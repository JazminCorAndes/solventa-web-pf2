import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  signal,
  SimpleChanges,
  HostListener,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, map, Observable, of, Subscription, switchMap, take, throwError } from 'rxjs';
import { ProfilingError, profilingErrorKey } from '../../core/profiling/profiling.errors';
import { PROFILING_GATEWAY } from '../../core/profiling/profiling.gateway';
import { ProfilingClock } from '../../core/profiling/profiling-clock.service';
import {
  consentIsComplete,
  consentIsCurrent,
  consentIsReadable,
  ConsentDecision,
  ConsentRequest,
  consentRequestIssues,
  createConsentRequest,
  ProfilingConsent,
  profileIsCurrent,
  RiskProfile,
} from '../../core/profiling/profiling.models';

@Component({
  selector: 'app-profiling-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './profiling-panel.component.html',
  styleUrl: './profiling-panel.component.scss',
})
export class ProfilingPanelComponent implements OnInit, OnChanges, OnDestroy {
  private readonly gateway = inject(PROFILING_GATEWAY);
  private readonly clock = inject(ProfilingClock);
  private subscription?: Subscription;
  private expiration?: ReturnType<typeof setTimeout>;
  @Input() requestId: string | null = null;
  @Output() readonly availabilityChange = new EventEmitter<boolean>();
  readonly consent = signal<ProfilingConsent | null>(null);
  readonly profile = signal<RiskProfile | null>(null);
  readonly loading = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly authorized = signal(false);
  readonly consentLoaded = signal(false);
  readonly consentRequest = signal<ConsentRequest | null>(null);
  readonly incompleteEvidence = signal(false);
  readonly confirmingRevocation = signal(false);
  readonly consentExpired = signal(false);
  readonly requestIssues = computed(() =>
    consentRequestIssues(this.consentRequest(), this.clock.now()),
  );

