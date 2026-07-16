// Layout principal con sidebar, header móvil y estado de conexión.
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
  Wallet,
  Settings, 
  LogOut, 
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { Button } from './ui/button';
import { DEFAULT_LOGO_PATH, FALLBACK_LOGO_DATA_URL } from '../constants/branding';
import type { UserRole } from '../constants/permissions';

export function Layout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('pos-sidebar-collapsed') === 'true';
  });
  const [showRouteLoading, setShowRouteLoading] = useState(false);
  const { currentUser, logout, storeConfig, isAuthenticated, hasConnectedStore } = usePOS();
  const navigate = useNavigate();
  const location = useLocation();
  const navigation = useNavigation();
  const hideTimeoutRef = useRef<number | null>(null);
  const navigationStateRef = useRef(navigation.state);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const logoSrc = storeConfig.logo || DEFAULT_LOGO_PATH;

  // Menú lateral con rutas principales.
  const menuItems: Array<{
    path: string;
    icon: typeof LayoutDashboard;
    label: string;
    allowedRoles: UserRole[];
  }> = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', allowedRoles: ['admin', 'cashier'] },
    { path: '/pos', icon: ShoppingCart, label: 'Nueva Venta', allowedRoles: ['admin', 'cashier'] },
    { path: '/cash-register', icon: Wallet, label: 'Caja', allowedRoles: ['admin', 'cashier'] },
    { path: '/purchases', icon: ShoppingBag, label: 'Compras', allowedRoles: ['admin', 'cashier'] },
    { path: '/inventory', icon: Package, label: 'Inventario', allowedRoles: ['admin', 'cashier'] },
    { path: '/customers', icon: Users, label: 'Clientes', allowedRoles: ['admin', 'cashier'] },
    { path: '/suppliers', icon: TrendingUp, label: 'Proveedores', allowedRoles: ['admin'] },
    { path: '/reports', icon: FileText, label: 'Reportes', allowedRoles: ['admin', 'cashier'] },
    { path: '/recharges', icon: Smartphone, label: 'Recargas', allowedRoles: ['admin', 'cashier'] },
    { path: '/configuration', icon: Settings, label: 'Configuración', allowedRoles: ['admin'] },
  ];

  const visibleMenuItems = menuItems.filter((item) => {
    const activeRole: UserRole = currentUser?.role ?? 'cashier';
    return item.allowedRoles.includes(activeRole);
  });

  // Cierra sesión y redirige a login.
  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Muestra la barra superior al cambiar de ruta.
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

  // Dispara la animación al navegar.
  useEffect(() => {
    showLoadingBar();
  }, [location.pathname]);

  useEffect(() => {
    navigationStateRef.current = navigation.state;
    if (navigation.state !== 'idle') {
      showLoadingBar();
    }
  }, [navigation.state]);

  // Limpia timeout de la barra al desmontar.
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        window.clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  // Escucha cambios de conectividad para indicador visual.
  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem('pos-sidebar-collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // Indicadores de estado.
  const showConnectionDot = isAuthenticated;
  const isConnected = isAuthenticated && hasConnectedStore && isOnline;

  return (
    <div className="min-h-dvh bg-transparent flex">
      {showRouteLoading && (
        <div className="top-loading-bar" role="status" aria-live="polite">
          <div className="top-loading-bar__indicator" />
        </div>
      )}
      {/* Sidebar Desktop */}
      <aside
        className={`glass-surface relative hidden shrink-0 bg-white border-r border-border transition-[width] duration-200 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col ${
          isSidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        <button
          type="button"
          onClick={() => setIsSidebarCollapsed((current) => !current)}
          className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          aria-label={isSidebarCollapsed ? 'Mostrar menú lateral' : 'Contraer menú lateral'}
          title={isSidebarCollapsed ? 'Mostrar menú' : 'Contraer menú'}
        >
          {isSidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>

        <div className={`${isSidebarCollapsed ? 'p-3 pt-12' : 'p-6'} border-b border-border`}>
          <div className="flex flex-col items-center text-center gap-2">
            <div className={`relative transition-all ${isSidebarCollapsed ? 'h-10 w-10' : 'h-16 w-16'}`}>
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
        
        <nav className={`flex-1 overflow-y-auto ${isSidebarCollapsed ? 'p-2' : 'p-4'}`}>
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                aria-label={item.label}
                title={isSidebarCollapsed ? item.label : undefined}
                className={`w-full flex items-center rounded-lg mb-2 py-3 transition-colors ${
                  isSidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-4'
                } ${
                  isActive 
                  ? 'bg-[var(--primary)] text-white' 
                  : 'text-foreground hover:bg-secondary'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!isSidebarCollapsed && <span className="font-medium">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className={`${isSidebarCollapsed ? 'p-2' : 'p-4'} border-t border-border`}>
          <Button
            onClick={handleLogout}
            variant="outline"
            className={isSidebarCollapsed ? 'w-full px-0' : 'w-full'}
            aria-label="Cerrar sesión"
            title={isSidebarCollapsed ? 'Cerrar sesión' : undefined}
          >
            <LogOut className={`w-5 h-5 ${isSidebarCollapsed ? '' : 'mr-2'}`} />
            {!isSidebarCollapsed && 'Cerrar Sesión'}
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
          <aside className="glass-surface absolute left-0 top-0 bottom-0 w-64 bg-white flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex flex-col items-center text-center gap-2">
                <div className="relative w-12 h-12">
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
            
            <nav className="flex-1 p-3 overflow-y-auto">
              {visibleMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigate(item.path);
                      setIsSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg mb-1.5 transition-colors ${
                      isActive 
                        ? 'bg-[var(--primary)] text-white' 
                        : 'text-foreground hover:bg-secondary'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[1.06rem] font-medium">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="glass-surface p-3 border-t border-border bg-white">
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
      <div className="flex-1 flex flex-col min-h-dvh min-w-0">
        {/* Header Mobile */}
        <header className="glass-surface lg:hidden bg-white border-b border-border p-4 flex items-center justify-between">
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
        <main className="flex-1 min-w-0 p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
