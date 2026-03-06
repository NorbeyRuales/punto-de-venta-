import { useState, useRef } from 'react';
import { usePOS } from '../context/POSContext';
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
  const {
    products,
    cart,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    updateCartDiscount,
    cartTotal,
    completeSale,
    clearCart,
    customers
  } = usePOS();

  const [searchQuery, setSearchQuery] = useState('');
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [cashReceived, setCashReceived] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [discountAmount, setDiscountAmount] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredProducts = searchQuery
    ? products.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.barcode.includes(searchQuery)
      )
    : [];

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

  const handlePayment = () => {
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

    const sale = completeSale(
      paymentMethod,
      paymentMethod === 'efectivo' ? parseFloat(cashReceived) || 0 : cartTotal,
      selectedCustomer || undefined
    );

    toast.success('Venta completada exitosamente');
    setShowPaymentDialog(false);
    setCashReceived('');
    setPaymentMethod('efectivo');
    setSelectedCustomer('');

    // Simular impresión o envío por WhatsApp
    console.log('Venta:', sale);
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.product.salePrice * item.quantity), 0);
  const totalDiscount = cart.reduce((sum, item) => {
    const itemPrice = item.product.salePrice * item.quantity;
    return sum + ((itemPrice * item.discount) / 100);
  }, 0);
  const change = paymentMethod === 'efectivo' 
    ? Math.max(0, (parseFloat(cashReceived) || 0) - cartTotal)
    : 0;

  return (
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
            {['Lácteos', 'Bebidas', 'Aseo', 'Snacks', 'Granos', 'Carnes Frías'].map(category => (
              <Button
                key={category}
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery(category)}
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
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <span className="w-12 text-center font-semibold">{item.quantity}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0"
                        onClick={() => handleQuantityChange(item.product.id, item.quantity + 1)}
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
          onClick={() => setShowPaymentDialog(true)}
          disabled={cart.length === 0}
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
              />
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
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Completar Venta</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-secondary p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Total a Pagar</p>
              <p className="text-3xl font-bold text-[#2ECC71]">
                ${cartTotal.toLocaleString('es-CO')}
              </p>
            </div>

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
                  className="h-12 text-lg"
                  autoFocus
                />
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
              <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
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
              <Button
                variant="outline"
                onClick={() => setShowPaymentDialog(false)}
                className="h-12"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1">
                <Printer className="w-4 h-4 mr-1" />
                Imprimir
              </Button>
              <Button variant="outline" size="sm" className="flex-1">
                <Share2 className="w-4 h-4 mr-1" />
                WhatsApp
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
