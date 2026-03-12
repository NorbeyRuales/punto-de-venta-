// Inventario: alta/edición de productos, filtros, Kardex y exportación.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { usePOS } from '../context/POSContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  AlertTriangle,
  Download,
  Package,
  History
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { toast } from 'sonner';
import type { Product } from '../context/POSContext';

type BarcodeLookupResponse = {
  found: boolean;
  codigo: string;
  nombre?: string;
  marca?: string;
  detalle?: string;
  fuente?: string;
};

// Endpoint de Edge Function para buscar info por código de barras.
const barcodeLookupUrl = (barcode: string) =>
  `https://wujuzvjilkfrddmofyxa.supabase.co/functions/v1/make-server-cf6a4e6a/barcode-scrape/${barcode}`;

export function Inventory() {
  const { products, addProduct, updateProduct, deleteProduct, categories, suppliers, getKardexByProduct, adjustStock } = usePOS();
  const navigate = useNavigate();
  // Filtros y estado de UI.
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isSearchingBarcode, setIsSearchingBarcode] = useState(false);
  const [lastLookedUpBarcode, setLastLookedUpBarcode] = useState('');
  const [barcodeLookupStatus, setBarcodeLookupStatus] = useState<'idle' | 'searching' | 'found' | 'not-found' | 'error'>('idle');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showKardexDialog, setShowKardexDialog] = useState(false);
  const [selectedKardexProduct, setSelectedKardexProduct] = useState<Product | null>(null);
  // Formularios y valores derivados.
  const defaultCategory = categories[0] || 'General';
  const buildEmptyForm = (category: string) => ({
    name: '',
    sku: '',
    barcode: '',
    category,
    costPrice: '',
    unitsPerPurchase: '1',
    profitMargin: '30',
    stock: '',
    minStock: '',
    unit: 'unidad',
    isBulk: false,
    iva: '0',
    supplierName: ''
  });
  const [formData, setFormData] = useState(buildEmptyForm(defaultCategory));
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Cálculos automáticos de costos/IVA/utilidad.
  const purchaseCost = parseFloat(formData.costPrice) || 0;
  const unitsPerPurchase = parseFloat(formData.unitsPerPurchase) || 0;
  const profitMargin = parseFloat(formData.profitMargin) || 0;
  const ivaRate = parseFloat(formData.iva) || 0;
  const calculatedUnitCost = unitsPerPurchase > 0 ? purchaseCost / unitsPerPurchase : 0;
  const marginFactor = 1 - (profitMargin / 100);
  const calculatedCostWithIva = purchaseCost * (1 + (ivaRate / 100));
  const calculatedUnitCostWithIva = unitsPerPurchase > 0 ? calculatedCostWithIva / unitsPerPurchase : 0;
  const calculatedUnitSalePrice = marginFactor > 0 ? calculatedUnitCostWithIva / marginFactor : 0;
  const emptyFormData = buildEmptyForm(defaultCategory);

  const mapProductToForm = (product: Product) => ({
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    category: product.category,
    costPrice: product.costPrice.toString(),
    unitsPerPurchase: (product.unitsPerPurchase || 1).toString(),
    profitMargin: (product.profitMargin ?? 30).toString(),
    stock: product.stock.toString(),
    minStock: product.minStock.toString(),
    unit: product.unit,
    isBulk: product.isBulk,
    iva: product.iva.toString(),
    supplierName: product.supplierName || ''
  });

  const hasFormChanges = (current: typeof formData, baseline: typeof formData) =>
    Object.keys(baseline).some((key) =>
      current[key as keyof typeof baseline] !== baseline[key as keyof typeof baseline]
    );

  const isAddDirty = hasFormChanges(formData, emptyFormData);
  const isEditDirty = selectedProduct ? hasFormChanges(formData, mapProductToForm(selectedProduct)) : false;

  const errorClass = (field: keyof typeof formData) =>
    formErrors[field] ? 'border-red-500 focus-visible:ring-red-500' : '';

  const clearFormError = (field: keyof typeof formData) => {
    if (!formErrors[field]) return;
    setFormErrors(prev => {
      const { [field]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) {
      errors.name = 'Nombre requerido';
    }
    if (!formData.supplierName.trim()) {
      errors.supplierName = 'Proveedor requerido';
    }
    if (purchaseCost <= 0) {
      errors.costPrice = 'Debe ser mayor a 0';
    }
    if (unitsPerPurchase <= 0) {
      errors.unitsPerPurchase = 'Debe ser mayor a 0';
    }
    if (!formData.profitMargin.trim()) {
      errors.profitMargin = 'Utilidad requerida';
    } else if (profitMargin < 0 || profitMargin >= 100) {
      errors.profitMargin = 'Debe estar entre 0 y 99.99';
    }
    return errors;
  };

  // Mantiene filtros válidos cuando cambia catálogo.
  useEffect(() => {
    if (categoryFilter !== 'all' && !categories.includes(categoryFilter)) {
      setCategoryFilter('all');
    }
  }, [categories, categoryFilter]);

  useEffect(() => {
    const availableSuppliers = suppliers.map(s => s.name);
    if (supplierFilter !== 'all' && !availableSuppliers.includes(supplierFilter)) {
      setSupplierFilter('all');
    }
  }, [suppliers, supplierFilter]);

  useEffect(() => {
    if (categories.length === 0) return;
    if (!formData.category || !categories.includes(formData.category)) {
      setFormData(prev => ({ ...prev, category: defaultCategory }));
    }
  }, [categories, formData.category, defaultCategory]);

  // Atajos de teclado: "/" para buscar, Alt+N para nuevo producto.
  useEffect(() => {
    const handleShortcuts = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget = target
        && (target.tagName === 'INPUT'
          || target.tagName === 'TEXTAREA'
          || target.tagName === 'SELECT'
          || target.isContentEditable);

      if (isTypingTarget) return;

      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if ((event.key === 'n' || event.key === 'N') && event.altKey) {
        event.preventDefault();
        setShowAddDialog(true);
        setFormErrors({});
      }
    };

    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, []);

  // Filtrado por búsqueda, categoría y proveedor.
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.includes(searchQuery);
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    const matchesSupplier = supplierFilter === 'all' || (p.supplierName || '') === supplierFilter;
    return matchesSearch && matchesCategory && matchesSupplier;
  });

  const lowStockCount = products.filter(p => p.stock <= p.minStock).length;

  const openKardexDialog = (product: Product) => {
    setSelectedKardexProduct(product);
    setShowKardexDialog(true);
  };

  const selectedKardexMovements = selectedKardexProduct
    ? getKardexByProduct(selectedKardexProduct.id)
    : [];

  // Alta de producto.
  const handleAddProduct = () => {
    const errors = validateForm();
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error('Revisa los campos marcados.');
      return;
    }

    addProduct({
      name: formData.name,
      sku: formData.sku || `SKU-${Date.now()}`,
      barcode: formData.barcode || `${Date.now()}`,
      category: formData.category,
      costPrice: purchaseCost,
      salePrice: calculatedUnitSalePrice,
      stock: parseFloat(formData.stock) || 0,
      minStock: parseFloat(formData.minStock) || 5,
      unit: formData.unit,
      isBulk: formData.isBulk,
      iva: parseFloat(formData.iva) || 0,
      supplierName: formData.supplierName || undefined,
      unitsPerPurchase,
      profitMargin,
      unitPrice: calculatedUnitSalePrice
    });

    toast.success('Producto agregado exitosamente');
    setShowAddDialog(false);
    setFormErrors({});
    resetForm();
  };

  // Edición de producto.
  const handleEditProduct = () => {
    if (!selectedProduct) return;
    const errors = validateForm();
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error('Revisa los campos marcados.');
      return;
    }

    const nextStockRaw = parseFloat(formData.stock);
    const nextStock = Number.isFinite(nextStockRaw) ? nextStockRaw : selectedProduct.stock;
    const nextIva = parseFloat(formData.iva) || 0;
    const nextMinStockRaw = parseFloat(formData.minStock);
    const nextMinStock = Number.isFinite(nextMinStockRaw) ? nextMinStockRaw : selectedProduct.minStock;
    const stockChanged = nextStock !== selectedProduct.stock;

    const productPatch = {
      name: formData.name,
      sku: formData.sku,
      barcode: formData.barcode,
      category: formData.category,
      costPrice: purchaseCost,
      salePrice: calculatedUnitSalePrice,
      stock: nextStock,
      minStock: nextMinStock,
      unit: formData.unit,
      isBulk: formData.isBulk,
      iva: nextIva,
      supplierName: formData.supplierName || undefined,
      unitsPerPurchase,
      profitMargin,
      unitPrice: calculatedUnitSalePrice
    };

    if (stockChanged) {
      const { stock, ...patchWithoutStock } = productPatch;
      updateProduct(selectedProduct.id, patchWithoutStock);
      adjustStock(selectedProduct.id, nextStock, {
        reference: `AJU-${Date.now().toString().slice(-6)}`,
        productName: formData.name,
        nextCostPrice: purchaseCost,
        nextIva,
        nextUnitsPerPurchase: unitsPerPurchase,
        unitSalePrice: calculatedUnitSalePrice
      });
    } else {
      updateProduct(selectedProduct.id, productPatch);
    }

    toast.success('Producto actualizado');
    setShowEditDialog(false);
    setSelectedProduct(null);
    setFormErrors({});
    resetForm();
  };

  const handleDeleteProduct = (product: Product) => {
    const confirmed = confirm(`¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    deleteProduct(product.id);
    toast.success('Producto eliminado');
  };

  const openEditDialog = (product: Product) => {
    setSelectedProduct(product);
    setFormData(mapProductToForm(product));
    setFormErrors({});
    setShowEditDialog(true);
  };

  const resetForm = () => {
    setLastLookedUpBarcode('');
    setBarcodeLookupStatus('idle');
    setFormData(buildEmptyForm(defaultCategory));
    setFormErrors({});
  };

  const handleAddDialogChange = (open: boolean) => {
    if (!open && isAddDirty) {
      const confirmed = confirm('Tienes cambios sin guardar. ¿Cerrar sin guardar?');
      if (!confirmed) return;
    }
    setShowAddDialog(open);
    if (!open) {
      resetForm();
      return;
    }
    setFormErrors({});
  };

  const handleEditDialogChange = (open: boolean) => {
    if (!open && isEditDirty) {
      const confirmed = confirm('Tienes cambios sin guardar. ¿Cerrar sin guardar?');
      if (!confirmed) return;
    }
    setShowEditDialog(open);
    if (!open) {
      setSelectedProduct(null);
      resetForm();
      return;
    }
    setFormErrors({});
  };

  // Exportación rápida de inventario a CSV.
  const exportToCSV = () => {
    if (isExporting) return;
    setIsExporting(true);
    const csvEscape = (value: string | number) => {
      const text = String(value ?? '');
      if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const headers = ['Detalle', 'Unid', 'Precio con IVA', 'Precio costo uni', 'Precio venta', 'Utilidad (%)', 'Stock', 'Stock mínimo'];
    const rows = products.map(p => [
      p.name,
      p.unitsPerPurchase || 1,
      p.costPrice * (1 + ((p.iva || 0) / 100)),
      (p.costPrice * (1 + ((p.iva || 0) / 100))) / (p.unitsPerPurchase || 1),
      Number(p.unitPrice ?? p.salePrice),
      calculateProfitMargin(
        (p.costPrice * (1 + ((p.iva || 0) / 100))) / (p.unitsPerPurchase || 1),
        Number(p.unitPrice ?? p.salePrice)
      ),
      p.stock,
      p.minStock
    ]);
    
    try {
      const csvContent = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventario-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      toast.success('Inventario exportado');
    } finally {
      setIsExporting(false);
    }
  };

  // Helpers de cálculo para vistas.
  const calculateProfitMargin = (cost: number, sale: number): number => {
    if (sale === 0) return 0;
    return ((sale - cost) / sale) * 100;
  };

  const getUnitsPerPurchase = (product: Product): number => {
    const units = Number(product.unitsPerPurchase ?? 1);
    return units > 0 ? units : 1;
  };

  const getUnitCost = (product: Product): number => {
    const units = getUnitsPerPurchase(product);
    return (product.costPrice * (1 + (Number(product.iva || 0) / 100))) / units;
  };

  const getCostWithIva = (product: Product): number => {
    return product.costPrice * (1 + (Number(product.iva || 0) / 100));
  };

  const getUnitSalePrice = (product: Product): number => {
    return Number(product.unitPrice ?? product.salePrice);
  };

  const handleEditCostWithIvaChange = (value: string) => {
    const nextCostWithIva = parseFloat(value);
    if (Number.isNaN(nextCostWithIva)) {
      setFormData(prev => ({ ...prev, costPrice: '' }));
      return;
    }

    const divisor = 1 + (ivaRate / 100);
    const nextCostPrice = divisor > 0 ? nextCostWithIva / divisor : nextCostWithIva;
    setFormData(prev => ({ ...prev, costPrice: nextCostPrice.toString() }));
  };

  const handleEditUnitCostChange = (value: string) => {
    const nextUnitCost = parseFloat(value);
    if (Number.isNaN(nextUnitCost)) {
      setFormData(prev => ({ ...prev, costPrice: '' }));
      return;
    }

    const units = unitsPerPurchase > 0 ? unitsPerPurchase : 1;
    const nextCostWithIva = nextUnitCost * units;
    const divisor = 1 + (ivaRate / 100);
    const nextCostPrice = divisor > 0 ? nextCostWithIva / divisor : nextCostWithIva;
    setFormData(prev => ({ ...prev, costPrice: nextCostPrice.toString() }));
  };

  const handleEditUnitSalePriceChange = (value: string) => {
    const nextUnitSale = parseFloat(value);
    if (Number.isNaN(nextUnitSale)) {
      setFormData(prev => ({ ...prev, profitMargin: '' }));
      return;
    }

    if (nextUnitSale <= 0 || calculatedUnitCostWithIva <= 0) {
      setFormData(prev => ({ ...prev, profitMargin: '0' }));
      return;
    }

    const nextMargin = ((nextUnitSale - calculatedUnitCostWithIva) / nextUnitSale) * 100;
    setFormData(prev => ({ ...prev, profitMargin: nextMargin.toFixed(2) }));
  };

  // Consulta un servicio externo para autocompletar por código de barras.
  const searchProductByBarcode = async () => {
    const barcode = formData.barcode.trim();

    if (!barcode) {
      setBarcodeLookupStatus('idle');
      return;
    }

    if (!/^\d{8,14}$/.test(barcode)) {
      setBarcodeLookupStatus('idle');
      return;
    }

    if (isSearchingBarcode || lastLookedUpBarcode === barcode) {
      return;
    }

    setIsSearchingBarcode(true);
    setBarcodeLookupStatus('searching');

    try {
      const response = await fetch(barcodeLookupUrl(barcode));
      if (!response.ok) {
        throw new Error('Error de red');
      }

      const data = (await response.json()) as BarcodeLookupResponse;

      if (!data?.found) {
        setBarcodeLookupStatus('not-found');
        toast.error('No se encontró información para este código');
        return;
      }

      const productName = (data.nombre || '').trim();
      const brand = (data.marca || '').trim();

      if (!productName) {
        setBarcodeLookupStatus('not-found');
        toast.error('No se encontró nombre o gramaje para este producto');
        return;
      }

      const nameWithBrand = productName.toLowerCase().includes(brand.toLowerCase()) || !brand
        ? productName
        : `${brand} ${productName}`;

      setFormData(prev => ({
        ...prev,
        barcode,
        name: nameWithBrand || prev.name
      }));
      setLastLookedUpBarcode(barcode);
      setBarcodeLookupStatus('found');

      toast.success(`Producto encontrado (${data.fuente || 'Web'}). Nombre autocompletado`);
    } catch {
      setBarcodeLookupStatus('error');
      toast.error('No fue posible consultar el producto en internet');
    } finally {
      setIsSearchingBarcode(false);
    }
  };

  // Dispara búsqueda de código de barras con debounce.
  useEffect(() => {
    if (!showAddDialog) return;

    const barcode = formData.barcode.trim();
    if (!/^\d{8,14}$/.test(barcode)) return;

    const timeoutId = window.setTimeout(() => {
      void searchProductByBarcode();
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [formData.barcode, showAddDialog]);
return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Inventario</h1>
          <p className="text-gray-600">{products.length} productos registrados</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => navigate('/configuration?tab=categories')}
          >
            Gestionar Categorías
          </Button>
          <Button
            onClick={() => handleAddDialogChange(true)}
            className="bg-[var(--primary)] hover:bg-[var(--primary-hover)]"
          >
            <Plus className="w-5 h-5 mr-2" />
            Agregar Producto
          </Button>
        </div>
      </div>

      {/* Alertas */}
      {lowStockCount > 0 && (
        <Card className="p-4 bg-red-50 border-red-200">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5" />
            <p className="font-semibold">
              Hay {lowStockCount} productos con stock bajo
            </p>
          </div>
        </Card>
      )}

      {/* Filtros */}
      <Card className="p-4 rounded-2xl bg-[var(--card)] border-[var(--border)] shadow-[0_14px_34px_rgba(67,91,154,0.14)]">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              ref={searchInputRef}
              placeholder="Buscar productos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Buscar productos"
              aria-describedby="inventory-search-help"
              className="pl-10 h-12"
            />
          </div>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Todas las categorías" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Todos los proveedores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los proveedores</SelectItem>
              {suppliers.map(supplier => (
                <SelectItem key={supplier.id} value={supplier.name}>{supplier.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={exportToCSV}
            className="h-12"
            disabled={isExporting}
          >
            <Download className="w-5 h-5 mr-2" />
            {isExporting ? 'Exportando...' : 'Exportar CSV'}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-gray-500">
          <p id="inventory-search-help">Atajos: / buscar · Alt+N agregar producto</p>
          <p aria-live="polite">Mostrando {filteredProducts.length} de {products.length} productos</p>
        </div>
      </Card>

      {/* Tabla de productos */}
      <Card className="overflow-hidden rounded-2xl bg-[var(--card)] border-[var(--border)] shadow-[0_14px_34px_rgba(67,91,154,0.16)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[var(--secondary-soft)] border-b border-[var(--border)]">
              <tr>
                <th className="text-left p-4 font-semibold">Detalle</th>
                <th className="text-center p-4 font-semibold">Unid</th>
                <th className="text-right p-4 font-semibold">Precio con IVA</th>
                <th className="text-right p-4 font-semibold">Precio costo uni</th>
                <th className="text-right p-4 font-semibold">Precio venta</th>
                <th className="text-right p-4 font-semibold">Utilidad (%)</th>
                <th className="text-center p-4 font-semibold">Stock</th>
                <th className="text-center p-4 font-semibold">Acciones</th>
                </tr>
                </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-500">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No se encontraron productos</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map(product => (
                  <tr key={product.id} className="border-b border-[var(--border)] even:bg-[rgba(206,181,255,0.12)] hover:bg-[rgba(206,181,255,0.22)] transition-colors">
                    <td className="p-4">
                      <p className="font-semibold">{product.name}</p>
                      <p className="text-sm text-gray-600">
                        {product.category}
                        {product.supplierName ? ` · ${product.supplierName}` : ''}
                      </p>
                    </td>
                    <td className="p-4 text-center font-medium">{getUnitsPerPurchase(product)}</td>
                    <td className="p-4 text-right">
                      ${getCostWithIva(product).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="p-4 text-right">
                      ${getUnitCost(product).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="p-4 text-right font-semibold text-[#2ECC71]">
                      ${getUnitSalePrice(product).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="p-4 text-right">
                      <span className="font-semibold text-[#8E44AD]">
                        {calculateProfitMargin(getUnitCost(product), getUnitSalePrice(product)).toFixed(2)}%
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`font-semibold ${
                        product.stock <= product.minStock
                          ? 'text-red-600'
                          : 'text-gray-900'
                      }`}>
                        {product.stock} {product.unit}
                      </span>
                      {product.stock <= product.minStock && (
                        <p className="text-xs text-red-600">¡Stock bajo!</p>
                      )}
                    </td>
                    <td className="p-4"> {/* Acciones */}
                      <div className="flex items-center justify-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openKardexDialog(product)}
                              aria-label="Ver kardex"
                              title="Ver kardex"
                            >
                              <History className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Ver kardex (historial)</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEditDialog(product)}
                              aria-label="Editar producto"
                              title="Editar producto"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Editar producto</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleDeleteProduct(product)}
                              aria-label="Eliminar producto"
                              title="Eliminar producto"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Eliminar producto</TooltipContent>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Dialog Agregar Producto */}
      <Dialog open={showAddDialog} onOpenChange={handleAddDialogChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agregar Producto</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-500">Los campos con * son obligatorios.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nombre *</Label>
              <Input
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  clearFormError('name');
                }}
                placeholder="Nombre del producto"
                aria-invalid={!!formErrors.name}
                aria-describedby={formErrors.name ? 'inventory-name-error' : 'inventory-name-help'}
                className={errorClass('name')}
              />
              {formErrors.name ? (
                <p id="inventory-name-error" className="text-xs text-red-600 mt-1">{formErrors.name}</p>
              ) : (
                <p id="inventory-name-help" className="text-xs text-gray-500 mt-1">
                  
                </p>
              )}
            </div>

            <div>
              <Label>SKU</Label>
              <Input
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                placeholder="Auto-generado"
              />
              <p className="text-xs text-gray-500 mt-1"></p>
            </div>

            <div>
              <Label>Código de Barras</Label>
              <Input
                value={formData.barcode}
                onChange={(e) => {
                  const nextBarcode = e.target.value;
                  setFormData({ ...formData, barcode: nextBarcode });
                  if (!nextBarcode.trim()) {
                    setBarcodeLookupStatus('idle');
                  }
                  if (nextBarcode.trim() !== lastLookedUpBarcode) {
                    setLastLookedUpBarcode('');
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void searchProductByBarcode();
                  }
                }}
                placeholder={isSearchingBarcode ? 'Buscando producto...' : 'Escanear o ingresar'}
                aria-describedby="inventory-barcode-help inventory-barcode-status"
              />
              <p id="inventory-barcode-help" className="text-xs text-gray-500 mt-1">
                Formato válido: 8 a 14 dígitos. Presiona Enter para buscar.
              </p>
              {barcodeLookupStatus === 'searching' && (
                <p id="inventory-barcode-status" className="text-xs text-gray-500 mt-1" role="status" aria-live="polite">
                  Consultando producto en internet...
                </p>
              )}
              {barcodeLookupStatus === 'found' && (
                <p id="inventory-barcode-status" className="text-xs text-green-600 mt-1" role="status" aria-live="polite">
                  Producto encontrado y nombre autocompletado.
                </p>
              )}
              {barcodeLookupStatus === 'not-found' && (
                <p id="inventory-barcode-status" className="text-xs text-amber-600 mt-1" role="status" aria-live="polite">
                  No se encontró información para este código.
                </p>
              )}
              {barcodeLookupStatus === 'error' && (
                <p id="inventory-barcode-status" className="text-xs text-red-600 mt-1" role="status" aria-live="polite">
                  Error consultando internet. Intenta nuevamente.
                </p>
              )}
            </div>

            <div>
              <Label>Categoría</Label>
              <Select value={formData.category} onValueChange={(val) => setFormData({ ...formData, category: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">Crea categorías desde Configuración.</p>
            </div>

            <div>
              <Label>Proveedor *</Label>
              <Select
                value={formData.supplierName || 'none'}
                onValueChange={(val) => {
                  setFormData({ ...formData, supplierName: val === 'none' ? '' : val });
                  clearFormError('supplierName');
                }}
              >
                <SelectTrigger className={errorClass('supplierName')} aria-invalid={!!formErrors.supplierName}>
                  <SelectValue placeholder="Seleccione proveedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Seleccione proveedor</SelectItem>
                  {suppliers.map(supplier => (
                    <SelectItem key={supplier.id} value={supplier.name}>{supplier.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.supplierName ? (
                <p className="text-xs text-red-600 mt-1">{formErrors.supplierName}</p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">Obligatorio para trazabilidad y compras.</p>
              )}
            </div>

            <div>
              <Label>Precio Compra (sin IVA)</Label>
              <Input
                type="number"
                value={formData.costPrice}
                onChange={(e) => {
                  setFormData({ ...formData, costPrice: e.target.value });
                  clearFormError('costPrice');
                }}
                placeholder="0"
                aria-invalid={!!formErrors.costPrice}
                aria-describedby={formErrors.costPrice ? 'inventory-cost-error' : 'inventory-cost-help'}
                className={errorClass('costPrice')}
              />
              {formErrors.costPrice ? (
                <p id="inventory-cost-error" className="text-xs text-red-600 mt-1">{formErrors.costPrice}</p>
              ) : (
                <p id="inventory-cost-help" className="text-xs text-gray-500 mt-1">
                  Sin IVA. Se usa para calcular costo unitario.
                </p>
              )}
            </div>

            <div>
              <Label>Unidades por compra *</Label>
              <Input
                type="number"
                min="1"
                value={formData.unitsPerPurchase}
                onChange={(e) => {
                  setFormData({ ...formData, unitsPerPurchase: e.target.value });
                  clearFormError('unitsPerPurchase');
                }}
                placeholder="1"
                aria-invalid={!!formErrors.unitsPerPurchase}
                aria-describedby={formErrors.unitsPerPurchase ? 'inventory-units-error' : 'inventory-units-help'}
                className={errorClass('unitsPerPurchase')}
              />
              {formErrors.unitsPerPurchase ? (
                <p id="inventory-units-error" className="text-xs text-red-600 mt-1">{formErrors.unitsPerPurchase}</p>
              ) : (
                <p id="inventory-units-help" className="text-xs text-gray-500 mt-1">
                  Ej: si compras por caja de 12, ingresa 12.
                </p>
              )}
            </div>

            <div>
              <Label>Utilidad (%) *</Label>
              <Input
                type="number"
                min="0"
                value={formData.profitMargin}
                onChange={(e) => {
                  setFormData({ ...formData, profitMargin: e.target.value });
                  clearFormError('profitMargin');
                }}
                placeholder="30"
                aria-invalid={!!formErrors.profitMargin}
                aria-describedby={formErrors.profitMargin ? 'inventory-margin-error' : 'inventory-margin-help'}
                className={errorClass('profitMargin')}
              />
              {formErrors.profitMargin ? (
                <p id="inventory-margin-error" className="text-xs text-red-600 mt-1">{formErrors.profitMargin}</p>
              ) : (
                <p id="inventory-margin-help" className="text-xs text-gray-500 mt-1">
                  Margen sobre costo con IVA. Menor a 100%.
                </p>
              )}
            </div>

            <div>
              <Label>Stock Inicial</Label>
              <Input
                type="number"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                placeholder="0"
              />
              <p className="text-xs text-gray-500 mt-1">Si ya tienes inventario disponible, indícalo aquí.</p>
            </div>

            <div>
              <Label>Stock Mínimo</Label>
              <Input
                type="number"
                value={formData.minStock}
                onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
                placeholder="5"
              />
              <p className="text-xs text-gray-500 mt-1">Usado para alertas de stock bajo.</p>
            </div>

            <div>
              <Label>Precio con IVA</Label>
              <Input
                type="number"
                min="0"
                value={calculatedCostWithIva ? calculatedCostWithIva.toFixed(2) : ''}
                onChange={(e) => handleEditCostWithIvaChange(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-gray-500 mt-1">Se calcula con IVA. Puedes ajustarlo.</p>
            </div>

            <div>
              <Label>Precio costo uni</Label>
              <Input
                type="number"
                min="0"
                value={calculatedUnitCostWithIva ? calculatedUnitCostWithIva.toFixed(2) : ''}
                onChange={(e) => handleEditUnitCostChange(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-gray-500 mt-1">Costo unitario con IVA.</p>
            </div>

            <div>
              <Label>Precio venta</Label>
              <Input
                type="number"
                min="0"
                value={calculatedUnitSalePrice ? calculatedUnitSalePrice.toFixed(2) : ''}
                onChange={(e) => handleEditUnitSalePriceChange(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-gray-500 mt-1">Ajusta el precio y recalcularemos la utilidad.</p>
            </div>

            <div>
              <Label>Unidad de Medida</Label>
              <Select value={formData.unit} onValueChange={(val) => setFormData({ ...formData, unit: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unidad">Unidad</SelectItem>
                  <SelectItem value="kg">Kilogramo (kg)</SelectItem>
                  <SelectItem value="g">Gramo (g)</SelectItem>
                  <SelectItem value="l">Litro (l)</SelectItem>
                  <SelectItem value="ml">Mililitro (ml)</SelectItem>
                  <SelectItem value="paquete">Paquete</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">Se muestra junto al stock.</p>
            </div>

            <div>
              <Label>IVA (%)</Label>
              <Select value={formData.iva} onValueChange={(val) => setFormData({ ...formData, iva: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0% </SelectItem>
                  <SelectItem value="5">5%</SelectItem>
                  <SelectItem value="8">8%</SelectItem>
                  <SelectItem value="19">19%</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">Afecta el precio con IVA y el costo unitario.</p>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleAddProduct}
              className="flex-1 bg-[#2ECC71] hover:bg-[#27AE60]"
            >
              Agregar Producto
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                handleAddDialogChange(false);
              }}
              className="flex-1"
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Editar Producto */}
      <Dialog open={showEditDialog} onOpenChange={handleEditDialogChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Producto</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-500">Los campos con * son obligatorios.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nombre *</Label>
              <Input
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  clearFormError('name');
                }}
                aria-invalid={!!formErrors.name}
                aria-describedby={formErrors.name ? 'inventory-name-error' : 'inventory-name-help'}
                className={errorClass('name')}
              />
              {formErrors.name ? (
                <p id="inventory-name-error" className="text-xs text-red-600 mt-1">{formErrors.name}</p>
              ) : (
                <p id="inventory-name-help" className="text-xs text-gray-500 mt-1">
                  Usa el nombre comercial para encontrarlo rápido.
                </p>
              )}
            </div>

            <div>
              <Label>SKU</Label>
              <Input
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              />
              <p className="text-xs text-gray-500 mt-1">Puedes editarlo si cambia el código interno.</p>
            </div>

            <div>
              <Label>Código de Barras</Label>
              <Input
                value={formData.barcode}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                aria-describedby="inventory-barcode-help"
              />
              <p id="inventory-barcode-help" className="text-xs text-gray-500 mt-1">
                Formato válido: 8 a 14 dígitos.
              </p>
            </div>

            <div>
              <Label>Categoría</Label>
              <Select value={formData.category} onValueChange={(val) => setFormData({ ...formData, category: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">Crea categorías desde Configuración.</p>
            </div>

            <div>
              <Label>Proveedor *</Label>
              <Select
                value={formData.supplierName || 'none'}
                onValueChange={(val) => {
                  setFormData({ ...formData, supplierName: val === 'none' ? '' : val });
                  clearFormError('supplierName');
                }}
              >
                <SelectTrigger className={errorClass('supplierName')} aria-invalid={!!formErrors.supplierName}>
                  <SelectValue placeholder="Seleccione proveedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Seleccione proveedor</SelectItem>
                  {suppliers.map(supplier => (
                    <SelectItem key={supplier.id} value={supplier.name}>{supplier.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.supplierName ? (
                <p className="text-xs text-red-600 mt-1">{formErrors.supplierName}</p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">Obligatorio para trazabilidad y compras.</p>
              )}
            </div>

            <div>
              <Label>Precio Compra (sin IVA)</Label>
              <Input
                type="number"
                value={formData.costPrice}
                onChange={(e) => {
                  setFormData({ ...formData, costPrice: e.target.value });
                  clearFormError('costPrice');
                }}
                aria-invalid={!!formErrors.costPrice}
                aria-describedby={formErrors.costPrice ? 'inventory-cost-error' : 'inventory-cost-help'}
                className={errorClass('costPrice')}
              />
              {formErrors.costPrice ? (
                <p id="inventory-cost-error" className="text-xs text-red-600 mt-1">{formErrors.costPrice}</p>
              ) : (
                <p id="inventory-cost-help" className="text-xs text-gray-500 mt-1">
                  Sin IVA. Se usa para calcular costo unitario.
                </p>
              )}
            </div>

            <div>
              <Label>Unidades por compra *</Label>
              <Input
                type="number"
                min="1"
                value={formData.unitsPerPurchase}
                onChange={(e) => {
                  setFormData({ ...formData, unitsPerPurchase: e.target.value });
                  clearFormError('unitsPerPurchase');
                }}
                aria-invalid={!!formErrors.unitsPerPurchase}
                aria-describedby={formErrors.unitsPerPurchase ? 'inventory-units-error' : 'inventory-units-help'}
                className={errorClass('unitsPerPurchase')}
              />
              {formErrors.unitsPerPurchase ? (
                <p id="inventory-units-error" className="text-xs text-red-600 mt-1">{formErrors.unitsPerPurchase}</p>
              ) : (
                <p id="inventory-units-help" className="text-xs text-gray-500 mt-1">
                  Ej: si compras por caja de 12, ingresa 12.
                </p>
              )}
            </div>

            <div>
              <Label>Utilidad (%) *</Label>
              <Input
                type="number"
                min="0"
                value={formData.profitMargin}
                onChange={(e) => {
                  setFormData({ ...formData, profitMargin: e.target.value });
                  clearFormError('profitMargin');
                }}
                aria-invalid={!!formErrors.profitMargin}
                aria-describedby={formErrors.profitMargin ? 'inventory-margin-error' : 'inventory-margin-help'}
                className={errorClass('profitMargin')}
              />
              {formErrors.profitMargin ? (
                <p id="inventory-margin-error" className="text-xs text-red-600 mt-1">{formErrors.profitMargin}</p>
              ) : (
                <p id="inventory-margin-help" className="text-xs text-gray-500 mt-1">
                  Margen sobre costo con IVA. Menor a 100%.
                </p>
              )}
            </div>

            <div>
              <Label>Stock</Label>
              <Input
                type="number"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
              />
              <p className="text-xs text-gray-500 mt-1">Actualiza si haces ajustes manuales.</p>
            </div>

            <div>
              <Label>Stock Mínimo</Label>
              <Input
                type="number"
                value={formData.minStock}
                onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
              />
              <p className="text-xs text-gray-500 mt-1">Usado para alertas de stock bajo.</p>
            </div>

            <div>
              <Label>Precio con IVA</Label>
              <Input
                type="number"
                min="0"
                value={calculatedCostWithIva ? calculatedCostWithIva.toFixed(2) : ''}
                onChange={(e) => handleEditCostWithIvaChange(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">Se calcula con IVA. Puedes ajustarlo.</p>
            </div>

            <div>
              <Label>Precio costo uni</Label>
              <Input
                type="number"
                min="0"
                value={calculatedUnitCostWithIva ? calculatedUnitCostWithIva.toFixed(2) : ''}
                onChange={(e) => handleEditUnitCostChange(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">Costo unitario con IVA.</p>
            </div>

            <div>
              <Label>Precio venta</Label>
              <Input
                type="number"
                min="0"
                value={calculatedUnitSalePrice ? calculatedUnitSalePrice.toFixed(2) : ''}
                onChange={(e) => handleEditUnitSalePriceChange(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">Ajusta el precio y recalcularemos la utilidad.</p>
            </div>

            <div>
              <Label>Unidad de Medida</Label>
              <Select value={formData.unit} onValueChange={(val) => setFormData({ ...formData, unit: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unidad">Unidad</SelectItem>
                  <SelectItem value="kg">Kilogramo (kg)</SelectItem>
                  <SelectItem value="g">Gramo (g)</SelectItem>
                  <SelectItem value="l">Litro (l)</SelectItem>
                  <SelectItem value="ml">Mililitro (ml)</SelectItem>
                  <SelectItem value="paquete">Paquete</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">Se muestra junto al stock.</p>
            </div>

            <div>
              <Label>IVA (%)</Label>
              <Select value={formData.iva} onValueChange={(val) => setFormData({ ...formData, iva: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0% (Exento)</SelectItem>
                  <SelectItem value="5">5%</SelectItem>
                  <SelectItem value="8">8%</SelectItem>
                  <SelectItem value="19">19%</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">Afecta el precio con IVA y el costo unitario.</p>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleEditProduct}
              className="flex-1 bg-[#2ECC71] hover:bg-[#27AE60]"
            >
              Guardar Cambios
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                handleEditDialogChange(false);
              }}
              className="flex-1"
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Kardex */}
      <Dialog open={showKardexDialog} onOpenChange={setShowKardexDialog}>
        <DialogContent className="w-[98vw] max-w-[98vw] sm:max-w-[95vw] lg:max-w-[92vw] max-h-[94vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>
              Kardex {selectedKardexProduct ? `- ${selectedKardexProduct.name}` : ''}
            </DialogTitle>
          </DialogHeader>

          {selectedKardexProduct && (
            <div className="text-sm text-gray-600">
              Stock actual: <span className="font-semibold text-gray-900">{selectedKardexProduct.stock} {selectedKardexProduct.unit}</span>
            </div>
          )}

          <div className="overflow-auto border rounded-md max-h-[72vh]">
            <table className="w-full text-sm min-w-[980px]">
              <thead className="bg-secondary border-b">
                <tr>
                  <th className="text-left p-3 font-semibold">Fecha</th>
                  <th className="text-left p-3 font-semibold">Tipo</th>
                  <th className="text-left p-3 font-semibold">Referencia</th>
                  <th className="text-right p-3 font-semibold">Cantidad</th>
                  <th className="text-right p-3 font-semibold">Antes</th>
                  <th className="text-right p-3 font-semibold">Después</th>
                  <th className="text-right p-3 font-semibold">Costo uni</th>
                  <th className="text-right p-3 font-semibold">Venta uni</th>
                </tr>
              </thead>
              <tbody>
                {selectedKardexMovements.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-gray-500">
                      Este producto aún no tiene movimientos de Kardex.
                    </td>
                  </tr>
                ) : (
                  selectedKardexMovements.map(movement => (
                    <tr key={movement.id} className="border-b">
                      <td className="p-3 whitespace-nowrap">{new Date(movement.date).toLocaleString('es-CO')}</td>
                      <td className="p-3 capitalize whitespace-nowrap">{movement.type === 'entry' ? 'Entrada' : movement.type === 'sale' ? 'Salida' : 'Ajuste'}</td>
                      <td className="p-3 whitespace-nowrap">{movement.reference}</td>
                      <td className={`p-3 text-right font-semibold ${movement.quantity >= 0 ? 'text-[#2ECC71]' : 'text-red-600'}`}>
                        {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
                      </td>
                      <td className="p-3 text-right">{movement.stockBefore}</td>
                      <td className="p-3 text-right">{movement.stockAfter}</td>
                      <td className="p-3 text-right">${movement.unitCost.toLocaleString('es-CO', { maximumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right">
                        {typeof movement.unitSalePrice === 'number'
                          ? `$${movement.unitSalePrice.toLocaleString('es-CO', { maximumFractionDigits: 2 })}`
                          : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setShowKardexDialog(false)}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
