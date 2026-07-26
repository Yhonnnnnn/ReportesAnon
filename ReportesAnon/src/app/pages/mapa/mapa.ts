import { AfterViewInit, Component, OnDestroy, ViewEncapsulation } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import * as L from 'leaflet';
import { ReportesService, Reporte } from './reportes.service';
import { PerfilUsuario } from '../../components/perfil-usuario/perfil-usuario';
import { AuthService } from '../../services/auth.service';

const INTERVALO_POLLING_MS = 8000;

@Component({
  selector: 'app-mapa',
  imports: [FormsModule, DecimalPipe, PerfilUsuario],
  templateUrl: './mapa.html',
  styleUrls: ['./mapa.scss'],
  encapsulation: ViewEncapsulation.None
})
export class Mapa implements AfterViewInit, OnDestroy {

  private map!: L.Map;
  private marcadores = new Map<number, L.Marker>();
  private markerTemporal: L.Marker | null = null;
  private pollingId: any = null;
  private ultimaFecha: string | null = null;

  // Modal de reporte
  selectedCoords: { lat: number; lng: number } | null = null;
  zonaSeleccionada = '';
  mostrarModal = false;
  mostrarPopup = false;
  reporte = { categoria: '', descripcion: '' };
  evidenciaArchivo: File | null = null;
  evidenciaPreview: string | null = null;
  mensajeExito = false;
  enviando = false;
  errorEnvio = '';

  // Modal detalle de reporte existente
  reporteDetalle: Reporte | null = null;
  mostrarDetalle = false;

  // Contador de reportes
  totalReportes = 0;
  reportesCache: Reporte[] = [];

  constructor(
    private reportesService: ReportesService,
    private sanitizer: DomSanitizer,
    public auth: AuthService,
    private router: Router
  ) {}

  ngAfterViewInit(): void {
    this.inicializarMapa();
    this.cargarReportes();
    this.pollingId = setInterval(() => this.buscarReportesNuevos(), INTERVALO_POLLING_MS);
  }

  ngOnDestroy(): void {
    if (this.pollingId) {
      clearInterval(this.pollingId);
    }
  }

