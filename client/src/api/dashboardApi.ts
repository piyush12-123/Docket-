import apiClient from './apiClient';
import type { Document } from './documentsApi';

export interface DashboardStats {
  totalCount: number;
  statusCounts: {
    ready: number;
    processing: number;
    failed: number;
  };
  expiringCount: number;
  unreadNotificationCount: number;
  typeCounts: {
    id: number;
    certificate: number;
    contract: number;
    invoice: number;
    insurance: number;
    warranty: number;
    other: number;
  };
  recentDocuments: Document[];
}

export async function getStats(): Promise<DashboardStats> {
  const response = await apiClient.get<DashboardStats>('/dashboard/stats');
  return response.data;
}
