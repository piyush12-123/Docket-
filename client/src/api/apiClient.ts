import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

/**
 * Single shared Axios instance for all API calls.
 *
 * Request interceptor  — attaches `Authorization: Bearer <token>` from the
 *                        auth store when a token is present (Req 3.4).
 * Response interceptor — calls `authStore.logout()` on HTTP 401 so the user
 *                        is cleared and redirected to /login (Req 3.5).
 */
const apiClient = axios.create({
  baseURL: '/',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach Bearer token on every request.
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear auth state (triggers redirect via ProtectedRoute).
apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401
    ) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  },
);

export default apiClient;
