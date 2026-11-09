import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CLAIM_ID_PATTERN } from '../../core/claims/claim-status.models';
import { ClaimStatusService } from '../../core/claims/claim-status.service';

@Component({
  selector: 'app-claim-status-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './claim-status-page.component.html',
  styleUrl: './claim-status-page.component.scss',
})
export class ClaimStatusPageComponent implements OnInit {
  readonly claims = inject(ClaimStatusService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly i18n = inject(TranslocoService);

  readonly claimId = signal<string | null>(null);
  readonly lookup = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(CLAIM_ID_PATTERN)],
  });
  readonly lookupForm = new FormGroup({ claimId: this.lookup });

  get dateLocale(): string {
    return this.i18n.getActiveLang() === 'en' ? 'en-US' : 'es-CO';
  }

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const claimId = params.get('claimId');
      if (claimId === null || !CLAIM_ID_PATTERN.test(claimId)) {
        this.claimId.set(null);
        if (claimId !== null) {
          this.lookup.setValue(claimId);
          this.lookup.markAsTouched();
        }
        return;
      }
      this.claimId.set(claimId);
      this.lookup.setValue(claimId);
      this.claims.load(claimId);
    });
  }

  search(): void {
    const claimId = this.lookup.value.trim();
    this.lookup.setValue(claimId);
    if (this.lookup.invalid) {
      this.lookup.markAsTouched();
      return;
    }
    if (claimId === this.claimId()) {
      this.refresh();
      return;
    }
    void this.router.navigate(['/app/siniestros', claimId]);
  }

  refresh(): void {
    const claimId = this.claimId();
    if (claimId) {
      this.claims.load(claimId);
    }
  }
}
