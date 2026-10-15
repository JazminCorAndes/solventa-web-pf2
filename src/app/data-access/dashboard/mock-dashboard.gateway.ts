import { Injectable } from '@angular/core';
import { Observable, of, delay } from 'rxjs';
import { DashboardGateway } from '../../core/dashboard/dashboard.gateway';
import { DashboardSnapshot } from '../../core/dashboard/dashboard.models';

const DASHBOARD_FIXTURE: DashboardSnapshot = {
  upcomingTrip: 'Madrid',
  policies: [
    {
      id: 'POL-TRAVEL-001',
      product: 'Seguro de viaje',
      premiumCop: 189900,
      status: 'active',
    },
    {
      id: 'POL-LIFE-002',
      product: 'Microseguro de vida',
      premiumCop: 120000,
      status: 'active',
    },
    {
      id: 'POL-DEVICE-003',
      product: 'Protección de dispositivos',
      premiumCop: 45900,
      status: 'pending',
    },
  ],
  notifications: [
    {
      id: 'notification-001',
      title: 'Tu seguro de viaje está activo',
      createdAt: '2026-10-10T14:30:00.000Z',
      read: false,
    },
    {
      id: 'notification-002',
      title: 'Recibimos el pago de tu póliza',
      createdAt: '2026-10-08T16:00:00.000Z',
      read: false,
    },
    {
      id: 'notification-003',
      title: 'Actualizamos tus documentos',
      createdAt: '2026-10-01T09:15:00.000Z',
      read: true,
    },
  ],
};

@Injectable()
export class MockDashboardGateway implements DashboardGateway {
  load(): Observable<DashboardSnapshot> {
    return of(DASHBOARD_FIXTURE).pipe(delay(450));
  }
}
