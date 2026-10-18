import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guards';
import { offerSelectionGuard } from './core/offers/offer-selection.guard';
import { quoteRequestGuard } from './core/quotes/quote-request.guard';
import { subscriptionGuard } from './core/subscriptions/subscription.guard';

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
      {
        path: 'cotizaciones',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/quotes/quote-summary-page.component').then(
            (component) => component.QuoteSummaryPageComponent,
          ),
        title: 'Cotizaciones | Solventa',
      },
      {
        path: 'cotizaciones/solicitar',
        loadComponent: () =>
          import('./features/quotes/quote-request-page.component').then(
            (component) => component.QuoteRequestPageComponent,
          ),
        title: 'Solicitar cotización | Solventa',
      },
      {
        path: 'cotizaciones/ofertas',
        canActivate: [quoteRequestGuard],
        loadComponent: () =>
          import('./features/offers/offer-selection-page.component').then(
            (component) => component.OfferSelectionPageComponent,
          ),
        title: 'Ofertas de seguro | Solventa',
      },
      {
        path: 'cotizaciones/aceptacion',
        canActivate: [quoteRequestGuard, offerSelectionGuard],
        loadComponent: () =>
          import('./features/offers/offer-acceptance-page.component').then(
            (component) => component.OfferAcceptancePageComponent,
          ),
        title: 'Resumen de oferta | Solventa',
      },
      {
        path: 'cotizaciones/suscripcion',
        canActivate: [quoteRequestGuard, offerSelectionGuard, subscriptionGuard],
        loadComponent: () =>
          import('./features/subscriptions/subscription-status-page.component').then(
            (component) => component.SubscriptionStatusPageComponent,
          ),
        title: 'Estado de suscripción | Solventa',
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'iniciar-sesion' },
  { path: '**', redirectTo: 'iniciar-sesion' },
];
