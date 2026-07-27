import { Component, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ReportesService, Reporte } from '../mapa/reportes.service';
import { PerfilUsuario } from '../../components/perfil-usuario/perfil-usuario';

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe, RouterLink, PerfilUsuario],
  templateUrl: './reportes.html',
  styleUrls: ['./reportes.scss']
})
export class Reportes implements OnInit {
  reportes: Reporte[] = [];
  reportesFiltrados: Reporte[] = [];
  cargando = true;
  error = '';

  filtroCategoria = 'todas';
  busqueda = '';
  orden: 'reciente' | 'antiguo' = 'reciente';

  stats = { total: 0, robo: 0, secuestro: 0, extorsion: 0, sospechoso: 0, otro: 0 };

  reporteSeleccionado: Reporte | null = null;
  mostrarDetalle = false;

  constructor(private reportesService: ReportesService, private sanitizer: DomSanitizer) {}

  ngOnInit() {
    this.cargarReportes();
  }

  cargarReportes() {
    this.cargando = true;
    this.error = '';

    const locales = this.obtenerReportesLocal();
    if (locales.length > 0) {
      this.reportes = locales;
      this.aplicarFiltros();
      this.cargando = false;
    }

    this.reportesService.obtenerReportes().subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          this.reportes = data;
          localStorage.setItem('reportes', JSON.stringify(data));
          this.aplicarFiltros();
        }
        this.cargando = false;
      },
      error: () => {
        if (locales.length === 0) {
          this.error = 'No se pudo conectar con el servidor. Asegurate de tener XAMPP/WAMP encendido.';
        }
        this.cargando = false;
      }
    });
  }

  private obtenerReportesLocal(): Reporte[] {
    try {
      const data = localStorage.getItem('reportes');
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  }

  aplicarFiltros() {
    let filtrados = [...this.reportes];

    if (this.filtroCategoria !== 'todas') {
      filtrados = filtrados.filter(r => r.categoria === this.filtroCategoria);
    }

    if (this.busqueda.trim()) {
      const q = this.busqueda.toLowerCase();
      filtrados = filtrados.filter(r =>
        r.descripcion.toLowerCase().includes(q) ||
        r.categoria.toLowerCase().includes(q)
      );
    }

    filtrados.sort((a, b) => {
      const da = new Date(a.fecha).getTime();
      const db = new Date(b.fecha).getTime();
      return this.orden === 'reciente' ? db - da : da - db;
    });

    this.reportesFiltrados = filtrados;
    this.calcularStats();
  }

  private calcularStats() {
    this.stats = {
      total: this.reportes.length,
      robo: this.reportes.filter(r => r.categoria === 'robo').length,
      secuestro: this.reportes.filter(r => r.categoria === 'secuestro').length,
      extorsion: this.reportes.filter(r => r.categoria === 'extorsion').length,
      sospechoso: this.reportes.filter(r => r.categoria === 'sospechoso').length,
      otro: this.reportes.filter(r => r.categoria === 'otro').length
    };
  }

  verDetalle(reporte: Reporte) {
    this.reporteSeleccionado = reporte;
    this.mostrarDetalle = true;
  }

  cerrarDetalle() {
    this.mostrarDetalle = false;
    this.reporteSeleccionado = null;
  }

  getSvgCategoria(cat: string): SafeHtml {
    const svgs: Record<string, string> = {
      robo: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="2"><path d="M7 17l3-3 3 3"/><path d="M10 14V3"/><rect x="4" y="17" width="16" height="3" rx="1"/></svg>',
      secuestro: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffb300" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
      extorsion: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#43a047" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
      sospechoso: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#757575" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      otro: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#757575" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17"/></svg>'
    };
    return this.sanitizer.bypassSecurityTrustHtml(svgs[cat] || svgs['otro']);
  }

  getColorCategoria(cat: string): string {
    const colores: Record<string, string> = {
      robo: '#e53935',
      secuestro: '#ffb300',
      extorsion: '#43a047',
      sospechoso: '#757575',
      otro: '#757575'
    };
    return colores[cat] || '#757575';
  }

  formatearFecha(fecha: string): string {
    return new Date(fecha).toLocaleDateString('es-EC', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}