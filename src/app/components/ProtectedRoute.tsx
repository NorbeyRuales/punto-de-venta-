// Componente guard: bloquea rutas si no hay sesión.
import { Navigate } from 'react-router';
import { usePOS } from '../context/POSContext';
import { getDefaultRouteForRole, type UserRole } from '../constants/permissions';

export function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}) {
  const { isAuthenticated, isAuthReady, currentUser } = usePOS();

  if (!isAuthReady) {
    return null;
  }

  if (!isAuthenticated) {
    // Redirige al login cuando no hay autenticación.
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = currentUser?.role;
    if (!userRole || !allowedRoles.includes(userRole)) {
      return <Navigate to={getDefaultRouteForRole(userRole)} replace />;
    }
  }

  return <>{children}</>;
}
