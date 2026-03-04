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
  const { getSalesToday, products, sales, customers } = usePOS();
  const navigate = useNavigate();

  const todaySales = getSalesToday();
  const totalToday = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const transactionsToday = todaySales.length;

  // Productos más vendidos hoy
  const productSales = new Map<string, { name: string; quantity: number }>();
  todaySales.forEach(sale => {
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
      return saleDate === dateStr;
    });
    const total = daySales.reduce((sum, sale) => sum + sale.total, 0);
    
    return {
      date: format(date, 'EEE', { locale: es }),
      ventas: Math.round(total)
    };
  });

  const quickActions = [
    { icon: ShoppingCart, label: 'Nueva Venta', path: '/pos', color: 'bg-[#2ECC71]' },
    { icon: Package, label: 'Inventario', path: '/inventory', color: 'bg-[#FF6B00]' },
    { icon: FileText, label: 'Reportes', path: '/reports', color: 'bg-blue-500' },
    { icon: Users, label: 'Clientes', path: '/customers', color: 'bg-purple-500' },
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
              <p className="text-3xl font-bold text-[#FF6B00]">
                {transactionsToday}
              </p>
            </div>
            <div className="w-14 h-14 bg-[#FF6B00]/10 rounded-full flex items-center justify-center">
              <ShoppingBag className="w-8 h-8 text-[#FF6B00]" />
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
                className={`h-24 ${action.color} hover:opacity-90 text-white flex flex-col items-center justify-center gap-2`}
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
            <TrendingUp className="w-5 h-5 text-[#FF6B00]" />
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
                  stroke="#FF6B00" 
                  strokeWidth={3}
                  dot={{ fill: '#FF6B00', r: 4 }}
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
