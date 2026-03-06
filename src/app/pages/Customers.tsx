import { useState } from 'react';
import { usePOS } from '../context/POSContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { 
  Search, 
  Plus, 
  Edit, 
  DollarSign, 
  TrendingUp,
  User,
  Phone,
  MapPin,
  CreditCard,
  Gift
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Customer } from '../context/POSContext';

export function Customers() {
  const { 
    customers, 
    addCustomer, 
    updateCustomer, 
    addDebtToCustomer,
    addPaymentToCustomer
  } = usePOS();

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDebtDialog, setShowDebtDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    email: '',
    nit: ''
  });

  const [debtAmount, setDebtAmount] = useState('');
  const [debtDescription, setDebtDescription] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDescription, setPaymentDescription] = useState('');

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery)
  );

  const totalDebt = customers.reduce((sum, c) => sum + c.debt, 0);
  const customersWithDebt = customers.filter(c => c.debt > 0).length;

  const handleAddCustomer = () => {
    if (!formData.name || !formData.phone) {
      toast.error('Complete los campos requeridos');
      return;
    }

    addCustomer({
      name: formData.name,
      phone: formData.phone,
      address: formData.address,
      email: formData.email,
      nit: formData.nit
    });

    toast.success('Cliente agregado exitosamente');
    setShowAddDialog(false);
    resetForm();
  };

  const handleEditCustomer = () => {
    if (!selectedCustomer) return;

    updateCustomer(selectedCustomer.id, {
      name: formData.name,
      phone: formData.phone,
      address: formData.address,
      email: formData.email,
      nit: formData.nit
    });

    toast.success('Cliente actualizado');
    setShowEditDialog(false);
    setSelectedCustomer(null);
    resetForm();
  };

  const handleAddDebt = () => {
    if (!selectedCustomer || !debtAmount) {
      toast.error('Complete los campos requeridos');
      return;
    }

    addDebtToCustomer(
      selectedCustomer.id,
      parseFloat(debtAmount),
      debtDescription || 'Compra fiada'
    );

    toast.success('Deuda registrada');
    setShowDebtDialog(false);
    setDebtAmount('');
    setDebtDescription('');
    setSelectedCustomer(null);
  };

  const handleAddPayment = () => {
    if (!selectedCustomer || !paymentAmount) {
      toast.error('Complete los campos requeridos');
      return;
    }

    addPaymentToCustomer(
      selectedCustomer.id,
      parseFloat(paymentAmount),
      paymentDescription || 'Abono a cuenta'
    );

    toast.success('Pago registrado');
    setShowPaymentDialog(false);
    setPaymentAmount('');
    setPaymentDescription('');
    setSelectedCustomer(null);
  };

  const openEditDialog = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      email: customer.email || '',
      nit: customer.nit || ''
    });
    setShowEditDialog(true);
  };

  const openDetailDialog = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowDetailDialog(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      address: '',
      email: '',
      nit: ''
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Clientes</h1>
          <p className="text-gray-600">{customers.length} clientes registrados</p>
        </div>
        <Button
          onClick={() => setShowAddDialog(true)}
          className="bg-[var(--primary)] hover:bg-[var(--primary-hover)]"
        >
          <Plus className="w-5 h-5 mr-2" />
          Agregar Cliente
        </Button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Clientes</p>
              <p className="text-3xl font-bold">{customers.length}</p>
            </div>
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Clientes con Deuda</p>
              <p className="text-3xl font-bold text-[#E74C3C]">{customersWithDebt}</p>
            </div>
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center">
              <CreditCard className="w-8 h-8 text-[#E74C3C]" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Deuda Total</p>
              <p className="text-3xl font-bold text-[#E74C3C]">
                ${totalDebt.toLocaleString('es-CO')}
              </p>
            </div>
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center">
              <DollarSign className="w-8 h-8 text-[#E74C3C]" />
            </div>
          </div>
        </Card>
      </div>

      {/* Búsqueda */}
      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            placeholder="Buscar por nombre o teléfono..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12"
          />
        </div>
      </Card>

      {/* Lista de clientes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCustomers.map(customer => (
          <Card key={customer.id} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-[var(--primary)] rounded-full flex items-center justify-center text-white font-bold text-lg">
                    {customer.name.charAt(0)}
                  </div>
                <div>
                  <h3 className="font-bold">{customer.name}</h3>
                  <p className="text-sm text-gray-600 flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {customer.phone}
                  </p>
                </div>
              </div>
            </div>

            {customer.address && (
              <p className="text-sm text-gray-600 mb-3 flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {customer.address}
              </p>
            )}

            <div className="flex items-center justify-between mb-4 pb-4 border-b">
              <div>
                <p className="text-sm text-gray-600">Puntos</p>
                <p className="font-bold text-[#2ECC71] flex items-center gap-1">
                  <Gift className="w-4 h-4" />
                  {customer.points}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">Deuda</p>
                <p className={`font-bold ${customer.debt > 0 ? 'text-[#E74C3C]' : 'text-gray-900'}`}>
                  ${customer.debt.toLocaleString('es-CO')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => openDetailDialog(customer)}
              >
                Ver Detalles
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openEditDialog(customer)}
              >
                <Edit className="w-4 h-4 mr-1" />
                Editar
              </Button>
              <Button
                size="sm"
                className="bg-[#E74C3C] hover:bg-[#C0392B] text-white"
                onClick={() => {
                  setSelectedCustomer(customer);
                  setShowDebtDialog(true);
                }}
              >
                Registrar Fiado
              </Button>
              {customer.debt > 0 && (
                <Button
                  size="sm"
                  className="bg-[#2ECC71] hover:bg-[#27AE60] text-white"
                  onClick={() => {
                    setSelectedCustomer(customer);
                    setShowPaymentDialog(true);
                  }}
                >
                  Registrar Pago
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {filteredCustomers.length === 0 && (
        <Card className="p-12 text-center">
          <User className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500">No se encontraron clientes</p>
        </Card>
      )}

      {/* Dialog Agregar Cliente */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Cliente</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Nombre *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nombre completo"
              />
            </div>

            <div>
              <Label>Teléfono *</Label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="3001234567"
              />
            </div>

            <div>
              <Label>Dirección</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Calle 123 #45-67"
              />
            </div>

            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="cliente@email.com"
              />
            </div>

            <div>
              <Label>NIT/CC</Label>
              <Input
                value={formData.nit}
                onChange={(e) => setFormData({ ...formData, nit: e.target.value })}
                placeholder="1234567890"
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleAddCustomer}
                className="flex-1 bg-[#2ECC71] hover:bg-[#27AE60]"
              >
                Agregar Cliente
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddDialog(false);
                  resetForm();
                }}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Editar Cliente */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Nombre *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div>
              <Label>Teléfono *</Label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div>
              <Label>Dirección</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>

            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div>
              <Label>NIT/CC</Label>
              <Input
                value={formData.nit}
                onChange={(e) => setFormData({ ...formData, nit: e.target.value })}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleEditCustomer}
                className="flex-1 bg-[#2ECC71] hover:bg-[#27AE60]"
              >
                Guardar Cambios
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowEditDialog(false);
                  setSelectedCustomer(null);
                  resetForm();
                }}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Registrar Deuda */}
      <Dialog open={showDebtDialog} onOpenChange={setShowDebtDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Fiado</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {selectedCustomer && (
              <div className="p-4 bg-secondary rounded-lg">
                <p className="font-semibold">{selectedCustomer.name}</p>
                <p className="text-sm text-gray-600">
                  Deuda actual: ${selectedCustomer.debt.toLocaleString('es-CO')}
                </p>
              </div>
            )}

            <div>
              <Label>Monto *</Label>
              <Input
                type="number"
                value={debtAmount}
                onChange={(e) => setDebtAmount(e.target.value)}
                placeholder="0"
                className="h-12 text-lg"
              />
            </div>

            <div>
              <Label>Descripción</Label>
              <Input
                value={debtDescription}
                onChange={(e) => setDebtDescription(e.target.value)}
                placeholder="Compra fiada"
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleAddDebt}
                className="flex-1 bg-[#E74C3C] hover:bg-[#C0392B]"
              >
                Registrar Deuda
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowDebtDialog(false);
                  setDebtAmount('');
                  setDebtDescription('');
                }}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Registrar Pago */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pago</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {selectedCustomer && (
              <div className="p-4 bg-secondary rounded-lg">
                <p className="font-semibold">{selectedCustomer.name}</p>
                <p className="text-sm text-gray-600">
                  Deuda actual: ${selectedCustomer.debt.toLocaleString('es-CO')}
                </p>
              </div>
            )}

            <div>
              <Label>Monto del Pago *</Label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0"
                className="h-12 text-lg"
              />
            </div>

            <div>
              <Label>Descripción</Label>
              <Input
                value={paymentDescription}
                onChange={(e) => setPaymentDescription(e.target.value)}
                placeholder="Abono a cuenta"
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleAddPayment}
                className="flex-1 bg-[#2ECC71] hover:bg-[#27AE60]"
              >
                Registrar Pago
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowPaymentDialog(false);
                  setPaymentAmount('');
                  setPaymentDescription('');
                }}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Detalles Cliente */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalles del Cliente</DialogTitle>
          </DialogHeader>
          
          {selectedCustomer && (
            <Tabs defaultValue="info">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="info">Información</TabsTrigger>
                <TabsTrigger value="history">Historial</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Nombre</p>
                    <p className="font-semibold">{selectedCustomer.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Teléfono</p>
                    <p className="font-semibold">{selectedCustomer.phone}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Dirección</p>
                    <p className="font-semibold">{selectedCustomer.address || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Email</p>
                    <p className="font-semibold">{selectedCustomer.email || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Puntos</p>
                    <p className="font-semibold text-[#2ECC71]">{selectedCustomer.points}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Deuda</p>
                    <p className="font-semibold text-[#E74C3C]">
                      ${selectedCustomer.debt.toLocaleString('es-CO')}
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="history" className="space-y-4">
                <h3 className="font-bold">Historial de Cuenta</h3>
                {selectedCustomer.debtHistory.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No hay movimientos</p>
                ) : (
                  <div className="space-y-2">
                    {selectedCustomer.debtHistory
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map(transaction => (
                        <div 
                          key={transaction.id}
                          className={`p-3 rounded-lg border ${
                            transaction.type === 'debt' 
                              ? 'bg-red-50 border-red-200' 
                              : 'bg-green-50 border-green-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold">
                                {transaction.type === 'debt' ? 'Deuda' : 'Pago'}
                              </p>
                              <p className="text-sm text-gray-600">{transaction.description}</p>
                              <p className="text-xs text-gray-500">
                                {format(new Date(transaction.date), "d 'de' MMMM, yyyy - HH:mm", { locale: es })}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className={`font-bold ${
                                transaction.type === 'debt' ? 'text-[#E74C3C]' : 'text-[#2ECC71]'
                              }`}>
                                {transaction.type === 'debt' ? '+' : '-'}${transaction.amount.toLocaleString('es-CO')}
                              </p>
                              <p className="text-sm text-gray-600">
                                Saldo: ${transaction.balance.toLocaleString('es-CO')}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
