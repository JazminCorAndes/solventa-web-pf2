import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { InsuranceCatalogService } from '../../core/insurance-catalog/insurance-catalog.service';
import { SvgIconComponent } from '../../shared/svg-icon/svg-icon.component';

@Component({
  selector: 'app-insurance-catalog-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    RouterLink,
    SvgIconComponent,
    TranslocoPipe,
  ],
  templateUrl: './insurance-catalog-page.component.html',
  styleUrl: './insurance-catalog-page.component.scss',
})
export class InsuranceCatalogPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  readonly catalog = inject(InsuranceCatalogService);
  readonly selectedProductId = this.route.snapshot.queryParamMap.get('seleccion');

  ngOnInit(): void {
    this.catalog.loadProducts();
  }
}
