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
import { endOfDay, startOfDay, subDays } from 'date-fns';

type PurchaseItemDraft = {
  productId: string;
  quantity: string;
  cost: string;
  entryMode: 'package' | 'unit';
};

type PurchaseItem = {
  id: string;
  productId: string;
  quantity: number;
  cost: number;
  unitsPerPackage: number;
  entryMode: 'package' | 'unit';
};

const createPurchaseItemId = () => (
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

export function Purchases() {
  const { suppliers, products, registerPurchase, setPurchasePaid, deletePurchase, storeConfig } = usePOS();
  // Estado del formulario y de los ítems de compra.
  const [supplierId, setSupplierId] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierSuggestions, setShowSupplierSuggestions] = useState(false);
  const [pricePolicy, setPricePolicy] = useState<'automatic' | 'manual'>(storeConfig.purchasePricePolicy || 'automatic');
  const [draft, setDraft] = useState<PurchaseItemDraft>({
    productId: '',
    quantity: '1',
    cost: '',
    entryMode: 'package'
  });
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ quantity: string; cost: string }>({
    quantity: '',
    cost: ''
  });
  const [updatingPurchaseId, setUpdatingPurchaseId] = useState<string | null>(null);
  const [deletingPurchaseId, setDeletingPurchaseId] = useState<string | null>(null);
  const [confirmDeletePurchaseId, setConfirmDeletePurchaseId] = useState<string | null>(null);
  const [historyPeriod, setHistoryPeriod] = useState<'all' | 'today' | 'week' | 'month'>('all');

  const selectedSupplier = suppliers.find(s => s.id === supplierId) || null;
  const visibleSuppliers = useMemo(() => {
    const query = supplierSearch.trim().toLowerCase();
    if (!query) return suppliers;

    const filtered = suppliers.filter((supplier) => supplier.name.toLowerCase().includes(query));
    if (!supplierId || filtered.some((supplier) => supplier.id === supplierId)) return filtered;

    const selected = suppliers.find((supplier) => supplier.id === supplierId);
    return selected ? [selected, ...filtered] : filtered;
  }, [suppliers, supplierSearch, supplierId]);
  const supplierSuggestions = useMemo(() => {
    const query = supplierSearch.trim().toLowerCase();
    if (!query) return [];
    return suppliers
      .filter((supplier) => supplier.name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [suppliers, supplierSearch]);

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

  const selectedDraftProduct = draft.productId ? productById.get(draft.productId) : undefined;
  const supplierPurchases = useMemo(
    () => (selectedSupplier ? [...selectedSupplier.purchases].reverse() : []),
    [selectedSupplier],
  );
  const historyRange = useMemo(() => {
    const now = new Date();
    switch (historyPeriod) {
      case 'all':
        return null;
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'week':
        return { start: subDays(startOfDay(now), 7), end: endOfDay(now) };
      case 'month':
        return { start: subDays(startOfDay(now), 30), end: endOfDay(now) };
      default:
        return null;
    }
  }, [historyPeriod]);
  const filteredSupplierPurchases = useMemo(
    () => {
      if (!historyRange) return supplierPurchases;
      return supplierPurchases.filter((purchase) => {
      const purchaseDate = new Date(purchase.date).getTime();
      if (!Number.isFinite(purchaseDate)) return false;
      return purchaseDate >= historyRange.start.getTime() && purchaseDate <= historyRange.end.getTime();
      });
    },
    [supplierPurchases, historyRange],
  );

  // Agrega ítems al borrador de compra.
  const addItemToPurchase = () => {
    const quantity = parseFloat(draft.quantity);
    const cost = parseFloat(draft.cost);

    if (!draft.productId || Number.isNaN(quantity) || Number.isNaN(cost) || quantity <= 0 || cost <= 0) {
      toast.error('Complete producto, cantidad y costo');
      return;
    }

    const unitsPerPackage = draft.entryMode === 'unit'
      ? 1
      : Number(selectedDraftProduct?.unitsPerPurchase ?? 1) || 1;

    setItems(prev => {
      const existing = prev.find(item => item.productId === draft.productId && item.entryMode === draft.entryMode);
      if (existing) {
        return prev.map(item =>
          item.id === existing.id
            ? { ...item, quantity: item.quantity + quantity, cost, unitsPerPackage }
            : item
        );
      }

      return [...prev, {
        id: createPurchaseItemId(),
        productId: draft.productId,
        quantity,
        cost,
        unitsPerPackage,
        entryMode: draft.entryMode
      }];
    });

    setDraft({ productId: '', quantity: '1', cost: '', entryMode: 'package' });
  };

  const removeItem = (itemId: string) => {
    setItems(prev => prev.filter(item => item.id !== itemId));
    if (editingItemId === itemId) {
      setEditingItemId(null);
      setEditDraft({ quantity: '', cost: '' });
    }
  };

  const startEditItem = (itemId: string) => {
    const current = items.find(item => item.id === itemId);
    if (!current) return;

    setEditingItemId(itemId);
    setEditDraft({
      quantity: current.quantity.toString(),
      cost: current.cost.toString()
    });
  };

  const cancelEditItem = () => {
    setEditingItemId(null);
    setEditDraft({ quantity: '', cost: '' });
  };

  // Guarda cambios del ítem en edición.
  const saveEditItem = (itemId: string) => {
    const quantity = parseFloat(editDraft.quantity);
    const cost = parseFloat(editDraft.cost);

    if (Number.isNaN(quantity) || Number.isNaN(cost) || quantity <= 0 || cost <= 0) {
      toast.error('Ingrese valores válidos para cantidad y costo');
      return;
    }

    setItems(prev => prev.map(item =>
      item.id === itemId
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

    registerPurchase(
      supplierId,
      items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        cost: item.cost,
        unitsPerPackage: item.unitsPerPackage,
      })),
      { pricePolicy }
    );
    toast.success(
      pricePolicy === 'automatic'
        ? 'Compra registrada. Stock y precio actualizados automáticamente'
        : 'Compra registrada. Stock y costo actualizados; precio de venta conservado'
    );

    setItems([]);
    setDraft({ productId: '', quantity: '1', cost: '', entryMode: 'package' });
  };

  const handleTogglePurchasePaid = async (
    purchaseId: string,
    nextPaid: boolean,
  ) => {
    if (!selectedSupplier) return;

    setUpdatingPurchaseId(purchaseId);
    const result = await setPurchasePaid(selectedSupplier.id, purchaseId, nextPaid);
    setUpdatingPurchaseId(null);

    if (result === 'failed') return;
    toast.success(nextPaid ? 'Compra marcada como pagada' : 'Compra marcada como pendiente');
  };

  const handleDeleteRegisteredPurchase = async (purchaseId: string) => {
    if (!selectedSupplier) return;

    setDeletingPurchaseId(purchaseId);
    const result = await deletePurchase(selectedSupplier.id, purchaseId);
    setDeletingPurchaseId(null);
    setConfirmDeletePurchaseId(null);

    if (result === 'failed') return;
    toast.success('Compra eliminada correctamente');
  };

  const formatMoney = (value: number) => `$${value.toLocaleString('es-CO')}`;
  const resolveProductName = (productId?: string) => {
    if (!productId) return 'Sin detalle';
    return productById.get(productId)?.name || 'Producto';
  };
  const handleSelectSupplier = (value: string) => {
    setSupplierId(value);
    const selected = suppliers.find((supplier) => supplier.id === value);
    if (selected) setSupplierSearch(selected.name);
    setShowSupplierSuggestions(false);
    setItems([]);
    setDraft({ productId: '', quantity: '1', cost: '', entryMode: 'package' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Compras</h1>
          <p className="text-gray-600">Registro de entradas a inventario con política automática de precio</p>
        </div>
      </div>

      <Card className="p-6 space-y-4">
        <div>
          <Label>Proveedor *</Label>
          <div className="relative mb-2">
            <Input
              value={supplierSearch}
              onChange={(event) => {
                setSupplierSearch(event.target.value);
                setShowSupplierSuggestions(true);
              }}
              onFocus={() => setShowSupplierSuggestions(true)}
              onBlur={() => {
                window.setTimeout(() => setShowSupplierSuggestions(false), 120);
              }}
              placeholder="Buscar proveedor por nombre"
            />
            {showSupplierSuggestions && supplierSearch.trim().length > 0 ? (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-white shadow-md">
                {supplierSuggestions.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">Sin coincidencias</div>
                ) : (
                  supplierSuggestions.map((supplier) => (
                    <button
                      key={`suggest-${supplier.id}`}
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-secondary"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleSelectSupplier(supplier.id);
                      }}
                    >
                      {supplier.name}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
          <Select value={supplierId} onValueChange={handleSelectSupplier}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccione proveedor" />
            </SelectTrigger>
            <SelectContent>
              {visibleSuppliers.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">No se encontraron proveedores</div>
              ) : (
                visibleSuppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
                ))
              )}
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

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
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
            <Label>Modo de compra</Label>
            <Select
              value={draft.entryMode}
              onValueChange={(value: 'package' | 'unit') => setDraft(prev => ({ ...prev, entryMode: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="package">Por paquete</SelectItem>
                <SelectItem value="unit">Por unidad</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{draft.entryMode === 'package' ? 'Paquetes' : 'Unidades'}</Label>
            <Input
              type="number"
              min="1"
              value={draft.quantity}
              onChange={(e) => setDraft(prev => ({ ...prev, quantity: e.target.value }))}
            />
          </div>

          <div>
            <Label>{draft.entryMode === 'package' ? 'Costo paquete (sin IVA)' : 'Costo unidad (sin IVA)'}</Label>
            <Input
              type="number"
              min="0"
              value={draft.cost}
              onChange={(e) => setDraft(prev => ({ ...prev, cost: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-end">
          <Button onClick={addItemToPurchase} variant="outline" className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Agregar a compra
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="md:hidden p-4 space-y-3">
          {items.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No hay productos en la compra</div>
          ) : (
            items.map(item => {
              const product = productById.get(item.productId);
              const unitsPerPurchase = Number(item.unitsPerPackage ?? product?.unitsPerPurchase ?? 1) || 1;
              const isEditing = editingItemId === item.id;
              const quantityForCalc = isEditing ? (parseFloat(editDraft.quantity) || 0) : item.quantity;
              const costForCalc = isEditing ? (parseFloat(editDraft.cost) || 0) : item.cost;
              const enteredUnits = quantityForCalc * unitsPerPurchase;
              const quantityLabel = item.entryMode === 'package' ? 'Paquetes' : 'Unidades';
              const costLabel = item.entryMode === 'package' ? 'Costo paquete' : 'Costo unidad';
              const subtotal = quantityForCalc * costForCalc;

              return (
                <div key={item.id} className="rounded-lg border border-border bg-white p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{product?.name || 'Producto'}</p>
                      <p className="text-xs text-gray-600">Modo: {item.entryMode === 'package' ? 'por paquete' : 'por unidad'} · Unid/entrada: {unitsPerPurchase}</p>
                    </div>
                    <span className="text-sm font-semibold text-[#2ECC71]">+{enteredUnits} unid</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">{quantityLabel}</p>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="1"
                          value={editDraft.quantity}
                          onChange={(e) => setEditDraft(prev => ({ ...prev, quantity: e.target.value }))}
                          className="h-9 text-right"
                        />
                      ) : (
                        <p className="font-semibold">{item.quantity}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{costLabel}</p>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="0"
                          value={editDraft.cost}
                          onChange={(e) => setEditDraft(prev => ({ ...prev, cost: e.target.value }))}
                          className="h-9 text-right"
                        />
                      ) : (
                        <p className="font-semibold">${item.cost.toLocaleString('es-CO')}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Subtotal</p>
                      <p className="font-semibold">${subtotal.toLocaleString('es-CO')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Unidades entrada</p>
                      <p className="font-semibold text-[#2ECC71]">+{enteredUnits}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {isEditing ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[#2ECC71] hover:text-[#27AE60]"
                          onClick={() => saveEditItem(item.id)}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelEditItem}>
                          <X className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => startEditItem(item.id)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}

                    <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => removeItem(item.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-secondary border-b">
              <tr>
                <th className="text-left p-3 sm:p-4 font-semibold">Producto</th>
                <th className="text-right p-3 sm:p-4 font-semibold">Unid por entrada</th>
                <th className="text-right p-3 sm:p-4 font-semibold">Cantidad</th>
                <th className="text-right p-3 sm:p-4 font-semibold">Unidades entrada</th>
                <th className="text-right p-3 sm:p-4 font-semibold">Costo entrada</th>
                <th className="text-right p-3 sm:p-4 font-semibold">Subtotal</th>
                <th className="text-center p-3 sm:p-4 font-semibold">Acciones</th>
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
                  const unitsPerPurchase = Number(item.unitsPerPackage ?? product?.unitsPerPurchase ?? 1) || 1;
                  const isEditing = editingItemId === item.id;
                  const quantityForCalc = isEditing ? (parseFloat(editDraft.quantity) || 0) : item.quantity;
                  const costForCalc = isEditing ? (parseFloat(editDraft.cost) || 0) : item.cost;
                  const enteredUnits = quantityForCalc * unitsPerPurchase;
                  const subtotal = quantityForCalc * costForCalc;

                  return (
                    <tr key={item.id} className="border-b">
                      <td className="p-3 sm:p-4">
                        <p>{product?.name || 'Producto'}</p>
                        <p className="text-xs text-gray-500">{item.entryMode === 'package' ? 'Por paquete' : 'Por unidad'}</p>
                      </td>
                      <td className="p-3 sm:p-4 text-right">{unitsPerPurchase}</td>
                      <td className="p-3 sm:p-4 text-right">
                        {isEditing ? (
                          <Input
                            type="number"
                            min="1"
                            value={editDraft.quantity}
                            onChange={(e) => setEditDraft(prev => ({ ...prev, quantity: e.target.value }))}
                            className="h-9 text-right"
                          />
                        ) : item.quantity}
                      </td>
                      <td className="p-3 sm:p-4 text-right font-semibold text-[#2ECC71]">+{enteredUnits}</td>
                      <td className="p-3 sm:p-4 text-right">
                        {isEditing ? (
                          <Input
                            type="number"
                            min="0"
                            value={editDraft.cost}
                            onChange={(e) => setEditDraft(prev => ({ ...prev, cost: e.target.value }))}
                            className="h-9 text-right"
                          />
                        ) : `$${item.cost.toLocaleString('es-CO')}`}
                      </td>
                      <td className="p-3 sm:p-4 text-right font-semibold">${subtotal.toLocaleString('es-CO')}</td>
                      <td className="p-3 sm:p-4 text-center">
                        <div className="flex items-center justify-center gap-1 sm:gap-2">
                          {isEditing ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-[#2ECC71] hover:text-[#27AE60]"
                                onClick={() => saveEditItem(item.id)}
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={cancelEditItem}>
                                <X className="w-4 h-4" />
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => startEditItem(item.id)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}

                          <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => removeItem(item.id)}>
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
            className="w-full md:w-auto h-12 px-6 bg-[#2ECC71] hover:bg-[#27AE60]"
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
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-bold">Compras del proveedor</h2>
            <Select value={historyPeriod} onValueChange={(value: 'all' | 'today' | 'week' | 'month') => setHistoryPeriod(value)}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo el historial</SelectItem>
                <SelectItem value="today">Hoy</SelectItem>
                <SelectItem value="week">Última Semana</SelectItem>
                <SelectItem value="month">Último Mes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="mb-3 text-sm text-gray-600">
            Mostrando {filteredSupplierPurchases.length} de {supplierPurchases.length} compras.
          </p>
          {filteredSupplierPurchases.length === 0 ? (
            <p className="text-sm text-gray-500">Aún no hay compras registradas para este proveedor.</p>
          ) : (
            <>
              <div className="md:hidden space-y-3">
                {filteredSupplierPurchases.map((purchase) => (
                  <div key={purchase.id} className="rounded-lg border border-border p-3 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Fecha: {new Date(purchase.date).toLocaleString('es-CO')}</p>
                        <p className="text-sm text-gray-600">Proveedor: {selectedSupplier.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">Total: {formatMoney(purchase.total)}</p>
                        <p className={purchase.paid ? 'text-[#2ECC71] text-sm font-medium' : 'text-amber-700 text-sm font-medium'}>
                          {purchase.paid ? 'Pagada' : 'Pendiente'}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-md border divide-y">
                      {(purchase.items.length > 0 ? purchase.items : [{ productId: '', quantity: 1, cost: purchase.total, unitsPerPackage: 1 }]).map((item, index) => (
                        <div key={`${purchase.id}-mobile-${index}`} className="flex items-center justify-between gap-3 p-2 text-sm">
                          <span className="truncate">Producto: {resolveProductName(item.productId)}</span>
                          <span className="font-medium">Valor: {formatMoney(item.quantity * item.cost)}</span>
                        </div>
                      ))}
                    </div>

                    {confirmDeletePurchaseId === purchase.id ? (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 border-red-300 text-red-700 hover:bg-red-50"
                          onClick={() => handleDeleteRegisteredPurchase(purchase.id)}
                          disabled={deletingPurchaseId === purchase.id}
                        >
                          Confirmar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => setConfirmDeletePurchaseId(null)}
                          disabled={deletingPurchaseId === purchase.id}
                        >
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => handleTogglePurchasePaid(purchase.id, !purchase.paid)}
                          disabled={updatingPurchaseId === purchase.id || deletingPurchaseId === purchase.id}
                        >
                          {purchase.paid ? 'Marcar pendiente' : 'Marcar pagada'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 border-red-300 text-red-700 hover:bg-red-50"
                          onClick={() => setConfirmDeletePurchaseId(purchase.id)}
                          disabled={updatingPurchaseId === purchase.id || deletingPurchaseId === purchase.id}
                        >
                          Eliminar
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[1000px]">
                  <thead className="bg-secondary border-b">
                    <tr>
                      <th className="text-left p-3">Fecha</th>
                      <th className="text-left p-3">Proveedor</th>
                      <th className="text-left p-3">Producto</th>
                      <th className="text-right p-3">Valor</th>
                      <th className="text-center p-3">Estado</th>
                      <th className="text-right p-3">Total compra</th>
                      <th className="text-right p-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSupplierPurchases.map((purchase) => {
                      const detailItems = purchase.items.length > 0
                        ? purchase.items
                        : [{ productId: '', quantity: 1, cost: purchase.total, unitsPerPackage: 1 }];

                      return detailItems.map((item, index) => (
                        <tr key={`${purchase.id}-${index}`} className="border-b align-top">
                          <td className="p-3">{index === 0 ? new Date(purchase.date).toLocaleString('es-CO') : ''}</td>
                          <td className="p-3">{index === 0 ? selectedSupplier.name : ''}</td>
                          <td className="p-3">{resolveProductName(item.productId)}</td>
                          <td className="p-3 text-right">{formatMoney(item.quantity * item.cost)}</td>
                          <td className="p-3 text-center">
                            {index === 0 ? (
                              <span className={purchase.paid ? 'text-[#2ECC71] font-medium' : 'text-amber-700 font-medium'}>
                                {purchase.paid ? 'Pagada' : 'Pendiente'}
                              </span>
                            ) : null}
                          </td>
                          <td className="p-3 text-right font-semibold">{index === 0 ? formatMoney(purchase.total) : ''}</td>
                          <td className="p-3 text-right">
                            {index === 0 ? (
                              confirmDeletePurchaseId === purchase.id ? (
                                <div className="flex justify-end items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 border-red-300 text-red-700 hover:bg-red-50"
                                    onClick={() => handleDeleteRegisteredPurchase(purchase.id)}
                                    disabled={deletingPurchaseId === purchase.id}
                                  >
                                    Confirmar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8"
                                    onClick={() => setConfirmDeletePurchaseId(null)}
                                    disabled={deletingPurchaseId === purchase.id}
                                  >
                                    Cancelar
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex justify-end items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8"
                                    onClick={() => handleTogglePurchasePaid(purchase.id, !purchase.paid)}
                                    disabled={updatingPurchaseId === purchase.id || deletingPurchaseId === purchase.id}
                                  >
                                    {purchase.paid ? 'Marcar pendiente' : 'Marcar pagada'}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 border-red-300 text-red-700 hover:bg-red-50"
                                    onClick={() => setConfirmDeletePurchaseId(purchase.id)}
                                    disabled={updatingPurchaseId === purchase.id || deletingPurchaseId === purchase.id}
                                  >
                                    Eliminar
                                  </Button>
                                </div>
                              )
                            ) : null}
                          </td>
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
