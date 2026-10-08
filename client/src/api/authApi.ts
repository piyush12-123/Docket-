import apiClient from './apiClient';

interface User {
  name: string;
  email: string;
}

interface AuthResponse {
  token: string;
  user: User;
}

/**
 * Auth API — wraps /api/auth/* endpoints using the shared Axios instance.
 *
 * All functions return the typed response payload directly so callers don't
 * need to unwrap `response.data` themselves.
 */

/**
 * Register a new user.
 * POST /api/auth/register
 * Returns { token, user: { name, email } } on success (Requirement 1.1).
 */
export async function register(
  name: string,
  email: string,
  password: string,
): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/api/auth/register', {
    name,
    email,
    password,
  });
  return response.data;
}

/**
 * Log in an existing user.
 * POST /api/auth/login
 * Returns { token, user: { name, email } } on success (Requirement 2.1).
 */
export async function login(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/api/auth/login', {
    email,
    password,
  });
  return response.data;
}

/**
 * Fetch the authenticated user's profile.
 * GET /api/auth/me
 * Requires a valid Bearer token in the Authorization header (Requirement 2.3).
 */
export async function me(): Promise<User> {
  const response = await apiClient.get<User>('/api/auth/me');
  return response.data;
}
