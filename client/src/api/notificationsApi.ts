import apiClient from './apiClient';

export interface NotificationItem {
  _id: string;
  userId: string;
  documentId: string | null;
  message: string;
  type: 'expiry_alert' | 'processing_complete' | 'processing_failed';
  read: boolean;
  createdAt: string;
}

export async function list(unreadOnly = false): Promise<NotificationItem[]> {
  const params = unreadOnly ? { unreadOnly: 'true' } : {};
  const response = await apiClient.get<NotificationItem[]>('/notifications', { params });
  return response.data;
}

export async function markRead(id: string): Promise<NotificationItem> {
  const response = await apiClient.patch<NotificationItem>(`/notifications/${id}/read`);
  return response.data;
}

export async function markAllRead(): Promise<{ count: number }> {
  const response = await apiClient.patch<{ count: number }>('/notifications/mark-all-read');
  return response.data;
}
