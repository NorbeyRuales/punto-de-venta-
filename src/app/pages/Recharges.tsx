// Recargas y pago de servicios con cálculo de comisión.
import { useState } from 'react';
import { usePOS } from '../context/POSContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Smartphone, Zap, Tv } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';

export function Recharges() {
  const { addRecharge, recharges } = usePOS();
  // Estado del formulario de recargas.
  const [rechargeType, setRechargeType] = useState('mobile');
  const [provider, setProvider] = useState('Claro');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [amount, setAmount] = useState('');

  const mobileProviders = ['Claro', 'Movistar', 'Tigo', 'WOM', 'ETB'];
  const serviceProviders = ['Energía', 'Agua', 'Gas', 'Internet'];
  const pinProviders = ['Netflix', 'DirecTV', 'Spotify', 'PlayStation'];

  // Procesa recarga/servicio/pin y registra comisión.
  const handleRecharge = () => {
    if (!amount) {
      toast.error('Ingrese el monto');
      return;
    }

    const amountNum = parseFloat(amount);
    const commission = amountNum * 0.03; // 3% comisión
    const total = amountNum + commission;

    addRecharge({
      type: rechargeType as 'mobile' | 'service' | 'pin',
      provider,
      phoneNumber: rechargeType === 'mobile' ? phoneNumber : undefined,
      amount: amountNum,
      commission,
      total
    });

    toast.success('Recarga procesada exitosamente');
    setPhoneNumber('');
    setAmount('');
  };

  // Resumen de totales.
  const totalRecharges = recharges.reduce((sum, r) => sum + r.total, 0);
  const totalCommission = recharges.reduce((sum, r) => sum + r.commission, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Recargas y Servicios</h1>
        <p className="text-gray-600">Recargas de celular, pago de servicios y pines</p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Recargas Hoy</p>
              <p className="text-2xl font-bold text-[#2ECC71]">${totalRecharges.toLocaleString('es-CO')}</p>
            </div>
            <Smartphone className="w-10 h-10 text-[#2ECC71]" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Comisiones</p>
              <p className="text-2xl font-bold text-[var(--primary)]">${totalCommission.toLocaleString('es-CO')}</p>
            </div>
            <Zap className="w-10 h-10 text-[var(--primary)]" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Transacciones</p>
              <p className="text-2xl font-bold">{recharges.length}</p>
            </div>
            <Tv className="w-10 h-10 text-blue-600" />
          </div>
        </Card>
      </div>

      {/* Formulario de recarga */}
      <Card className="p-6">
        <Tabs value={rechargeType} onValueChange={setRechargeType}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="mobile">Recargas Móviles</TabsTrigger>
            <TabsTrigger value="service">Servicios Públicos</TabsTrigger>
            <TabsTrigger value="pin">Pines</TabsTrigger>
          </TabsList>

          <TabsContent value="mobile" className="space-y-4 mt-6">
            <div>
              <Label>Operador</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mobileProviders.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Número de Celular</Label>
              <Input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="3001234567"
                className="h-12"
              />
            </div>

            <div>
              <Label>Monto</Label>
              <Select value={amount} onValueChange={setAmount}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Seleccionar monto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5000">$5,000</SelectItem>
                  <SelectItem value="10000">$10,000</SelectItem>
                  <SelectItem value="20000">$20,000</SelectItem>
                  <SelectItem value="30000">$30,000</SelectItem>
                  <SelectItem value="50000">$50,000</SelectItem>
                  <SelectItem value="100000">$100,000</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {amount && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-600">Comisión (3%)</p>
                <p className="font-bold text-blue-600">${(parseFloat(amount) * 0.03).toLocaleString('es-CO')}</p>
                <p className="text-sm text-gray-600 mt-2">Total a Cobrar</p>
                <p className="text-xl font-bold">${(parseFloat(amount) * 1.03).toLocaleString('es-CO')}</p>
              </div>
            )}

            <Button onClick={handleRecharge} className="w-full h-14 bg-[#2ECC71] hover:bg-[#27AE60]">
              Procesar Recarga
            </Button>
          </TabsContent>

          <TabsContent value="service" className="space-y-4 mt-6">
            <div>
              <Label>Servicio</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {serviceProviders.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Monto</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="h-12"
              />
            </div>

            {amount && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-600">Comisión (3%)</p>
                <p className="font-bold text-blue-600">${(parseFloat(amount) * 0.03).toLocaleString('es-CO')}</p>
                <p className="text-sm text-gray-600 mt-2">Total a Cobrar</p>
                <p className="text-xl font-bold">${(parseFloat(amount) * 1.03).toLocaleString('es-CO')}</p>
              </div>
            )}

            <Button onClick={handleRecharge} className="w-full h-14 bg-[#2ECC71] hover:bg-[#27AE60]">
              Procesar Pago
            </Button>
          </TabsContent>

          <TabsContent value="pin" className="space-y-4 mt-6">
            <div>
              <Label>Servicio</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pinProviders.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Monto</Label>
              <Select value={amount} onValueChange={setAmount}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Seleccionar monto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20000">$20,000</SelectItem>
                  <SelectItem value="50000">$50,000</SelectItem>
                  <SelectItem value="100000">$100,000</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {amount && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-600">Comisión (3%)</p>
                <p className="font-bold text-blue-600">${(parseFloat(amount) * 0.03).toLocaleString('es-CO')}</p>
                <p className="text-sm text-gray-600 mt-2">Total a Cobrar</p>
                <p className="text-xl font-bold">${(parseFloat(amount) * 1.03).toLocaleString('es-CO')}</p>
              </div>
            )}

            <Button onClick={handleRecharge} className="w-full h-14 bg-[#2ECC71] hover:bg-[#27AE60]">
              Procesar Pin
            </Button>
          </TabsContent>
        </Tabs>
      </Card>

      {/* Historial */}
      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Historial de Recargas</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary border-b">
              <tr>
                <th className="text-left p-3">Tipo</th>
                <th className="text-left p-3">Proveedor</th>
                <th className="text-left p-3">Teléfono</th>
                <th className="text-right p-3">Monto</th>
                <th className="text-right p-3">Comisión</th>
                <th className="text-right p-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {recharges.slice(-20).reverse().map(recharge => (
                <tr key={recharge.id} className="border-b">
                  <td className="p-3 capitalize">{recharge.type}</td>
                  <td className="p-3">{recharge.provider}</td>
                  <td className="p-3">{recharge.phoneNumber || '-'}</td>
                  <td className="p-3 text-right">${recharge.amount.toLocaleString('es-CO')}</td>
                  <td className="p-3 text-right text-[var(--primary)]">${recharge.commission.toLocaleString('es-CO')}</td>
                  <td className="p-3 text-right font-bold">${recharge.total.toLocaleString('es-CO')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
