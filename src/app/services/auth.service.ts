import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, timeout } from 'rxjs';
import { API_URL } from '../config';

export interface Usuario {
  alias: string;
  avatarColor: string;
}

interface AuthResponse {
  token: string;
  usuario: Usuario;
}

const TOKEN_KEY = 'auth_token';
const USUARIO_KEY = 'auth_usuario';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private apiUrl = `${API_URL}/auth.php`;

  // Señal reactiva con el usuario actual (null si no hay sesión iniciada)
  usuarioActual = signal<Usuario | null>(this.leerUsuarioGuardado());

  constructor(private http: HttpClient) {}

  get estaAutenticado(): boolean {
    return !!this.usuarioActual();
  }

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  registrar(correo: string, password: string, alias: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}?action=register`, { correo, password, alias })
      .pipe(timeout(8000), tap((res) => this.guardarSesion(res)));
  }

  login(correo: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}?action=login`, { correo, password })
      .pipe(timeout(8000), tap((res) => this.guardarSesion(res)));
  }

  logout(): void {
    const token = this.token;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USUARIO_KEY);
    this.usuarioActual.set(null);

    if (token) {
      // Avisamos al backend para invalidar el token guardado; si falla no importa,
      // ya lo borramos localmente.
      this.http
        .post(`${this.apiUrl}?action=logout`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        })
        .subscribe({ error: () => {} });
    }
  }

  private guardarSesion(res: AuthResponse) {
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USUARIO_KEY, JSON.stringify(res.usuario));
    this.usuarioActual.set(res.usuario);
  }

  private leerUsuarioGuardado(): Usuario | null {
    try {
      const data = localStorage.getItem(USUARIO_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }
}
