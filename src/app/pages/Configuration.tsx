import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { usePOS } from '../context/POSContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { Store, Printer, Shield, Database, Tag, Edit, Trash2, Check, X } from 'lucide-react';

export function Configuration() {
  const {
    storeConfig,
    updateStoreConfig,
    currentUser,
    products,
    categories,
    addCategory,
    updateCategory,
    deleteCategory
  } = usePOS();
  const location = useLocation();
  const [config, setConfig] = useState(storeConfig);
  const [activeTab, setActiveTab] = useState('store');
  const [newCategory, setNewCategory] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    const allowedTabs = ['store', 'categories', 'printer', 'roles', 'backup'];
    if (tab && allowedTabs.includes(tab)) {
      setActiveTab(tab);
    }
  }, [location.search]);

  const handleSave = () => {
    updateStoreConfig(config);
    toast.success('Configuración guardada');
  };

  const handleBackup = () => {
    const data = {
      products: localStorage.getItem('pos_products'),
      sales: localStorage.getItem('pos_sales'),
      customers: localStorage.getItem('pos_customers'),
      suppliers: localStorage.getItem('pos_suppliers'),
      kardex: localStorage.getItem('pos_kardex'), // Added kardex
      recharges: localStorage.getItem('pos_recharges'), // Added recharges
      config: localStorage.getItem('pos_config')
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-tiendapos-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    toast.success('Backup descargado');
  };

  const handleAddCategory = () => {
    const created = addCategory(newCategory);
    if (!created) {
      toast.error('No se pudo crear la categoría (vacía o duplicada)');
      return;
    }

    setNewCategory('');
    toast.success('Categoría creada');
  };

  const startEditCategory = (category: string) => {
    setEditingCategory(category);
    setEditingValue(category);
  };

  const cancelEditCategory = () => {
    setEditingCategory(null);
    setEditingValue('');
  };

  const handleSaveCategory = () => {
    if (!editingCategory) return;

    const updated = updateCategory(editingCategory, editingValue);
    if (!updated) {
      toast.error('No se pudo actualizar la categoría (vacía o duplicada)');
      return;
    }

    cancelEditCategory();
    toast.success('Categoría actualizada');
  };

  const handleDeleteCategory = (category: string) => {
    const inUse = products.some(product => product.category === category);

    if (!inUse) {
      const confirmed = confirm(`¿Eliminar la categoría "${category}"?`);
      if (!confirmed) return;

      const deleted = deleteCategory(category);
      if (!deleted) {
        toast.error('No se pudo eliminar la categoría');
        return;
      }

      toast.success('Categoría eliminada');
      return;
    }

    const replacement = prompt(
      `La categoría "${category}" tiene productos. Escriba la categoría de reemplazo:`,
      categories.find(item => item !== category) || ''
    );

    if (!replacement) {
      toast.info('Eliminación cancelada');
      return;
    }

    const deletedWithReplacement = deleteCategory(category, replacement);
    if (!deletedWithReplacement) {
      toast.error('No se pudo eliminar. Verifique la categoría de reemplazo.');
      return;
    }

    toast.success('Categoría eliminada y productos reasignados');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Configuración</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="store">Tienda</TabsTrigger>
          <TabsTrigger value="categories">Categorías</TabsTrigger>
          <TabsTrigger value="printer">Impresora</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
        </TabsList>

        <TabsContent value="categories">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <Tag className="w-8 h-8 text-[#FF6B00]" />
              <h2 className="text-xl font-bold">Categorías de Inventario</h2>
            </div>

            <div className="flex gap-2">
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Nueva categoría"
                className="h-12"
              />
              <Button onClick={handleAddCategory} className="h-12 bg-[#2ECC71] hover:bg-[#27AE60]">
                Agregar
              </Button>
            </div>

            <div className="space-y-2">
              {categories.length === 0 ? (
                <p className="text-sm text-gray-600">No hay categorías registradas.</p>
              ) : (
                categories.map(category => {
                  const usageCount = products.filter(product => product.category === category).length;

                  return (
                    <div key={category} className="flex items-center justify-between border rounded-lg p-3 gap-3">
                      <div className="flex-1">
                        {editingCategory === category ? (
                          <Input
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            className="h-10"
                          />
                        ) : (
                          <p className="font-medium">{category}</p>
                        )}
                        <p className="text-xs text-gray-600 mt-1">{usageCount} producto(s)</p>
                      </div>

                      <div className="flex items-center gap-2">
                        {editingCategory === category ? (
                          <>
                            <Button size="sm" variant="outline" onClick={handleSaveCategory}>
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEditCategory}>
                              <X className="w-4 h-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" onClick={() => startEditCategory(category)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleDeleteCategory(category)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="store">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <Store className="w-8 h-8 text-[#FF6B00]" />
              <h2 className="text-xl font-bold">Datos de la Tienda</h2>
            </div>

            <div>
              <Label>Nombre del Negocio</Label>
              <Input
                value={config.name}
                onChange={(e) => setConfig({ ...config, name: e.target.value })}
                className="h-12"
              />
            </div>

            <div>
              <Label>NIT</Label>
              <Input
                value={config.nit}
                onChange={(e) => setConfig({ ...config, nit: e.target.value })}
                className="h-12"
              />
            </div>

            <div>
              <Label>Dirección</Label>
              <Input
                value={config.address}
                onChange={(e) => setConfig({ ...config, address: e.target.value })}
                className="h-12"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={config.phone}
                  onChange={(e) => setConfig({ ...config, phone: e.target.value })}
                  className="h-12"
                />
              </div>

              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={config.email}
                  onChange={(e) => setConfig({ ...config, email: e.target.value })}
                  className="h-12"
                />
              </div>
            </div>

            <div>
              <Label>Resolución DIAN (Facturación Electrónica)</Label>
              <Input
                value={config.dianResolution || ''}
                onChange={(e) => setConfig({ ...config, dianResolution: e.target.value })}
                placeholder="Ej: 18760000001"
                className="h-12"
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-secondary rounded-lg">
              <div>
                <p className="font-semibold">Mostrar IVA en productos</p>
                <p className="text-sm text-gray-600">Incluir el IVA en los precios</p>
              </div>
              <Switch
                checked={config.showIVA}
                onCheckedChange={(checked) => setConfig({ ...config, showIVA: checked })}
              />
            </div>

            <div>
              <Label>Política de precio por defecto en compras</Label>
              <Select
                value={config.purchasePricePolicy}
                onValueChange={(value: 'automatic' | 'manual') => setConfig({ ...config, purchasePricePolicy: value })}
              >
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">Automática (recalcula venta)</SelectItem>
                  <SelectItem value="manual">Manual (mantiene venta actual)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleSave} className="w-full h-12 bg-[#2ECC71] hover:bg-[#27AE60]">
              Guardar Cambios
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="printer">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <Printer className="w-8 h-8 text-[#FF6B00]" />
              <h2 className="text-xl font-bold">Configuración de Impresora</h2>
            </div>

            <div>
              <Label>Tipo de Impresora</Label>
              <Select 
                value={config.printerType} 
                onValueChange={(value: 'thermal' | 'standard') => setConfig({ ...config, printerType: value })}
              >
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="thermal">Impresora Térmica (58mm/80mm)</SelectItem>
                  <SelectItem value="standard">Impresora Estándar</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="font-semibold mb-2">Conexión</p>
              <p className="text-sm text-gray-600">
                Soporta impresoras USB y Bluetooth. Configura tu impresora en la configuración del dispositivo.
              </p>
            </div>

            <div className="p-4 bg-secondary rounded-lg">
              <p className="font-semibold mb-2">Cajón de Dinero</p>
              <p className="text-sm text-gray-600">
                Compatible con cajones automáticos conectados a la impresora térmica.
              </p>
            </div>

            <Button variant="outline" className="w-full h-12">
              Imprimir Prueba
            </Button>

            <Button onClick={handleSave} className="w-full h-12 bg-[#2ECC71] hover:bg-[#27AE60]">
              Guardar Cambios
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-8 h-8 text-[#FF6B00]" />
              <h2 className="text-xl font-bold">Roles y Permisos</h2>
            </div>

            <div className="p-4 bg-secondary rounded-lg">
              <p className="font-semibold mb-2">Usuario Actual</p>
              <p className="text-sm">
                <strong>Rol:</strong> {currentUser?.role === 'admin' ? 'Administrador' : 'Cajero'}
              </p>
              <p className="text-sm text-gray-600 mt-2">
                {currentUser?.username}
              </p>
            </div>

            <div className="space-y-3">
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-2">Administrador</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Acceso completo al sistema</li>
                  <li>• Gestión de inventario y precios</li>
                  <li>• Reportes y estadísticas</li>
                  <li>• Configuración del sistema</li>
                  <li>• Gestión de usuarios</li>
                </ul>
              </div>

              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-2">Cajero</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Realizar ventas</li>
                  <li>• Consultar inventario</li>
                  <li>• Gestionar clientes</li>
                  <li>• Recargas y servicios</li>
                  <li>• Ver reportes básicos</li>
                </ul>
              </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-700">
                <strong>Nota:</strong> Los usuarios de demostración son <strong>admin/admin123</strong> y <strong>cajero/cajero123</strong>
              </p>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="backup">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <Database className="w-8 h-8 text-[#FF6B00]" />
              <h2 className="text-xl font-bold">Backup y Sincronización</h2>
            </div>

            <div className="p-4 bg-secondary rounded-lg">
              <p className="font-semibold mb-2">Almacenamiento Local</p>
              <p className="text-sm text-gray-600">
                Los datos se guardan automáticamente en el navegador. Se recomienda hacer backups periódicos.
              </p>
            </div>

            <div className="space-y-3">
              <Button
                onClick={handleBackup}
                className="w-full h-12 bg-[#FF6B00] hover:bg-[#E85F00]"
              >
                Descargar Backup Completo
              </Button>

              <Button
                variant="outline"
                className="w-full h-12"
                onClick={() => toast.info('Funcionalidad de restauración disponible')}
              >
                Restaurar desde Backup
              </Button>            </div>

            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="font-semibold mb-2">Modo Offline</p>
              <p className="text-sm text-gray-600">
                El sistema funciona sin conexión a internet. Los datos se sincronizan automáticamente cuando hay conexión.
              </p>
            </div>

            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="font-semibold mb-2 text-yellow-800">⚠️ Importante</p>
              <p className="text-sm text-yellow-700">
                Realiza backups periódicos para evitar pérdida de datos. Los datos locales pueden perderse si se borra el caché del navegador.
              </p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
