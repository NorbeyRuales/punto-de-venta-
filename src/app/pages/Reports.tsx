// Reportes de ventas con gráficos y ranking.
import { useState } from 'react';
import { usePOS } from '../context/POSContext';
import type { Sale } from '../context/POSContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { FileText, Download, TrendingUp, DollarSign, Eye, Share2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'sonner';

export function Reports() {
  const { getSalesInRange, kardexMovements, registerReturn, customers, storeConfig } = usePOS();
  const [period, setPeriod] = useState('today');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showSaleDialog, setShowSaleDialog] = useState(false);

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
  
  // Métricas agregadas del periodo.
  const totalSales = periodSales.reduce((sum, s) => sum + s.total, 0);
  const totalCost = periodSales.reduce((sum, sale) => {
    return sum + sale.items.reduce((itemSum, item) => itemSum + (item.product.costPrice * item.quantity), 0);
  }, 0);
  const profit = totalSales - totalCost;
  const transactions = periodSales.length;

  // Productos más vendidos
  const productSales = new Map<string, { name: string; quantity: number; revenue: number }>();
  periodSales.forEach(sale => {
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
  periodSales.forEach(sale => {
    sale.items.forEach(item => {
      const current = categorySales.get(item.product.category) || 0;
      categorySales.set(item.product.category, current + (item.product.salePrice * item.quantity));
    });
  });

  const categoryData = Array.from(categorySales.entries()).map(([name, value]) => ({ name, value }));
  const COLORS = ['#15D9E6', '#E6C915', '#E61595', '#8BE9FD', '#FFD27F', '#2ECC71'];
  const returnedReferences = new Set(
    kardexMovements
      .map(movement => movement.reference)
      .filter(Boolean)
  );

  const formatCurrency = (value: number) => `$${Math.round(value).toLocaleString('es-CO')}`;

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
        return `• ${item.product.name} x${item.quantity} = ${formatCurrency(totalItem)}${discountLabel}`;
      }),
      `Subtotal: ${formatCurrency(sale.subtotal)}`,
      sale.discount > 0 ? `Descuento: -${formatCurrency(sale.discount)}` : null,
      `IVA: ${formatCurrency(sale.iva)}`,
      `Total: ${formatCurrency(sale.total)}`,
      `Pago: ${sale.paymentMethod}`,
      sale.paymentMethod === 'efectivo'
        ? `Efectivo: ${formatCurrency(sale.cashReceived)} | Cambio: ${formatCurrency(sale.change)}`
        : null,
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

  const openSaleDetail = (sale: Sale) => {
    setSelectedSale(sale);
    setShowSaleDialog(true);
  };

  const handleReturnSale = (saleId: string, invoiceNumber?: string) => {
    const reference = `DEV-${saleId}`;
    if (returnedReferences.has(reference)) {
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
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Reportes</h1>
        <div className="flex gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoy</SelectItem>
              <SelectItem value="week">Última Semana</SelectItem>
              <SelectItem value="month">Último Mes</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportToExcel}>
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
          <div className="h-80">
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
          <div className="h-80">
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
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary border-b">
              <tr>
                <th className="text-left p-3">Fecha</th>
                <th className="text-left p-3">Factura</th>
                <th className="text-left p-3">Método Pago</th>
                <th className="text-right p-3">Total</th>
                <th className="text-right p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {periodSales.slice(-20).reverse().map(sale => {
                const returnRef = `DEV-${sale.id}`;
                const isReturned = returnedReferences.has(returnRef);
                return (
                  <tr key={sale.id} className="border-b">
                    <td className="p-3">{format(new Date(sale.date), "d MMM, HH:mm", { locale: es })}</td>
                    <td className="p-3">{sale.invoiceNumber}</td>
                    <td className="p-3 capitalize">{sale.paymentMethod}</td>
                    <td className="p-3 text-right font-bold text-[#2ECC71]">${sale.total.toLocaleString('es-CO')}</td>
                    <td className="p-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openSaleDetail(sale)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Detalle
                        </Button>
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

      <Dialog
        open={showSaleDialog}
        onOpenChange={(open) => {
          setShowSaleDialog(open);
          if (!open) setSelectedSale(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de venta</DialogTitle>
          </DialogHeader>

          {selectedSale && (() => {
            const customer = selectedSale.customerId
              ? customers.find(c => c.id === selectedSale.customerId)
              : undefined;
            const isReturned = returnedReferences.has(`DEV-${selectedSale.id}`);

            return (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-secondary rounded-lg space-y-2">
                    <p className="text-xs text-gray-600">Factura</p>
                    <p className="font-semibold">{selectedSale.invoiceNumber || selectedSale.id}</p>
                    <p className="text-xs text-gray-600">Fecha</p>
                    <p className="font-semibold">
                      {format(new Date(selectedSale.date), "d MMMM, HH:mm", { locale: es })}
                    </p>
                    <p className="text-xs text-gray-600">Método de pago</p>
                    <p className="font-semibold capitalize">{selectedSale.paymentMethod}</p>
                    {isReturned && (
                      <p className="text-sm font-semibold text-[#E74C3C]">Venta devuelta</p>
                    )}
                  </div>

                  <div className="p-4 bg-secondary rounded-lg space-y-2">
                    <p className="text-xs text-gray-600">Cliente</p>
                    <p className="font-semibold">{customer?.name || 'Cliente general'}</p>
                    <p className="text-xs text-gray-600">Teléfono</p>
                    <p className="font-semibold">{customer?.phone || 'N/A'}</p>
                    <p className="text-xs text-gray-600">NIT/CC</p>
                    <p className="font-semibold">{customer?.nit || 'N/A'}</p>
                  </div>
                </div>

                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary border-b">
                      <tr>
                        <th className="text-left p-3">Producto</th>
                        <th className="text-center p-3">Cantidad</th>
                        <th className="text-right p-3">Precio</th>
                        <th className="text-right p-3">Descuento</th>
                        <th className="text-right p-3">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSale.items.map((item, index) => {
                        const subtotalItem = item.product.salePrice * item.quantity;
                        const discountValue = (subtotalItem * item.discount) / 100;
                        const totalItem = subtotalItem - discountValue;
                        return (
                          <tr key={`${item.product.id}-${index}`} className="border-b">
                            <td className="p-3">{item.product.name}</td>
                            <td className="p-3 text-center">{item.quantity}</td>
                            <td className="p-3 text-right">{formatCurrency(item.product.salePrice)}</td>
                            <td className="p-3 text-right">{item.discount > 0 ? `${item.discount}%` : '-'}</td>
                            <td className="p-3 text-right font-semibold">{formatCurrency(totalItem)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                  <div className="text-sm text-gray-600">
                    {storeConfig?.dianResolution && (
                      <p>Resolución DIAN: {storeConfig.dianResolution}</p>
                    )}
                  </div>

                  <div className="w-full md:w-72 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(selectedSale.subtotal)}</span>
                    </div>
                    {selectedSale.discount > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Descuento:</span>
                        <span>-{formatCurrency(selectedSale.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>IVA:</span>
                      <span>{formatCurrency(selectedSale.iva)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg border-t pt-2">
                      <span>Total:</span>
                      <span className="text-[#2ECC71]">{formatCurrency(selectedSale.total)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => handleShareWhatsapp(selectedSale)}
                    className="border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10"
                  >
                    <Share2 className="w-4 h-4 mr-1" />
                    Enviar por WhatsApp
                  </Button>
                  <Button
                    variant="outline"
                    disabled={isReturned}
                    onClick={() => handleReturnSale(selectedSale.id, selectedSale.invoiceNumber)}
                  >
                    {isReturned ? 'Devuelto' : 'Devolver venta'}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
