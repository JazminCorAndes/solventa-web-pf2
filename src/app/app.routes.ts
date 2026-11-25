import { Routes } from '@angular/router';
import {
  administratorGuard,
  advisorGuard,
  authGuard,
  guestGuard,
  internalPermissionGuard,
  portalGuard,
} from './core/auth/auth.guards';
import { partnerGuard } from './core/partners/partner.guard';
import { quoteResumeGuard } from './core/quotes/quote-resume.guard';

export const routes: Routes = [
  {
    path: 'administracion',
    canActivate: [authGuard, administratorGuard],
    canActivateChild: [administratorGuard],
    loadComponent: () =>
      import('./layout/administration-layout/administration-layout.component').then(
        (component) => component.AdministrationLayoutComponent,
      ),
    children: [
      {
        path: 'reportes',
        canActivate: [internalPermissionGuard],
        data: { internalPermission: 'reportes:operativos' },
        loadComponent: () =>
          import('./features/advisor/operational-reports-page.component').then(
            (component) => component.OperationalReportsPageComponent,
          ),
        title: 'Reportes operativos | Solventa',
      },
      {
        path: 'colas/:queue',
        loadComponent: () =>
          import('./features/administration/administration-page.component').then(
            (component) => component.AdministrationPageComponent,
          ),
        title: 'Revisiones administrativas | Solventa',
      },
      {
        path: 'siniestros/:claimId',
        loadComponent: () =>
          import('./features/administration/administration-page.component').then(
            (component) => component.AdministrationPageComponent,
          ),
        title: 'Revisión de siniestro | Solventa',
      },
      { path: '', pathMatch: 'full', redirectTo: 'colas/revision' },
    ],
  },
  {
    path: 'olvide-contrasena',
    loadComponent: () =>
      import('./features/auth/password-recovery-page.component').then(
        (component) => component.PasswordRecoveryPageComponent,
      ),
    title: 'Recuperar contraseña | Solventa',
  },
  {
    path: 'recuperar-contrasena',
    data: { resetPassword: true },
    loadComponent: () =>
      import('./features/auth/password-recovery-page.component').then(
        (component) => component.PasswordRecoveryPageComponent,
      ),
    title: 'Nueva contraseña | Solventa',
  },
  {
    path: 'registrarse',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/register-page.component').then(
        (component) => component.RegisterPageComponent,
      ),
    title: 'Registrarse | Solventa',
  },
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
        path: 'consentimiento',
        loadComponent: () =>
          import('./features/auth/consent-page.component').then(
            (component) => component.ConsentPageComponent,
          ),
        title: 'Consentimiento | Solventa',
      },
      {
        path: 'socios/perfilamientos/nuevo',
        canActivate: [partnerGuard],
        data: { partnerScope: 'clientes:consultar', mortgageMode: true, partnerMode: true },
        loadComponent: () =>
          import('./features/partners/client-information-page.component').then(
            (component) => component.ClientInformationPageComponent,
          ),
        title: 'Perfilamiento hipotecario del socio | Solventa',
      },
      {
        path: 'socios/clientes',
        pathMatch: 'full',
        canActivate: [partnerGuard],
        data: { partnerScope: 'clientes:consultar', partnerMode: true },
        loadComponent: () =>
          import('./features/partners/partner-clients-page.component').then(
            (component) => component.PartnerClientsPageComponent,
          ),
        title: 'Clientes cotizados | Solventa',
      },
      {
        path: 'socios/clientes/consultar',
        canActivate: [partnerGuard],
        data: { partnerScope: 'clientes:consultar', partnerMode: true },
        loadComponent: () =>
          import('./features/partners/client-information-page.component').then(
            (component) => component.ClientInformationPageComponent,
          ),
        title: 'Consultar información del cliente | Solventa',
      },
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
        path: 'socios/solicitudes',
        canActivate: [partnerGuard],
        data: { partnerScope: 'perfilamientos:crear', partnerMode: true },
        loadComponent: () =>
          import('./features/partners/partner-requests-page.component').then(
            (component) => component.PartnerRequestsPageComponent,
          ),
        title: 'Solicitudes del socio | Solventa',
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
        path: 'siniestros/reportar',
        loadComponent: () =>
          import('./features/claims/claim-report-page.component').then(
            (component) => component.ClaimReportPageComponent,
          ),
        title: 'Reportar siniestro | Solventa',
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
        path: 'polizas',
        loadComponent: () =>
          import('./features/policies/policy-list-page.component').then(
            (component) => component.PolicyListPageComponent,
          ),
        title: 'Mis pólizas | Solventa',
      },
      {
        path: 'polizas/:policyId/renovacion',
        loadComponent: () =>
          import('./features/policies/policy-renewal-page.component').then(
            (component) => component.PolicyRenewalPageComponent,
          ),
        title: 'Renovar póliza | Solventa',
      },
      {
        path: 'polizas/:policyId/modificacion',
        loadComponent: () =>
          import('./features/policies/policy-modification-page.component').then(
            (component) => component.PolicyModificationPageComponent,
          ),
        title: 'Modificar póliza | Solventa',
      },
      {
        path: 'polizas/:policyId/cancelacion',
        loadComponent: () =>
          import('./features/policies/policy-cancellation-page.component').then(
            (component) => component.PolicyCancellationPageComponent,
          ),
        title: 'Cancelar póliza | Solventa',
      },
      {
        path: 'polizas/:policyId',
        loadComponent: () =>
          import('./features/policies/policy-detail-page.component').then(
            (component) => component.PolicyDetailPageComponent,
          ),
        title: 'Detalle de póliza | Solventa',
      },
      {
        path: 'siniestros/:claimId',
        loadComponent: () =>
          import('./features/claims/claim-status-page.component').then(
            (component) => component.ClaimStatusPageComponent,
          ),
        title: 'Estado del siniestro | Solventa',
      },
      {
        path: 'siniestros',
        loadComponent: () =>
          import('./features/claims/claim-list-page.component').then(
            (component) => component.ClaimListPageComponent,
          ),
        title: 'Siniestros | Solventa',
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
        path: 'colas/:queue',
        canActivate: [internalPermissionGuard],
        data: { internalPermission: 'siniestros:revisar' },
        loadComponent: () =>
          import('./features/administration/administration-page.component').then(
            (component) => component.AdministrationPageComponent,
          ),
        title: 'Bandeja de siniestros | Solventa',
      },
      {
        path: 'siniestros/:claimId',
        canActivate: [internalPermissionGuard],
        data: { internalPermission: 'siniestros:revisar' },
        loadComponent: () =>
          import('./features/administration/administration-page.component').then(
            (component) => component.AdministrationPageComponent,
          ),
        title: 'Revisión de siniestro | Solventa',
      },
      {
        path: 'excepciones/:exceptionId',
        canActivate: [internalPermissionGuard],
        data: { internalPermission: 'open_finance:resolver' },
        loadComponent: () =>
          import('./features/advisor/advisor-exceptions-page.component').then(
            (component) => component.AdvisorExceptionsPageComponent,
          ),
        title: 'Detalle de excepción | Solventa',
      },
      {
        path: 'excepciones',
        canActivate: [internalPermissionGuard],
        data: { internalPermission: 'open_finance:resolver' },
        loadComponent: () =>
          import('./features/advisor/advisor-exceptions-page.component').then(
            (component) => component.AdvisorExceptionsPageComponent,
          ),
        title: 'Excepciones Open Finance | Solventa',
      },
      {
        path: 'reportes',
        canActivate: [internalPermissionGuard],
        data: { internalPermission: 'reportes:operativos' },
        loadComponent: () =>
          import('./features/advisor/operational-reports-page.component').then(
            (component) => component.OperationalReportsPageComponent,
          ),
        title: 'Reportes operativos | Solventa',
      },
      {
        path: '',
        pathMatch: 'full',
        data: { advisorHome: true },
        loadComponent: () =>
          import('./features/administration/administration-page.component').then(
            (component) => component.AdministrationPageComponent,
          ),
      },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'iniciar-sesion' },
  { path: '**', redirectTo: 'iniciar-sesion' },
];
