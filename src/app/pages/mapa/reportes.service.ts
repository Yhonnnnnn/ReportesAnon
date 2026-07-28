import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, timeout } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { API_URL } from '../../config';

export interface Reporte {
  id: number;
  categoria: string;
  descripcion: string;
  latitud: number;
  longitud: number;
  zona: string | null;
  fecha: string;
  evidenciaUrl: string | null;
  confirmaciones: number;
  marcasFalso: number;
}

export interface NuevoReporte {
  categoria: string;
  descripcion: string;
  latitud: number;
  longitud: number;
  zona?: string | null;
  evidencia?: File | null;
}

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private apiUrl = `${API_URL}/reportes.php`;
  private votosUrl = `${API_URL}/votos.php`;
  private createAbortController: AbortController | null = null;

  constructor(private http: HttpClient, private auth: AuthService) {}

  // Trae todos los reportes activos, o solo los nuevos desde cierta fecha
  // (así es como el mapa refresca "en tiempo real" con polling).
  obtenerReportes(desde?: string): Observable<Reporte[]> {
    const url = desde ? `${this.apiUrl}?desde=${encodeURIComponent(desde)}` : this.apiUrl;
    return this.http.get<Reporte[]>(url);
  }

  crearReporte(data: NuevoReporte): Observable<any> {
    const headers = { Authorization: `Bearer ${this.auth.token}` };

    // Si incluye evidencia, el backend recodifica la imagen (puede tardar),
    // por eso aumentamos el timeout para esos casos.
    if (data.evidencia) {
      return this._crearReporte(data, headers).pipe(timeout(120000));
    }

    return this._crearReporte(data, headers).pipe(timeout(15000));
  }

  private _crearReporte(data: NuevoReporte, headers: any): Observable<any> {

    if (data.evidencia) {
      // Usamos fetch con AbortController para permitir abortar la subida de imagen.
      return new Observable((observer) => {
        const controller = new AbortController();
        this.createAbortController = controller;

        const form = new FormData();
        form.append('categoria', data.categoria);
        form.append('descripcion', data.descripcion);
        form.append('latitud', String(data.latitud));
        form.append('longitud', String(data.longitud));
        if (data.zona) form.append('zona', data.zona);
        form.append('evidencia', data.evidencia as File);

        fetch(this.apiUrl, { method: 'POST', headers, body: form, signal: controller.signal })
          .then(async (res) => {
            this.createAbortController = null;
            if (!res.ok) {
                const json = await res.json().catch(() => null);
                observer.error(json || { status: res.status });
                return;
            }
            const json = await res.json().catch(() => null);
            observer.next(json);
            observer.complete();
          })
          .catch((err) => {
            this.createAbortController = null;
            observer.error(err);
          });

        // Teardown: abort on unsubscribe
        return () => {
          if (this.createAbortController) {
            this.createAbortController.abort();
            this.createAbortController = null;
          }
        };
      });
    }

    return this.http.post(
      this.apiUrl,
      {
        categoria: data.categoria,
        descripcion: data.descripcion,
        latitud: data.latitud,
        longitud: data.longitud,
        zona: data.zona || null
      },
      { headers }
    );
  }

  cancelCrearReporte() {
    if (this.createAbortController) {
      this.createAbortController.abort();
      this.createAbortController = null;
    }
  }

  votar(reporteId: number, tipo: 'confirma' | 'falso'): Observable<any> {
    const headers = { Authorization: `Bearer ${this.auth.token}` };
    return this.http.post(this.votosUrl, { reporte_id: reporteId, tipo }, { headers });
  }
}
