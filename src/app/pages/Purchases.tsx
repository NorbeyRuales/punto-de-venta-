// Registro de compras y actualización de stock.
import { useEffect, useMemo, useState } from 'react';
import { usePOS } from '../context/POSContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Check, Pencil, Plus, ShoppingBasket, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

type PurchaseItemDraft = {
  productId: string;
  quantityPackages: string;
  packageCost: string;
};

export function Purchases() {
  const { suppliers, products, registerPurchase, storeConfig } = usePOS();
  // Estado del formulario y de los ítems de compra.
  const [supplierId, setSupplierId] = useState('');
  const [pricePolicy, setPricePolicy] = useState<'automatic' | 'manual'>(storeConfig.purchasePricePolicy || 'automatic');
  const [draft, setDraft] = useState<PurchaseItemDraft>({
    productId: '',
    quantityPackages: '1',
    packageCost: ''
  });
  const [items, setItems] = useState<Array<{ productId: string; quantity: number; cost: number }>>([]);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ quantityPackages: string; packageCost: string }>({
    quantityPackages: '',
    packageCost: ''
  });

  const selectedSupplier = suppliers.find(s => s.id === supplierId) || null;

  // Productos filtrados por proveedor seleccionado.
  const supplierProducts = useMemo(() => {
    if (!selectedSupplier) return [];
    return products.filter(product => (product.supplierName || '').trim() === selectedSupplier.name.trim());
  }, [products, selectedSupplier]);

  // Mapa rápido para acceder a productos por id.
  const productById = useMemo(() => {
    const map = new Map<string, typeof products[number]>();
    products.forEach(product => map.set(product.id, product));
    return map;
  }, [products]);

  // Agrega ítems al borrador de compra.
  const addItemToPurchase = () => {
    const quantity = parseFloat(draft.quantityPackages);
    const cost = parseFloat(draft.packageCost);

    if (!draft.productId || Number.isNaN(quantity) || Number.isNaN(cost) || quantity <= 0 || cost <= 0) {
      toast.error('Complete producto, paquetes y costo por paquete');
      return;
    }

    setItems(prev => {
      const existing = prev.find(item => item.productId === draft.productId);
      if (existing) {
        return prev.map(item =>
          item.productId === draft.productId
            ? { ...item, quantity: item.quantity + quantity, cost }
            : item
        );
      }

      return [...prev, { productId: draft.productId, quantity, cost }];
    });

    setDraft({ productId: '', quantityPackages: '1', packageCost: '' });
  };

  const removeItem = (productId: string) => {
    setItems(prev => prev.filter(item => item.productId !== productId));
    if (editingProductId === productId) {
      setEditingProductId(null);
      setEditDraft({ quantityPackages: '', packageCost: '' });
    }
  };

  const startEditItem = (productId: string) => {
    const current = items.find(item => item.productId === productId);
    if (!current) return;

    setEditingProductId(productId);
    setEditDraft({
      quantityPackages: current.quantity.toString(),
      packageCost: current.cost.toString()
    });
  };

  const cancelEditItem = () => {
    setEditingProductId(null);
    setEditDraft({ quantityPackages: '', packageCost: '' });
  };

  // Guarda cambios del ítem en edición.
  const saveEditItem = (productId: string) => {
    const quantity = parseFloat(editDraft.quantityPackages);
    const cost = parseFloat(editDraft.packageCost);

    if (Number.isNaN(quantity) || Number.isNaN(cost) || quantity <= 0 || cost <= 0) {
      toast.error('Ingrese valores válidos para paquetes y costo');
      return;
    }

    setItems(prev => prev.map(item =>
      item.productId === productId
        ? { ...item, quantity, cost }
        : item
    ));

    toast.success('Ítem de compra actualizado');
    cancelEditItem();
  };

  // Total calculado de la compra.
  const purchaseTotal = items.reduce((sum, item) => sum + (item.quantity * item.cost), 0);

  useEffect(() => {
    setPricePolicy(storeConfig.purchasePricePolicy || 'automatic');
  }, [storeConfig.purchasePricePolicy]);

  // Registra la compra y aplica política de precio.
  const handleRegisterPurchase = () => {
    if (!supplierId) {
      toast.error('Seleccione proveedor');
      return;
    }

    if (items.length === 0) {
      toast.error('Agregue al menos un producto a la compra');
      return;
    }

    registerPurchase(supplierId, items, { pricePolicy });
    toast.success(
      pricePolicy === 'automatic'
        ? 'Compra registrada. Stock y precio actualizados automáticamente'
        : 'Compra registrada. Stock y costo actualizados; precio de venta conservado'
    );

    setItems([]);
    setDraft({ productId: '', quantityPackages: '1', packageCost: '' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Compras</h1>
          <p className="text-gray-600">Registro de entradas a inventario con política automática de precio</p>
        </div>
      </div>

      <Card className="p-6 space-y-4">
        <div>
          <Label>Proveedor *</Label>
          <Select value={supplierId} onValueChange={(value) => {
            setSupplierId(value);
            setItems([]);
            setDraft({ productId: '', quantityPackages: '1', packageCost: '' });
          }}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccione proveedor" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map(supplier => (
                <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Política de precio</Label>
          <Select
            value={pricePolicy}
            onValueChange={(value: 'automatic' | 'manual') => setPricePolicy(value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="automatic">Automática (recalcula venta)</SelectItem>
              <SelectItem value="manual">Manual (mantiene venta actual)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Label>Producto</Label>
            <Select
              value={draft.productId}
              onValueChange={(value) => setDraft(prev => ({ ...prev, productId: value }))}
              disabled={!supplierId}
            >
              <SelectTrigger>
                <SelectValue placeholder={supplierId ? 'Seleccione producto' : 'Primero seleccione proveedor'} />
              </SelectTrigger>
              <SelectContent>
                {supplierProducts.map(product => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Paquetes</Label>
            <Input
              type="number"
              min="1"
              value={draft.quantityPackages}
              onChange={(e) => setDraft(prev => ({ ...prev, quantityPackages: e.target.value }))}
            />
          </div>

          <div>
            <Label>Costo paquete (sin IVA)</Label>
            <Input
              type="number"
              min="0"
              value={draft.packageCost}
              onChange={(e) => setDraft(prev => ({ ...prev, packageCost: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={addItemToPurchase} variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Agregar a compra
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary border-b">
              <tr>
                <th className="text-left p-4 font-semibold">Producto</th>
                <th className="text-right p-4 font-semibold">Unid por paquete</th>
                <th className="text-right p-4 font-semibold">Paquetes</th>
                <th className="text-right p-4 font-semibold">Unidades entrada</th>
                <th className="text-right p-4 font-semibold">Costo paquete</th>
                <th className="text-right p-4 font-semibold">Subtotal</th>
                <th className="text-center p-4 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-gray-500">No hay productos en la compra</td>
                </tr>
              ) : (
                items.map(item => {
                  const product = productById.get(item.productId);
                  const unitsPerPurchase = Number(product?.unitsPerPurchase ?? 1) || 1;
                  const isEditing = editingProductId === item.productId;
                  const quantityForCalc = isEditing ? (parseFloat(editDraft.quantityPackages) || 0) : item.quantity;
                  const costForCalc = isEditing ? (parseFloat(editDraft.packageCost) || 0) : item.cost;
                  const enteredUnits = quantityForCalc * unitsPerPurchase;
                  const subtotal = quantityForCalc * costForCalc;

                  return (
                    <tr key={item.productId} className="border-b">
                      <td className="p-4">{product?.name || 'Producto'}</td>
                      <td className="p-4 text-right">{unitsPerPurchase}</td>
                      <td className="p-4 text-right">
                        {isEditing ? (
                          <Input
                            type="number"
                            min="1"
                            value={editDraft.quantityPackages}
                            onChange={(e) => setEditDraft(prev => ({ ...prev, quantityPackages: e.target.value }))}
                            className="h-9 text-right"
                          />
                        ) : item.quantity}
                      </td>
                      <td className="p-4 text-right font-semibold text-[#2ECC71]">+{enteredUnits}</td>
                      <td className="p-4 text-right">
                        {isEditing ? (
                          <Input
                            type="number"
                            min="0"
                            value={editDraft.packageCost}
                            onChange={(e) => setEditDraft(prev => ({ ...prev, packageCost: e.target.value }))}
                            className="h-9 text-right"
                          />
                        ) : `$${item.cost.toLocaleString('es-CO')}`}
                      </td>
                      <td className="p-4 text-right font-semibold">${subtotal.toLocaleString('es-CO')}</td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {isEditing ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-[#2ECC71] hover:text-[#27AE60]"
                                onClick={() => saveEditItem(item.productId)}
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={cancelEditItem}>
                                <X className="w-4 h-4" />
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => startEditItem(item.productId)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}

                          <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => removeItem(item.productId)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-sm text-gray-600">Total compra</p>
            <p className="text-3xl font-bold text-[var(--primary)]">${purchaseTotal.toLocaleString('es-CO')}</p>
            <p className="text-xs text-gray-500 mt-1">
              {pricePolicy === 'automatic'
                ? 'Al registrar: se actualiza stock, Kardex, costo promedio y precio de venta.'
                : 'Al registrar: se actualiza stock, Kardex y costo promedio; el precio de venta no cambia.'}
            </p>
          </div>
          <Button
            className="h-12 px-6 bg-[#2ECC71] hover:bg-[#27AE60]"
            onClick={handleRegisterPurchase}
            disabled={!supplierId || items.length === 0}
          >
            <ShoppingBasket className="w-5 h-5 mr-2" />
            Registrar compra
          </Button>
        </div>
      </Card>

      {selectedSupplier && (
        <Card className="p-6">
          <h2 className="text-lg font-bold mb-3">Últimas compras del proveedor</h2>
          {selectedSupplier.purchases.length === 0 ? (
            <p className="text-sm text-gray-500">Aún no hay compras registradas para este proveedor.</p>
          ) : (
            <div className="space-y-2">
              {selectedSupplier.purchases.slice(-8).reverse().map(purchase => (
                <div key={purchase.id} className="flex items-center justify-between text-sm border-b pb-2">
                  <span>{new Date(purchase.date).toLocaleString('es-CO')}</span>
                  <span>{purchase.items.length} ítems</span>
                  <span className="font-semibold">${purchase.total.toLocaleString('es-CO')}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