  private inicializarMapa() {
    this.map = L.map('map', {
      center: [-1.831239, -78.183406],
      zoom: 7,
      zoomControl: false
    });

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '&copy; OpenStreetMap &copy; CARTO'
      }
    ).addTo(this.map);

    this.agregarBuscadorOSM();

    // Click en el mapa
    this.map.on('click', async (e: L.LeafletMouseEvent) => {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      this.selectedCoords = { lat, lng };

      // Limpiar marcador temporal anterior
      if (this.markerTemporal) {
        this.map.removeLayer(this.markerTemporal);
      }

      // Obtener nombre de la zona con reverse geocoding
      this.zonaSeleccionada = 'Obteniendo ubicación...';

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`
        );
        const data = await response.json();

        if (data && data.display_name) {
          const partes = data.display_name.split(',');
          this.zonaSeleccionada = partes.slice(0, 3).join(',').trim();
        } else {
          this.zonaSeleccionada = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }
      } catch {
        this.zonaSeleccionada = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }

      const autenticado = this.auth.estaAutenticado;
      const botonHtml = autenticado
        ? `<button onclick="document.getElementById('btnAgregarReporte')?.click()"
            style="width:100%;padding:10px;background:linear-gradient(135deg,#e53935,#c62828);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Agregar reporte
          </button>`
        : `<button onclick="document.getElementById('btnIrLogin')?.click()"
            style="width:100%;padding:10px;background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.15);border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            Inicia sesión para reportar
          </button>`;

      // Mostrar marcador temporal con popup que incluye zona y botón
      const marker = this.crearMarcadorPulso([lat, lng])
        .addTo(this.map)
        .bindPopup(`
          <div style="color:#fff;background:#1e1e1e;padding:14px;border-radius:10px;min-width:250px;">
            <div style="display:flex;align-items:center;gap:6px;font-size:13px;color:#888;margin-bottom:4px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><circle cx="12" cy="10" r="3"/><path d="M12 21s-8-7-8-11a8 8 0 1 1 16 0c0 4-8 11-8 11z"/></svg>
              Ubicación seleccionada
            </div>
            <div style="font-size:13px;color:#fff;margin-bottom:10px;font-weight:500;">${this.zonaSeleccionada}</div>
            ${botonHtml}
          </div>
        `, { closeButton: true, className: 'popup-tmp' })
        .openPopup();

      // Eliminar el marcador temporal cuando se cierra el popup con la X
      marker.on('popupclose', () => {
        if (this.markerTemporal) {
          this.map.removeLayer(this.markerTemporal);
          this.markerTemporal = null;
        }
      });

      this.markerTemporal = marker;

      this.mostrarPopup = false;
      this.mostrarModal = false;
      this.mensajeExito = false;
    });
  }

  irALogin() {
    this.router.navigateByUrl('/login');
  }

  abrirModalReporte() {
    if (!this.auth.estaAutenticado) {
      this.irALogin();
      return;
    }
    this.mostrarPopup = false;
    this.mostrarModal = true;
    this.reporte = { categoria: '', descripcion: '' };
    this.evidenciaArchivo = null;
    this.evidenciaPreview = null;
    this.errorEnvio = '';
    if (this.markerTemporal) {
      this.markerTemporal.closePopup();
    }
  }

  // ===== EVIDENCIA =====

  onEvidenciaSeleccionada(event: Event) {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;

    if (archivo.size > 5 * 1024 * 1024) {
      this.errorEnvio = 'La imagen debe pesar menos de 5MB';
      input.value = '';
      return;
    }

    this.evidenciaArchivo = archivo;
    this.errorEnvio = '';

    const reader = new FileReader();
    reader.onload = () => { this.evidenciaPreview = reader.result as string; };
    reader.readAsDataURL(archivo);
  }

  quitarEvidencia() {
    this.evidenciaArchivo = null;
    this.evidenciaPreview = null;
  }

  // ===== REPORTES =====

  private cargarReportes() {
    const cache = this.leerCache();
    if (cache.length > 0) {
      this.reportesCache = cache;
      this.pintarReportes(cache);
    }

    this.reportesService.obtenerReportes().subscribe({
      next: (reportes) => {
        this.reportesCache = reportes;
        this.pintarReportes(reportes);
        this.guardarCache(reportes);
        this.actualizarUltimaFecha(reportes);
      },
      error: () => {}
    });
  }

  // "Tiempo real" simple por polling: cada pocos segundos preguntamos solo
  // por lo nuevo desde el último reporte que vimos, y lo agregamos al mapa
  // sin recargar todo ni duplicar marcadores.
  private buscarReportesNuevos() {
    if (!this.ultimaFecha) return;

    this.reportesService.obtenerReportes(this.ultimaFecha).subscribe({
      next: (nuevos) => {
        if (!nuevos || nuevos.length === 0) return;
        nuevos.forEach((r) => {
          if (!this.marcadores.has(r.id)) {
            this.reportesCache.unshift(r);
            this.agregarMarcadorReporte(r);
          }
        });
        this.totalReportes = this.marcadores.size;
        this.actualizarContador();
        this.guardarCache(this.reportesCache);
        this.actualizarUltimaFecha(nuevos);
        this.filtrarPanel(this.filtroPanel);
      },
      error: () => {}
    });
  }

  private actualizarUltimaFecha(reportes: Reporte[]) {
    for (const r of reportes) {
      if (!this.ultimaFecha || r.fecha > this.ultimaFecha) {
        this.ultimaFecha = r.fecha;
      }
    }
  }

  private pintarReportes(reportes: Reporte[]) {
    this.marcadores.forEach((m) => this.map.removeLayer(m));
    this.marcadores.clear();
    reportes.forEach((r) => this.agregarMarcadorReporte(r));
    this.totalReportes = this.marcadores.size;
    this.actualizarContador();
  }

  private leerCache(): Reporte[] {
    try {
      const data = localStorage.getItem('reportes');
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  }

  private guardarCache(reportes: Reporte[]) {
    localStorage.setItem('reportes', JSON.stringify(reportes));
  }

  enviarReporte() {
    if (!this.auth.estaAutenticado) {
      this.irALogin();
      return;
    }
    if (!this.selectedCoords || !this.reporte.categoria || !this.reporte.descripcion) return;

    this.enviando = true;
    this.errorEnvio = '';

    this.reportesService.crearReporte({
      categoria: this.reporte.categoria,
      descripcion: this.reporte.descripcion,
      latitud: this.selectedCoords.lat,
      longitud: this.selectedCoords.lng,
      evidencia: this.evidenciaArchivo
    }).subscribe({
      next: (res) => {
        this.enviando = false;
        this.mensajeExito = true;

        const nuevoReporte: Reporte = {
          id: res.id,
          categoria: this.reporte.categoria,
          descripcion: this.reporte.descripcion,
          latitud: this.selectedCoords!.lat,
          longitud: this.selectedCoords!.lng,
          fecha: new Date().toISOString().slice(0, 19).replace('T', ' '),
          evidenciaUrl: null,
          confirmaciones: 0,
          marcasFalso: 0
        };
        this.reportesCache.unshift(nuevoReporte);
        this.agregarMarcadorReporte(nuevoReporte);
        this.totalReportes = this.marcadores.size;
        this.actualizarContador();
        this.guardarCache(this.reportesCache);
        this.actualizarUltimaFecha([nuevoReporte]);

        setTimeout(() => { this.cerrarModal(); }, 1500);
      },
      error: (err) => {
        this.enviando = false;
        this.errorEnvio = err?.error?.error || 'No se pudo enviar el reporte, intenta de nuevo';
      }
    });
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.mostrarPopup = false;
    this.mensajeExito = false;
    this.reporte = { categoria: '', descripcion: '' };
    this.evidenciaArchivo = null;
    this.evidenciaPreview = null;
    this.selectedCoords = null;
    this.zonaSeleccionada = '';
    if (this.markerTemporal) {
      this.map.removeLayer(this.markerTemporal);
      this.markerTemporal = null;
    }
  }

  cerrarPopup() {
    this.mostrarPopup = false;
    if (this.markerTemporal) {
      this.markerTemporal.closePopup();
      this.map.removeLayer(this.markerTemporal);
      this.markerTemporal = null;
    }
  }

  // ===== VOTOS (confirmar / marcar como falso) =====

  votar(reporte: Reporte, tipo: 'confirma' | 'falso') {
    if (!this.auth.estaAutenticado) {
      this.irALogin();
      return;
    }

    this.reportesService.votar(reporte.id, tipo).subscribe({
      next: (res) => {
        reporte.confirmaciones = res.confirmaciones;
        reporte.marcasFalso = res.marcasFalso;
        this.guardarCache(this.reportesCache);
      },
      error: () => {}
    });
  }

  // ===== MARCADOR ROJO CON PULSO =====

  private agregarMarcadorReporte(reporte: Reporte) {
    const { id, categoria, descripcion, fecha, latitud, longitud, evidenciaUrl, confirmaciones, marcasFalso } = reporte;

    const iconos: Record<string, string> = {
      robo: 'gun',
      secuestro: 'chains',
      extorsion: 'phone',
      sospechoso: 'user',
      otro: 'alert'
    };
    const svgIconos: Record<string, string> = {
      gun: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18h8l3-3 3-3-3-3-3-3H6l-3 6 3 6z"/><circle cx="12" cy="12" r="2"/><line x1="2" y1="12" x2="8" y2="12"/><line x1="16" y1="12" x2="22" y2="12"/></svg>',
      chains: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffb300" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9V3"/><path d="M9 6h6"/><path d="M8 12h8"/><path d="M10 18h4"/><rect x="3" y="8" width="18" height="12" rx="2"/></svg>',
      phone: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#43a047" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
      user: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#757575" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      alert: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#757575" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/></svg>'
    };
    const key = iconos[categoria] || 'alert';
    const svgIcono = svgIconos[key];
    const categoriaLabel = {robo:'Robo/Asalto', secuestro:'Secuestro', extorsion:'Extorsion', sospechoso:'Sospechoso', otro:'Otro'}[categoria] || categoria;
    const fechaFormateada = new Date(fecha).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const evidenciaHtml = evidenciaUrl
      ? `<a href="${evidenciaUrl}" target="_blank" style="display:block;margin:8px 0;"><img src="${evidenciaUrl}" style="width:100%;border-radius:6px;max-height:120px;object-fit:cover;" /></a>`
      : '';

    const marker = this.crearMarcadorPulso([latitud, longitud])
      .addTo(this.map)
      .bindPopup(`
        <div style="color:#fff;background:#1e1e1e;padding:12px;border-radius:8px;min-width:220px;border:1px solid #333;">
          <div style="text-align:center;margin-bottom:4px;">${svgIcono}</div>
          <b style="color:#e53935;text-transform:uppercase;font-size:11px;letter-spacing:1px;">${categoriaLabel}</b>
          <p style="margin:6px 0;font-size:12px;color:#ccc;line-height:1.3;">${descripcion}</p>
          ${evidenciaHtml}
          <small style="color:#666;display:flex;align-items:center;gap:4px;font-size:10px;margin-bottom:8px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${fechaFormateada}</small>
          <div style="display:flex;gap:6px;">
            <button onclick="window.dispatchEvent(new CustomEvent('votar-reporte',{detail:{id:${id},tipo:'confirma'}}))" style="flex:1;background:rgba(67,160,71,0.15);color:#66bb6a;border:1px solid rgba(67,160,71,0.3);border-radius:6px;padding:6px;font-size:10px;font-weight:600;cursor:pointer;">✓ Confirmar (${confirmaciones})</button>
            <button onclick="window.dispatchEvent(new CustomEvent('votar-reporte',{detail:{id:${id},tipo:'falso'}}))" style="flex:1;background:rgba(229,57,53,0.15);color:#ef5350;border:1px solid rgba(229,57,53,0.3);border-radius:6px;padding:6px;font-size:10px;font-weight:600;cursor:pointer;">✕ Falso (${marcasFalso})</button>
          </div>
        </div>
      `);

    this.marcadores.set(id, marker);
  }

  private crearMarcadorPulso(coords: [number, number]): L.Marker {
    const icon = L.divIcon({
      className: 'marcador-pulso-container',
      html: `
        <div class="marcador-pulso">
          <div class="pulso"></div>
          <div class="punto"></div>
        </div>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    return L.marker(coords, { icon });
  }

  private actualizarContador() {
    const el = document.getElementById('reportesCount');
    if (el) {
      el.textContent = `${this.totalReportes} reporte${this.totalReportes !== 1 ? 's' : ''}`;
    }
  }

  // ===== BUSCADOR (SIN MARCADOR) =====

  private agregarBuscadorOSM() {
    const SearchControl = L.Control.extend({
      onAdd: (map: L.Map) => {
        const container = L.DomUtil.create('div', 'leaflet-control leaflet-control-custom-search');
        container.innerHTML = `
          <div class="search-wrapper">
            <input type="text" class="search-input" placeholder="Buscar lugar..." />
            <button class="search-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
            </button>
            <div class="search-results"></div>
          </div>
        `;

        const input = container.querySelector('.search-input') as HTMLInputElement;
        const resultsDiv = container.querySelector('.search-results') as HTMLElement;
        let timeoutId: any;

        input.addEventListener('input', () => {
          clearTimeout(timeoutId);
          const query = input.value.trim();
          if (query.length < 3) {
            resultsDiv.innerHTML = '';
            resultsDiv.classList.remove('active');
            return;
          }

          timeoutId = setTimeout(async () => {
            try {
              const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=EC`
              );
              const data = await response.json();

              resultsDiv.innerHTML = '';
              if (data.length === 0) {
                resultsDiv.innerHTML = '<div class="result-item no-results">Sin resultados</div>';
              } else {
                data.forEach((item: any) => {
                  const div = document.createElement('div');
                  div.className = 'result-item';
                  div.innerHTML = `
                    <span class="result-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="2"><circle cx="12" cy="10" r="3"/><path d="M12 21s-8-7-8-11a8 8 0 1 1 16 0c0 4-8 11-8 11z"/></svg>
                    </span>
                    <span class="result-text">${item.display_name}</span>
                  `;
                  div.addEventListener('click', () => {
                    // SOLO mover el mapa, SIN poner marcador
                    map.setView([parseFloat(item.lat), parseFloat(item.lon)], 16);
                    input.value = item.display_name.split(',')[0];
                    resultsDiv.innerHTML = '';
                    resultsDiv.classList.remove('active');
                  });
                  resultsDiv.appendChild(div);
                });
              }
              resultsDiv.classList.add('active');
            } catch (err) {
              console.error('Error en búsqueda:', err);
            }
          }, 400);
        });

        document.addEventListener('click', (e) => {
          if (!container.contains(e.target as Node)) {
            resultsDiv.classList.remove('active');
          }
        });

        return container;
      }
    });

    // Posición centrada arriba del mapa - Leaflet permite 'topcenter' con custom position
    this.map.addControl(new (SearchControl as any)({ position: 'topleft' }));

    // Escucha los clics en los botones "Confirmar"/"Falso" de los popups (ver agregarMarcadorReporte)
    window.addEventListener('votar-reporte', (e: any) => {
      const { id, tipo } = e.detail;
      const reporte = this.reportesCache.find(r => r.id === id);
      if (reporte) this.votar(reporte, tipo);
    });
  }

  // ===== PANEL DE REPORTES (estilo sección de comentarios) =====

  panelReportesAbierto = false;
  panelCerrando = false;
  filtroPanel = 'todas';
  reportesPanel: Reporte[] = [];

  togglePanelReportes() {
    if (this.panelReportesAbierto) {
      this.panelCerrando = true;
      setTimeout(() => {
        this.panelReportesAbierto = false;
        this.panelCerrando = false;
      }, 250);
    } else {
      this.panelReportesAbierto = true;
      this.filtrarPanel(this.filtroPanel);
    }
  }

  filtrarPanel(categoria: string) {
    this.filtroPanel = categoria;
    if (categoria === 'todas') {
      this.reportesPanel = this.reportesCache;
    } else {
      this.reportesPanel = this.reportesCache.filter(r => r.categoria === categoria);
    }
  }

  seleccionarReportePanel(reporte: Reporte) {
    this.reporteDetalle = reporte;
    this.mostrarDetalle = true;
  }

  cerrarDetalleMapa() {
    this.mostrarDetalle = false;
    this.reporteDetalle = null;
  }

  centrarMapaEnReporte(reporte: Reporte) {
    this.mostrarDetalle = false;
    this.reporteDetalle = null;
    if (this.panelReportesAbierto) {
      this.panelReportesAbierto = false;
      this.panelCerrando = false;
    }
    if (this.map) {
      this.map.setView([reporte.latitud, reporte.longitud], 16);
    }
  }

  getSvgCategoriaDetalle(cat: string): SafeHtml {
    const svgs: Record<string, string> = {
      robo: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="2"><path d="M7 17l3-3 3 3"/><path d="M10 14V3"/><rect x="4" y="17" width="16" height="3" rx="1"/></svg>',
      secuestro: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffb300" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
      extorsion: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#43a047" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
      sospechoso: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#757575" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      otro: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#757575" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17"/></svg>'
    };
    return this.sanitizer.bypassSecurityTrustHtml(svgs[cat] || svgs['otro']);
  }

  getSvgCategoriaComentario(cat: string): SafeHtml {
    const iconos: Record<string, string> = {
      robo: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18h8l3-3 3-3-3-3-3-3H6l-3 6 3 6z"/><circle cx="12" cy="12" r="2"/></svg>',
      secuestro: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9V3"/><path d="M9 6h6"/><rect x="3" y="8" width="18" height="12" rx="2"/></svg>',
      extorsion: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
      sospechoso: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      otro: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/></svg>'
    };
    return this.sanitizer.bypassSecurityTrustHtml(iconos[cat] || iconos['otro']);
  }

  getInicialCategoria(cat: string): string {
    const labels: Record<string, string> = {
      robo: 'R',
      secuestro: 'S',
      extorsion: 'E',
      sospechoso: 'S',
      otro: 'O'
    };
    return labels[cat] || '?';
  }

  getLabelCategoria(cat: string): string {
    const labels: Record<string, string> = {
      robo: 'Robo / Asalto',
      secuestro: 'Secuestro / Desaparición',
      extorsion: 'Extorsión / Amenazas',
      sospechoso: 'Persona Sospechosa',
      otro: 'Otro'
    };
    return labels[cat] || cat;
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

  formatearFechaPanel(fecha: string): string {
    return new Date(fecha).toLocaleDateString('es-EC', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
