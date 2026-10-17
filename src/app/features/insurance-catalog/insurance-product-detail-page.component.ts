import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { InsuranceCatalogService } from '../../core/insurance-catalog/insurance-catalog.service';
import { SvgIconComponent } from '../../shared/svg-icon/svg-icon.component';

@Component({
  selector: 'app-insurance-product-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    MatButtonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    RouterLink,
    SvgIconComponent,
    TranslocoPipe,
  ],
  templateUrl: './insurance-product-detail-page.component.html',
  styleUrl: './insurance-product-detail-page.component.scss',
})
export class InsuranceProductDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  readonly catalog = inject(InsuranceCatalogService);
  readonly productId = this.route.snapshot.paramMap.get('productoId') ?? '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.catalog.loadProduct(this.productId);
  }
}
