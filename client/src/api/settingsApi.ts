import apiClient from './apiClient';

export interface UpdateProfilePayload {
  name?: string;
  email?: string;
}

export interface UpdatePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<{ user: { name: string; email: string } }> {
  const response = await apiClient.patch<{ user: { name: string; email: string } }>('/settings/profile', payload);
  return response.data;
}

export async function updatePassword(payload: UpdatePasswordPayload): Promise<{ message: string }> {
  const response = await apiClient.patch<{ message: string }>('/settings/password', payload);
  return response.data;
}

export async function deleteAccount(): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>('/settings/account');
  return response.data;
}
