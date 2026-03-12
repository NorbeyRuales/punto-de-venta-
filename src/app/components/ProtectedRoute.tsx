// Componente guard: bloquea rutas si no hay sesión.
import { Navigate } from 'react-router';
import { usePOS } from '../context/POSContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAuthReady } = usePOS();

  if (!isAuthReady) {
    return null;
  }

  if (!isAuthenticated) {
    // Redirige al login cuando no hay autenticación.
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
