import { useState } from 'react';
import { usePOS } from '../context/POSContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Search, Plus, TrendingUp, Edit, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import type { Supplier } from '../context/POSContext';

export function Suppliers() {
  const { suppliers, addSupplier, updateSupplier, deleteSupplier } = usePOS();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({ name: '', nit: '', phone: '', email: '', address: '', bankAccounts: [''] });
  const [editFormData, setEditFormData] = useState({ name: '', nit: '', phone: '', email: '', address: '', bankAccounts: [''] });

  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAdd = () => {
    const trimmedName = formData.name.trim();
    const trimmedNit = formData.nit.trim();
    const trimmedPhone = formData.phone.trim();

    if (!trimmedName || !trimmedNit || !trimmedPhone) {
      toast.error('Complete Nombre, NIT y Teléfono');
      return;
    }

    const bankAccounts = formData.bankAccounts
      .map(account => account.trim())
      .filter(account => account.length > 0);

    addSupplier({
      ...formData,
      name: trimmedName,
      nit: trimmedNit,
      phone: trimmedPhone,
      bankAccounts
    });
    toast.success('Proveedor agregado');
    setShowAddDialog(false);
    setFormData({ name: '', nit: '', phone: '', email: '', address: '', bankAccounts: [''] });
  };

  const handleEdit = () => {
    if (!selectedSupplier) return;
    const trimmedName = editFormData.name.trim();
    const trimmedNit = editFormData.nit.trim();
    const trimmedPhone = editFormData.phone.trim();

    if (!trimmedName || !trimmedNit || !trimmedPhone) {
      toast.error('Complete Nombre, NIT y Teléfono');
      return;
    }

    const bankAccounts = editFormData.bankAccounts
      .map(account => account.trim())
      .filter(account => account.length > 0);

    updateSupplier(selectedSupplier.id, {
      ...editFormData,
      name: trimmedName,
      nit: trimmedNit,
      phone: trimmedPhone,
      bankAccounts
    });

    toast.success('Proveedor actualizado');
    setShowEditDialog(false);
    setSelectedSupplier(null);
    setEditFormData({ name: '', nit: '', phone: '', email: '', address: '', bankAccounts: [''] });
  };

  const openEditDialog = (supplier: Supplier) => {
    const existingAccounts = supplier.bankAccounts && supplier.bankAccounts.length > 0
      ? supplier.bankAccounts
      : supplier.bankAccount
        ? [supplier.bankAccount]
        : [''];

    setSelectedSupplier(supplier);
    setEditFormData({
      name: supplier.name,
      nit: supplier.nit,
      phone: supplier.phone,
      email: supplier.email || '',
      address: supplier.address || '',
      bankAccounts: existingAccounts
    });
    setShowEditDialog(true);
  };

  const handleDelete = (supplierId: string) => {
    if (!confirm('¿Está seguro de eliminar este proveedor?')) return;
    deleteSupplier(supplierId);
    toast.success('Proveedor eliminado');
  };

  const handleBankAccountChange = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      bankAccounts: prev.bankAccounts.map((account, currentIndex) =>
        currentIndex === index ? value : account
      )
    }));
  };

  const addBankAccountField = () => {
    setFormData(prev => ({
      ...prev,
      bankAccounts: [...prev.bankAccounts, '']
    }));
  };

  const removeBankAccountField = (index: number) => {
    setFormData(prev => {
      const nextAccounts = prev.bankAccounts.filter((_, currentIndex) => currentIndex !== index);
      return {
        ...prev,
        bankAccounts: nextAccounts.length > 0 ? nextAccounts : ['']
      };
    });
  };

  const handleEditBankAccountChange = (index: number, value: string) => {
    setEditFormData(prev => ({
      ...prev,
      bankAccounts: prev.bankAccounts.map((account, currentIndex) =>
        currentIndex === index ? value : account
      )
    }));
  };

  const addEditBankAccountField = () => {
    setEditFormData(prev => ({
      ...prev,
      bankAccounts: [...prev.bankAccounts, '']
    }));
  };

  const removeEditBankAccountField = (index: number) => {
    setEditFormData(prev => {
      const nextAccounts = prev.bankAccounts.filter((_, currentIndex) => currentIndex !== index);
      return {
        ...prev,
        bankAccounts: nextAccounts.length > 0 ? nextAccounts : ['']
      };
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Proveedores</h1>
        <Button onClick={() => setShowAddDialog(true)} className="bg-[#FF6B00] hover:bg-[#E85F00]">
          <Plus className="w-5 h-5 mr-2" />
          Agregar Proveedor
        </Button>
      </div>

      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input placeholder="Buscar proveedores..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 h-12" />
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSuppliers.map(supplier => (
          <Card key={supplier.id} className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-[#FF6B00] rounded-full flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold">{supplier.name}</h3>
                <p className="text-sm text-gray-600">NIT: {supplier.nit}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <p><strong>Teléfono:</strong> {supplier.phone}</p>
              {supplier.email && <p><strong>Email:</strong> {supplier.email}</p>}
              {(supplier.bankAccounts && supplier.bankAccounts.length > 0) ? (
                <div>
                  <p><strong>Cuentas bancarias:</strong></p>
                  <ul className="list-disc ml-5">
                    {supplier.bankAccounts.map((account, index) => (
                      <li key={`${supplier.id}-bank-${index}`}>{account}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                supplier.bankAccount && <p><strong>Cuenta bancaria:</strong> {supplier.bankAccount}</p>
              )}
              <p className="text-[#E74C3C] font-bold">
                Deuda: ${supplier.debt.toLocaleString('es-CO')}
              </p>
            </div>

            <div className="flex gap-2 mt-4">
              <Button size="sm" variant="outline" onClick={() => openEditDialog(supplier)}>
                <Edit className="w-4 h-4 mr-1" />
                Editar
              </Button>
              <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(supplier.id)}>
                <Trash2 className="w-4 h-4 mr-1" />
                Eliminar
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Agregar Proveedor</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nombre *</Label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
            <div><Label>NIT *</Label><Input value={formData.nit} onChange={(e) => setFormData({ ...formData, nit: e.target.value })} /></div>
            <div><Label>Teléfono *</Label><Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} /></div>
            <div><Label>Dirección</Label><Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} /></div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Cuentas bancarias</Label>
                <Button type="button" variant="outline" size="sm" onClick={addBankAccountField}>
                  Agregar cuenta
                </Button>
              </div>
              {formData.bankAccounts.map((account, index) => (
                <div key={`bank-account-${index}`} className="flex gap-2">
                  <Input
                    value={account}
                    onChange={(e) => handleBankAccountChange(index, e.target.value)}
                    placeholder="Ej: Bancolombia 1234567890"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => removeBankAccountField(index)}
                  >
                    Quitar
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAdd} className="flex-1 bg-[#2ECC71] hover:bg-[#27AE60]">Agregar</Button>
              <Button variant="outline" onClick={() => setShowAddDialog(false)} className="flex-1">Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Proveedor</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nombre *</Label><Input value={editFormData.name} onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })} /></div>
            <div><Label>NIT *</Label><Input value={editFormData.nit} onChange={(e) => setEditFormData({ ...editFormData, nit: e.target.value })} /></div>
            <div><Label>Teléfono *</Label><Input value={editFormData.phone} onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={editFormData.email} onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })} /></div>
            <div><Label>Dirección</Label><Input value={editFormData.address} onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })} /></div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Cuentas bancarias</Label>
                <Button type="button" variant="outline" size="sm" onClick={addEditBankAccountField}>
                  Agregar cuenta
                </Button>
              </div>
              {editFormData.bankAccounts.map((account, index) => (
                <div key={`edit-bank-account-${index}`} className="flex gap-2">
                  <Input
                    value={account}
                    onChange={(e) => handleEditBankAccountChange(index, e.target.value)}
                    placeholder="Ej: Bancolombia 1234567890"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => removeEditBankAccountField(index)}
                  >
                    Quitar
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleEdit} className="flex-1 bg-[#2ECC71] hover:bg-[#27AE60]">Guardar</Button>
              <Button variant="outline" onClick={() => setShowEditDialog(false)} className="flex-1">Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
