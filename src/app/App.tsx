import { RouterProvider } from 'react-router';
import { router } from './routes';
import { POSProvider } from './context/POSContext';
import { Toaster } from './components/ui/sonner';

export default function App() {
  return (
    <POSProvider>
      <RouterProvider router={router} />
      <Toaster position="top-right" />
    </POSProvider>
  );
}