  ngOnInit(): void {
    this.reload();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['requestId'] && !changes['requestId'].firstChange) {
      this.reload();
    }
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    clearTimeout(this.expiration);
  }

  reload(): void {
    this.run(this.gateway.loadConsent());
  }

  @HostListener('window:focus')
  onFocus(): void {
    if (!this.loading()) {
      this.reload();
    }
  }

  save(authorized: boolean): void {
    if (this.loading() || !this.consentLoaded()) {
      return;
    }
    const solicitud = this.consentRequest();
    if (solicitud && Date.parse(solicitud.vigenteHasta) <= this.clock.now()) {
      this.errorKey.set('profiling.errors.decisionExpired');
      return;
    }
    if (!solicitud || consentRequestIssues(solicitud, this.clock.now()).length) {
      this.errorKey.set('profiling.errors.incompleteRequest');
      return;
    }
    this.saveDecision({
      autorizado: authorized,
      version: this.consent()?.version ?? 0,
      solicitud,
    });
  }

  revoke(): void {
    if (!this.loading() && this.consentLoaded() && this.consent()?.estado === 'autorizado') {
      this.confirmingRevocation.set(true);
    }
  }

  cancelRevocation(): void {
    this.confirmingRevocation.set(false);
  }

  confirmRevocation(): void {
    const consent = this.consent();
    if (
      !this.confirmingRevocation() ||
      this.loading() ||
      !this.consentLoaded() ||
      consent?.estado !== 'autorizado'
    ) {
      return;
    }
    this.saveDecision({ autorizado: false, version: consent.version });
  }

  private saveDecision(decision: ConsentDecision): void {
    const expectedState = decision.autorizado
      ? 'autorizado'
      : decision.solicitud
        ? 'rechazado'
        : 'revocado';
    this.run(
      this.gateway.saveConsent(decision).pipe(
        catchError((error: unknown) => {
          if (
            (error instanceof HttpErrorResponse && error.status === 400) ||
            (error instanceof ProfilingError && error.code === 'solicitud_invalida')
          ) {
            return throwError(() => new ProfilingError('solicitud_consentimiento_invalida'));
          }
          return throwError(() => error);
        }),
        map((consent) => {
          if (
            !consentIsReadable(consent) ||
            consent.estado !== expectedState ||
            consent.version !== decision.version + 1 ||
            (decision.autorizado && !consentIsComplete(consent))
          ) {
            throw new ProfilingError('respuesta_invalida');
          }
          return consent;
        }),
      ),
    );
  }

  private run(operation: Observable<ProfilingConsent | null>): void {
    this.subscription?.unsubscribe();
    clearTimeout(this.expiration);
    this.profile.set(null);
    this.consent.set(null);
    this.authorized.set(false);
    this.availabilityChange.emit(false);
    this.errorKey.set(null);
    this.loading.set(true);
    this.consentLoaded.set(false);
    this.consentRequest.set(null);
    this.incompleteEvidence.set(false);
    this.confirmingRevocation.set(false);
    this.consentExpired.set(false);
    this.subscription = operation
      .pipe(
        take(1),
        switchMap((consent) => {
          if (consent && !consentIsReadable(consent)) {
            throw new ProfilingError('respuesta_invalida');
          }
          this.consent.set(consent);
          this.updateExpiration();
          this.consentLoaded.set(true);
          this.consentRequest.set(createConsentRequest(this.clock.earliestNow()));
          this.incompleteEvidence.set(!!consent && !consentIsComplete(consent));
          const authorized = consentIsCurrent(consent, this.clock.now());
          this.authorized.set(authorized);
          if (!authorized) {
            this.errorKey.set(consent ? 'profiling.errors.consent' : null);
            return of(null);
          }
          this.expireAt([consent!.vigenteHasta], 'profiling.errors.consent');
          return this.requestId ? this.gateway.loadProfile(this.requestId) : of(null);
        }),
      )
      .subscribe({
        next: (profile) => {
          if (profile && !consentIsCurrent(this.consent(), this.clock.now())) {
            this.fail(new ProfilingError('consentimiento_no_vigente'));
            return;
          }
          if (
            (profile &&
              (!this.requestId ||
                !profileIsCurrent(profile, this.consent(), this.requestId, this.clock.now()))) ||
            (this.authorized() && this.requestId && !profile)
          ) {
            this.fail(new ProfilingError('respuesta_invalida'));
            return;
          }
          this.profile.set(profile);
          this.loading.set(false);
          if (profile) {
            this.expireAt(
              [
                this.consent()!.vigenteHasta,
                profile.vigenteHasta,
                ...profile.fuentes.map((source) => source.vigenteHasta),
              ],
              'profiling.errors.expired',
            );
          }
          this.availabilityChange.emit(this.authorized() && (!this.requestId || !!profile));
        },
        error: (error: unknown) => this.fail(error),
      });
  }

  private fail(error: unknown): void {
    clearTimeout(this.expiration);
    this.loading.set(false);
    this.profile.set(null);
    this.authorized.set(false);
    this.errorKey.set(profilingErrorKey(error) ?? 'profiling.errors.unavailable');
    this.availabilityChange.emit(false);
  }

  private expireAt(dates: string[], errorKey: string): void {
    clearTimeout(this.expiration);
    const delay = Math.min(...dates.map((date) => Date.parse(date))) - this.clock.now();
    this.expiration = setTimeout(
      () => {
        if (delay > 2147483647) {
          this.expireAt(dates, errorKey);
          return;
        }
        this.profile.set(null);
        this.authorized.set(false);
        this.updateExpiration();
        this.errorKey.set(errorKey);
        this.availabilityChange.emit(false);
      },
      Math.min(Math.max(delay, 0), 2147483647),
    );
  }

  private updateExpiration(): void {
    const consent = this.consent();
    this.consentExpired.set(
      consent?.estado === 'autorizado' && Date.parse(consent.vigenteHasta) <= this.clock.now(),
    );
  }
}
