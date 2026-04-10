// Reportes de ventas con gráficos y ranking.
import { useMemo, useState } from 'react';
import { usePOS } from '../context/POSContext';
import type { Purchase, Sale } from '../context/POSContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { FileText, Download, TrendingUp, DollarSign, Share2, ChevronDown, ChevronUp, ShoppingBag } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'sonner';

export function Reports() {
  const { getSalesInRange, kardexMovements, registerReturn, customers, storeConfig, products, suppliers } = usePOS();
  const [period, setPeriod] = useState('today');
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [showAllLatestSales, setShowAllLatestSales] = useState(false);
  const [showAllLatestPurchases, setShowAllLatestPurchases] = useState(false);
  const [showAllInventoryRows, setShowAllInventoryRows] = useState(false);
  const latestSalesCollapsedLimit = 3;
  const latestPurchasesCollapsedLimit = 5;
  const inventoryRowsCollapsedLimit = 3;

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

  const periodPurchases = useMemo(() => {
    const startTime = start.getTime();
    const endTime = end.getTime();

    return suppliers
      .flatMap((supplier) => supplier.purchases.map((purchase) => ({
        ...purchase,
        supplierName: supplier.name,
      })))
      .filter((purchase) => {
        const timestamp = new Date(purchase.date).getTime();
        return Number.isFinite(timestamp) && timestamp >= startTime && timestamp <= endTime;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [suppliers, start, end]);

  const purchaseSupplierTotals = useMemo(() => {
    const grouped = new Map<string, {
      supplierId: string;
      supplierName: string;
      purchases: number;
      total: number;
      pending: number;
    }>();

    periodPurchases.forEach((purchase) => {
      const current = grouped.get(purchase.supplierId);
      if (current) {
        current.purchases += 1;
        current.total += purchase.total;
        if (!purchase.paid) current.pending += purchase.total;
        return;
      }

      grouped.set(purchase.supplierId, {
        supplierId: purchase.supplierId,
        supplierName: purchase.supplierName,
        purchases: 1,
        total: purchase.total,
        pending: purchase.paid ? 0 : purchase.total,
      });
    });

    return Array.from(grouped.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [periodPurchases]);
  const filteredPeriodPurchases = useMemo(() => {
    if (purchaseStatusFilter === 'pending') return periodPurchases.filter((purchase) => !purchase.paid);
    if (purchaseStatusFilter === 'paid') return periodPurchases.filter((purchase) => purchase.paid);
    return periodPurchases;
  }, [periodPurchases, purchaseStatusFilter]);
  const filteredPurchaseSupplierTotals = useMemo(() => {
    const grouped = new Map<string, {
      supplierId: string;
      supplierName: string;
      purchases: number;
      total: number;
      pending: number;
    }>();

    filteredPeriodPurchases.forEach((purchase) => {
      const current = grouped.get(purchase.supplierId);
      if (current) {
        current.purchases += 1;
        current.total += purchase.total;
        if (!purchase.paid) current.pending += purchase.total;
        return;
      }

      grouped.set(purchase.supplierId, {
        supplierId: purchase.supplierId,
        supplierName: purchase.supplierName,
        purchases: 1,
        total: purchase.total,
        pending: purchase.paid ? 0 : purchase.total,
      });
    });

    return Array.from(grouped.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [filteredPeriodPurchases]);
  
  // Métricas agregadas del periodo.
  const totalSales = netSales.reduce((sum, s) => sum + s.total, 0);
  const totalCost = netSales.reduce((sum, sale) => {
    return sum + sale.items.reduce((itemSum, item) => itemSum + (item.product.costPrice * item.quantity), 0);
  }, 0);
  const profit = totalSales - totalCost;
  const transactions = netSales.length;
  const totalPurchases = periodPurchases.reduce((sum, purchase) => sum + purchase.total, 0);
  const purchaseTransactions = periodPurchases.length;
  const pendingPurchasesTotal = periodPurchases.reduce(
    (sum, purchase) => sum + (purchase.paid ? 0 : purchase.total),
    0,
  );

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
  const visibleLatestSales = showAllLatestSales
    ? latestSales
    : latestSales.slice(0, latestSalesCollapsedLimit);
  const hiddenLatestSalesCount = Math.max(0, latestSales.length - visibleLatestSales.length);
  const latestPurchases = filteredPeriodPurchases.slice(-20).reverse();
  const visibleLatestPurchases = showAllLatestPurchases
    ? latestPurchases
    : latestPurchases.slice(0, latestPurchasesCollapsedLimit);
  const hiddenLatestPurchasesCount = Math.max(0, latestPurchases.length - visibleLatestPurchases.length);
  const productNameById = useMemo(() => {
    return new Map(products.map((product) => [product.id, product.name]));
  }, [products]);

  const formatCurrency = (value: number) => `$${Math.round(value).toLocaleString('es-CO')}`;
  const roundToHundred = (value: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value / 100) * 100;
  };
  const formatRoundedCurrency = (value: number) => `$${roundToHundred(value).toLocaleString('es-CO')}`;
  const formatTaxLabel = (ivaPercent: number, ipucPercent: number) => {
    const normalizedIva = Number.isFinite(ivaPercent) ? ivaPercent : 0;
    const normalizedIpuc = Number.isFinite(ipucPercent) ? ipucPercent : 0;
    if (normalizedIva <= 0 && normalizedIpuc <= 0) return 'Sin impuesto';
    if (normalizedIva > 0 && normalizedIpuc > 0) return `IVA ${normalizedIva}% + IPUC ${normalizedIpuc}%`;
    if (normalizedIva > 0) return `IVA ${normalizedIva}%`;
    return `IPUC ${normalizedIpuc}%`;
  };

  const inventoryTaxDetails = useMemo(() => {
    return products
      .filter((product) => Number(product.stock) > 0)
      .map((product) => {
        const stock = Number(product.stock) || 0;
        const unitsPerPurchaseRaw = Number(product.unitsPerPurchase ?? 1);
        const unitsPerPurchase = unitsPerPurchaseRaw > 0 ? unitsPerPurchaseRaw : 1;
        const packageCost = Number(product.costPrice) || 0;
        const ivaPercent = Number(product.iva) || 0;
        const ipucPercent = Number(product.ipuc ?? 0) || 0;
        const totalTaxPercent = ivaPercent + ipucPercent;
        const unitBaseCost = unitsPerPurchase > 0 ? packageCost / unitsPerPurchase : 0;
        const unitTaxValue = unitBaseCost * (totalTaxPercent / 100);
        const unitCostWithTax = unitBaseCost + unitTaxValue;
        const inventoryBaseCost = unitBaseCost * stock;
        const inventoryTaxValue = unitTaxValue * stock;
        const inventoryTotalCost = inventoryBaseCost + inventoryTaxValue;

        return {
          id: product.id,
          name: product.name,
          category: product.category,
          stock,
          unitsPerPurchase,
          ivaPercent,
          ipucPercent,
          totalTaxPercent,
          unitBaseCost,
          unitTaxValue,
          unitCostWithTax,
          inventoryBaseCost,
          inventoryTaxValue,
          inventoryTotalCost,
          taxLabel: formatTaxLabel(ivaPercent, ipucPercent),
        };
      })
      .sort((a, b) => b.inventoryTotalCost - a.inventoryTotalCost);
  }, [products]);

  const inventoryTotals = useMemo(() => {
    return inventoryTaxDetails.reduce((acc, detail) => {
      acc.base += detail.inventoryBaseCost;
      acc.tax += detail.inventoryTaxValue;
      acc.total += detail.inventoryTotalCost;
      return acc;
    }, { base: 0, tax: 0, total: 0 });
  }, [inventoryTaxDetails]);

  const inventoryTaxSummary = useMemo(() => {
    const grouped = new Map<string, {
      key: string;
      label: string;
      ivaPercent: number;
      ipucPercent: number;
      totalTaxPercent: number;
      productsCount: number;
      unitsInStock: number;
      baseCost: number;
      taxValue: number;
      totalCost: number;
    }>();

    inventoryTaxDetails.forEach((detail) => {
      const key = `${detail.ivaPercent}|${detail.ipucPercent}`;
      const current = grouped.get(key);
      if (current) {
        current.productsCount += 1;
        current.unitsInStock += detail.stock;
        current.baseCost += detail.inventoryBaseCost;
        current.taxValue += detail.inventoryTaxValue;
        current.totalCost += detail.inventoryTotalCost;
        return;
      }

      grouped.set(key, {
        key,
        label: detail.taxLabel,
        ivaPercent: detail.ivaPercent,
        ipucPercent: detail.ipucPercent,
        totalTaxPercent: detail.totalTaxPercent,
        productsCount: 1,
        unitsInStock: detail.stock,
        baseCost: detail.inventoryBaseCost,
        taxValue: detail.inventoryTaxValue,
        totalCost: detail.inventoryTotalCost,
      });
    });

    return Array.from(grouped.values()).sort((a, b) => b.totalCost - a.totalCost);
  }, [inventoryTaxDetails]);

  const visibleInventoryTaxDetails = showAllInventoryRows
    ? inventoryTaxDetails
    : inventoryTaxDetails.slice(0, inventoryRowsCollapsedLimit);
  const hiddenInventoryRowsCount = Math.max(0, inventoryTaxDetails.length - visibleInventoryTaxDetails.length);

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
  const formatPurchaseItemsSummary = (purchase: Purchase) => {
    if (purchase.items.length === 0) return 'Sin productos';
    const [firstItem, ...restItems] = purchase.items;
    const productName = productNameById.get(firstItem.productId) || 'Producto';
    const firstLabel = `${productName} x${firstItem.quantity}`;
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

      {/* Resumen de compras */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Compras Totales</p>
              <p className="text-2xl font-bold text-[var(--primary)]">{formatCurrency(totalPurchases)}</p>
            </div>
            <ShoppingBag className="w-10 h-10 text-[var(--primary)]" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Compras Registradas</p>
              <p className="text-2xl font-bold">{purchaseTransactions}</p>
            </div>
            <FileText className="w-10 h-10 text-blue-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Ticket Promedio Compra</p>
              <p className="text-2xl font-bold">{formatCurrency(purchaseTransactions > 0 ? totalPurchases / purchaseTransactions : 0)}</p>
            </div>
            <DollarSign className="w-10 h-10 text-[#2ECC71]" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Compras por Pagar</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(pendingPurchasesTotal)}</p>
            </div>
            <TrendingUp className="w-10 h-10 text-red-600" />
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
        <p className="mb-3 text-sm text-gray-600">
          Mostrando {visibleLatestSales.length} de {latestSales.length} transacciones.
        </p>
        <div className="md:hidden space-y-3">
          {visibleLatestSales.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No hay transacciones</div>
          ) : (
            visibleLatestSales.map(sale => {
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
              {visibleLatestSales.map(sale => {
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
        {!showAllLatestSales && hiddenLatestSalesCount > 0 ? (
          <div className="flex justify-center pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAllLatestSales(true)}
              className="rounded-full"
            >
              <ChevronDown className="w-4 h-4 mr-1" />
              Ver listado completo
            </Button>
          </div>
        ) : null}
        {!showAllLatestSales && hiddenLatestSalesCount > 0 ? (
          <p className="text-sm text-gray-600">
            {hiddenLatestSalesCount} transacciones ocultas. Usa "Ver listado completo" para desplegarlas.
          </p>
        ) : null}
      </Card>

      {/* Reporte de compras */}
      <Card className="p-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-bold">Compras del Período</h3>
            <p className="text-sm text-gray-600">Mostrando {visibleLatestPurchases.length} de {latestPurchases.length} compras registradas.</p>
          </div>
          <Select value={purchaseStatusFilter} onValueChange={(value: 'all' | 'pending' | 'paid') => setPurchaseStatusFilter(value)}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="paid">Pagadas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px]">
            <thead className="bg-secondary border-b">
              <tr>
                <th className="text-left p-3">Proveedor</th>
                <th className="text-right p-3">Compras</th>
                <th className="text-right p-3">Total</th>
                <th className="text-right p-3">Pendiente</th>
              </tr>
            </thead>
            <tbody>
              {filteredPurchaseSupplierTotals.length === 0 ? (
                <tr>
                  <td className="p-4 text-center text-gray-500" colSpan={4}>No hay compras registradas para este período.</td>
                </tr>
              ) : (
                filteredPurchaseSupplierTotals.map((row) => (
                  <tr key={row.supplierId || row.supplierName} className="border-b">
                    <td className="p-3 font-medium">{row.supplierName}</td>
                    <td className="p-3 text-right">{row.purchases}</td>
                    <td className="p-3 text-right font-semibold">{formatCurrency(row.total)}</td>
                    <td className="p-3 text-right text-red-600">{formatCurrency(row.pending)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden space-y-3">
          {visibleLatestPurchases.length === 0 ? (
            <div className="text-center py-6 text-gray-500">No hay compras registradas</div>
          ) : (
            visibleLatestPurchases.map((purchase) => (
              <div key={purchase.id} className="rounded-lg border border-border bg-white p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm text-gray-600">{format(new Date(purchase.date), "d MMM, HH:mm", { locale: es })}</p>
                    <p className="font-semibold">{purchase.supplierName}</p>
                    <p className="text-xs text-gray-500">{formatPurchaseItemsSummary(purchase)}</p>
                  </div>
                  <span className="font-bold text-[var(--primary)]">{formatCurrency(purchase.total)}</span>
                </div>
                <p className="text-xs text-gray-600">Estado: {purchase.paid ? 'Pagada' : 'Pendiente'}</p>
              </div>
            ))
          )}
        </div>

        <div className="hidden md:block overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[920px]">
            <thead className="bg-secondary border-b">
              <tr>
                <th className="text-left p-3">Fecha</th>
                <th className="text-left p-3">Proveedor</th>
                <th className="text-left p-3">Detalle</th>
                <th className="text-right p-3">Ítems</th>
                <th className="text-right p-3">Estado</th>
                <th className="text-right p-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {visibleLatestPurchases.length === 0 ? (
                <tr>
                  <td className="p-4 text-center text-gray-500" colSpan={6}>No hay compras registradas para este período.</td>
                </tr>
              ) : (
                visibleLatestPurchases.map((purchase) => (
                  <tr key={purchase.id} className="border-b">
                    <td className="p-3">{format(new Date(purchase.date), "d MMM, HH:mm", { locale: es })}</td>
                    <td className="p-3 font-medium">{purchase.supplierName}</td>
                    <td className="p-3">{formatPurchaseItemsSummary(purchase)}</td>
                    <td className="p-3 text-right">{purchase.items.length}</td>
                    <td className="p-3 text-right">
                      <span className={purchase.paid ? 'text-[#2ECC71]' : 'text-amber-700'}>
                        {purchase.paid ? 'Pagada' : 'Pendiente'}
                      </span>
                    </td>
                    <td className="p-3 text-right font-semibold">{formatCurrency(purchase.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!showAllLatestPurchases && hiddenLatestPurchasesCount > 0 ? (
          <div className="flex justify-center pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAllLatestPurchases(true)}
              className="rounded-full"
            >
              <ChevronDown className="w-4 h-4 mr-1" />
              Ver listado completo
            </Button>
          </div>
        ) : null}
        {!showAllLatestPurchases && hiddenLatestPurchasesCount > 0 ? (
          <p className="text-sm text-gray-600">
            {hiddenLatestPurchasesCount} compras ocultas. Usa "Ver listado completo" para desplegarlas.
          </p>
        ) : null}
      </Card>

      {/* Reporte de costos e impuestos del inventario */}
      <Card className="p-6 space-y-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-bold">Costo de Inventario con Impuestos</h3>
          <p className="text-sm text-gray-600">
            Desglose por producto según impuestos registrados (IVA, IPUC y combinaciones).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border bg-secondary/40 p-4">
            <p className="text-sm text-gray-600">Valor Base Inventario</p>
            <p className="text-xl font-bold">{formatCurrency(inventoryTotals.base)}</p>
          </div>
          <div className="rounded-lg border bg-secondary/40 p-4">
            <p className="text-sm text-gray-600">Valor Impuestos Inventario</p>
            <p className="text-xl font-bold text-amber-700">{formatCurrency(inventoryTotals.tax)}</p>
          </div>
          <div className="rounded-lg border bg-secondary/40 p-4">
            <p className="text-sm text-gray-600">Valor Total con Impuestos</p>
            <p className="text-xl font-bold text-[#2ECC71]">{formatCurrency(inventoryTotals.total)}</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[760px]">
            <thead className="bg-secondary border-b">
              <tr>
                <th className="text-left p-3">Impuesto</th>
                <th className="text-right p-3">Productos</th>
                <th className="text-right p-3">Unidades</th>
                <th className="text-right p-3">Base</th>
                <th className="text-right p-3">Impuesto</th>
                <th className="text-right p-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {inventoryTaxSummary.length === 0 ? (
                <tr>
                  <td className="p-4 text-center text-gray-500" colSpan={6}>No hay inventario con stock disponible.</td>
                </tr>
              ) : (
                inventoryTaxSummary.map((row) => (
                  <tr key={row.key} className="border-b">
                    <td className="p-3 font-medium">{row.label}</td>
                    <td className="p-3 text-right">{row.productsCount}</td>
                    <td className="p-3 text-right">{row.unitsInStock.toLocaleString('es-CO')}</td>
                    <td className="p-3 text-right">{formatCurrency(row.baseCost)}</td>
                    <td className="p-3 text-right text-amber-700">{formatCurrency(row.taxValue)}</td>
                    <td className="p-3 text-right font-semibold">{formatCurrency(row.totalCost)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div>
          <div>
            <h4 className="font-semibold">Detalle por producto</h4>
            <p className="text-sm text-gray-600">
              Mostrando {visibleInventoryTaxDetails.length} de {inventoryTaxDetails.length} productos con stock.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[1200px]">
            <thead className="bg-secondary border-b">
              <tr>
                <th className="text-left p-3">Producto</th>
                <th className="text-left p-3">Categoría</th>
                <th className="text-right p-3">Stock</th>
                <th className="text-right p-3">Costo Base Unit.</th>
                <th className="text-right p-3">IVA</th>
                <th className="text-right p-3">IPUC</th>
                <th className="text-right p-3">Impuesto Unit.</th>
                <th className="text-right p-3">Costo Unit. + Imp.</th>
                <th className="text-right p-3">Base Inventario</th>
                <th className="text-right p-3">Impuesto Inventario</th>
                <th className="text-right p-3">Total Inventario</th>
              </tr>
            </thead>
            <tbody>
              {inventoryTaxDetails.length === 0 ? (
                <tr>
                  <td className="p-4 text-center text-gray-500" colSpan={11}>No hay inventario con stock disponible.</td>
                </tr>
              ) : (
                visibleInventoryTaxDetails.map((detail) => (
                  <tr key={detail.id} className="border-b align-top">
                    <td className="p-3 font-medium">{detail.name}</td>
                    <td className="p-3">{detail.category}</td>
                    <td className="p-3 text-right">{detail.stock.toLocaleString('es-CO')}</td>
                    <td className="p-3 text-right">{formatCurrency(detail.unitBaseCost)}</td>
                    <td className="p-3 text-right">{detail.ivaPercent}%</td>
                    <td className="p-3 text-right">{detail.ipucPercent}%</td>
                    <td className="p-3 text-right text-amber-700">{formatCurrency(detail.unitTaxValue)}</td>
                    <td className="p-3 text-right">{formatCurrency(detail.unitCostWithTax)}</td>
                    <td className="p-3 text-right">{formatCurrency(detail.inventoryBaseCost)}</td>
                    <td className="p-3 text-right text-amber-700">{formatCurrency(detail.inventoryTaxValue)}</td>
                    <td className="p-3 text-right font-semibold">{formatCurrency(detail.inventoryTotalCost)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!showAllInventoryRows && hiddenInventoryRowsCount > 0 ? (
          <div className="flex justify-center pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAllInventoryRows(true)}
              className="rounded-full"
            >
              <ChevronDown className="w-4 h-4 mr-1" />
              Ver listado completo
            </Button>
          </div>
        ) : null}
        {!showAllInventoryRows && hiddenInventoryRowsCount > 0 ? (
          <p className="text-sm text-gray-600">
            {hiddenInventoryRowsCount} productos ocultos. Usa "Ver listado completo" para desplegarlos.
          </p>
        ) : null}
      </Card>

      {(showAllLatestSales && latestSales.length > latestSalesCollapsedLimit)
      || (showAllLatestPurchases && latestPurchases.length > latestPurchasesCollapsedLimit)
      || (showAllInventoryRows && inventoryTaxDetails.length > inventoryRowsCollapsedLimit) ? (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2 sm:left-auto sm:right-6 sm:translate-x-0">
          {showAllLatestSales && latestSales.length > latestSalesCollapsedLimit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAllLatestSales(false)}
              className="rounded-full bg-white/95 shadow-lg backdrop-blur"
            >
              <ChevronUp className="w-4 h-4 mr-1" />
              Ocultar transacciones
            </Button>
          ) : null}
          {showAllLatestPurchases && latestPurchases.length > latestPurchasesCollapsedLimit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAllLatestPurchases(false)}
              className="rounded-full bg-white/95 shadow-lg backdrop-blur"
            >
              <ChevronUp className="w-4 h-4 mr-1" />
              Ocultar compras
            </Button>
          ) : null}
          {showAllInventoryRows && inventoryTaxDetails.length > inventoryRowsCollapsedLimit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAllInventoryRows(false)}
              className="rounded-full bg-white/95 shadow-lg backdrop-blur"
            >
              <ChevronUp className="w-4 h-4 mr-1" />
              Ocultar inventario
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
