import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SubscriptionService } from '../../core/subscriptions/subscription.service';
import { SvgIconComponent } from '../../shared/svg-icon/svg-icon.component';

@Component({
  selector: 'app-subscription-status-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, RouterLink, SvgIconComponent, TranslocoPipe],
  templateUrl: './subscription-status-page.component.html',
  styleUrl: './subscription-status-page.component.scss',
})
export class SubscriptionStatusPageComponent implements OnInit {
  readonly subscriptions = inject(SubscriptionService);

  ngOnInit(): void {
    this.subscriptions.load();
  }
}
