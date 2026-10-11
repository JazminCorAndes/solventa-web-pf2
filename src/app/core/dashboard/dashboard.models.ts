export type PolicyStatus = 'active' | 'pending';

export interface PolicySummary {
  id: string;
  product: string;
  premiumCop: number;
  status: PolicyStatus;
}

export interface NotificationSummary {
  id: string;
  title: string;
  createdAt: string;
  read: boolean;
}

export interface DashboardSnapshot {
  policies: PolicySummary[];
  notifications: NotificationSummary[];
  upcomingTrip: string;
}
