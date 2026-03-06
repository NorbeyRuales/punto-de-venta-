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
import { Printer, Shield, Database, Tag, Edit, Trash2, Check, X } from 'lucide-react';
import { DEFAULT_LOGO_PATH, FALLBACK_LOGO_DATA_URL } from '../constants/branding';

export function Configuration() {
  const inputClass = "h-12 bg-[var(--input-background)] border border-[var(--border)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]";
  const {
    storeConfig,
    updateStoreConfig,
    currentUser,
    products,
    categories,
    addCategory,
    updateCategory,
    deleteCategory,
    syncWithSupabase,
    createStore,
    hasConnectedStore,
    uploadLocalBackupToSupabase
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

  useEffect(() => {
    setConfig(storeConfig);
  }, [storeConfig]);

  const handleSave = async () => {
    if (!hasConnectedStore) {
      const created = await createStore({
        name: config.name,
        nit: config.nit,
        address: config.address,
        phone: config.phone,
        email: config.email,
      });

      if (!created) {
        toast.error('No se pudo registrar la tienda en Supabase.');
        return;
      }
    }

    const saved = await updateStoreConfig(config);
    if (!saved) return;

    toast.success('Configuración guardada en Supabase y local.');
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

  const handleLogoFile = async (file: File | null) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten imágenes.');
      return;
    }

    const maxSizeMb = 2.5;
    if (file.size > maxSizeMb * 1024 * 1024) {
      toast.error(`La imagen debe pesar menos de ${maxSizeMb} MB.`);
      return;
    }

    const toDataUrl = (f: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(f);
      });

    try {
      const dataUrl = await toDataUrl(file);
      setConfig(prev => ({ ...prev, logo: dataUrl }));
      toast.success('Logo cargado en la configuración. Guarda para aplicarlo en toda la app.');
    } catch (error) {
      console.error('No se pudo leer el archivo de logo', error);
      toast.error('No se pudo cargar la imagen.');
    }
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


  const handleManualSync = async () => {
    await syncWithSupabase();
  };

  const handleCreateStore = async () => {
    const created = await createStore({
      name: config.name,
      nit: config.nit,
      address: config.address,
      phone: config.phone,
      email: config.email,
    });

    if (created) {
      toast.success('Tienda registrada y conectada a tu usuario.');
    }
  };

  const handleUploadLocalData = async () => {
    await uploadLocalBackupToSupabase(false);
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
    <div className="max-w-6xl mx-auto space-y-6 px-2 md:px-4">
      <h1 className="text-3xl font-bold">Configuración</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5 rounded-2xl shadow-[0_10px_30px_rgba(67,91,154,0.12)]">
          <TabsTrigger value="store">Tienda</TabsTrigger>
          <TabsTrigger value="categories">Categorías</TabsTrigger>
          <TabsTrigger value="printer">Impresora</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
        </TabsList>

        <TabsContent value="categories">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <Tag className="w-8 h-8 text-[var(--primary)]" />
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
          <Card className="p-8 space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg border border-border bg-white overflow-hidden flex items-center justify-center">
                <img
                  src={config.logo || DEFAULT_LOGO_PATH}
                  alt="Logo de la tienda"
                  className="w-full h-full object-contain"
                  onError={(event) => {
                    if (event.currentTarget.src !== FALLBACK_LOGO_DATA_URL) {
                      event.currentTarget.src = FALLBACK_LOGO_DATA_URL;
                    }
                  }}
                />
              </div>
              <h2 className="text-xl font-bold">Datos de la Tienda</h2>
            </div>

            <div className="grid gap-8 md:grid-cols-[280px,1fr] items-start md:items-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-44 h-44 rounded-xl border border-dashed border-border bg-white overflow-hidden flex items-center justify-center shadow-[0_12px_30px_rgba(67,91,154,0.12)]">
                  <img
                    src={config.logo || DEFAULT_LOGO_PATH}
                    alt="Vista previa del logo"
                    className="w-full h-full object-contain"
                    onError={(event) => {
                      if (event.currentTarget.src !== FALLBACK_LOGO_DATA_URL) {
                        event.currentTarget.src = FALLBACK_LOGO_DATA_URL;
                      }
                    }}
                  />
                </div>
                <div className="w-full flex flex-col gap-3">
                  <Label className="text-sm font-semibold text-foreground">Logo de la tienda</Label>
                  <label className="inline-flex items-center gap-3 w-full">
                    <span className="inline-flex items-center justify-center px-4 py-2 h-12 rounded-lg border-2 border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--foreground)] font-semibold hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)] transition-all shadow-[0_6px_18px_rgba(128,168,255,0.25)]">
                      Seleccionar logo
                    </span>
                    <span className="text-sm text-[var(--muted-foreground)] truncate" aria-live="polite">
                      {config.logo && config.logo !== DEFAULT_LOGO_PATH ? config.logo : 'Ningún archivo seleccionado'}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png"
                      onChange={(e) => handleLogoFile(e.target.files?.[0] ?? null)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-5">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col md:flex-row gap-3">
                    <Input
                      value={config.logo || ''}
                      onChange={(e) => setConfig({ ...config, logo: e.target.value })}
                      placeholder="/branding/logo.jpeg"
                      className="h-12 bg-[var(--input-background)] border border-[var(--border)]"
                    />
                    <Button
                      variant="outline"
                      className="h-12 shrink-0 border-[var(--border)]"
                      onClick={() => setConfig({ ...config, logo: DEFAULT_LOGO_PATH })}
                    >
                      Usar ruta sugerida
                    </Button>
                  </div>
                  <p className="text-xs text-gray-600 leading-5">
                    La imagen debe estar en formato JPEG. Ruta sugerida: <code>/branding/logo.jpeg</code> (colócala dentro de <code>public/branding/</code>).
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre del Negocio</Label>
                  <Input
                    value={config.name}
                    onChange={(e) => setConfig({ ...config, name: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label>NIT</Label>
                  <Input
                    value={config.nit}
                    onChange={(e) => setConfig({ ...config, nit: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Dirección</Label>
                <Input
                  value={config.address}
                  onChange={(e) => setConfig({ ...config, address: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input
                    value={config.phone}
                    onChange={(e) => setConfig({ ...config, phone: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={config.email}
                    onChange={(e) => setConfig({ ...config, email: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Resolución DIAN (Facturación Electrónica)</Label>
                <Input
                  value={config.dianResolution || ''}
                  onChange={(e) => setConfig({ ...config, dianResolution: e.target.value })}
                  placeholder="Ej: 18760000001"
                  className={inputClass}
                />
              </div>
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

            {!hasConnectedStore && (
              <Button onClick={handleCreateStore} variant="outline" className="w-full h-12">
                Registrar tienda en Supabase
              </Button>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="printer">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <Printer className="w-8 h-8 text-[var(--primary)]" />
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
              <Shield className="w-8 h-8 text-[var(--primary)]" />
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
                <strong>Nota:</strong> Los usuarios se administran desde Supabase Auth (Dashboard).
              </p>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="backup">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <Database className="w-8 h-8 text-[var(--primary)]" />
              <h2 className="text-xl font-bold">Backup y Sincronización</h2>
            </div>

            <div className="p-4 bg-secondary rounded-lg">
              <p className="font-semibold mb-2">Almacenamiento Local</p>
              <p className="text-sm text-gray-600">
                Los datos se guardan automáticamente en el navegador. Se recomienda hacer backups periódicos.
              </p>
            </div>

            <div className="space-y-3">
              {!hasConnectedStore && (
                <Button
                  onClick={handleCreateStore}
                  className="w-full h-12 bg-[#2ECC71] hover:bg-[#27AE60]"
                >
                  Registrar tienda con datos actuales
                </Button>
              )}

              <Button
                onClick={handleBackup}
                className="w-full h-12 bg-[var(--primary)] hover:bg-[var(--primary-hover)]"
              >
                Descargar Backup Completo
              </Button>

              <Button
                variant="outline"
                className="w-full h-12"
                onClick={handleManualSync}
              >
                Re-sincronizar catálogo con Supabase
              </Button>

              <Button
                variant="outline"
                className="w-full h-12"
                onClick={handleUploadLocalData}
              >
                Subir datos actuales (localStorage) a Supabase
              </Button>

              <Button
                variant="outline"
                className="w-full h-12"
                onClick={() => toast.info('Funcionalidad de restauración disponible')}
              >
                Restaurar desde Backup
              </Button>
            </div>

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
