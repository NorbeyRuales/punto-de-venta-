// Componente raíz: conecta contexto global, rutas y notificaciones.
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { POSProvider } from './context/POSContext';
import { Toaster } from './components/ui/sonner';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      {/* Contexto global del POS (estado y acciones compartidas) */}
      <POSProvider>
        {/* Ruteo principal de la app */}
        <RouterProvider router={router} />
        {/* Notificaciones tipo toast */}
        <Toaster
          position="bottom-right"
          visibleToasts={2}
          expand={false}
          duration={4000}
          gap={8}
          offset={16}
          mobileOffset={12}
        />
      </POSProvider>
    </ErrorBoundary>
  );
}
