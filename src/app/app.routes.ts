import { Routes } from '@angular/router';
import { Mapa } from './pages/mapa/mapa';
import { Reportes } from './pages/reportes/reportes';
import { Login } from './pages/login/login';

export const routes: Routes = [
    { path: '', component: Mapa },
    { path: 'reportes', component: Reportes },
    { path: 'login', component: Login }
];