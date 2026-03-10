import { useState } from 'react';
import { useNavigate } from 'react-router';
import { usePOS } from '../context/POSContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { User, Lock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_LOGO_PATH, FALLBACK_LOGO_DATA_URL } from '../constants/branding';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showCreateStore, setShowCreateStore] = useState(false);
  const [error, setError] = useState('');
  const [storeName, setStoreName] = useState('');
  const [nit, setNit] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [showRegisterButton, setShowRegisterButton] = useState(false); // Para hacer visible el botón "Crear Tienda", cambia este valor a `true`.
  const { login, createStore, storeConfig } = usePOS();
  const navigate = useNavigate();
  const logoSrc = storeConfig.logo || DEFAULT_LOGO_PATH;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const success = await login(username, password);
    if (success) {
      toast.success('¡Bienvenido!');
      navigate('/dashboard');
    } else {
      setError('Email o contraseña incorrectos');
    }
  };

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
            >
              Iniciar Sesión
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


      </div>
    </div>
  );
}
