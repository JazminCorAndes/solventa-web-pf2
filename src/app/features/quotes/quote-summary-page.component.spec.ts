import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError, Subject } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import { AuthService } from '../../core/auth/auth.service';
import { AuthUser } from '../../core/auth/auth.models';
import {
  QUOTE_REQUEST_GATEWAY,
  QuoteRequestGateway,
} from '../../core/quotes/quote-request.gateway';
import { QUOTE_REQUEST_STORAGE } from '../../core/quotes/quote-request-storage.service';
import { OFFER_SELECTION_STORAGE } from '../../core/offers/offer-selection-storage.service';
import { QuoteRequestRecord } from '../../core/quotes/quote-request.models';
import { PROFILING_GATEWAY } from '../../core/profiling/profiling.gateway';
import { createConsent, createProfile } from '../../../testing/core/profiling/profiling.fixtures';
import { HISTORY_CLIENT_ID, historyEntry } from '../../../testing/quotes/quote-history.testing';
import {
  HttpQuoteHistoryGateway,
  QuoteHistoryEntry,
} from '../../data-access/quotes/http-quote-history.gateway';
import { QuoteSummaryPageComponent } from './quote-summary-page.component';

const RECORD: QuoteRequestRecord = {
  id: 'AQT-2026-123456',
  status: 'received',
  createdAt: '2026-10-11T12:00:00Z',
  productId: 'automotive',
  customerType: 'natural',
  documentType: 'cc',
  nationalId: '12345678-9',
  productData: { vehiclePlate: 'ABC123' },
  email: 'cliente@example.test',
  phone: '+573001234567',
};
const USER: AuthUser = {
  id: HISTORY_CLIENT_ID,
  name: 'Cliente',
  email: RECORD.email,
  role: 'client',
};

