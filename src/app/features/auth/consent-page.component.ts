import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { ProfilingPanelComponent } from '../../shared/profiling/profiling-panel.component';

@Component({
  selector: 'app-consent-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProfilingPanelComponent, TranslocoPipe],
  template: `
    <h1>{{ 'navigation.consent' | transloco }}</h1>
    <p>{{ 'registration.consent.management' | transloco }}</p>
    <app-profiling-panel [requestId]="requestId()" />
  `,
})
export class ConsentPageComponent {
  readonly requestId = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((params) => params.get('solicitud'))),
    { initialValue: null },
  );
}
