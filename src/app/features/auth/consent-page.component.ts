import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ProfilingPanelComponent } from '../../shared/profiling/profiling-panel.component';

@Component({
  selector: 'app-consent-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProfilingPanelComponent, TranslocoPipe],
  template: `
    <h1>{{ 'navigation.consent' | transloco }}</h1>
    <p>{{ 'registration.consent.management' | transloco }}</p>
    <app-profiling-panel />
  `,
})
export class ConsentPageComponent {}