describe('QuoteSummaryPageComponent', () => {
  let fixture: ComponentFixture<QuoteSummaryPageComponent>;
  let entries: QuoteHistoryEntry[];
  const user = signal<AuthUser | null>(USER);
  const history = {
    loadClientHistory: vi.fn(),
    loadClientState: vi.fn(),
    reject: vi.fn(),
  };
  const quotes: Partial<QuoteRequestGateway> = {
    loadRequest: vi.fn(),
    loadProducts: vi.fn(() =>
      of([
        {
          id: 'automotive',
          name: 'Seguro Automotriz Total',
          description: '',
          available: true,
          mainCoverages: [],
        },
      ]),
    ),
    loadTravelDestinations: vi.fn(() => of([])),
  };
  const profiling = { loadConsent: vi.fn(), loadProfile: vi.fn() };
  beforeEach(async () => {
    user.set(USER);
    entries = [historyEntry()];
    history.loadClientHistory.mockReset().mockImplementation(() => of(entries));
    history.loadClientState
      .mockReset()
      .mockImplementation(() => of(historyEntry({ status: 'vencida' })));
    history.reject.mockReset().mockReturnValue(of({ status: 'rechazada' }));
    vi.mocked(quotes.loadRequest!)
      .mockReset()
      .mockImplementation((id) => of({ ...RECORD, id }));
    profiling.loadConsent.mockReset().mockReturnValue(of(createConsent()));
    profiling.loadProfile.mockReset().mockImplementation((id: string) => of(createProfile(id)));
    await TestBed.configureTestingModule({
      imports: [
        QuoteSummaryPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user } },
        { provide: HttpQuoteHistoryGateway, useValue: history },
        { provide: QUOTE_REQUEST_GATEWAY, useValue: quotes },
        {
          provide: QUOTE_REQUEST_STORAGE,
          useValue: { read: () => null, write: vi.fn(), clear: vi.fn() },
        },
        {
          provide: OFFER_SELECTION_STORAGE,
          useValue: { read: () => null, write: vi.fn(), clear: vi.fn() },
        },
        { provide: PROFILING_GATEWAY, useValue: profiling },
      ],
    }).compileComponents();
  });
  const render = () => {
    fixture = TestBed.createComponent(QuoteSummaryPageComponent);
    fixture.detectChanges();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('explains an expired-profile recovery even when there are no actionable quotations', () => {
    entries = [];
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { queryParamMap: convertToParamMap({ error: 'expired' }) } },
    });
    const root = render();
    expect(root.querySelector('[role=alert]')?.textContent).toContain(es.profiling.errors.expired);
    expect(root.querySelector('.summary-card')).toBeNull();
    expect(quotes.loadRequest).not.toHaveBeenCalled();
  });

  it('excludes purchased quotations without loading their details or continuation', () => {
    entries = [
      historyEntry({
        status: 'completada',
        paymentStatus: 'confirmado',
        emissionStatus: 'emitida',
        completedAt: '2026-11-01T12:00:00Z',
        validUntil: '2000-01-01T00:00:00Z',
      }),
    ];
    const root = render();
    expect(root.querySelector('.summary-card')).toBeNull();
    expect(quotes.loadRequest).not.toHaveBeenCalled();
    expect(root.querySelector('app-profiling-panel')).toBeNull();
    expect(history.loadClientHistory).toHaveBeenCalledWith(USER.id);
  });

  it('excludes expired quotations without loading their details', () => {
    entries = [historyEntry({ status: 'vencida' })];
    const root = render();
    expect(root.querySelector('.summary-card')).toBeNull();
    expect(quotes.loadRequest).not.toHaveBeenCalled();
    expect(root.querySelector('app-profiling-panel')).toBeNull();
    expect(root.textContent).not.toContain(es.profiling.errors.expired);
  });

  it('retains explicit rejection instead of expiring it and exposes no continuation', () => {
    entries = [
      historyEntry({
        status: 'rechazada',
        rejectedAt: '2026-11-01T12:00:00Z',
        validUntil: '2000-01-01T00:00:00Z',
      }),
    ];
    const root = render();
    expect(root.querySelector('.summary-card')?.textContent).toContain('Rechazada');
    expect(root.querySelector('.summary-card a, .summary-card button')).toBeNull();
  });

  it('keeps pending quotations separate, including the persisted partner choice', () => {
    entries = [
      historyEntry(),
      historyEntry({
        requestId: 'AQT-2026-654321',
        quoteId: '44444444-4444-4444-8444-444444444444',
        selectionState: {
          quoteId: 'AQT-2026-654321',
          acceptance: null,
          offerStatus: 'available',
          selection: {
            quoteId: 'AQT-2026-654321',
            offerId: '55555555-5555-4555-8555-555555555555',
            offerVersion: 1,
            offerName: 'Plan elegido por socio',
            premium: { amount: 15000, currency: 'COP' },
            periodicity: 'mensual',
            selectedAt: '2026-11-01T12:00:00Z',
            confirmed: false,
            revision: 1,
            validUntil: '2099-01-01T00:00:00Z',
          },
        },
      }),
    ];
    const root = render();
    expect(root.querySelectorAll('.summary-card')).toHaveLength(2);
    expect(root.textContent).toContain('Plan elegido por socio');
    expect(
      root.querySelector('a[href="/app/cotizaciones/ofertas?solicitud=AQT-2026-654321"]'),
    ).not.toBeNull();
    expect(root.textContent).toContain('Pendiente');
  });

  it('asks the server for state after an expired profile read, not the browser clock', () => {
    profiling.loadProfile.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 422, error: { code: 'perfil_vencido' } })),
    );
    const root = render();
    expect(history.loadClientState).toHaveBeenCalledWith(RECORD.id, USER.id);
    expect(root.querySelector('.summary-card')).toBeNull();
    expect(root.querySelector('app-profiling-panel')).toBeNull();
    expect(root.textContent).not.toContain(es.profiling.errors.expired);
  });

  it('refreshes authoritative state at profile deadline without inventing expiration', () => {
    vi.useFakeTimers();
    try {
      history.loadClientState.mockReturnValue(of(historyEntry()));
      const root = render();
      vi.advanceTimersByTime(15 * 60000);
      fixture.detectChanges();
      expect(history.loadClientState).toHaveBeenCalledWith(RECORD.id, USER.id);
      expect(root.querySelector('.status')?.textContent).toContain('Pendiente');
      fixture.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps actionable requests when history also contains purchased and expired entries', () => {
    entries = [
      historyEntry(),
      historyEntry({ requestId: 'AQT-2026-BOUGHT', status: 'completada' }),
      historyEntry({ requestId: 'AQT-2026-EXPIRED', status: 'vencida' }),
    ];
    const root = render();
    expect(root.querySelectorAll('.summary-card')).toHaveLength(1);
    expect(quotes.loadRequest).toHaveBeenCalledExactlyOnceWith(RECORD.id);
  });

  it('persists explicit rejection and recovers it from authoritative state and reload', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const rejected = historyEntry({ status: 'rechazada', rejectedAt: '2026-11-01T12:00:00Z' });
    history.loadClientState.mockReturnValue(of(rejected));
    const root = render();
    fixture.componentInstance.reject(fixture.componentInstance.cards()[0]);
    fixture.detectChanges();
    expect(history.reject.mock.calls[0].slice(0, 2)).toEqual([RECORD.id, entries[0].quoteId]);
    expect(history.reject.mock.calls[0][2]).toMatch(/^[0-9a-f-]{36}$/);
    expect(root.querySelector('.status')?.textContent).toContain('Rechazada');
    expect(root.querySelector('.summary-card button, .summary-card a')).toBeNull();
    entries = [rejected];
    fixture.componentInstance.load();
    fixture.detectChanges();
    expect(root.querySelector('.status')?.textContent).toContain('Rechazada');
  });

  it('does not reject on cancelled confirmation and retries an uncertain result using the same key', () => {
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render();
    const card = fixture.componentInstance.cards()[0];
    fixture.componentInstance.reject(card);
    expect(history.reject).not.toHaveBeenCalled();
    confirmation.mockReturnValue(true);
    history.reject.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    fixture.componentInstance.reject(card);
    fixture.componentInstance.retryRejection();
    expect(history.reject.mock.calls[1]).toEqual(history.reject.mock.calls[0]);
    expect(fixture.componentInstance.canReject(card)).toBe(false);
  });

  it('drops history when authenticated owner changes', () => {
    const root = render();
    user.set(null);
    fixture.detectChanges();
    expect(fixture.componentInstance.cards()).toEqual([]);
    expect(root.querySelector('.summary-card')).toBeNull();
  });
  it('cancels an in-flight rejection and clears its attempt when the owner leaves', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const pending = new Subject<unknown>();
    history.reject.mockReturnValue(pending);
    render();
    fixture.componentInstance.reject(fixture.componentInstance.cards()[0]);
    expect(pending.observed).toBe(true);
    user.set(null);
    fixture.detectChanges();
    expect(pending.observed).toBe(false);
    expect(fixture.componentInstance.pendingRejection()).toBeNull();
    expect(fixture.componentInstance.rejectionBusy()).toBe(false);
  });
  it('does not replace terminal rejection with an older concurrent pending read', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const delayed = new Subject<QuoteHistoryEntry>();
    history.loadClientState
      .mockReturnValueOnce(delayed)
      .mockReturnValue(
        of(historyEntry({ status: 'rechazada', rejectedAt: '2026-11-01T12:00:00Z' })),
      );
    render();
    fixture.componentInstance.refreshState(RECORD.id);
    fixture.componentInstance.reject(fixture.componentInstance.cards()[0]);
    delayed.next(historyEntry());
    expect(fixture.componentInstance.cards()[0].state.status).toBe('rechazada');
  });

  it('distinguishes empty history from a failed read and retries without cached fixtures', () => {
    history.loadClientHistory.mockReturnValueOnce(throwError(() => new Error('offline')));
    const root = render();
    expect(root.querySelector('[role=alert]')).not.toBeNull();
    expect(root.querySelector('.summary-card')).toBeNull();
    entries = [];
    fixture.componentInstance.load();
    fixture.detectChanges();
    expect(root.querySelector('.empty-card')).not.toBeNull();
  });
});
