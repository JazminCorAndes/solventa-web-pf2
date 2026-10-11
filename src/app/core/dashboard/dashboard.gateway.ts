import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { DashboardSnapshot } from './dashboard.models';

export interface DashboardGateway {
  load(): Observable<DashboardSnapshot>;
}

export const DASHBOARD_GATEWAY = new InjectionToken<DashboardGateway>('DASHBOARD_GATEWAY');
