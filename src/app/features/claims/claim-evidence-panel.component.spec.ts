import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import es from '../../../../public/assets/i18n/es.json';
import { AuthUser } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { TEST_USER } from '../../core/auth/auth.testing';
import { ClaimEvidence } from '../../core/claims/claim-evidence.models';
import { ClaimEvidencePanelComponent } from './claim-evidence-panel.component';

const evidence: ClaimEvidence = {
  id: '33333333-3333-4333-8333-333333333333',
  siniestroId: '11111111-1111-4111-8111-111111111111',
  mimeType: 'image/png',
  tamanoBytes: 1,
  sha256: 'a'.repeat(64),
  creadaEn: '2026-11-08T10:00:00Z',
};

describe('ClaimEvidencePanelComponent private downloads', () => {
  let fixture: ComponentFixture<ClaimEvidencePanelComponent>;
  const user = signal<AuthUser | null>(TEST_USER);

  beforeEach(async () => {
    user.set(TEST_USER);
    await TestBed.configureTestingModule({
      imports: [
        ClaimEvidencePanelComponent,
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [provideHttpClient(), { provide: AuthService, useValue: { user } }],
    }).compileComponents();
    fixture = TestBed.createComponent(ClaimEvidencePanelComponent);
    fixture.componentRef.setInput('claimId', evidence.siniestroId);
    fixture.detectChanges();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:private-evidence');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('descarga solo blob temporal y revoca su URL', async () => {
    vi.useFakeTimers();
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
    vi.spyOn(fixture.componentInstance.evidence, 'download').mockResolvedValue(blob);
    await fixture.componentInstance.download(evidence);
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-evidence');
  });

  it.each(['actor', 'claim'] as const)(
    'no descarga una respuesta tardía después de cambiar %s',
    async (change) => {
      let resolve!: (blob: Blob) => void;
      vi.spyOn(fixture.componentInstance.evidence, 'download').mockReturnValue(
        new Promise((done) => {
          resolve = done;
        }),
      );
      const result = fixture.componentInstance.download(evidence);
      if (change === 'actor') user.set(null);
      else fixture.componentRef.setInput('claimId', evidence.id);
      resolve(new Blob([new Uint8Array([1])], { type: 'image/png' }));
      await result;
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    },
  );
});
