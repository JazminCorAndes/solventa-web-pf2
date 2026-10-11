import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  {
    path: 'iniciar-sesion',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login-page.component').then(
        (component) => component.LoginPageComponent,
      ),
    title: 'Iniciar sesión | Solventa',
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/authenticated-layout/authenticated-layout.component').then(
        (component) => component.AuthenticatedLayoutComponent,
      ),
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard-page.component').then(
            (component) => component.DashboardPageComponent,
          ),
        title: 'Inicio | Solventa',
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'iniciar-sesion' },
  { path: '**', redirectTo: 'iniciar-sesion' },
];
