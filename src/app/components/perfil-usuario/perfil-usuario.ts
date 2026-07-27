import { Component, ElementRef, HostListener } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-perfil-usuario',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './perfil-usuario.html',
  styleUrls: ['./perfil-usuario.scss']
})
export class PerfilUsuario {
  menuAbierto = false;

  constructor(public auth: AuthService, private elementRef: ElementRef) {}

  @HostListener('document:click', ['$event'])
  onClickFuera(event: MouseEvent) {
    if (this.menuAbierto && !this.elementRef.nativeElement.contains(event.target)) {
      this.menuAbierto = false;
    }
  }

  toggleMenu() {
    this.menuAbierto = !this.menuAbierto;
  }

  cerrarMenu() {
    this.menuAbierto = false;
  }

  cerrarSesion() {
    this.auth.logout();
    this.menuAbierto = false;
  }

  inicial(alias: string): string {
    return alias?.charAt(0)?.toUpperCase() ?? '?';
  }
}
