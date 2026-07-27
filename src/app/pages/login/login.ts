import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { AuthService } from '../../services/auth.service';

interface PuntoMapa { x: number; y: number; }
interface Trayecto { desde: number; hasta: number; progreso: number; velocidad: number; }

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrls: ['./login.scss']
})
export class Login implements AfterViewInit, OnDestroy {
  modo: 'login' | 'registro' = 'login';
  correo = '';
  alias = '';
  password = '';
  cargando = false;
  error = '';

  // ===== Animación de fondo (puntos conectados por arcos) =====
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private puntos: PuntoMapa[] = [];
  private trayectos: Trayecto[] = [];
  private animId = 0;
  private ultimoFrame = 0;
  private readonly resizeHandler = () => this.redimensionarCanvas();

  constructor(private auth: AuthService, private router: Router, private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.inicializarAnimacionFondo();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this.resizeHandler);
  }

  // ===== Animación de fondo: puntos rojos unidos por arcos que se
  // desvanecen desde el punto anterior a medida que avanzan al siguiente =====

  private inicializarAnimacionFondo() {
    const canvas = document.getElementById('mapaFondo') as HTMLCanvasElement | null;
    const ctx = canvas?.getContext('2d') ?? null;
    if (!canvas || !ctx) return;

    this.canvas = canvas;
    this.ctx = ctx;

    this.redimensionarCanvas();
    window.addEventListener('resize', this.resizeHandler);

    const CANTIDAD_PUNTOS = 16;
    this.puntos = Array.from({ length: CANTIDAD_PUNTOS }, () => ({
      x: 0.06 + Math.random() * 0.88,
      y: 0.08 + Math.random() * 0.84
    }));

    const CANTIDAD_TRAYECTOS = 6;
    this.trayectos = Array.from({ length: CANTIDAD_TRAYECTOS }, () => this.crearTrayecto());

    this.ultimoFrame = performance.now();
    this.animId = requestAnimationFrame(this.dibujarFrame);
  }

  private redimensionarCanvas() {
    if (!this.canvas || !this.ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const ancho = this.canvas.clientWidth;
    const alto = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, Math.round(ancho * dpr));
    this.canvas.height = Math.max(1, Math.round(alto * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private crearTrayecto(desdeForzado?: number): Trayecto {
    const total = this.puntos.length;
    const desde = desdeForzado ?? Math.floor(Math.random() * total);
    let hasta = desde;
    while (hasta === desde && total > 1) {
      hasta = Math.floor(Math.random() * total);
    }
    return {
      desde,
      hasta,
      progreso: 0,
      velocidad: 0.22 + Math.random() * 0.22 // cada arco tarda ~4-5s en completarse
    };
  }

  // Arrow function como propiedad para no perder el "this" al pasarla a requestAnimationFrame
  private dibujarFrame = (tiempo: number) => {
    if (!this.canvas || !this.ctx) return;

    const dt = Math.min((tiempo - this.ultimoFrame) / 1000, 0.05);
    this.ultimoFrame = tiempo;

    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    // Puntos base (ubicaciones fijas), con un leve pulso de brillo
    const ahora = tiempo / 1000;
    this.puntos.forEach((p, i) => {
      const x = p.x * w;
      const y = p.y * h;
      const pulso = 1 + Math.sin(ahora * 1.4 + i * 1.7) * 0.3;
      ctx.beginPath();
      ctx.arc(x, y, 2 * pulso, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(229, 57, 53, 0.5)';
      ctx.fill();
    });

    // Arcos viajando de un punto a otro
    this.trayectos.forEach((trayecto) => {
      trayecto.progreso += trayecto.velocidad * dt;
      if (trayecto.progreso >= 1) {
        const siguiente = this.crearTrayecto(trayecto.hasta);
        trayecto.desde = siguiente.desde;
        trayecto.hasta = siguiente.hasta;
        trayecto.velocidad = siguiente.velocidad;
        trayecto.progreso = 0;
      }
      this.dibujarTrayecto(trayecto, w, h);
    });

    this.animId = requestAnimationFrame(this.dibujarFrame);
  };

  private dibujarTrayecto(trayecto: Trayecto, w: number, h: number) {
    if (!this.ctx) return;
    const p0 = this.puntos[trayecto.desde];
    const p2 = this.puntos[trayecto.hasta];
    if (!p0 || !p2) return;

    const inicio = { x: p0.x * w, y: p0.y * h };
    const fin = { x: p2.x * w, y: p2.y * h };
    const medioX = (inicio.x + fin.x) / 2;
    const medioY = (inicio.y + fin.y) / 2;
    const distancia = Math.hypot(fin.x - inicio.x, fin.y - inicio.y);
    // Punto de control desplazado hacia arriba: da la forma de parábola/arco de vuelo
    const control = { x: medioX, y: medioY - distancia * 0.3 };

    const puntoEnCurva = (t: number) => {
      const mt = 1 - t;
      return {
        x: mt * mt * inicio.x + 2 * mt * t * control.x + t * t * fin.x,
        y: mt * mt * inicio.y + 2 * mt * t * control.y + t * t * fin.y
      };
    };

    // Solo se dibuja el tramo reciente (la "estela"): lo anterior a ese
    // tramo ya desapareció por completo, y dentro de la estela el color
    // se desvanece desde el punto de origen hacia la cabeza actual.
    const LARGO_ESTELA = 0.4;
    const inicioEstela = Math.max(0, trayecto.progreso - LARGO_ESTELA);
    const pasos = 24;
    const ctx = this.ctx;

    for (let i = 0; i < pasos; i++) {
      const t1 = inicioEstela + ((trayecto.progreso - inicioEstela) * i) / pasos;
      const t2 = inicioEstela + ((trayecto.progreso - inicioEstela) * (i + 1)) / pasos;
      const a = puntoEnCurva(t1);
      const b = puntoEnCurva(t2);
      const alpha = (i / pasos) * 0.8;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = `rgba(255, 82, 82, ${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Cabeza brillante: el "punto viajero" que va conectando de un lugar a otro
    const cabeza = puntoEnCurva(trayecto.progreso);
    ctx.beginPath();
    ctx.arc(cabeza.x, cabeza.y, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = '#ff8a80';
    ctx.shadowColor = '#e53935';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  cambiarModo(nuevo: 'login' | 'registro') {
    this.modo = nuevo;
    this.error = '';
    this.alias = '';
  }

  enviar() {
    if (!this.correo || !this.password || (this.modo === 'registro' && !this.alias)) return;
    this.cargando = true;
    this.error = '';

    const accion$ =
      this.modo === 'login'
        ? this.auth.login(this.correo, this.password)
        : this.auth.registrar(this.correo, this.password, this.alias);

    accion$
      .pipe(finalize(() => {
        this.cargando = false;
        this.cdr.detectChanges(); // sin esto, en esta app (zoneless) el botón se queda en "Procesando..."
      }))
      .subscribe({
        next: () => this.router.navigateByUrl('/'),
        error: (err) => {
          console.error('Error de autenticación:', err);

          if (err?.name === 'TimeoutError') {
            this.error = 'El servidor no responde. Revisa que el backend (Apache/Railway) y la base de datos estén activos.';
            this.cdr.detectChanges();
            return;
          }

          if (err instanceof HttpErrorResponse) {
            if (err.status === 0) {
              this.error = 'No se pudo conectar con el backend. Revisa la URL en src/app/config.ts.';
            } else if (err.status === 404) {
              this.error = 'El backend respondió 404: revisa que la ruta en src/app/config.ts sea correcta.';
            } else {
              this.error = err.error?.error || 'Ocurrió un error en el servidor, intenta de nuevo.';
            }
            this.cdr.detectChanges();
            return;
          }

          this.error = 'Ocurrió un error, intenta de nuevo';
          this.cdr.detectChanges();
        }
      });
  }
}