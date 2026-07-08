// Configuración general: tienda, categorías, impresora, roles y backups.
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { usePOS } from '../context/POSContext';
import type { PendingProductSyncPreview } from '../context/POSContext';
import type { StoreManagedUser } from '../services/posSupabase';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import { Printer, Shield, Database, Tag, Edit, Trash2, Check, X, ClipboardList, Download, CloudDownload, CloudUpload, RotateCcw } from 'lucide-react';
import { DEFAULT_LOGO_PATH, FALLBACK_LOGO_DATA_URL } from '../constants/branding';
import { validateBackupPayload, type BackupValidationResult } from '../services/backupValidation';

type PendingSyncSummary = {
  products: number;
  sales: number;
  customers: number;
  suppliers: number;
  kardex: number;
  recharges: number;
  cashSessions: number;
  cashMovements: number;
  hasConfig: boolean;
  source: 'offline-backup' | 'live-local';
};

const OFFLINE_BACKUP_STORAGE_KEY = 'pos_offline_backup';

const parseJsonArrayLength = (raw: string | null): number => {
  if (!raw) return 0;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
};

const parseConfigExists = (raw: string | null): boolean => {
  if (!raw) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Boolean(parsed && typeof parsed === 'object');
  } catch {
    return false;
  }
};

const readPendingSyncSummary = (live?: Omit<PendingSyncSummary, 'source'>): PendingSyncSummary => {
  const backupRaw = localStorage.getItem(OFFLINE_BACKUP_STORAGE_KEY);
  if (backupRaw) {
    try {
      const parsed = JSON.parse(backupRaw) as Record<string, string | null>;
      return {
        products: parseJsonArrayLength(parsed.products ?? null),
        sales: parseJsonArrayLength(parsed.sales ?? null),
        customers: parseJsonArrayLength(parsed.customers ?? null),
        suppliers: parseJsonArrayLength(parsed.suppliers ?? null),
        kardex: parseJsonArrayLength(parsed.kardex ?? null),
        recharges: parseJsonArrayLength(parsed.recharges ?? null),
        cashSessions: parseJsonArrayLength(parsed.cash_sessions ?? null),
        cashMovements: parseJsonArrayLength(parsed.cash_movements ?? null),
        hasConfig: parseConfigExists(parsed.config ?? null),
        source: 'offline-backup',
      };
    } catch {
      // Si el snapshot está corrupto, caemos al estado local actual.
    }
  }

  return live ? { ...live, source: 'live-local' } : {
    products: parseJsonArrayLength(localStorage.getItem('pos_products')),
    sales: parseJsonArrayLength(localStorage.getItem('pos_sales')),
    customers: parseJsonArrayLength(localStorage.getItem('pos_customers')),
    suppliers: parseJsonArrayLength(localStorage.getItem('pos_suppliers')),
    kardex: parseJsonArrayLength(localStorage.getItem('pos_kardex')),
    recharges: parseJsonArrayLength(localStorage.getItem('pos_recharges')),
    cashSessions: parseJsonArrayLength(localStorage.getItem('pos_cash_sessions')),
    cashMovements: parseJsonArrayLength(localStorage.getItem('pos_cash_movements')),
    hasConfig: parseConfigExists(localStorage.getItem('pos_config')),
    source: 'live-local',
  };
};

