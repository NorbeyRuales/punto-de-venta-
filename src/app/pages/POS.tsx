// Punto de venta: búsqueda, carrito, descuentos y cobro.
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { usePOS } from '../context/POSContext';
import type { Sale } from '../context/POSContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  CreditCard, 
  DollarSign,
  Smartphone,
  Printer,
  Share2,
  Percent,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

export function POS() {
  const navigate = useNavigate();
  const {
    products,
    categories,
    saleDrafts,
    activeDraftId,
    activeDraft,
    createSaleDraft,
    switchSaleDraft,
    discardSaleDraft,
    setActiveDraftCustomerId,
    cart,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    updateCartDiscount,
    cartTotal,
    completeSale,
    clearCart,
    customers,
    currentCashSession,
    storeConfig
  } = usePOS();

  // Estado de UI y cobro.
  const [searchQuery, setSearchQuery] = useState('');
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [cashReceived, setCashReceived] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [discountAmount, setDiscountAmount] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const keepPaymentDialogOpenRef = useRef(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const selectedCustomer = activeDraft?.customerId ?? '';

  useEffect(() => {
    setPaymentMethod('efectivo');
    setCashReceived('');
    setSelectedProduct(null);
    setDiscountAmount('');
    if (keepPaymentDialogOpenRef.current) {
      return;
    }
    setShowPaymentDialog(false);
    setCompletedSale(null);
  }, [activeDraftId]);

  const formatCurrency = (value: number) => `$${Math.round(value).toLocaleString('es-CO')}`;

  const normalizeText = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const buildWhatsappMessage = (sale: Sale) => {
    const customer = sale.customerId ? customers.find(c => c.id === sale.customerId) : undefined;
    const lines = [
      storeConfig?.name ? `Tienda: ${storeConfig.name}` : 'Comprobante de venta',
      `Factura: ${sale.invoiceNumber || sale.id}`,
      `Fecha: ${new Date(sale.date).toLocaleString('es-CO')}`,
      customer?.name ? `Cliente: ${customer.name}` : null,
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
      '',
      '¡Gracias por tu compra!',
    ].filter(Boolean);

    return lines.join('\n');
  };

  // Resultados de búsqueda por nombre/SKU/código de barras.
  const normalizedQuery = normalizeText(searchQuery);
  const filteredProducts = searchQuery
    ? products.filter(p =>
        normalizeText(p.name).includes(normalizedQuery) ||
        normalizeText(p.sku || '').includes(normalizedQuery) ||
        normalizeText(p.category || '').includes(normalizedQuery) ||
        (p.barcode || '').includes(searchQuery.trim())
      )
    : [];

  const quickCategories = categories.length > 0
    ? categories
    : ['Lácteos', 'Bebidas', 'Aseo', 'Snacks', 'Granos', 'Carnes Frías'];

  // Agrega un producto al carrito validando stock.
  const handleAddToCart = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      if (product.stock <= 0) {
        toast.error('Producto sin stock');
        return;
      }
      addToCart(product, 1);
      toast.success('Producto agregado');
      setSearchQuery('');
      searchInputRef.current?.focus();
    }
  };

  // Ajusta cantidades del carrito con validaciones.
  const handleQuantityChange = (productId: string, newQuantity: number) => {
    const product = products.find(p => p.id === productId);
    if (product && newQuantity > product.stock) {
      toast.error(`Stock insuficiente. Disponible: ${product.stock}`);
      return;
    }
    if (newQuantity < 1) {
      removeFromCart(productId);
    } else {
      updateCartQuantity(productId, newQuantity);
    }
  };

  // Aplica descuento porcentual a un ítem del carrito.
  const handleApplyDiscount = () => {
    if (selectedProduct && discountAmount) {
      const discount = parseFloat(discountAmount);
      if (discount >= 0 && discount <= 100) {
        updateCartDiscount(selectedProduct, discount);
        toast.success('Descuento aplicado');
        setSelectedProduct(null);
        setDiscountAmount('');
      } else {
        toast.error('El descuento debe estar entre 0 y 100');
      }
    }
  };

  // Valida y completa una venta.
  const handlePayment = async () => {
    if (cart.length === 0) {
      toast.error('El carrito está vacío');
      return;
    }

    if (paymentMethod === 'efectivo') {
      const cash = parseFloat(cashReceived) || 0;
      if (cash < cartTotal) {
        toast.error('Monto insuficiente');
        return;
      }
    }

    keepPaymentDialogOpenRef.current = true;
    const sale = await completeSale(
      paymentMethod,
      paymentMethod === 'efectivo' ? parseFloat(cashReceived) || 0 : cartTotal
    );

    if (!sale) {
      keepPaymentDialogOpenRef.current = false;
      return;
    }

    setCompletedSale(sale);
    setCashReceived('');
    setPaymentMethod('efectivo');

    // Simular impresión o envío por WhatsApp
    console.log('Venta:', sale);
  };

  const handlePrint = () => {
    toast.info('Funcionalidad de impresión en preparación.');
  };

  const handleShareWhatsapp = () => {
    if (!completedSale) {
      toast.info('Completa una venta para compartirla por WhatsApp.');
      return;
    }
    const message = buildWhatsappMessage(completedSale);
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Totales de la venta.
  const subtotal = cart.reduce((sum, item) => sum + (item.product.salePrice * item.quantity), 0);
  const totalDiscount = cart.reduce((sum, item) => {
    const itemPrice = item.product.salePrice * item.quantity;
    return sum + ((itemPrice * item.discount) / 100);
  }, 0);
  const cashValue = parseFloat(cashReceived) || 0;
  const isCashInsufficient = paymentMethod === 'efectivo' && cashReceived !== '' && cashValue < cartTotal;
  const change = paymentMethod === 'efectivo' 
    ? Math.max(0, cashValue - cartTotal)
    : 0;

  return (
    <div className="space-y-4">
      {!currentCashSession && (
        <Card className="p-4 border border-amber-200 bg-amber-50">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-amber-800">Caja cerrada</p>
              <p className="text-sm text-amber-700">
                Abre una sesión de caja para registrar ventas.
              </p>
            </div>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => navigate('/cash-register')}
            >
              Ir a apertura de caja
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-3 border border-violet-200 bg-gradient-to-r from-violet-50 via-indigo-50 to-fuchsia-50">
        <div className="flex items-center gap-3">
          <div className="flex-1 overflow-x-auto">
            <div className="flex items-center gap-2 min-w-max pr-2">
              {saleDrafts.map((draft, index) => {
                const customerName = draft.customerId
                  ? customers.find((customer) => customer.id === draft.customerId)?.name
                  : '';
                const label = `Venta ${index + 1}`;
                const isActive = draft.id === activeDraftId;
                const count = draft.items.length;
                return (
                  <div
                    key={draft.id}
                    className={`group inline-flex items-center rounded-full border transition-all ${
                      isActive
                        ? 'border-violet-600 bg-violet-600 text-white shadow-sm'
                        : 'border-violet-200 bg-white/80 text-violet-900 hover:border-violet-300 hover:bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => switchSaleDraft(draft.id)}
                      aria-current={isActive ? 'page' : undefined}
                      title={customerName ? `${label} · ${customerName}` : label}
                      className="flex items-center gap-2 px-4 py-2 text-left"
                    >
                      <div className="flex flex-col leading-tight">
                        <span className="text-sm font-semibold">{label}</span>
                        {customerName && (
                          <span className={`text-xs ${isActive ? 'text-white/80' : 'text-violet-600'} max-w-[140px] truncate`}>
                            {customerName}
                          </span>
                        )}
                      </div>
                      {count > 0 && (
                        <span
                          className={`min-w-[1.5rem] rounded-full px-2 py-0.5 text-xs font-semibold ${
                            isActive ? 'bg-white/20 text-white' : 'bg-violet-100 text-violet-700'
                          }`}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                    {saleDrafts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => discardSaleDraft(draft.id)}
                        aria-label={`Cerrar ${label}`}
                        className={`mr-2 h-7 w-7 rounded-full grid place-items-center transition ${
                          isActive
                            ? 'text-white/70 hover:text-white hover:bg-white/10'
                            : 'text-violet-500 hover:text-violet-700 hover:bg-violet-100'
                        }`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => void createSaleDraft()}
            className="h-10 rounded-full bg-violet-600 text-white hover:bg-violet-700 shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nueva venta
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">
      {/* Panel de productos */}
      <div className="lg:col-span-2 flex flex-col gap-4">
        <Card className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="Buscar por nombre, código o escanear código de barras..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-14 text-lg"
              autoFocus
              aria-label="Buscar productos"
            />
          </div>

          {/* Resultados de búsqueda */}
          {searchQuery && (
            <div className="mt-4 max-h-64 overflow-y-auto space-y-2">
              {filteredProducts.length > 0 ? (
                filteredProducts.map(product => (
                  <button
                    key={product.id}
                    onClick={() => handleAddToCart(product.id)}
                    className="w-full flex items-center justify-between p-4 bg-secondary hover:bg-gray-200 rounded-lg transition-colors text-left"
                  >
                    <div className="flex-1">
                      <p className="font-semibold">{product.name}</p>
                      <p className="text-sm text-gray-600">
                        {product.category} - Stock: {product.stock} {product.unit}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg text-[#2ECC71]">
                        ${product.salePrice.toLocaleString('es-CO')}
                      </p>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-center text-gray-500 py-8">No se encontraron productos</p>
              )}
            </div>
          )}
        </Card>

        {/* Categorías rápidas */}
        <Card className="p-4 hidden md:block">
          <h3 className="font-bold mb-3">Categorías Rápidas</h3>
          <div className="flex flex-wrap gap-2">
            {quickCategories.map(category => (
              <Button
                key={category}
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery(category);
                  searchInputRef.current?.focus();
                }}
              >
                {category}
              </Button>
            ))}
          </div>
        </Card>
      </div>

      {/* Panel del carrito */}
      <div className="flex flex-col gap-4">
        <Card className="flex-1 flex flex-col">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold">Carrito</h2>
              {cart.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearCart}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>
            <p className="text-sm text-gray-600">{cart.length} productos</p>
          </div>

          {/* Items del carrito */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                <p>El carrito está vacío</p>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.product.id} className="bg-secondary p-3 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{item.product.name}</p>
                      <p className="text-sm text-gray-600">
                        ${item.product.salePrice.toLocaleString('es-CO')} c/u
                      </p>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="text-red-600 hover:text-red-700"
                      aria-label="Eliminar del carrito"
                      title="Eliminar del carrito"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0"
                        onClick={() => handleQuantityChange(item.product.id, item.quantity - 1)}
                        aria-label="Disminuir cantidad"
                        title="Disminuir cantidad"
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <span className="w-12 text-center font-semibold">{item.quantity}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0"
                        onClick={() => handleQuantityChange(item.product.id, item.quantity + 1)}
                        aria-label="Aumentar cantidad"
                        title="Aumentar cantidad"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="text-right">
                      {item.discount > 0 && (
                        <p className="text-xs text-red-600">-{item.discount}%</p>
                      )}
                      <p className="font-bold">
                        ${((item.product.salePrice * item.quantity) * (1 - item.discount / 100)).toLocaleString('es-CO')}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-2 text-[var(--primary)]"
                    onClick={() => setSelectedProduct(item.product.id)}
                  >
                    <Percent className="w-4 h-4 mr-1" />
                    {item.discount > 0 ? 'Cambiar descuento' : 'Aplicar descuento'}
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* Totales */}
          {cart.length > 0 && (
            <div className="p-4 border-t border-border space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span>${subtotal.toLocaleString('es-CO')}</span>
              </div>
              {totalDiscount > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>Descuento:</span>
                  <span>-${totalDiscount.toLocaleString('es-CO')}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-bold pt-2 border-t">
                <span>Total:</span>
                <span className="text-[#2ECC71]">${cartTotal.toLocaleString('es-CO')}</span>
              </div>
            </div>
          )}
        </Card>

        {/* Botón de cobrar */}
        <Button
          size="lg"
          className="h-16 bg-[#2ECC71] hover:bg-[#27AE60] text-white text-xl font-bold"
          onClick={() => {
            setCompletedSale(null);
            setShowPaymentDialog(true);
          }}
          disabled={cart.length === 0 || !currentCashSession}
        >
          <DollarSign className="w-6 h-6 mr-2" />
          Cobrar
        </Button>
      </div>

      {/* Dialog de descuento */}
      <Dialog open={selectedProduct !== null} onOpenChange={() => setSelectedProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aplicar Descuento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Descuento (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                placeholder="0"
                className="h-12 text-lg"
                aria-describedby="pos-discount-help"
              />
              <p id="pos-discount-help" className="text-xs text-gray-500 mt-1">Rango permitido: 0 a 100.</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleApplyDiscount} className="flex-1 bg-[#2ECC71] hover:bg-[#27AE60]">
                Aplicar
              </Button>
              <Button variant="outline" onClick={() => setSelectedProduct(null)} className="flex-1">
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de pago */}
      <Dialog
        open={showPaymentDialog}
        onOpenChange={(open) => {
          setShowPaymentDialog(open);
          if (!open) {
            keepPaymentDialogOpenRef.current = false;
          }
          if (open) setCompletedSale(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Completar Venta</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-secondary p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">{completedSale ? 'Total Pagado' : 'Total a Pagar'}</p>
              <p className="text-3xl font-bold text-[#2ECC71]">
                ${(completedSale ? completedSale.total : cartTotal).toLocaleString('es-CO')}
              </p>
            </div>

            {!completedSale && (
              <>
                <div>
                  <Label>Método de Pago</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="efectivo">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4" />
                          Efectivo
                        </div>
                      </SelectItem>
                      <SelectItem value="tarjeta">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4" />
                          Tarjeta/Datáfono
                        </div>
                      </SelectItem>
                      <SelectItem value="transferencia">Transferencia</SelectItem>
                      <SelectItem value="nequi">
                        <div className="flex items-center gap-2">
                          <Smartphone className="w-4 h-4" />
                          Nequi
                        </div>
                      </SelectItem>
                      <SelectItem value="daviplata">Daviplata</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {paymentMethod === 'efectivo' && (
                  <div>
                    <Label>Efectivo Recibido</Label>
                    <Input
                      type="number"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      placeholder="0"
                      className={`h-12 text-lg ${isCashInsufficient ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                      autoFocus
                      aria-invalid={isCashInsufficient}
                      aria-describedby="pos-cash-help"
                    />
                    {isCashInsufficient ? (
                      <p id="pos-cash-help" className="text-xs text-red-600 mt-1">
                        El efectivo debe ser igual o mayor al total.
                      </p>
                    ) : (
                      <p id="pos-cash-help" className="text-xs text-gray-500 mt-1">
                        Ingresa el valor recibido para calcular el cambio.
                      </p>
                    )}
                    {cashReceived && (
                      <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                        <p className="text-sm text-gray-600">Cambio a Devolver</p>
                        <p className="text-xl font-bold text-blue-600">
                          ${change.toLocaleString('es-CO')}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <Label>Cliente (Opcional)</Label>
                  <Select value={selectedCustomer} onValueChange={(value) => setActiveDraftCustomerId(value || null)}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Seleccionar cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map(customer => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={handlePayment}
                    className="flex-1 h-12 bg-[#2ECC71] hover:bg-[#27AE60] text-white"
                  >
                    <DollarSign className="w-5 h-5 mr-2" />
                    Completar Venta
                  </Button>
                </div>
              </>
            )}

            {completedSale && (
              <div className="space-y-2">
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  Venta registrada. Puedes imprimir o compartir antes de cerrar.
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={handlePrint} title="Imprimir comprobante">
                    <Printer className="w-4 h-4 mr-1" />
                    Imprimir
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={handleShareWhatsapp} title="Enviar por WhatsApp">
                    <Share2 className="w-4 h-4 mr-1" />
                    WhatsApp
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
