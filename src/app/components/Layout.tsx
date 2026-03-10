import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation, useNavigation } from 'react-router';
import { usePOS } from '../context/POSContext';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  ShoppingBag,
  Package, 
  Users, 
  TrendingUp, 
  FileText, 
  Smartphone, 
  Settings, 
  LogOut, 
  Menu,
  X
} from 'lucide-react';
import { Button } from './ui/button';
import { DEFAULT_LOGO_PATH, FALLBACK_LOGO_DATA_URL } from '../constants/branding';

export function Layout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showRouteLoading, setShowRouteLoading] = useState(false);
  const { currentUser, logout, storeConfig, isAuthenticated, hasConnectedStore } = usePOS();
  const navigate = useNavigate();
  const location = useLocation();
  const navigation = useNavigation();
  const hideTimeoutRef = useRef<number | null>(null);
  const navigationStateRef = useRef(navigation.state);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const logoSrc = storeConfig.logo || DEFAULT_LOGO_PATH;

  const menuItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/pos', icon: ShoppingCart, label: 'Nueva Venta' },
    { path: '/purchases', icon: ShoppingBag, label: 'Compras' },
    { path: '/inventory', icon: Package, label: 'Inventario' },
    { path: '/customers', icon: Users, label: 'Clientes' },
    { path: '/suppliers', icon: TrendingUp, label: 'Proveedores' },
    { path: '/reports', icon: FileText, label: 'Reportes' },
    { path: '/recharges', icon: Smartphone, label: 'Recargas' },
    { path: '/configuration', icon: Settings, label: 'Configuración' },
  ];

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const showLoadingBar = () => {
    if (hideTimeoutRef.current) {
      window.clearTimeout(hideTimeoutRef.current);
    }
    setShowRouteLoading(true);
    hideTimeoutRef.current = window.setTimeout(() => {
      if (navigationStateRef.current === 'idle') {
        setShowRouteLoading(false);
      }
    }, 700);
  };

  useEffect(() => {
    showLoadingBar();
  }, [location.pathname]);

  useEffect(() => {
    navigationStateRef.current = navigation.state;
    if (navigation.state !== 'idle') {
      showLoadingBar();
    }
  }, [navigation.state]);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        window.clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  const showConnectionDot = isAuthenticated;
  const isConnected = isAuthenticated && hasConnectedStore && isOnline;

  return (
    <div className="min-h-screen bg-secondary flex">
      {showRouteLoading && (
        <div className="top-loading-bar" role="status" aria-live="polite">
          <div className="top-loading-bar__indicator" />
        </div>
      )}
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-white border-r border-border">
        <div className="p-6 border-b border-border">
          <div className="flex flex-col items-center text-center gap-2">
            <div className="relative w-16 h-16">
              <div className="w-full h-full rounded-xl border border-border bg-white overflow-hidden flex items-center justify-center">
                <img
                  src={logoSrc}
                  alt="Logo de la tienda"
                  className="w-full h-full object-contain"
                  onError={(event) => {
                    if (event.currentTarget.src !== FALLBACK_LOGO_DATA_URL) {
                      event.currentTarget.src = FALLBACK_LOGO_DATA_URL;
                    }
                  }}
                />
              </div>
              {showConnectionDot && (
                <span
                  className={`absolute -bottom-2 -right-2 size-4 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(91,124,255,0.35),0_0_8px_rgba(15,23,42,0.25)] ${isConnected ? 'bg-[#2ECC71]' : 'bg-[#E74C3C]'}`}
                  aria-label={isConnected ? 'Conectado' : 'Sin conexión'}
                  title={isConnected ? 'Conectado' : 'Sin conexión'}
                />
              )}
            </div>
            <span className="sr-only">{storeConfig.name}</span>
          </div>
        </div>
        
        <nav className="flex-1 p-4 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-colors ${
                  isActive 
                  ? 'bg-[var(--primary)] text-white' 
                  : 'text-foreground hover:bg-secondary'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <Button
            onClick={handleLogout}
            variant="outline"
            className="w-full"
          >
            <LogOut className="w-5 h-5 mr-2" />
            Cerrar Sesión
          </Button>
        </div>
      </aside>

      {/* Sidebar Mobile */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white flex flex-col">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div className="flex flex-col items-center text-center gap-2">
                <div className="relative w-14 h-14">
                  <div className="w-full h-full rounded-xl border border-border bg-white overflow-hidden flex items-center justify-center">
                    <img
                      src={logoSrc}
                      alt="Logo de la tienda"
                      className="w-full h-full object-contain"
                      onError={(event) => {
                        if (event.currentTarget.src !== FALLBACK_LOGO_DATA_URL) {
                          event.currentTarget.src = FALLBACK_LOGO_DATA_URL;
                        }
                      }}
                    />
                  </div>
                  {showConnectionDot && (
                    <span
                      className={`absolute -bottom-2 -right-2 size-4 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(91,124,255,0.35),0_0_8px_rgba(15,23,42,0.25)] ${isConnected ? 'bg-[#2ECC71]' : 'bg-[#E74C3C]'}`}
                      aria-label={isConnected ? 'Conectado' : 'Sin conexión'}
                      title={isConnected ? 'Conectado' : 'Sin conexión'}
                    />
                  )}
                </div>
                <span className="sr-only">{storeConfig.name}</span>
              </div>
              <button onClick={() => setIsSidebarOpen(false)}>
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <nav className="flex-1 p-4 overflow-y-auto">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigate(item.path);
                      setIsSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-colors ${
                      isActive 
                        ? 'bg-[var(--primary)] text-white' 
                        : 'text-foreground hover:bg-secondary'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="p-4 border-t border-border">
              <Button
                onClick={handleLogout}
                variant="outline"
                className="w-full"
              >
                <LogOut className="w-5 h-5 mr-2" />
                Cerrar Sesión
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header Mobile */}
        <header className="lg:hidden bg-white border-b border-border p-4 flex items-center justify-between">
          <button onClick={() => setIsSidebarOpen(true)}>
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="relative w-8 h-8">
              <div className="w-full h-full rounded-lg border border-border bg-white overflow-hidden flex items-center justify-center">
                <img
                  src={logoSrc}
                  alt="Logo de la tienda"
                  className="w-full h-full object-contain"
                  onError={(event) => {
                    if (event.currentTarget.src !== FALLBACK_LOGO_DATA_URL) {
                      event.currentTarget.src = FALLBACK_LOGO_DATA_URL;
                    }
                  }}
                />
              </div>
              {showConnectionDot && (
                <span
                  className={`absolute -bottom-2 -right-2 size-3.5 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(91,124,255,0.35),0_0_6px_rgba(15,23,42,0.2)] ${isConnected ? 'bg-[#2ECC71]' : 'bg-[#E74C3C]'}`}
                  aria-label={isConnected ? 'Conectado' : 'Sin conexión'}
                  title={isConnected ? 'Conectado' : 'Sin conexión'}
                />
              )}
            </div>
            <h2 className="font-bold">{storeConfig.name}</h2>
          </div>
          <div className="w-6" />
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