export function Configuration() {
  const inputClass = "h-12 bg-[var(--input-background)] border border-[var(--border)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]";
  const {
    storeConfig,
    updateStoreConfig,
    currentUser,
    offlinePinConfigured,
    offlineDefaultRole,
    hasPendingSync,
    syncDiagnostics,
    setOfflinePin,
    setOfflineDefaultRole,
    products,
    sales,
    customers,
    suppliers,
    kardexMovements,
    recharges,
    cashSessions,
    cashMovements,
    categories,
    addCategory,
    updateCategory,
    deleteCategory,
    syncWithSupabase,
    createCompleteBackup,
    rebuildLocalCache,
    createStore,
    hasConnectedStore,
    getPendingProductSyncPreview,
    listStoreUsers,
    createStoreUser,
    updateStoreUserAccess,
    removeStoreUser,
  } = usePOS();
  const location = useLocation();
  // Estado de pestañas y formularios.
  const [config, setConfig] = useState(storeConfig);
  const [activeTab, setActiveTab] = useState('store');
  const [newCategory, setNewCategory] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRebuildingCache, setIsRebuildingCache] = useState(false);
  const [backupValidation, setBackupValidation] = useState<BackupValidationResult | null>(null);
  const [isRegisteringStore, setIsRegisteringStore] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const getLiveSyncSummary = (): Omit<PendingSyncSummary, 'source'> => ({
    products: products.length,
    sales: sales.length,
    customers: customers.length,
    suppliers: suppliers.length,
    kardex: kardexMovements.length,
    recharges: recharges.length,
    cashSessions: cashSessions.length,
    cashMovements: cashMovements.length,
    hasConfig: Boolean(storeConfig),
  });
  const [pendingSummary, setPendingSummary] = useState<PendingSyncSummary>(() =>
    readPendingSyncSummary(getLiveSyncSummary()));
  const [isLoadingProductDiff, setIsLoadingProductDiff] = useState(false);
  const [productDiff, setProductDiff] = useState<PendingProductSyncPreview | null>(null);
  const [offlinePin, setOfflinePinInput] = useState('');
  const [offlinePinConfirm, setOfflinePinConfirm] = useState('');
  const [isSavingOfflinePin, setIsSavingOfflinePin] = useState(false);
  const [offlineRoleSelection, setOfflineRoleSelection] = useState<'admin' | 'cashier'>(offlineDefaultRole);
  const [storeUsers, setStoreUsers] = useState<StoreManagedUser[]>([]);
  const [isLoadingStoreUsers, setIsLoadingStoreUsers] = useState(false);
  const [isCreatingStoreUser, setIsCreatingStoreUser] = useState(false);
  const [isMutatingUserId, setIsMutatingUserId] = useState<string | null>(null);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'cashier'>('cashier');

  // Lee el tab desde querystring (?tab=categories, etc).
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    const allowedTabs = ['store', 'categories', 'printer', 'roles', 'backup'];
    if (tab && allowedTabs.includes(tab)) {
      setActiveTab(tab);
    }
  }, [location.search]);

  // Mantiene configuración local sincronizada con el contexto.
  useEffect(() => {
    setConfig(storeConfig);
  }, [storeConfig]);

  useEffect(() => {
    setOfflineRoleSelection(offlineDefaultRole);
  }, [offlineDefaultRole]);

  const hasConfigChanges = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(storeConfig),
    [config, storeConfig]
  );
  const isAdmin = currentUser?.role === 'admin';

  const reloadStoreUsers = async () => {
    if (!isAdmin) return;
    setIsLoadingStoreUsers(true);
    try {
      const users = await listStoreUsers();
      setStoreUsers(users);
    } finally {
      setIsLoadingStoreUsers(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'roles' || !isAdmin) return;
    void reloadStoreUsers();
  }, [activeTab, isAdmin]);

  const handleCreateStoreUser = async () => {
    if (isCreatingStoreUser) return;

    const normalizedEmail = newUserEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error('Ingresa un email para el usuario.');
      return;
    }

    if (newUserPassword.trim().length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setIsCreatingStoreUser(true);
    try {
      const ok = await createStoreUser({
        email: normalizedEmail,
        password: newUserPassword,
        fullName: newUserFullName.trim() || undefined,
        role: newUserRole,
      });

      if (!ok) return;

      toast.success('Usuario creado y vinculado a la tienda.');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserFullName('');
      setNewUserRole('cashier');
      await reloadStoreUsers();
    } finally {
      setIsCreatingStoreUser(false);
    }
  };

  const handleChangeStoreUserRole = async (membershipId: string, role: 'admin' | 'cashier') => {
    if (isMutatingUserId) return;
    setIsMutatingUserId(membershipId);
    try {
      const ok = await updateStoreUserAccess(membershipId, { role });
      if (!ok) return;
      toast.success('Rol actualizado.');
      await reloadStoreUsers();
    } finally {
      setIsMutatingUserId(null);
    }
  };

  const handleToggleStoreUserActive = async (membershipId: string, isActive: boolean) => {
    if (isMutatingUserId) return;
    setIsMutatingUserId(membershipId);
    try {
      const ok = await updateStoreUserAccess(membershipId, { isActive });
      if (!ok) return;
      toast.success(isActive ? 'Usuario activado.' : 'Usuario desactivado.');
      await reloadStoreUsers();
    } finally {
      setIsMutatingUserId(null);
    }
  };

  const handleRemoveStoreUser = async (membershipId: string) => {
    if (isMutatingUserId) return;
    setIsMutatingUserId(membershipId);
    try {
      const ok = await removeStoreUser(membershipId);
      if (!ok) return;
      toast.success('Usuario desvinculado de la tienda.');
      await reloadStoreUsers();
    } finally {
      setIsMutatingUserId(null);
    }
  };

  // Guarda configuración local y en base de datos.
  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (!hasConnectedStore) {
        const created = await createStore({
          name: config.name,
          nit: config.nit,
          address: config.address,
          phone: config.phone,
          email: config.email,
        });

        if (!created) {
          toast.error('No se pudo registrar la tienda en la base de datos.');
          return;
        }
      }

      const saved = await updateStoreConfig(config);
      if (!saved) return;

      toast.success('Configuración guardada en base de datos y local.');
    } finally {
      setIsSaving(false);
    }
  };

  // Descarga un backup JSON con datos locales.
  const handleBackup = async () => {
    if (isBackingUp) return;
    setIsBackingUp(true);
    try {
      const data = await createCompleteBackup();
      if (!data) return;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-tiendapos-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      toast.success('Backup descargado');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleBackupFileValidation = async (file?: File) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      setBackupValidation(validateBackupPayload(parsed));
    } catch {
      setBackupValidation({
        valid: false,
        counts: {
          products: 0, sales: 0, customers: 0, suppliers: 0, kardex: 0,
          recharges: 0, cash_sessions: 0, cash_movements: 0,
        },
        errors: ['El archivo no contiene JSON válido.'],
        warnings: [],
      });
    }
  };

  const handleRebuildCache = async () => {
    if (isRebuildingCache) return;
    setIsRebuildingCache(true);
    try {
      await rebuildLocalCache();
    } finally {
      setIsRebuildingCache(false);
    }
  };

  // Alta de categorías.
  const handleAddCategory = async () => {
    const created = await addCategory(newCategory);
    if (created === 'invalid') {
      toast.error('No se pudo crear la categoría (vacía o duplicada)');
      return;
    }
    if (created === 'failed') return;

    setNewCategory('');
    if (created === 'remote-synced') {
      toast.success('Categoría creada en la base de datos.');
    } else {
      toast.info('Categoría creada localmente. Quedó pendiente de sincronización manual.');
    }
  };

  const startEditCategory = (category: string) => {
    setEditingCategory(category);
    setEditingValue(category);
  };

  // Convierte imagen seleccionada a data URL para previsualización/guardado.
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

  const handleSaveCategory = async () => {
    if (!editingCategory) return;

    const updated = await updateCategory(editingCategory, editingValue);
    if (updated === 'invalid') {
      toast.error('No se pudo actualizar la categoría (vacía o duplicada)');
      return;
    }
    if (updated === 'failed') return;

    cancelEditCategory();
    if (updated === 'remote-synced') {
      toast.success('Categoría actualizada en la base de datos.');
    } else {
      toast.info('Categoría actualizada localmente. Quedó pendiente de sincronización manual.');
    }
  };


  // Forzar sincronización con base de datos.
  const handleManualSync = async () => {
    if (isSyncing) return;
    if (hasPendingSync) {
      toast.error('No se descargará la nube mientras existan cambios offline pendientes.');
      return;
    }
    setIsSyncing(true);
    try {
      await syncWithSupabase();
    } finally {
      setIsSyncing(false);
    }
  };

  // Registra la tienda actual en base de datos si aún no existe.
  const handleCreateStore = async () => {
    if (isRegisteringStore) return;
    setIsRegisteringStore(true);
    try {
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
    } finally {
      setIsRegisteringStore(false);
    }
  };

  const handleOpenPendingModal = () => {
    setPendingSummary(readPendingSyncSummary(getLiveSyncSummary()));
    setProductDiff(null);
    setShowPendingModal(true);
  };

  const handleLoadProductDiff = async () => {
    if (isLoadingProductDiff) return;
    setIsLoadingProductDiff(true);
    try {
      const preview = await getPendingProductSyncPreview();
      setProductDiff(preview);
      if (!preview.canCompare) {
        toast.info(preview.reason || 'No fue posible comparar pendientes con la base de datos.');
      }
    } finally {
      setIsLoadingProductDiff(false);
    }
  };

  const handleOfflinePinSave = async () => {
    if (isSavingOfflinePin) return;
    if (!offlinePin || !offlinePinConfirm) {
      toast.error('Completa ambos campos de PIN.');
      return;
    }
    if (offlinePin !== offlinePinConfirm) {
      toast.error('El PIN no coincide.');
      return;
    }
    setIsSavingOfflinePin(true);
    try {
      const ok = await setOfflinePin(offlinePin);
      if (ok) {
        toast.success('PIN offline actualizado.');
        setOfflinePinInput('');
        setOfflinePinConfirm('');
      }
    } finally {
      setIsSavingOfflinePin(false);
    }
  };

  const handleOfflineRoleChange = (role: 'admin' | 'cashier') => {
    setOfflineRoleSelection(role);
    setOfflineDefaultRole(role);
    toast.success('Rol offline actualizado.');
  };

  const handlePrinterTest = () => {
    toast.info('Funcionalidad de impresión de prueba en preparación.');
  };

  // Eliminación de categorías con reasignación opcional.
  const handleDeleteCategory = async (category: string) => {
    const inUse = products.some(product => product.category === category);

    if (!inUse) {
      const confirmed = confirm(`¿Eliminar la categoría "${category}"?`);
      if (!confirmed) return;

      const deleted = await deleteCategory(category);
      if (deleted === 'invalid') {
        toast.error('No se pudo eliminar la categoría');
        return;
      }
      if (deleted === 'failed') return;

      if (deleted === 'remote-synced') {
        toast.success('Categoría eliminada en la base de datos.');
      } else {
        toast.info('Categoría eliminada localmente. Quedó pendiente de sincronización manual.');
      }
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

    const deletedWithReplacement = await deleteCategory(category, replacement);
    if (deletedWithReplacement === 'invalid') {
      toast.error('No se pudo eliminar. Verifique la categoría de reemplazo.');
      return;
    }
    if (deletedWithReplacement === 'failed') return;

    if (deletedWithReplacement === 'remote-synced') {
      toast.success('Categoría eliminada y productos reasignados en la base de datos.');
    } else {
      toast.info('Categoría eliminada/reasignada localmente. Quedó pendiente de sincronización manual.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-3 sm:px-4 md:px-5">
      <h1 className="text-3xl font-bold">Configuración</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 h-auto rounded-2xl shadow-[0_10px_30px_rgba(67,91,154,0.12)]">
          <TabsTrigger value="store" className="text-xs sm:text-sm py-2">Tienda</TabsTrigger>
          <TabsTrigger value="categories" className="text-xs sm:text-sm py-2">Categorías</TabsTrigger>
          <TabsTrigger value="printer" className="text-xs sm:text-sm py-2">Impresora</TabsTrigger>
          <TabsTrigger value="roles" className="text-xs sm:text-sm py-2">Roles</TabsTrigger>
          <TabsTrigger value="backup" className="text-xs sm:text-sm py-2">Backup</TabsTrigger>
        </TabsList>

        <TabsContent value="categories">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <Tag className="w-8 h-8 text-[var(--primary)]" />
              <h2 className="text-xl font-bold">Categorías de Inventario</h2>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Nueva categoría"
                className="h-12"
              />
              <Button onClick={handleAddCategory} className="h-12 w-full sm:w-auto bg-[#2ECC71] hover:bg-[#27AE60]">
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
                    <div key={category} className="flex flex-col gap-3 border rounded-lg p-3 sm:flex-row sm:items-center sm:justify-between">
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

                      <div className="flex items-center justify-end gap-2">
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
          <Card className="p-4 sm:p-6 md:p-8 space-y-6">
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
                  <label className="inline-flex w-full flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <span className="inline-flex items-center justify-center px-4 py-2 h-12 rounded-lg border-2 border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--foreground)] font-semibold hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)] transition-all shadow-[0_6px_18px_rgba(128,168,255,0.25)]">
                      Seleccionar logo
                    </span>
                    <span className="w-full text-sm text-[var(--muted-foreground)] break-all sm:truncate" aria-live="polite">
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

            <Button
              onClick={handleSave}
              className="w-full h-12 bg-[#2ECC71] hover:bg-[#27AE60]"
              disabled={isSaving || !hasConfigChanges}
            >
              {isSaving ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
            {!hasConfigChanges && (
              <p className="text-xs text-gray-500 text-center">No hay cambios pendientes por guardar.</p>
            )}

            {!hasConnectedStore && (
              <Button
                onClick={handleCreateStore}
                variant="outline"
                className="w-full h-12"
                disabled={isRegisteringStore}
              >
                {isRegisteringStore ? 'Registrando...' : 'Registrar tienda en base de datos'}
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

            <Button variant="outline" className="w-full h-12" onClick={handlePrinterTest}>
              Imprimir Prueba
            </Button>

            <Button
              onClick={handleSave}
              className="w-full h-12 bg-[#2ECC71] hover:bg-[#27AE60]"
              disabled={isSaving || !hasConfigChanges}
            >
              {isSaving ? 'Guardando...' : 'Guardar Cambios'}
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
                  <li>• Gestión de usuarios y roles</li>
                  <li>• Reportes y estadísticas</li>
                  <li>• Configuración y sincronización avanzada</li>
                </ul>
              </div>

              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-2">Cajero</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Realizar ventas</li>
                  <li>• Consultar inventario (modo lectura)</li>
                  <li>• Registrar compras de mercancía</li>
                  <li>• Gestionar clientes</li>
                  <li>• Recargas y servicios</li>
                  <li>• Ver reportes básicos</li>
                </ul>
              </div>
            </div>

            {isAdmin && (
              <div className="p-4 border rounded-lg space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <h3 className="font-semibold">Gestión de usuarios de tienda</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void reloadStoreUsers()}
                    disabled={isLoadingStoreUsers || !!isMutatingUserId || isCreatingStoreUser}
                    className="w-full sm:w-auto"
                  >
                    {isLoadingStoreUsers ? 'Cargando...' : 'Actualizar lista'}
                  </Button>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Nombre (opcional)</Label>
                    <Input
                      value={newUserFullName}
                      onChange={(e) => setNewUserFullName(e.target.value)}
                      placeholder="Ej: Laura Gómez"
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="usuario@tienda.com"
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Contraseña inicial *</Label>
                    <Input
                      type="password"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Rol *</Label>
                    <Select value={newUserRole} onValueChange={(value: 'admin' | 'cashier') => setNewUserRole(value)}>
                      <SelectTrigger className="h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="cashier">Cajero</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  className="h-12 w-full bg-[#2ECC71] hover:bg-[#27AE60]"
                  onClick={() => void handleCreateStoreUser()}
                  disabled={isCreatingStoreUser || !!isMutatingUserId}
                >
                  {isCreatingStoreUser ? 'Creando usuario...' : 'Crear usuario de tienda'}
                </Button>

                <div className="md:hidden space-y-3">
                  {isLoadingStoreUsers ? (
                    <div className="rounded-lg border p-4 text-center text-gray-500">Cargando usuarios...</div>
                  ) : storeUsers.length === 0 ? (
                    <div className="rounded-lg border p-4 text-center text-gray-500">No hay usuarios vinculados a la tienda.</div>
                  ) : (
                    storeUsers.map((user) => (
                      <div key={user.id} className="rounded-lg border p-3 space-y-3">
                        <div>
                          <p className="font-medium">{user.fullName || 'Sin nombre'}</p>
                          <p className="text-xs text-gray-600 break-all">{user.email}</p>
                          <p className="text-xs text-gray-500 mt-1">Creado: {new Date(user.createdAt).toLocaleString('es-CO')}</p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Rol</Label>
                          <Select
                            value={user.role}
                            onValueChange={(value: 'admin' | 'cashier') => void handleChangeStoreUserRole(user.id, value)}
                            disabled={isMutatingUserId === user.id}
                          >
                            <SelectTrigger className="h-10 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Administrador</SelectItem>
                              <SelectItem value="cashier">Cajero</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center justify-between rounded-md bg-secondary px-3 py-2">
                          <span className="text-sm text-gray-700">{user.isActive ? 'Activo' : 'Inactivo'}</span>
                          <Switch
                            checked={user.isActive}
                            onCheckedChange={(checked) => void handleToggleStoreUserActive(user.id, checked)}
                            disabled={isMutatingUserId === user.id}
                          />
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-red-600 hover:text-red-700"
                          onClick={() => void handleRemoveStoreUser(user.id)}
                          disabled={isMutatingUserId === user.id}
                        >
                          Quitar
                        </Button>
                      </div>
                    ))
                  )}
                </div>

                <div className="hidden md:block overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary border-b">
                      <tr>
                        <th className="text-left p-3">Usuario</th>
                        <th className="text-left p-3">Rol</th>
                        <th className="text-left p-3">Estado</th>
                        <th className="text-left p-3">Creado</th>
                        <th className="text-right p-3">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoadingStoreUsers ? (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-gray-500">Cargando usuarios...</td>
                        </tr>
                      ) : storeUsers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-gray-500">No hay usuarios vinculados a la tienda.</td>
                        </tr>
                      ) : (
                        storeUsers.map((user) => (
                          <tr key={user.id} className="border-b">
                            <td className="p-3">
                              <p className="font-medium">{user.fullName || 'Sin nombre'}</p>
                              <p className="text-xs text-gray-600">{user.email}</p>
                            </td>
                            <td className="p-3">
                              <Select
                                value={user.role}
                                onValueChange={(value: 'admin' | 'cashier') => void handleChangeStoreUserRole(user.id, value)}
                                disabled={isMutatingUserId === user.id}
                              >
                                <SelectTrigger className="h-9 w-full min-w-[170px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">Administrador</SelectItem>
                                  <SelectItem value="cashier">Cajero</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={user.isActive}
                                  onCheckedChange={(checked) => void handleToggleStoreUserActive(user.id, checked)}
                                  disabled={isMutatingUserId === user.id}
                                />
                                <span className="text-xs text-gray-600">{user.isActive ? 'Activo' : 'Inactivo'}</span>
                              </div>
                            </td>
                            <td className="p-3 text-xs text-gray-600">
                              {new Date(user.createdAt).toLocaleString('es-CO')}
                            </td>
                            <td className="p-3 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => void handleRemoveStoreUser(user.id)}
                                disabled={isMutatingUserId === user.id}
                              >
                                Quitar
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="p-4 border rounded-lg space-y-4">
              <div>
                <h3 className="font-semibold">Modo Offline</h3>
                <p className="text-sm text-gray-600">
                  PIN configurado: {offlinePinConfigured ? 'Sí' : 'No'}
                </p>
              </div>

              <div>
                <Label>Rol que opera en offline</Label>
                <Select value={offlineRoleSelection} onValueChange={(value: 'admin' | 'cashier') => handleOfflineRoleChange(value)}>
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="cashier">Cajero</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Nuevo PIN (4 dígitos)</Label>
                  <Input
                    value={offlinePin}
                    onChange={(e) => setOfflinePinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    inputMode="numeric"
                    maxLength={4}
                    type="password"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Confirmar PIN</Label>
                  <Input
                    value={offlinePinConfirm}
                    onChange={(e) => setOfflinePinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    inputMode="numeric"
                    maxLength={4}
                    type="password"
                    className={inputClass}
                  />
                </div>
              </div>

              <Button
                onClick={handleOfflinePinSave}
                className="h-12 bg-[#2ECC71] hover:bg-[#27AE60]"
                disabled={isSavingOfflinePin}
              >
                {isSavingOfflinePin ? 'Guardando PIN...' : 'Guardar PIN Offline'}
              </Button>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-700">
                <strong>Nota:</strong> Para seguridad, la gestión de usuarios se valida en backend y solo un administrador activo puede ejecutarla.
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
                Los datos se guardan automáticamente en el navegador y se sincronizan con la base de datos cuando hay conexión.
              </p>
            </div>

            {hasPendingSync && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="font-semibold mb-2 text-yellow-800">Cambios offline pendientes</p>
                <p className="text-sm text-yellow-700">
                  El sistema intentará sincronizar automáticamente al recuperar conexión. También puedes forzar la sincronización manualmente.
                </p>
                <Button
                  variant="outline"
                  className="mt-3 h-10 border-yellow-300 bg-white text-yellow-900 hover:bg-yellow-100"
                  onClick={handleOpenPendingModal}
                >
                  <ClipboardList className="w-4 h-4 mr-2" />
                  Ver detalle de pendientes
                </Button>
              </div>
            )}

            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="font-semibold text-blue-900">Guia rapida</p>
              <p className="text-sm text-blue-800 mt-1">
                Aqui existen dos lugares de datos: <strong>este equipo</strong> (local) y <strong>base de datos</strong> (nube). Cada boton indica claramente hacia donde se mueve la informacion.
              </p>
            </div>

            <div className="rounded-xl border bg-white p-4 space-y-2" aria-live="polite">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">Estado de sincronización</p>
                <span className={`text-xs font-semibold rounded-full px-2 py-1 ${
                  syncDiagnostics.status === 'success' ? 'bg-green-100 text-green-800'
                    : syncDiagnostics.status === 'partial' ? 'bg-amber-100 text-amber-800'
                      : syncDiagnostics.status === 'error' ? 'bg-red-100 text-red-800'
                        : syncDiagnostics.status === 'syncing' ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-700'
                }`}>
                  {syncDiagnostics.status === 'success' ? 'Correcta'
                    : syncDiagnostics.status === 'partial' ? 'Parcial'
                      : syncDiagnostics.status === 'error' ? 'Error'
                        : syncDiagnostics.status === 'syncing' ? 'En curso' : 'Sin actividad'}
                </span>
              </div>
              <p className="text-sm text-gray-600">{syncDiagnostics.message || 'Todavía no hay un diagnóstico registrado.'}</p>
              <div className="grid sm:grid-cols-3 gap-2 text-xs text-gray-600">
                <p>Último intento: {syncDiagnostics.lastAttemptAt ? new Date(syncDiagnostics.lastAttemptAt).toLocaleString('es-CO') : 'No registrado'}</p>
                <p>Último éxito: {syncDiagnostics.lastSuccessAt ? new Date(syncDiagnostics.lastSuccessAt).toLocaleString('es-CO') : 'No registrado'}</p>
                <p>Duración: {syncDiagnostics.durationMs == null ? 'No registrada' : `${syncDiagnostics.durationMs} ms`}</p>
              </div>
              <p className="text-xs text-gray-600">
                Último backup validado: {syncDiagnostics.lastBackupAt ? new Date(syncDiagnostics.lastBackupAt).toLocaleString('es-CO') : 'No registrado'}
              </p>
              {syncDiagnostics.lastBackupCounts && (
                <p className="text-xs text-gray-600">
                  Contenido: {Object.entries(syncDiagnostics.lastBackupCounts)
                    .map(([section, count]) => `${section}: ${count}`)
                    .join(' · ')}
                </p>
              )}
            </div>

            <div className="space-y-4">
              {!hasConnectedStore && (
                <Button
                  onClick={handleCreateStore}
                  className="w-full h-12 bg-[#2ECC71] hover:bg-[#27AE60]"
                  disabled={isRegisteringStore}
                >
                  {isRegisteringStore ? 'Registrando tienda...' : 'Registrar tienda con datos actuales'}
                </Button>
              )}

              <div className="rounded-xl border p-4 bg-white space-y-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-2 rounded-lg bg-blue-100 text-blue-700">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold">Guardar copia en este equipo</p>
                    <p className="text-sm text-gray-600">
                      Descarga y valida todo el historial disponible en Supabase antes de crear el archivo.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleBackup}
                  className="w-full h-12 bg-[var(--primary)] hover:bg-[var(--primary-hover)]"
                  disabled={isBackingUp || !hasConnectedStore || hasPendingSync}
                  title="Descarga un respaldo completo desde Supabase sin modificar la base de datos."
                >
                  {isBackingUp ? 'Generando copia...' : 'Descargar copia de seguridad'}
                </Button>
              </div>

              <div className="rounded-xl border p-4 bg-white space-y-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-2 rounded-lg bg-amber-100 text-amber-700">
                    <CloudDownload className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold">Traer datos de la nube a este equipo</p>
                    <p className="text-sm text-gray-600">
                      Descarga el historial completo y lo combina por identificador con este equipo.
                    </p>
                  </div>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  Esta acción no elimina registros locales ni modifica Supabase.
                </div>
                <Button
                  variant="outline"
                  className="w-full h-12"
                  onClick={handleManualSync}
                  disabled={isSyncing || hasPendingSync}
                  title="Trae el historial completo y lo combina con la información de este dispositivo."
                >
                  {isSyncing ? 'Trayendo datos...' : 'Traer datos de la base de datos a este equipo'}
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-12"
                  onClick={handleRebuildCache}
                  disabled={isRebuildingCache || hasPendingSync || !hasConnectedStore}
                  title="Vuelve a guardar localmente una descarga completa validada, sin borrar Supabase."
                >
                  {isRebuildingCache ? 'Reconstruyendo caché...' : 'Reconstruir caché local de forma segura'}
                </Button>
              </div>

              <div className="rounded-xl border p-4 bg-white space-y-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-2 rounded-lg bg-rose-100 text-rose-700">
                    <CloudUpload className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold">Enviar datos de este equipo a la nube</p>
                    <p className="text-sm text-gray-600">
                      Esta operación está bloqueada para impedir que una copia local parcial reemplace la nube.
                    </p>
                  </div>
                </div>
                <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">
                  Protección activa: no se permiten reemplazos destructivos de Supabase.
                </div>
                <Button
                  variant="outline"
                  className="w-full h-12"
                  disabled
                  title="Bloqueado para proteger los datos remotos."
                >
                  Envío destructivo bloqueado
                </Button>
              </div>

              <div className="rounded-xl border p-4 bg-white space-y-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-2 rounded-lg bg-emerald-100 text-emerald-700">
                    <RotateCcw className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold">Validar un archivo de backup</p>
                    <p className="text-sm text-gray-600">
                      Revisa estructura y cantidades sin importar ni modificar ningún dato.
                    </p>
                  </div>
                </div>
                <Input
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => {
                    void handleBackupFileValidation(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                  aria-label="Seleccionar archivo JSON para validar"
                />
                {backupValidation && (
                  <div className={`rounded-lg border p-3 text-sm ${
                    backupValidation.valid
                      ? 'border-green-200 bg-green-50 text-green-800'
                      : 'border-red-200 bg-red-50 text-red-800'
                  }`}>
                    <p className="font-semibold">
                      {backupValidation.valid ? 'Backup válido para revisión' : 'Backup inválido'}
                    </p>
                    {backupValidation.errors.map((error) => <p key={error}>{error}</p>)}
                    {backupValidation.warnings.map((warning) => <p key={warning}>Advertencia: {warning}</p>)}
                    {backupValidation.valid && (
                      <p className="mt-1">
                        Productos: {backupValidation.counts.products}; ventas: {backupValidation.counts.sales}; clientes: {backupValidation.counts.customers}; kardex: {backupValidation.counts.kardex}.
                      </p>
                    )}
                    <p className="mt-1 text-xs">La validación no restaura ni escribe información.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="font-semibold mb-2">Modo Offline</p>
              <p className="text-sm text-gray-600">
                El sistema funciona sin conexión a internet y sincroniza automáticamente al volver la conexión.
              </p>
            </div>

            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="font-semibold mb-2 text-yellow-800">⚠️ Importante</p>
              <p className="text-sm text-yellow-700">
                Realiza backups periódicos para evitar pérdida de datos. Los datos locales pueden perderse si se borra el caché del navegador.
              </p>
            </div>
          </Card>

          <Dialog open={showPendingModal} onOpenChange={setShowPendingModal}>
            <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Pendientes locales por sincronizar</DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Fuente del cálculo: {pendingSummary.source === 'offline-backup' ? 'snapshot pendiente (pos_offline_backup)' : 'estado local actual'}.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg border p-3">
                    <p className="text-gray-500">Productos</p>
                    <p className="text-lg font-semibold">{pendingSummary.products}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-gray-500">Ventas</p>
                    <p className="text-lg font-semibold">{pendingSummary.sales}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-gray-500">Clientes</p>
                    <p className="text-lg font-semibold">{pendingSummary.customers}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-gray-500">Proveedores</p>
                    <p className="text-lg font-semibold">{pendingSummary.suppliers}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-gray-500">Kardex</p>
                    <p className="text-lg font-semibold">{pendingSummary.kardex}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-gray-500">Recargas</p>
                    <p className="text-lg font-semibold">{pendingSummary.recharges}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-gray-500">Sesiones de caja</p>
                    <p className="text-lg font-semibold">{pendingSummary.cashSessions}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-gray-500">Movimientos de caja</p>
                    <p className="text-lg font-semibold">{pendingSummary.cashMovements}</p>
                  </div>
                </div>

                <div className="rounded-lg border bg-secondary p-3 text-sm">
                  <p>
                    Configuración de tienda pendiente: <strong>{pendingSummary.hasConfig ? 'Sí' : 'No'}</strong>
                  </p>
                </div>

                <p className="text-xs text-gray-500">
                  Este modal muestra un resumen de registros locales pendientes. No reemplaza la validación final en la base de datos.
                </p>

                <div className="pt-1">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleLoadProductDiff}
                    disabled={isLoadingProductDiff}
                  >
                    {isLoadingProductDiff ? 'Comparando con base de datos...' : 'Comparar productos pendientes con base de datos'}
                  </Button>
                </div>

                {productDiff && (
                  <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <p className="text-sm font-semibold text-blue-900">Resultado de comparación de productos</p>
                    {!productDiff.canCompare && (
                      <p className="text-sm text-blue-800">{productDiff.reason || 'No se pudo realizar la comparación.'}</p>
                    )}
                    {productDiff.canCompare && (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                          <div className="rounded border bg-white p-2">
                            <p className="text-gray-500">Locales</p>
                            <p className="font-semibold">{productDiff.localTotal}</p>
                          </div>
                          <div className="rounded border bg-white p-2">
                            <p className="text-gray-500">Remotos</p>
                            <p className="font-semibold">{productDiff.remoteTotal}</p>
                          </div>
                          <div className="rounded border bg-white p-2">
                            <p className="text-gray-500">Se crearían</p>
                            <p className="font-semibold text-emerald-700">{productDiff.toCreate}</p>
                          </div>
                          <div className="rounded border bg-white p-2">
                            <p className="text-gray-500">Se actualizarían</p>
                            <p className="font-semibold text-blue-700">{productDiff.toUpdate}</p>
                          </div>
                          <div className="rounded border bg-white p-2">
                            <p className="text-gray-500">Conflictos</p>
                            <p className="font-semibold text-amber-700">{productDiff.conflicts}</p>
                          </div>
                          <div className="rounded border bg-white p-2">
                            <p className="text-gray-500">Sin identificadores</p>
                            <p className="font-semibold text-rose-700">{productDiff.missingIdentifiers}</p>
                          </div>
                        </div>

                        {productDiff.duplicateLocalIdentifiers > 0 && (
                          <p className="text-xs text-amber-800">
                            Duplicados locales por SKU/código detectados: {productDiff.duplicateLocalIdentifiers}
                          </p>
                        )}

                        {productDiff.sampleConflicts.length > 0 && (
                          <div className="rounded border bg-white p-2">
                            <p className="text-xs font-semibold text-amber-800 mb-1">Ejemplos de conflicto</p>
                            <ul className="text-xs text-gray-700 space-y-1">
                              {productDiff.sampleConflicts.map((item) => (
                                <li key={item}>- {item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
