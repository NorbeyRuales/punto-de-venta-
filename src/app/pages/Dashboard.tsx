// Dashboard con KPIs, alertas de stock y gráficas de ventas.
import { usePOS } from '../context/POSContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { 
  DollarSign, 
  ShoppingBag, 
  TrendingUp, 
  Package, 
  AlertTriangle,
  ShoppingCart,
  FileText,
  Users
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { format, subDays, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

export function Dashboard() {
  const { getSalesToday, products, sales, customers, kardexMovements } = usePOS();
  const navigate = useNavigate();

  // KPIs principales del día.
  const returnedReferences = new Set(
    kardexMovements
      .map(movement => movement.reference)
      .filter(Boolean)
  );
  const isReturned = (sale: { id: string; returnedAt?: string | null }) =>
    Boolean(sale.returnedAt) || returnedReferences.has(`DEV-${sale.id}`);
  const todaySales = getSalesToday();
  const netTodaySales = todaySales.filter((sale) => !isReturned(sale));
  const totalToday = netTodaySales.reduce((sum, sale) => sum + sale.total, 0);
  const transactionsToday = netTodaySales.length;

  // Productos más vendidos hoy
  const productSales = new Map<string, { name: string; quantity: number }>();
  netTodaySales.forEach(sale => {
    sale.items.forEach(item => {
      const current = productSales.get(item.product.id);
      if (current) {
        current.quantity += item.quantity;
      } else {
        productSales.set(item.product.id, {
          name: item.product.name,
          quantity: item.quantity
        });
      }
    });
  });

  const topProducts = Array.from(productSales.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  // Productos con bajo stock
  const lowStockProducts = products.filter(p => p.stock <= p.minStock).slice(0, 5);

  // Datos para gráfica semanal
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    const dateStr = format(startOfDay(date), 'yyyy-MM-dd');
    const daySales = sales.filter(sale => {
      const saleDate = format(startOfDay(new Date(sale.date)), 'yyyy-MM-dd');
      return saleDate === dateStr && !isReturned(sale);
    });
    const total = daySales.reduce((sum, sale) => sum + sale.total, 0);
    
    return {
      date: format(date, 'EEE', { locale: es }),
      ventas: Math.round(total)
    };
  });

  const quickActions = [
    { icon: ShoppingCart, label: 'Nueva Venta', path: '/pos', color: 'bg-[linear-gradient(135deg,#80a8ff,#6a8dff)] text-white' },
    { icon: Package, label: 'Inventario', path: '/inventory', color: 'bg-[linear-gradient(135deg,#7b63ff,#5136ff)] text-white' },
    { icon: FileText, label: 'Reportes', path: '/reports', color: 'bg-[linear-gradient(135deg,#8ec1de,#5fa7cf)] text-[#0a1020]' },
    { icon: Users, label: 'Clientes', path: '/customers', color: 'bg-[linear-gradient(135deg,#d3d3ff,#bcbcff)] text-[#0f172a]' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-gray-600">
          {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
        </p>
      </div>

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Ventas del Día</p>
              <p className="text-3xl font-bold text-[#2ECC71]">
                ${totalToday.toLocaleString('es-CO')}
              </p>
            </div>
            <div className="w-14 h-14 bg-[#2ECC71]/10 rounded-full flex items-center justify-center">
              <DollarSign className="w-8 h-8 text-[#2ECC71]" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Transacciones</p>
              <p className="text-3xl font-bold text-[var(--primary)]">
                {transactionsToday}
              </p>
            </div>
            <div className="w-14 h-14 bg-[rgba(128,168,255,0.18)] rounded-full flex items-center justify-center">
              <ShoppingBag className="w-8 h-8 text-[var(--primary)]" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Productos</p>
              <p className="text-3xl font-bold text-blue-600">
                {products.length}
              </p>
            </div>
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
              <Package className="w-8 h-8 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Clientes</p>
              <p className="text-3xl font-bold text-purple-600">
                {customers.length}
              </p>
            </div>
            <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center">
              <Users className="w-8 h-8 text-purple-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Accesos rápidos */}
      <div>
        <h2 className="text-xl font-bold mb-4">Accesos Rápidos</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.path}
                onClick={() => navigate(action.path)}
                className={`h-24 ${action.color} shadow-[0_14px_32px_rgba(68,85,150,0.25)] border border-white/40 hover:translate-y-[-2px] hover:shadow-[0_18px_40px_rgba(68,85,150,0.28)] transition-all flex flex-col items-center justify-center gap-2 text-base font-semibold rounded-xl`}
              >
                <Icon className="w-8 h-8" />
                <span className="font-semibold">{action.label}</span>
              </Button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfica de ventas */}
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[var(--primary)]" />
            Ventas de la Semana
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={last7Days}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip 
                  formatter={(value) => `$${Number(value).toLocaleString('es-CO')}`}
                />
                <Line 
                  type="monotone" 
                  dataKey="ventas" 
                  stroke="var(--primary)" 
                  strokeWidth={3}
                  dot={{ fill: 'var(--primary)', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Productos más vendidos */}
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#2ECC71]" />
            Productos Más Vendidos Hoy
          </h3>
          {topProducts.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={120} />
                  <Tooltip />
                  <Bar dataKey="quantity" fill="#2ECC71" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              <p>No hay ventas registradas hoy</p>
            </div>
          )}
        </Card>
      </div>

      {/* Alertas de stock bajo */}
      {lowStockProducts.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#E74C3C]" />
            Alertas de Bajo Stock
          </h3>
          <div className="space-y-3">
            {lowStockProducts.map(product => (
              <div 
                key={product.id}
                className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-lg"
              >
                <div>
                  <p className="font-semibold">{product.name}</p>
                  <p className="text-sm text-gray-600">
                    Stock: {product.stock} {product.unit} (Mínimo: {product.minStock})
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#E74C3C] text-[#E74C3C] hover:bg-[#E74C3C] hover:text-white"
                  onClick={() => navigate('/inventory')}
                >
                  Ver Inventario
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
