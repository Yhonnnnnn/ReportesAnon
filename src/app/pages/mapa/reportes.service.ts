import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { API_URL } from '../../config';

export interface Reporte {
  id: number;
  categoria: string;
  descripcion: string;
  latitud: number;
  longitud: number;
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
  evidencia?: File | null;
}

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private apiUrl = `${API_URL}/reportes.php`;
  private votosUrl = `${API_URL}/votos.php`;

  constructor(private http: HttpClient, private auth: AuthService) {}

  // Trae todos los reportes activos, o solo los nuevos desde cierta fecha
  // (así es como el mapa refresca "en tiempo real" con polling).
  obtenerReportes(desde?: string): Observable<Reporte[]> {
    const url = desde ? `${this.apiUrl}?desde=${encodeURIComponent(desde)}` : this.apiUrl;
    return this.http.get<Reporte[]>(url);
  }

  crearReporte(data: NuevoReporte): Observable<any> {
    const headers = { Authorization: `Bearer ${this.auth.token}` };

    if (data.evidencia) {
      const form = new FormData();
      form.append('categoria', data.categoria);
      form.append('descripcion', data.descripcion);
      form.append('latitud', String(data.latitud));
      form.append('longitud', String(data.longitud));
      form.append('evidencia', data.evidencia);
      return this.http.post(this.apiUrl, form, { headers });
    }

    return this.http.post(
      this.apiUrl,
      {
        categoria: data.categoria,
        descripcion: data.descripcion,
        latitud: data.latitud,
        longitud: data.longitud
      },
      { headers }
    );
  }

  votar(reporteId: number, tipo: 'confirma' | 'falso'): Observable<any> {
    const headers = { Authorization: `Bearer ${this.auth.token}` };
    return this.http.post(this.votosUrl, { reporte_id: reporteId, tipo }, { headers });
  }
}
