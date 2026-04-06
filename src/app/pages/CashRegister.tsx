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
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, CheckCircle2, FileText, Lock, Unlock, Wallet } from 'lucide-react';

const roundToHundred = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / 100) * 100;
};

const formatCurrency = (value: number) => `$${roundToHundred(value).toLocaleString('es-CO')}`;

const formatMethodLabel = (method: string) => {
  const normalized = method?.toLowerCase?.() || 'otro';
  const map: Record<string, string> = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    transferencia: 'Transferencia',
    nequi: 'Nequi',
    daviplata: 'Daviplata',
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
    const amount = roundToHundred(parseFloat(openingCash) || 0);
    const ok = await openCashSession(amount);
    if (ok) {
      setOpeningCash('');
    }
  };

  const handleMovement = async () => {
    const amount = roundToHundred(parseFloat(movementAmount) || 0);
    const movement = await addCashMovement(movementType, amount, movementReason);
    if (movement) {
      setMovementAmount('');
      setMovementReason('');
    }
  };

  const handleClose = async () => {
    const amount = roundToHundred(parseFloat(countedCash) || 0);
    const closed = await closeCashSession(amount);
    if (closed) {
      setCountedCash('');
      setLastClosedId(closed.id);
    }
  };

  const countedPreview = roundToHundred(parseFloat(countedCash) || 0);
  const differencePreview = activeReport ? roundToHundred(countedPreview - activeReport.expectedCash) : 0;
  const manualFlowTotal = activeReport
    ? roundToHundred(activeReport.cashInTotal - activeReport.cashOutTotal - activeReport.cashReturnTotal)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Caja</h1>
          <p className="text-gray-600">Control de apertura, movimientos y cierre</p>
        </div>
        <div
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${
            currentCashSession
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-amber-100 text-amber-700'
          }`}
        >
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-emerald-200 bg-emerald-50/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Ventas sesión</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{formatCurrency(activeReport.salesTotal)}</p>
            <p className="mt-1 text-xs text-emerald-700/80">Incluye todos los métodos de pago</p>
          </Card>

          <Card className="border-blue-200 bg-blue-50/70 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Ventas en efectivo</p>
            <p className="mt-1 text-2xl font-bold text-blue-700">{formatCurrency(activeReport.cashSalesTotal)}</p>
            <p className="mt-1 text-xs text-blue-700/80">Base para el efectivo esperado</p>
          </Card>

          <Card className="border-violet-200 bg-violet-50/70 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-violet-700">Efectivo esperado</p>
            <p className="mt-1 text-2xl font-bold text-violet-700">{formatCurrency(activeReport.expectedCash)}</p>
            <p className="mt-1 text-xs text-violet-700/80">Resultado de apertura + operaciones</p>
          </Card>

          <Card className="border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-600">Flujo manual neto</p>
            <p className={`mt-1 text-2xl font-bold ${manualFlowTotal >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {formatCurrency(manualFlowTotal)}
            </p>
            <p className="mt-1 text-xs text-slate-600">Ingresos - retiros - devoluciones</p>
          </Card>
        </div>
      )}

      {currentCashSession && activeReport && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="p-6 lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-[var(--primary)]" />
              <h2 className="text-lg font-bold">Resumen de sesión activa</h2>
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
                <p className="text-xs text-gray-600">Ventas totales de la sesión</p>
                <p className="text-lg font-semibold text-[#2ECC71]">{formatCurrency(activeReport.salesTotal)}</p>
                <p className="text-sm text-gray-600">Efectivo: {formatCurrency(activeReport.cashSalesTotal)}</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary">
                <p className="text-xs text-gray-600">Devoluciones (efectivo)</p>
                <p className="text-lg font-semibold text-red-600">{formatCurrency(activeReport.cashReturnTotal)}</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary">
                <p className="text-xs text-gray-600">Ingresos de caja</p>
                <p className="text-lg font-semibold">{formatCurrency(activeReport.cashInTotal)}</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary">
                <p className="text-xs text-gray-600">Retiros de caja</p>
                <p className="text-lg font-semibold text-red-600">{formatCurrency(activeReport.cashOutTotal)}</p>
                <p className="text-xs text-gray-500">No incluye devoluciones</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary md:col-span-2">
                <p className="text-xs text-gray-600">Dinero esperado</p>
                <p className="text-2xl font-bold text-[var(--primary)]">{formatCurrency(activeReport.expectedCash)}</p>
                <p className="text-xs text-gray-500">
                  Base inicial + ventas en efectivo - devoluciones + ingresos - retiros
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <ArrowUpCircle className="w-5 h-5 text-emerald-600" />
              <h2 className="text-lg font-bold">Movimientos</h2>
            </div>
            <p className="mb-4 text-sm text-gray-600">
              Registra ingresos o retiros manuales para mantener el esperado de caja actualizado.
            </p>
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
            <div className="mb-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
              <p className="text-xs text-slate-600">Esperado actual</p>
              <p className="text-lg font-bold text-slate-800">{formatCurrency(activeReport.expectedCash)}</p>
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
                <p className="mt-1 text-xs text-gray-500">
                  {differencePreview > 0 && 'Hay sobrante frente al esperado.'}
                  {differencePreview < 0 && 'Hay faltante frente al esperado.'}
                  {differencePreview === 0 && 'El conteo coincide con el esperado.'}
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
                <div key={method} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-700">{formatMethodLabel(method)}</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(total)}</span>
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
          <p className="mb-4 text-sm text-gray-600">Se muestran los últimos 10 movimientos manuales de la sesión actual.</p>
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
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                            movement.type === 'cash_in'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {movement.type === 'cash_in' ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                          {movement.type === 'cash_in' ? 'Ingreso' : 'Retiro'}
                        </span>
                      </td>
                      <td className="p-3">{movement.reason || 'Sin motivo'}</td>
                      <td className={`p-3 text-right font-semibold ${movement.type === 'cash_in' ? 'text-emerald-700' : 'text-red-700'}`}>
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
              <p className="text-xs text-gray-600">Ventas en efectivo</p>
              <p className="text-sm font-semibold">{formatCurrency(lastClosedReport.cashSalesTotal)}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
