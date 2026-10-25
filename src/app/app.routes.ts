import { Routes } from '@angular/router';
import { advisorGuard, authGuard, guestGuard, portalGuard } from './core/auth/auth.guards';
import { partnerGuard } from './core/partners/partner.guard';
import { quoteResumeGuard } from './core/quotes/quote-resume.guard';

export const routes: Routes = [
  {
    path: 'acceso-no-disponible',
    loadComponent: () =>
      import('./features/auth/access-unavailable-page.component').then(
        (component) => component.AccessUnavailablePageComponent,
      ),
    title: 'Acceso no disponible | Solventa',
  },
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
    canActivateChild: [portalGuard],
    loadComponent: () =>
      import('./layout/authenticated-layout/authenticated-layout.component').then(
        (component) => component.AuthenticatedLayoutComponent,
      ),
    children: [
      {
        path: 'socios/cotizaciones/solicitar',
        canActivate: [partnerGuard],
        data: { partnerScope: 'perfilamientos:crear', partnerMode: true },
        loadComponent: () =>
          import('./features/quotes/quote-request-page.component').then(
            (component) => component.QuoteRequestPageComponent,
          ),
        title: 'Cotización de socio | Solventa',
      },
      {
        path: 'socios',
        canActivate: [partnerGuard],
        runGuardsAndResolvers: 'always',
        loadComponent: () =>
          import('./features/partners/partner-home-page.component').then(
            (component) => component.PartnerHomePageComponent,
          ),
        title: 'Portal de socios | Solventa',
      },
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
        canActivate: [quoteResumeGuard],
        runGuardsAndResolvers: 'paramsOrQueryParamsChange',
        loadComponent: () =>
          import('./features/offers/offer-selection-page.component').then(
            (component) => component.OfferSelectionPageComponent,
          ),
        title: 'Ofertas de seguro | Solventa',
      },
      {
        path: 'cotizaciones/aceptacion',
        canActivate: [quoteResumeGuard],
        runGuardsAndResolvers: 'paramsOrQueryParamsChange',
        loadComponent: () =>
          import('./features/offers/offer-acceptance-page.component').then(
            (component) => component.OfferAcceptancePageComponent,
          ),
        title: 'Resumen de oferta | Solventa',
      },
      {
        path: 'cotizaciones/suscripcion/detalle',
        canActivate: [quoteResumeGuard],
        runGuardsAndResolvers: 'paramsOrQueryParamsChange',
        data: { detail: true },
        loadComponent: () =>
          import('./features/subscriptions/subscription-status-page.component').then(
            (component) => component.SubscriptionStatusPageComponent,
          ),
        title: 'Detalle de suscripción | Solventa',
      },
      {
        path: 'cotizaciones/suscripcion',
        canActivate: [quoteResumeGuard],
        runGuardsAndResolvers: 'paramsOrQueryParamsChange',
        loadComponent: () =>
          import('./features/subscriptions/subscription-status-page.component').then(
            (component) => component.SubscriptionStatusPageComponent,
          ),
        title: 'Estado de suscripción | Solventa',
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  {
    path: 'asesor',
    canActivate: [authGuard, advisorGuard],
    canActivateChild: [advisorGuard],
    loadComponent: () =>
      import('./layout/advisor-layout/advisor-layout.component').then(
        (component) => component.AdvisorLayoutComponent,
      ),
    children: [
      {
        path: 'perfilamientos/nuevo',
        loadComponent: () =>
          import('./features/advisor/mortgage-profiling-start-page.component').then(
            (component) => component.MortgageProfilingStartPageComponent,
          ),
        title: 'Iniciar perfilamiento hipotecario | Solventa',
      },
      { path: '', pathMatch: 'full', redirectTo: 'perfilamientos/nuevo' },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'iniciar-sesion' },
  { path: '**', redirectTo: 'iniciar-sesion' },
];
