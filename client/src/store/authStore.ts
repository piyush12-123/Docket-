import { create } from 'zustand';

interface User {
  name: string;
  email: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

/**
 * Decode a JWT payload without verifying the signature.
 * Returns null if the token is malformed.
 */
function decodeJwtExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const exp = decodeJwtExp(token);
  if (exp === null) return true;
  // exp is Unix timestamp in seconds
  return Date.now() / 1000 > exp;
}

function readStoredToken(): string | null {
  const token = localStorage.getItem('token');
  if (!token) return null;
  if (isTokenExpired(token)) {
    localStorage.removeItem('token');
    return null;
  }
  return token;
}

function readStoredUser(): User | null {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

// Read persisted state at store creation time (Requirement 3.1, 3.7)
const storedToken = readStoredToken();
const storedUser = storedToken ? readStoredUser() : null;

export const useAuthStore = create<AuthState>()((set) => ({
  token: storedToken,
  user: storedUser,
  isAuthenticated: storedToken !== null,

  // Requirement 3.2 — persist JWT and user to localStorage on login
  login: (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  // Requirement 3.5, 3.6 — clear localStorage and state on logout
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ token: null, user: null, isAuthenticated: false });
  },
}));
