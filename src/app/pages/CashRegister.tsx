// Control de caja: apertura, movimientos y cierre.
import { useMemo, useState } from 'react';
import { usePOS } from '../context/POSContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowDownCircle, ArrowUpCircle, FileText, Lock, Unlock, Wallet } from 'lucide-react';

const formatCurrency = (value: number) => `$${Math.round(value).toLocaleString('es-CO')}`;

const formatMethodLabel = (method: string) => {
  const normalized = method?.toLowerCase?.() || 'otro';
  const map: Record<string, string> = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    transferencia: 'Transferencia',
    credito: 'Crédito',
    otro: 'Otros',
  };
  return map[normalized] || normalized.toUpperCase();
};

export function CashRegister() {
  const {
    currentCashSession,
    cashSessions,
    cashMovements,
    openCashSession,
    closeCashSession,
    addCashMovement,
    getCashSessionReport,
  } = usePOS();

  const [openingCash, setOpeningCash] = useState('');
  const [movementType, setMovementType] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [lastClosedId, setLastClosedId] = useState<string | null>(null);

  const activeReport = currentCashSession ? getCashSessionReport(currentCashSession.id) : null;
  const activeMovements = currentCashSession
    ? cashMovements.filter(movement => movement.cashSessionId === currentCashSession.id)
    : [];

  const lastClosedSession = useMemo(() => {
    if (lastClosedId) {
      return cashSessions.find(session => session.id === lastClosedId) ?? null;
    }
    const closedSessions = cashSessions.filter(session => session.status === 'closed');
    return closedSessions.sort((a, b) => new Date(b.closedAt || b.openedAt).getTime() - new Date(a.closedAt || a.openedAt).getTime())[0] ?? null;
  }, [cashSessions, lastClosedId]);

  const lastClosedReport = lastClosedSession ? getCashSessionReport(lastClosedSession.id) : null;

  const handleOpen = async () => {
    const amount = parseFloat(openingCash) || 0;
    const ok = await openCashSession(amount);
    if (ok) {
      setOpeningCash('');
    }
  };

  const handleMovement = async () => {
    const amount = parseFloat(movementAmount) || 0;
    const movement = await addCashMovement(movementType, amount, movementReason);
    if (movement) {
      setMovementAmount('');
      setMovementReason('');
    }
  };

  const handleClose = async () => {
    const amount = parseFloat(countedCash) || 0;
    const closed = await closeCashSession(amount);
    if (closed) {
      setCountedCash('');
      setLastClosedId(closed.id);
    }
  };

  const countedPreview = parseFloat(countedCash) || 0;
  const differencePreview = activeReport ? countedPreview - activeReport.expectedCash : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Caja</h1>
          <p className="text-gray-600">Control de apertura, movimientos y cierre</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Wallet className="w-4 h-4" />
          {currentCashSession ? 'Sesión abierta' : 'Sin sesión activa'}
        </div>
      </div>

      {!currentCashSession && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Unlock className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold">Apertura de Caja</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2">
              <Label>Base inicial</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="0"
                className="h-12"
              />
              <p className="text-xs text-gray-500 mt-1">Dinero disponible para dar cambio al iniciar turno.</p>
            </div>
            <Button className="h-12 bg-[#2ECC71] hover:bg-[#27AE60]" onClick={handleOpen}>
              Abrir caja
            </Button>
          </div>
        </Card>
      )}

      {currentCashSession && activeReport && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="p-6 lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-[var(--primary)]" />
              <h2 className="text-lg font-bold">Resumen de Sesión</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-secondary">
                <p className="text-xs text-gray-600">Apertura</p>
                <p className="text-lg font-semibold">
                  {format(new Date(currentCashSession.openedAt), "d MMM yyyy, HH:mm", { locale: es })}
                </p>
                <p className="text-sm text-gray-600">Base: {formatCurrency(currentCashSession.openingCash)}</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary">
                <p className="text-xs text-gray-600">Ventas totales</p>
                <p className="text-lg font-semibold text-[#2ECC71]">{formatCurrency(activeReport.salesTotal)}</p>
                <p className="text-sm text-gray-600">Efectivo: {formatCurrency(activeReport.cashSalesTotal)}</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary">
                <p className="text-xs text-gray-600">Ingresos de caja</p>
                <p className="text-lg font-semibold">{formatCurrency(activeReport.cashInTotal)}</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary">
                <p className="text-xs text-gray-600">Retiros de caja</p>
                <p className="text-lg font-semibold text-red-600">{formatCurrency(activeReport.cashOutTotal)}</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary md:col-span-2">
                <p className="text-xs text-gray-600">Dinero esperado</p>
                <p className="text-2xl font-bold text-[var(--primary)]">{formatCurrency(activeReport.expectedCash)}</p>
                <p className="text-xs text-gray-500">
                  Base inicial + ventas en efectivo + ingresos - retiros
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <ArrowUpCircle className="w-5 h-5 text-emerald-600" />
              <h2 className="text-lg font-bold">Movimientos</h2>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Tipo de movimiento</Label>
                <Select value={movementType} onValueChange={(value) => setMovementType(value as 'cash_in' | 'cash_out')}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash_in">Ingreso de caja</SelectItem>
                    <SelectItem value="cash_out">Retiro de caja</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Monto</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={movementAmount}
                  onChange={(e) => setMovementAmount(e.target.value)}
                  placeholder="0"
                  className="h-11"
                />
              </div>
              <div>
                <Label>Motivo</Label>
                <Input
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  placeholder="Ej: retiro de pago proveedor"
                  className="h-11"
                />
              </div>
              <Button onClick={handleMovement} className="w-full h-11 bg-[#2ECC71] hover:bg-[#27AE60]">
                Registrar movimiento
              </Button>
            </div>
          </Card>
        </div>
      )}

      {currentCashSession && activeReport && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <ArrowDownCircle className="w-5 h-5 text-red-600" />
              <h2 className="text-lg font-bold">Cierre de Caja</h2>
            </div>
            <div className="space-y-4">
              <div>
                <Label>Dinero contado</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value)}
                  placeholder="0"
                  className="h-12"
                />
              </div>
              <div className="p-4 rounded-lg bg-secondary">
                <p className="text-xs text-gray-600">Diferencia estimada</p>
                <p className={`text-xl font-bold ${differencePreview >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatCurrency(differencePreview)}
                </p>
              </div>
              <Button className="h-12 bg-[#0f172a] hover:bg-[#111827] text-white" onClick={handleClose}>
                <Lock className="w-4 h-4 mr-2" />
                Cerrar caja
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-[var(--primary)]" />
              <h2 className="text-lg font-bold">Ventas por método</h2>
            </div>
            <div className="space-y-3">
              {Object.keys(activeReport.salesByMethod).length === 0 && (
                <p className="text-sm text-gray-500">No hay ventas registradas en la sesión.</p>
              )}
              {Object.entries(activeReport.salesByMethod).map(([method, total]) => (
                <div key={method} className="flex items-center justify-between text-sm">
                  <span>{formatMethodLabel(method)}</span>
                  <span className="font-semibold">{formatCurrency(total)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {currentCashSession && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-bold">Movimientos registrados</h2>
          </div>
          {activeMovements.length === 0 ? (
            <p className="text-sm text-gray-500">No hay movimientos manuales en esta sesión.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary border-b">
                  <tr>
                    <th className="text-left p-3">Fecha</th>
                    <th className="text-left p-3">Tipo</th>
                    <th className="text-left p-3">Motivo</th>
                    <th className="text-right p-3">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {activeMovements.slice(-10).reverse().map((movement) => (
                    <tr key={movement.id} className="border-b">
                      <td className="p-3">{format(new Date(movement.date), "d MMM, HH:mm", { locale: es })}</td>
                      <td className="p-3">{movement.type === 'cash_in' ? 'Ingreso' : 'Retiro'}</td>
                      <td className="p-3">{movement.reason || 'Sin motivo'}</td>
                      <td className="p-3 text-right font-semibold">
                        {movement.type === 'cash_out' ? '-' : ''}{formatCurrency(movement.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {lastClosedSession && lastClosedReport && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-[var(--primary)]" />
            <h2 className="text-lg font-bold">Reporte de último cierre</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-600">Cierre</p>
              <p className="text-sm font-semibold">
                {lastClosedSession.closedAt
                  ? format(new Date(lastClosedSession.closedAt), "d MMM yyyy, HH:mm", { locale: es })
                  : 'Sin cierre'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Esperado</p>
              <p className="text-sm font-semibold">{formatCurrency(lastClosedSession.expectedCash || lastClosedReport.expectedCash)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Contado</p>
              <p className="text-sm font-semibold">{formatCurrency(lastClosedSession.countedCash || 0)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Diferencia</p>
              <p className={`text-sm font-semibold ${(lastClosedSession.difference || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatCurrency(lastClosedSession.difference || 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Ventas totales</p>
              <p className="text-sm font-semibold">{formatCurrency(lastClosedReport.salesTotal)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Ventas efectivo</p>
              <p className="text-sm font-semibold">{formatCurrency(lastClosedReport.cashSalesTotal)}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
