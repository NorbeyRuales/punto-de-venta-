// Reportes de ventas con gráficos y ranking.
import { useState } from 'react';
import { usePOS } from '../context/POSContext';
import type { Sale } from '../context/POSContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { FileText, Download, TrendingUp, DollarSign, Share2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'sonner';

export function Reports() {
  const { getSalesInRange, kardexMovements, registerReturn, customers, storeConfig } = usePOS();
  const [period, setPeriod] = useState('today');

  // Calcula rango de fechas según periodo seleccionado.
  const getDateRange = () => {
    const now = new Date();
    switch (period) {
      case 'today': return { start: startOfDay(now), end: endOfDay(now) };
      case 'week': return { start: subDays(startOfDay(now), 7), end: endOfDay(now) };
      case 'month': return { start: subDays(startOfDay(now), 30), end: endOfDay(now) };
      default: return { start: startOfDay(now), end: endOfDay(now) };
    }
  };

  const { start, end } = getDateRange();
  const periodSales = getSalesInRange(start, end);
  const returnedReferences = new Set(
    kardexMovements
      .map(movement => movement.reference)
      .filter(Boolean)
  );
  const isSaleReturned = (sale: Sale) =>
    Boolean(sale.returnedAt) || returnedReferences.has(`DEV-${sale.id}`);
  const netSales = periodSales.filter((sale) => !isSaleReturned(sale));
  
  // Métricas agregadas del periodo.
  const totalSales = netSales.reduce((sum, s) => sum + s.total, 0);
  const totalCost = netSales.reduce((sum, sale) => {
    return sum + sale.items.reduce((itemSum, item) => itemSum + (item.product.costPrice * item.quantity), 0);
  }, 0);
  const profit = totalSales - totalCost;
  const transactions = netSales.length;

  // Productos más vendidos
  const productSales = new Map<string, { name: string; quantity: number; revenue: number }>();
  netSales.forEach(sale => {
    sale.items.forEach(item => {
      const current = productSales.get(item.product.id);
      const revenue = item.product.salePrice * item.quantity;
      if (current) {
        current.quantity += item.quantity;
        current.revenue += revenue;
      } else {
        productSales.set(item.product.id, { name: item.product.name, quantity: item.quantity, revenue });
      }
    });
  });

  const topProducts = Array.from(productSales.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Ventas por categoría
  const categorySales = new Map<string, number>();
  netSales.forEach(sale => {
    sale.items.forEach(item => {
      const current = categorySales.get(item.product.category) || 0;
      categorySales.set(item.product.category, current + (item.product.salePrice * item.quantity));
    });
  });

  const categoryData = Array.from(categorySales.entries()).map(([name, value]) => ({ name, value }));
  const COLORS = ['#15D9E6', '#E6C915', '#E61595', '#8BE9FD', '#FFD27F', '#2ECC71'];
  const latestSales = periodSales.slice(-20).reverse();

  const formatCurrency = (value: number) => `$${Math.round(value).toLocaleString('es-CO')}`;
  const roundToHundred = (value: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value / 100) * 100;
  };
  const formatRoundedCurrency = (value: number) => `$${roundToHundred(value).toLocaleString('es-CO')}`;
  const formatPaymentMethodLabel = (method: string) => {
    const normalized = method?.toLowerCase?.() || 'otro';
    const labels: Record<string, string> = {
      efectivo: 'Efectivo',
      tarjeta: 'Tarjeta/Datáfono',
      transferencia: 'Transferencia',
      nequi: 'Nequi',
      daviplata: 'Daviplata',
      credito: 'Fiado',
      otro: 'Otro',
    };
    return labels[normalized] || method;
  };
  const getSalePaymentBreakdown = (sale: Sale) => {
    const source = sale.paymentBreakdown || {};
    const cleaned = Object.entries(source)
      .map(([method, amount]) => [method, roundToHundred(Number(amount) || 0)] as const)
      .filter(([, amount]) => amount > 0);

    if (cleaned.length > 0) return cleaned;
    return [[sale.paymentMethod || 'otro', roundToHundred(sale.total)] as const];
  };
  const formatSalePaymentBreakdown = (sale: Sale) => getSalePaymentBreakdown(sale)
    .map(([method, amount]) => `${formatPaymentMethodLabel(method)}: ${formatRoundedCurrency(amount)}`)
    .join(' | ');
  const formatSaleItemsSummary = (sale: Sale) => {
    if (sale.items.length === 0) return 'Sin productos';
    const [firstItem, ...restItems] = sale.items;
    const firstLabel = `${firstItem.product.name} x${firstItem.quantity}`;
    return restItems.length > 0 ? `${firstLabel} +${restItems.length} más` : firstLabel;
  };

  const buildWhatsappMessage = (sale: Sale) => {
    const customer = sale.customerId ? customers.find(c => c.id === sale.customerId) : undefined;
    const lines = [
      storeConfig?.name ? `Tienda: ${storeConfig.name}` : 'Comprobante de venta',
      `Factura: ${sale.invoiceNumber || sale.id}`,
      `Fecha: ${new Date(sale.date).toLocaleString('es-CO')}`,
      customer?.name ? `Cliente: ${customer.name}` : null,
      customer?.nit ? `NIT: ${customer.nit}` : null,
      'Detalle:',
      ...sale.items.map(item => {
        const unitPrice = item.product.salePrice;
        const subtotalItem = unitPrice * item.quantity;
        const totalItem = subtotalItem - ((subtotalItem * item.discount) / 100);
        const discountLabel = item.discount > 0 ? ` (-${item.discount}%)` : '';
        return `• ${item.product.name} x${item.quantity} = ${formatRoundedCurrency(totalItem)}${discountLabel}`;
      }),
      `Subtotal: ${formatRoundedCurrency(sale.subtotal)}`,
      sale.discount > 0 ? `Descuento: -${formatRoundedCurrency(sale.discount)}` : null,
      `Total: ${formatRoundedCurrency(sale.total)}`,
      `Pago: ${formatSalePaymentBreakdown(sale)}`,
      sale.cashReceived > 0
        ? `Efectivo recibido: ${formatRoundedCurrency(sale.cashReceived)} | Cambio: ${formatRoundedCurrency(sale.change)}`
        : null,
      (sale.creditedAmount ?? 0) > 0 ? `Saldo fiado: ${formatRoundedCurrency(sale.creditedAmount ?? 0)}` : null,
      storeConfig?.phone ? `Contacto: ${storeConfig.phone}` : null,
      '',
      '¡Gracias por tu compra!',
    ].filter(Boolean);

    return lines.join('\n');
  };

  const handleShareWhatsapp = (sale: Sale) => {
    const message = buildWhatsappMessage(sale);
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleReturnSale = (saleId: string, invoiceNumber?: string) => {
    const reference = `DEV-${saleId}`;
    const sale = periodSales.find(item => item.id === saleId);
    const alreadyReturned = sale ? isSaleReturned(sale) : returnedReferences.has(reference);
    if (alreadyReturned) {
      toast.info('Esta venta ya tiene una devolución registrada.');
      return;
    }

    const confirmed = confirm(`¿Registrar devolución total de la factura ${invoiceNumber || saleId}?`);
    if (!confirmed) return;

    registerReturn(saleId);
  };

  // Placeholder de exportación.
  const exportToExcel = () => {
    toast.success('Exportando reporte...');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">Reportes</h1>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoy</SelectItem>
              <SelectItem value="week">Última Semana</SelectItem>
              <SelectItem value="month">Último Mes</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportToExcel} className="w-full sm:w-auto">
            <Download className="w-5 h-5 mr-2" />
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Ventas Totales</p>
              <p className="text-2xl font-bold text-[#2ECC71]">${totalSales.toLocaleString('es-CO')}</p>
            </div>
            <DollarSign className="w-10 h-10 text-[#2ECC71]" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Ganancia Neta</p>
              <p className="text-2xl font-bold text-[var(--primary)]">${profit.toLocaleString('es-CO')}</p>
            </div>
            <TrendingUp className="w-10 h-10 text-[var(--primary)]" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Transacciones</p>
              <p className="text-2xl font-bold">{transactions}</p>
            </div>
            <FileText className="w-10 h-10 text-blue-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Ticket Promedio</p>
              <p className="text-2xl font-bold">${transactions > 0 ? Math.round(totalSales / transactions).toLocaleString('es-CO') : 0}</p>
            </div>
            <DollarSign className="w-10 h-10 text-purple-600" />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Productos más vendidos */}
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">Top 10 Productos</h3>
          <div className="h-64 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} />
                <Tooltip formatter={(value) => `$${Number(value).toLocaleString('es-CO')}`} />
                <Bar dataKey="revenue" fill="var(--primary)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Ventas por categoría */}
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">Ventas por Categoría</h3>
          <div className="h-64 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `$${Number(value).toLocaleString('es-CO')}`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Listado de ventas */}
      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Últimas Transacciones</h3>
        <div className="md:hidden space-y-3">
          {latestSales.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No hay transacciones</div>
          ) : (
            latestSales.map(sale => {
              const isReturned = isSaleReturned(sale);
              return (
                <div key={sale.id} className="rounded-lg border border-border bg-white p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm text-gray-600">{format(new Date(sale.date), "d MMM, HH:mm", { locale: es })}</p>
                      <p className="font-semibold">{sale.invoiceNumber || sale.id}</p>
                      <p className="text-xs text-gray-500">{formatSaleItemsSummary(sale)}</p>
                      <p className="text-xs text-gray-500">{formatSalePaymentBreakdown(sale)}</p>
                    </div>
                    <span className="font-bold text-[#2ECC71]">{formatRoundedCurrency(sale.total)}</span>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10"
                      onClick={() => handleShareWhatsapp(sale)}
                    >
                      <Share2 className="w-4 h-4 mr-1" />
                      WhatsApp
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isReturned}
                      onClick={() => handleReturnSale(sale.id, sale.invoiceNumber)}
                    >
                      {isReturned ? 'Devuelto' : 'Devolver'}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary border-b">
              <tr>
                <th className="text-left p-3">Fecha</th>
                <th className="text-left p-3">Factura</th>
                <th className="text-left p-3">Detalle compra</th>
                <th className="text-left p-3">Método Pago</th>
                <th className="text-right p-3">Total</th>
                <th className="text-right p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {latestSales.map(sale => {
                const isReturned = isSaleReturned(sale);
                return (
                  <tr key={sale.id} className="border-b">
                    <td className="p-3">{format(new Date(sale.date), "d MMM, HH:mm", { locale: es })}</td>
                    <td className="p-3">{sale.invoiceNumber || sale.id}</td>
                    <td className="p-3 align-top">
                      <div className="space-y-1 text-sm">
                        {sale.items.length === 0 ? (
                          <span className="text-gray-500">Sin productos</span>
                        ) : (
                          sale.items.map((item, index) => (
                            <p key={`${item.product.id}-${index}`} className="leading-snug">
                              {item.product.name} x{item.quantity}
                            </p>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="p-3">{formatSalePaymentBreakdown(sale)}</td>
                    <td className="p-3 text-right font-bold text-[#2ECC71]">{formatRoundedCurrency(sale.total)}</td>
                    <td className="p-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10"
                          onClick={() => handleShareWhatsapp(sale)}
                        >
                          <Share2 className="w-4 h-4 mr-1" />
                          WhatsApp
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isReturned}
                          onClick={() => handleReturnSale(sale.id, sale.invoiceNumber)}
                        >
                          {isReturned ? 'Devuelto' : 'Devolver'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
