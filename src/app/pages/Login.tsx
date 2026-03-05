import { useState } from 'react';
import { useNavigate } from 'react-router';
import { usePOS } from '../context/POSContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Store, User, Lock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showCreateStore, setShowCreateStore] = useState(false);
  const [error, setError] = useState('');
  const { login } = usePOS();
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const success = login(username, password);
    if (success) {
      toast.success('¡Bienvenido!');
      navigate('/dashboard');
    } else {
      setError('Usuario o contraseña incorrectos');
      toast.error('Credenciales inválidas');
    }
  };

  if (showCreateStore) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#FF6B00] to-[#FF8C00] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[#FF6B00] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Store className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Crear Tienda</h1>
            <p className="text-gray-600">Ingresa los datos de tu negocio</p>
          </div>

          <form className="space-y-4">
            <div>
              <Label htmlFor="storeName">Nombre de la tienda</Label>
              <Input
                id="storeName"
                placeholder="Ej: Tienda Don Pepe"
                className="h-12"
              />
            </div>

            <div>
              <Label htmlFor="nit">NIT</Label>
              <Input
                id="nit"
                placeholder="900123456-1"
                className="h-12"
              />
            </div>

            <div>
              <Label htmlFor="address">Dirección</Label>
              <Input
                id="address"
                placeholder="Calle 123 #45-67"
                className="h-12"
              />
            </div>

            <div>
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                placeholder="3001234567"
                className="h-12"
              />
            </div>

            <div className="pt-4 space-y-3">
              <Button
                type="button"
                className="w-full h-12 bg-[#2ECC71] hover:bg-[#27AE60] text-white"
                onClick={() => {
                  toast.success('¡Tienda creada exitosamente!');
                  setShowCreateStore(false);
                }}
              >
                Crear Tienda Gratis
              </Button>
              
              <Button
                type="button"
                variant="outline"
                className="w-full h-12"
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
    <div className="min-h-screen bg-gradient-to-br from-[#3d1857] to-[#FF8C00] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-[#FF6B00] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Store className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">TiendaPOS</h1>
          <p className="text-gray-600 text-lg">Sistema de Punto de Venta</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <Label htmlFor="username" className="text-base">Usuario</Label>
            <div className="relative mt-2">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                id="username"
                type="text"
                placeholder="Ingresa tu usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="pl-10 h-14 text-lg"
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="password" className="text-base">Contraseña</Label>
            <div className="relative mt-2">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                id="password"
                type="password"
                placeholder="Ingresa tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 h-14 text-lg"
                required
              />
            </div>
          </div>

          <div className="pt-4 space-y-3">
            <Button
              type="submit"
              className="w-full h-14 text-lg bg-[#FF6B00] hover:bg-[#E85F00] text-white"
            >
              Iniciar Sesión
            </Button>
            
            <Button
              type="button"
              variant="outline"
              className="w-full h-14 text-lg border-2 border-[#2ECC71] text-[#2ECC71] hover:bg-[#2ECC71] hover:text-white"
              onClick={() => setShowCreateStore(true)}
            >
              Crear Tienda Gratis
            </Button>
          </div>
        </form>

        <div className="mt-8 p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600 text-center mb-2">
            <strong>Usuarios de prueba:</strong>
          </p>
          <p className="text-sm text-gray-600 text-center">
            Admin: <strong>admin</strong> / <strong>admin123</strong>
          </p>
          <p className="text-sm text-gray-600 text-center">
            Cajero: <strong>cajero</strong> / <strong>cajero123</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
