// Pantalla de inicio de sesión y creación inicial de tienda.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { usePOS } from '../context/POSContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { User, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_LOGO_PATH, FALLBACK_LOGO_DATA_URL } from '../constants/branding';

export function Login() {
  // Estado del formulario y flags de vista.
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [offlinePin, setOfflinePinInput] = useState('');
  const [offlinePinSetup, setOfflinePinSetup] = useState('');
  const [offlinePinConfirm, setOfflinePinConfirm] = useState('');
  const [offlineUsername, setOfflineUsername] = useState('');
  const [offlineRole, setOfflineRole] = useState<'admin' | 'cashier'>('cashier');
  const [showOfflinePanel, setShowOfflinePanel] = useState(false);
  const [isSettingPin, setIsSettingPin] = useState(false);
  const [isOfflineSubmitting, setIsOfflineSubmitting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreateStore, setShowCreateStore] = useState(false);
  const [error, setError] = useState('');
  const [storeName, setStoreName] = useState('');
  const [nit, setNit] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [showRegisterButton, setShowRegisterButton] = useState(false); // Para hacer visible el botón "Crear Tienda", cambia este valor a `true`.
  const {
    login,
    loginOffline,
    setOfflinePin,
    offlinePinConfigured,
    offlineDefaultRole,
    createStore,
    storeConfig,
  } = usePOS();
  const navigate = useNavigate();
  const logoSrc = storeConfig.logo || DEFAULT_LOGO_PATH;

  useEffect(() => {
    setOfflineRole(offlineDefaultRole);
  }, [offlineDefaultRole]);

  const checkSupabaseReachable = async (): Promise<boolean> => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;

    if (!supabaseUrl) {
      return navigator.onLine;
    }

    if (!navigator.onLine) {
      return false;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 3000);

    try {
      await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      });
      return true;
    } catch {
      return false;
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const handleShowOfflinePanel = async () => {
    if (showOfflinePanel) return;
    const reachable = await checkSupabaseReachable();
    if (reachable) {
      toast.info('Estás en línea. El acceso offline se usa cuando no hay internet.');
    }
    setShowOfflinePanel(true);
  };

  // Maneja autenticación contra Supabase.
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError('');
    setIsSubmitting(true);
    try {
      const success = await login(username, password);
      if (success) {
        toast.success('¡Bienvenido!');
        navigate('/dashboard');
      } else {
        const reachable = await checkSupabaseReachable();
        if (!reachable) {
          setShowOfflinePanel(true);
          setError('');
          toast.info('Sin internet. Usa el PIN para ingresar en modo offline.');
        } else {
          setError('Email o contraseña incorrectos');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetOfflinePin = async () => {
    if (isSettingPin) return;
    if (!offlinePinSetup || !offlinePinConfirm) {
      toast.error('Completa ambos campos de PIN.');
      return;
    }
    if (offlinePinSetup !== offlinePinConfirm) {
      toast.error('El PIN no coincide.');
      return;
    }
    setIsSettingPin(true);
    try {
      const ok = await setOfflinePin(offlinePinSetup);
      if (ok) {
        toast.success('PIN offline configurado.');
        setOfflinePinSetup('');
        setOfflinePinConfirm('');
      }
    } finally {
      setIsSettingPin(false);
    }
  };

  const handleOfflineLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOfflineSubmitting) return;
    setError('');

    if (!offlinePinConfigured) {
      toast.error('Configura un PIN offline primero.');
      return;
    }

    setIsOfflineSubmitting(true);
    try {
      const success = await loginOffline(offlinePin, offlineRole, offlineUsername);
      if (success) {
        toast.success('Ingreso offline activado.');
        setOfflinePinInput('');
        navigate('/dashboard');
      } else {
        setError('PIN incorrecto');
      }
    } finally {
      setIsOfflineSubmitting(false);
    }
  };

  // Vista: creación de tienda (primer uso).
  if (showCreateStore) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#d3d3ff] via-[#ceb5ff] to-[#80a8ff] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] shadow-[var(--shadow-card)] rounded-2xl p-8 text-foreground">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl border border-[var(--primary)] bg-[var(--primary-soft)] overflow-hidden flex items-center justify-center mx-auto mb-4">
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
            <h1 className="text-3xl font-bold mb-2">Crear Tienda</h1>
            <p className="text-[var(--muted-foreground)]">Ingresa los datos de tu negocio</p>
          </div>

          <form className="space-y-4">
            <div>
              <Label htmlFor="storeName">Nombre de la tienda</Label>
              <Input
                id="storeName"
                placeholder="Ej: Tienda Don Pepe"
                className="h-12 bg-[var(--input-background)] border border-[var(--border)] text-foreground placeholder:text-[var(--muted-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="nit">NIT</Label>
              <Input
                id="nit"
                placeholder="900123456-1"
                className="h-12 bg-[var(--input-background)] border border-[var(--border)] text-foreground placeholder:text-[var(--muted-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                value={nit}
                onChange={(e) => setNit(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="address">Dirección</Label>
              <Input
                id="address"
                placeholder="Calle 123 #45-67"
                className="h-12 bg-[var(--input-background)] border border-[var(--border)] text-foreground placeholder:text-[var(--muted-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                placeholder="3001234567"
                className="h-12 bg-[var(--input-background)] border border-[var(--border)] text-foreground placeholder:text-[var(--muted-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="pt-4 space-y-3">
              <Button
                type="button"
                className="w-full h-12 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-foreground)] font-semibold shadow-[0_8px_24px_rgba(128,168,255,0.28)]"
                onClick={async () => {
                  if (!storeName.trim()) {
                    toast.error('Ingresa el nombre de la tienda');
                    return;
                  }

                  const success = await createStore({
                    name: storeName.trim(),
                    nit: nit.trim(),
                    address: address.trim(),
                    phone: phone.trim(),
                    email: username.trim(),
                  });

                  if (!success) {
                    return;
                  }

                  toast.success('¡Tienda creada exitosamente!');
                  setShowCreateStore(false);
                }}
              >
                Crear Tienda
              </Button>
              
              <Button
                type="button"
                variant="outline"
                className="w-full h-12 border-[var(--border)] text-foreground"
                onClick={() => setShowCreateStore(false)}
              >
                Volver al Login
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Vista: login normal.
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#d3d3ff] via-[#ceb5ff] to-[#80a8ff] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] shadow-[var(--shadow-card)] rounded-2xl p-8 text-foreground">
        <div className="text-center mb-8 space-y-2">
          <div className="w-20 h-20 rounded-2xl border border-[var(--primary)] bg-[var(--primary-soft)] overflow-hidden flex items-center justify-center mx-auto mb-4">
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
          <p className="text-[var(--muted-foreground)] text-lg">Sistema de Punto de Venta</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-[rgba(230,21,149,0.08)] border border-[var(--accent)] rounded-lg flex items-center gap-2 text-[var(--accent)]">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <Label htmlFor="username" className="text-base">Email</Label>
            <div className="relative mt-2">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
              <Input
                id="username"
                type="text"
                placeholder="Ingresa tu email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="pl-10 h-14 text-lg bg-[var(--input-background)] border border-[var(--border)] text-foreground placeholder:text-[var(--muted-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="password" className="text-base">Contraseña</Label>
            <div className="relative mt-2">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
              <Input
                id="password"
                type="password"
                placeholder="Ingresa tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 h-14 text-lg bg-[var(--input-background)] border border-[var(--border)] text-foreground placeholder:text-[var(--muted-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                required
              />
            </div>
          </div>

          <div className="pt-4 space-y-3">
            <Button
              type="submit"
              className="w-full h-14 text-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-foreground)] font-semibold shadow-[0_8px_24px_rgba(128,168,255,0.28)] transition-transform hover:-translate-y-[1px]"
              disabled={isSubmitting}
            >
              <span className="inline-flex items-center justify-center gap-2">
                {isSubmitting && <Loader2 className="h-5 w-5 animate-spin" />}
                {isSubmitting ? 'Iniciando...' : 'Iniciar Sesión'}
              </span>
            </Button>
            
            {showRegisterButton && (
              // Para crear una tienda, primero inicia sesión en otra pestaña
              <Button
                type="button"
                variant="outline"
                className="w-full h-14 text-lg border-2 border-[var(--secondary)] text-foreground hover:bg-[var(--secondary-soft)]"
                onClick={() => setShowCreateStore(true)}
              >
                Crear Tienda
              </Button>
            )}
          </div>
        </form>

        {!showOfflinePanel && (
          <div className="mt-4 text-center">
            <Button
              type="button"
              variant="ghost"
              className="text-sm text-[var(--muted-foreground)] hover:text-foreground"
              onClick={handleShowOfflinePanel}
            >
              Acceder offline
            </Button>
          </div>
        )}

        {showOfflinePanel && (
          <div className="mt-8 border-t border-[var(--border)] pt-6 space-y-4">
            <h2 className="text-lg font-semibold">Ingreso Offline (PIN)</h2>

            {!offlinePinConfigured && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg space-y-3">
                <p className="text-sm text-yellow-800 font-semibold">Configura un PIN de 4 dígitos</p>
                <div className="grid gap-3">
                  <div>
                    <Label htmlFor="offlinePinSetup">Nuevo PIN</Label>
                    <Input
                      id="offlinePinSetup"
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="0000"
                      value={offlinePinSetup}
                      onChange={(e) => setOfflinePinSetup(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="h-12 bg-[var(--input-background)] border border-[var(--border)]"
                    />
                  </div>
                  <div>
                    <Label htmlFor="offlinePinConfirm">Confirmar PIN</Label>
                    <Input
                      id="offlinePinConfirm"
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="0000"
                      value={offlinePinConfirm}
                      onChange={(e) => setOfflinePinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="h-12 bg-[var(--input-background)] border border-[var(--border)]"
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  className="w-full h-12 bg-[#2ECC71] hover:bg-[#27AE60]"
                  onClick={handleSetOfflinePin}
                  disabled={isSettingPin}
                >
                  {isSettingPin ? 'Guardando PIN...' : 'Guardar PIN Offline'}
                </Button>
              </div>
            )}

            <form onSubmit={handleOfflineLogin} className="space-y-4">
              <div>
                <Label htmlFor="offlinePin">PIN de 4 dígitos</Label>
                <Input
                  id="offlinePin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="0000"
                  value={offlinePin}
                  onChange={(e) => setOfflinePinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="h-12 bg-[var(--input-background)] border border-[var(--border)]"
                  disabled={!offlinePinConfigured}
                />
              </div>

              <div>
                <Label>Rol offline</Label>
                <Select value={offlineRole} onValueChange={(value: 'admin' | 'cashier') => setOfflineRole(value)}>
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="cashier">Cajero</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="offlineUsername">Usuario (opcional)</Label>
                <Input
                  id="offlineUsername"
                  placeholder="Caja 1"
                  value={offlineUsername}
                  onChange={(e) => setOfflineUsername(e.target.value)}
                  className="h-12 bg-[var(--input-background)] border border-[var(--border)]"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-12 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-foreground)] font-semibold"
                disabled={!offlinePinConfigured || isOfflineSubmitting}
              >
                {isOfflineSubmitting ? 'Ingresando...' : 'Entrar sin Internet'}
              </Button>
            </form>
          </div>
        )}


      </div>
    </div>
  );
}
