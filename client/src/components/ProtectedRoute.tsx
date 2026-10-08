import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

/**
 * Wraps protected routes. Reads `isAuthenticated` from the auth store and
 * redirects to `/login` if the user has no valid session (Requirement 3.3).
 *
 * Usage in the router:
 *   <Route element={<ProtectedRoute />}>
 *     <Route path="/dashboard" element={<Dashboard />} />
 *     ...
 *   </Route>
 */
export default function ProtectedRoute() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    // `replace` prevents the protected route from being added to history,
    // so the back button won't loop the user back to a page they can't access.
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
