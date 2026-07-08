// Control de caja: apertura, movimientos y cierre.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { usePOS } from '../context/POSContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, CheckCircle2, FileText, Lock, Unlock, Wallet } from 'lucide-react';

const CASH_BILL_DENOMINATIONS = [1000, 2000, 5000, 10000, 20000, 50000, 100000] as const;
const CASH_COIN_DENOMINATIONS = [50, 100, 200, 500, 1000] as const;

const buildCountInputState = (denominations: readonly number[]) =>
  Object.fromEntries(denominations.map((denomination) => [String(denomination), ''])) as Record<string, string>;

const parseCountInput = (value: string | undefined): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
};

const roundToHundred = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / 100) * 100;
};

const formatCurrency = (value: number) => `$${roundToHundred(value).toLocaleString('es-CO')}`;
const formatDenomination = (value: number) => `$${Math.trunc(value).toLocaleString('es-CO')}`;
const formatExactCurrency = (value: number) => `$${Math.round(value).toLocaleString('es-CO')}`;

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

const getSessionStatusMeta = (status?: string | null) => {
  if (status === 'open') {
    return { label: 'Sesión abierta', className: 'bg-emerald-100 text-emerald-700' };
  }
  if (status === 'counting') {
    return { label: 'En arqueo', className: 'bg-blue-100 text-blue-700' };
  }
  return { label: 'Sin sesión activa', className: 'bg-amber-100 text-amber-700' };
};

const getMovementCategoryLabel = (movement: { category?: string; type: 'cash_in' | 'cash_out'; reason?: string }) => {
  const category = movement.category;
  if (category === 'opening') return 'Apertura';
  if (category === 'sale') return 'Venta';
  if (category === 'manual_income') return 'Ingreso manual';
  if (category === 'manual_expense') return 'Egreso manual';
  if (category === 'return') return 'Devolución';
  if (category === 'credit_payment') return 'Abono fiado';
  if (category === 'adjustment') return 'Ajuste';
  if (movement.type === 'cash_out' && movement.reason?.startsWith('Devolución venta ')) return 'Devolución';
  return movement.type === 'cash_in' ? 'Ingreso' : 'Retiro';
};

const getClosedStatusLabel = (status: string) => {
  if (status === 'closed_with_difference') return 'Cerrada con diferencia';
  if (status === 'closed') return 'Cerrada exacta';
  return 'Cerrada';
};

export function CashRegister() {
  const {
    currentCashSession,
    cashSessions,
    cashMovements,
    openCashSession,
    startCashCounting,
    cancelCashCounting,
    closeCashSession,
    clearSelectedCashReports,
    verifyAdminPasswordForCriticalAction,
    addCashMovement,
    getCashSessionReport,
    storeConfig,
  } = usePOS();

  const [openingCash, setOpeningCash] = useState('');
  const [openingNote, setOpeningNote] = useState('');
  const [movementType, setMovementType] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [movementPaymentMethod, setMovementPaymentMethod] = useState<'efectivo' | 'tarjeta' | 'transferencia' | 'nequi' | 'daviplata' | 'otro'>('efectivo');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const [movementReference, setMovementReference] = useState('');
  const [billCounts, setBillCounts] = useState<Record<string, string>>(() => buildCountInputState(CASH_BILL_DENOMINATIONS));
  const [coinCounts, setCoinCounts] = useState<Record<string, string>>(() => buildCountInputState(CASH_COIN_DENOMINATIONS));
  const [closingNote, setClosingNote] = useState('');
  const [lastClosedId, setLastClosedId] = useState<string | null>(null);
  const [showCloseReportDialog, setShowCloseReportDialog] = useState(false);
  const [selectedClosedSessionId, setSelectedClosedSessionId] = useState<string | null>(null);
  const [selectedClosedSessionIds, setSelectedClosedSessionIds] = useState<string[]>([]);
  const [showDeleteSelectedDialog, setShowDeleteSelectedDialog] = useState(false);
  const [showCancelCountingDialog, setShowCancelCountingDialog] = useState(false);
  const [isDeletingSelectedReports, setIsDeletingSelectedReports] = useState(false);
  const [deleteConfirmationPassword, setDeleteConfirmationPassword] = useState('');
  const [showAllActiveMovements, setShowAllActiveMovements] = useState(false);
  const [visibleClosedSessionsCount, setVisibleClosedSessionsCount] = useState(20);
  const countInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const closingNoteRef = useRef<HTMLInputElement | null>(null);

  const currentStatus = currentCashSession?.status;
  const isOpen = currentStatus === 'open';
  const isCounting = currentStatus === 'counting';

  const activeReport = useMemo(
    () => currentCashSession ? getCashSessionReport(currentCashSession.id) : null,
    [currentCashSession, getCashSessionReport],
  );
  const activeMovements = useMemo(
    () => currentCashSession
      ? cashMovements.filter((movement) => movement.cashSessionId === currentCashSession.id)
      : [],
    [cashMovements, currentCashSession],
  );
  const activeMovementsCollapsedLimit = 5;
  const latestActiveMovements = useMemo(
    () => activeMovements.slice(-10).reverse(),
    [activeMovements],
  );
  const visibleActiveMovements = showAllActiveMovements
    ? latestActiveMovements
    : latestActiveMovements.slice(0, activeMovementsCollapsedLimit);
  const hiddenActiveMovementsCount = Math.max(0, latestActiveMovements.length - visibleActiveMovements.length);

  const closedSessions = useMemo(() => cashSessions
    .filter((session) => session.status === 'closed' || session.status === 'closed_with_difference')
    .sort((a, b) => new Date(b.closedAt || b.openedAt).getTime() - new Date(a.closedAt || a.openedAt).getTime()), [cashSessions]);
  const visibleClosedSessions = useMemo(
    () => closedSessions.slice(0, visibleClosedSessionsCount),
    [closedSessions, visibleClosedSessionsCount],
  );

  const lastClosedSession = useMemo(() => {
    if (lastClosedId) {
      return cashSessions.find(session => session.id === lastClosedId) ?? null;
    }
    const closedSessions = cashSessions.filter(
      (session) => session.status === 'closed' || session.status === 'closed_with_difference'
    );
    return closedSessions.sort((a, b) => new Date(b.closedAt || b.openedAt).getTime() - new Date(a.closedAt || a.openedAt).getTime())[0] ?? null;
  }, [cashSessions, lastClosedId]);

  const lastClosedReport = useMemo(
    () => lastClosedSession ? getCashSessionReport(lastClosedSession.id) : null,
    [lastClosedSession, getCashSessionReport],
  );

  const selectedClosedSession = useMemo(() => {
    if (selectedClosedSessionId) {
      return closedSessions.find((session) => session.id === selectedClosedSessionId) ?? null;
    }
    return lastClosedSession;
  }, [closedSessions, selectedClosedSessionId, lastClosedSession]);

  const selectedClosedReport = useMemo(
    () => selectedClosedSession ? getCashSessionReport(selectedClosedSession.id) : null,
    [selectedClosedSession, getCashSessionReport],
  );

  const selectedClosedMovements = useMemo(() => {
    if (!selectedClosedSession) return [];
    return cashMovements
      .filter((movement) => movement.cashSessionId === selectedClosedSession.id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [cashMovements, selectedClosedSession]);

  const selectedClosedSet = useMemo(() => new Set(selectedClosedSessionIds), [selectedClosedSessionIds]);
  const allClosedSelected = closedSessions.length > 0 && selectedClosedSessionIds.length === closedSessions.length;
  const selectedClosedCount = selectedClosedSessionIds.length;
  const isDeleteConfirmationValid = deleteConfirmationPassword.trim().length > 0;

  useEffect(() => {
    const validIds = new Set(closedSessions.map((session) => session.id));
    setSelectedClosedSessionIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [closedSessions]);

  const openCloseReport = (sessionId: string) => {
    setSelectedClosedSessionId(sessionId);
    setShowCloseReportDialog(true);
  };

  const toggleClosedSessionSelection = (sessionId: string, checked: boolean) => {
    setSelectedClosedSessionIds((prev) => {
      if (checked) {
        return prev.includes(sessionId) ? prev : [...prev, sessionId];
      }
      return prev.filter((id) => id !== sessionId);
    });
  };

  const toggleSelectAllClosedSessions = (checked: boolean) => {
    if (checked) {
      setSelectedClosedSessionIds(closedSessions.map((session) => session.id));
      return;
    }
    setSelectedClosedSessionIds([]);
  };

  const handleDeleteSelectedReports = async () => {
    if (isDeletingSelectedReports) return;
    setIsDeletingSelectedReports(true);

    const isPasswordValid = await verifyAdminPasswordForCriticalAction(deleteConfirmationPassword);
    if (!isPasswordValid) {
      setIsDeletingSelectedReports(false);
      return;
    }

    const ok = await clearSelectedCashReports(selectedClosedSessionIds);
    if (ok) {
      if (selectedClosedSessionId && selectedClosedSet.has(selectedClosedSessionId)) {
        setShowCloseReportDialog(false);
        setSelectedClosedSessionId(null);
      }
      if (lastClosedId && selectedClosedSet.has(lastClosedId)) {
        setLastClosedId(null);
      }
      setSelectedClosedSessionIds([]);
      setDeleteConfirmationPassword('');
      setShowDeleteSelectedDialog(false);
    }
    setIsDeletingSelectedReports(false);
  };

  const handleOpen = async () => {
    const amount = roundToHundred(parseFloat(openingCash) || 0);
    const ok = await openCashSession(amount, openingNote);
    if (ok) {
      setOpeningCash('');
      setOpeningNote('');
    }
  };

  const handleMovement = async () => {
    const amount = roundToHundred(parseFloat(movementAmount) || 0);
    const movement = await addCashMovement(movementType, amount, movementReason, {
      category: movementType === 'cash_in' ? 'manual_income' : 'manual_expense',
      paymentMethod: movementPaymentMethod,
      referenceType: 'manual',
      metadata: {
        reference: movementReference?.trim() || null,
      },
    });
    if (movement) {
      setMovementAmount('');
      setMovementReason('');
      setMovementReference('');
      setMovementPaymentMethod('efectivo');
    }
  };

  const handleStartCounting = async () => {
    await startCashCounting();
  };

  const handleCountInputKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();

    const nextInput = countInputRefs.current[index + 1];
    if (nextInput) {
      nextInput.focus();
      return;
    }

    closingNoteRef.current?.focus();
  };

  const handleCancelCounting = async () => {
    const cancelled = await cancelCashCounting();
    if (cancelled) {
      setShowCancelCountingDialog(false);
    }
  };

  const billRows = useMemo(() => CASH_BILL_DENOMINATIONS.map((denomination) => {
    const quantity = parseCountInput(billCounts[String(denomination)]);
    return {
      denomination,
      quantity,
      subtotal: denomination * quantity,
    };
  }), [billCounts]);

  const coinRows = useMemo(() => CASH_COIN_DENOMINATIONS.map((denomination) => {
    const quantity = parseCountInput(coinCounts[String(denomination)]);
    return {
      denomination,
      quantity,
      subtotal: denomination * quantity,
    };
  }), [coinCounts]);

  const billsTotal = billRows.reduce((sum, row) => sum + row.subtotal, 0);
  const coinsTotal = coinRows.reduce((sum, row) => sum + row.subtotal, 0);
  const countedPreview = billsTotal + coinsTotal;

  const handleClose = async () => {
    const bills = Object.fromEntries(
      billRows.map((row) => [String(row.denomination), row.quantity])
    );
    const coins = Object.fromEntries(
      coinRows.map((row) => [String(row.denomination), row.quantity])
    );
    const closed = await closeCashSession(countedPreview, closingNote, {
      bills,
      coins,
      billsTotal,
      coinsTotal,
      total: countedPreview,
      currency: 'COP',
    });
    if (closed) {
      setBillCounts(buildCountInputState(CASH_BILL_DENOMINATIONS));
      setCoinCounts(buildCountInputState(CASH_COIN_DENOMINATIONS));
      setClosingNote('');
      setLastClosedId(closed.id);
    }
  };

  const differencePreview = activeReport ? roundToHundred(countedPreview - activeReport.expectedCash) : 0;
  const manualFlowTotal = activeReport
    ? roundToHundred(activeReport.cashInTotal - activeReport.cashOutTotal - activeReport.cashReturnTotal)
    : 0;
  const statusMeta = getSessionStatusMeta(currentStatus);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Caja</h1>
          <p className="text-gray-600">Control de apertura, movimientos y cierre</p>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${statusMeta.className}`}>
          <Wallet className="w-4 h-4" />
          {statusMeta.label}
        </div>
      </div>

      {!currentCashSession && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Unlock className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold">Apertura de Caja</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
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
            <div>
              <Label>Observación (opcional)</Label>
              <Input
                value={openingNote}
                onChange={(e) => setOpeningNote(e.target.value)}
                placeholder="Ej: turno mañana"
                className="h-12"
              />
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
            {isCounting && (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Caja en arqueo: los movimientos manuales quedan bloqueados hasta finalizar el cierre.
              </div>
            )}
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
                <Label>Medio de pago</Label>
                <Select value={movementPaymentMethod} onValueChange={(value) => setMovementPaymentMethod(value as 'efectivo' | 'tarjeta' | 'transferencia' | 'nequi' | 'daviplata' | 'otro')}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="nequi">Nequi</SelectItem>
                    <SelectItem value="daviplata">Daviplata</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
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
                <Label>Referencia (opcional)</Label>
                <Input
                  value={movementReference}
                  onChange={(e) => setMovementReference(e.target.value)}
                  placeholder="Ej: comprobante, recibo o consecutivo"
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
              <Button onClick={handleMovement} className="w-full h-11 bg-[#2ECC71] hover:bg-[#27AE60]" disabled={!isOpen}>
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
              {isOpen && (
                <Button className="h-11 w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={handleStartCounting}>
                  Iniciar arqueo
                </Button>
              )}
              {isCounting && (
                <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-blue-700">
                    Arqueo en curso: ingresa la cantidad por denominación para calcular el total contado.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCancelCountingDialog(true)}
                    className="h-8 border-blue-300 text-blue-700 hover:bg-blue-100"
                  >
                    Salir del arqueo
                  </Button>
                </div>
              )}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-600">Total contado (billetes + monedas)</p>
                <p className="text-lg font-bold text-slate-800">{formatExactCurrency(countedPreview)}</p>
              </div>
              {isCounting && (
                <div className="flex flex-wrap gap-4">
                  <div className="min-w-[260px] flex-1 rounded-lg border border-slate-200 p-3">
                    <p className="mb-2 text-sm font-semibold text-slate-700">Billetes</p>
                    <div className="space-y-2">
                      {billRows.map((row, index) => (
                        <div key={row.denomination} className="grid grid-cols-[68px_84px_minmax(80px,1fr)] items-center gap-2 sm:grid-cols-[88px_96px_minmax(96px,1fr)] sm:gap-3">
                          <span className="whitespace-nowrap text-sm text-slate-700 tabular-nums">{formatDenomination(row.denomination)}</span>
                          <Input
                            ref={(element) => {
                              countInputRefs.current[index] = element;
                            }}
                            type="number"
                            min="0"
                            step="1"
                            value={billCounts[String(row.denomination)]}
                            onChange={(event) => setBillCounts((prev) => ({
                              ...prev,
                              [String(row.denomination)]: event.target.value,
                            }))}
                            onKeyDown={(event) => handleCountInputKeyDown(event, index)}
                            placeholder="0"
                            className="h-11 w-full text-center text-base font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                          <span className="whitespace-nowrap text-right text-xs font-medium text-slate-800 tabular-nums sm:text-sm">{formatExactCurrency(row.subtotal)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 border-t border-slate-200 pt-2 text-sm font-semibold text-slate-800">
                      Total billetes: {formatExactCurrency(billsTotal)}
                    </div>
                  </div>

                  <div className="min-w-[320px] flex-[1.18] rounded-lg border border-slate-200 p-3">
                    <p className="mb-2 text-sm font-semibold text-slate-700">Monedas</p>
                    <div className="space-y-2">
                      {coinRows.map((row, index) => (
                        <div key={row.denomination} className="grid grid-cols-[68px_84px_minmax(80px,1fr)] items-center gap-2 sm:grid-cols-[88px_96px_minmax(96px,1fr)] sm:gap-3">
                          <span className="whitespace-nowrap text-sm text-slate-700 tabular-nums">{formatDenomination(row.denomination)}</span>
                          <Input
                            ref={(element) => {
                              countInputRefs.current[CASH_BILL_DENOMINATIONS.length + index] = element;
                            }}
                            type="number"
                            min="0"
                            step="1"
                            value={coinCounts[String(row.denomination)]}
                            onChange={(event) => setCoinCounts((prev) => ({
                              ...prev,
                              [String(row.denomination)]: event.target.value,
                            }))}
                            onKeyDown={(event) => handleCountInputKeyDown(event, CASH_BILL_DENOMINATIONS.length + index)}
                            placeholder="0"
                            className="h-11 w-full text-center text-base font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                          <span className="whitespace-nowrap text-right text-xs font-medium text-slate-800 tabular-nums sm:text-sm">{formatExactCurrency(row.subtotal)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 border-t border-slate-200 pt-2 text-sm font-semibold text-slate-800">
                      Total monedas: {formatExactCurrency(coinsTotal)}
                    </div>
                  </div>
                </div>
              )}
              <div>
                <Label>Observación de cierre (opcional)</Label>
                <Input
                  ref={closingNoteRef}
                  value={closingNote}
                  onChange={(e) => setClosingNote(e.target.value)}
                  placeholder="Ej: faltante por cambio no registrado"
                  className="h-12"
                />
              </div>
              <div className="p-4 rounded-lg bg-secondary">
                <p className="text-xs text-gray-600">Diferencia estimada</p>
                <p className={`text-xl font-bold ${differencePreview >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatExactCurrency(differencePreview)}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {differencePreview > 0 && 'Hay sobrante frente al esperado.'}
                  {differencePreview < 0 && 'Hay faltante frente al esperado.'}
                  {differencePreview === 0 && 'El conteo coincide con el esperado.'}
                </p>
              </div>
              <Button className="h-12 bg-[#0f172a] hover:bg-[#111827] text-white" onClick={handleClose} disabled={!isCounting}>
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
          <p className="mb-4 text-sm text-gray-600">
            Mostrando {visibleActiveMovements.length} de {latestActiveMovements.length} movimientos de la sesión actual.
          </p>
          {latestActiveMovements.length === 0 ? (
            <p className="text-sm text-gray-500">No hay movimientos registrados en esta sesión.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary border-b">
                  <tr>
                    <th className="text-left p-3">Fecha</th>
                    <th className="text-left p-3">Categoría</th>
                    <th className="text-left p-3">Detalle</th>
                    <th className="text-right p-3">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleActiveMovements.map((movement) => (
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
                            {getMovementCategoryLabel(movement)}
                        </span>
                      </td>
                        <td className="p-3">
                          <p>{movement.reason || 'Sin motivo'}</p>
                          <div className="text-xs text-gray-500">
                            {movement.paymentMethod ? `Medio: ${formatMethodLabel(movement.paymentMethod)}` : 'Medio: n/a'}
                            {typeof movement.metadata?.reference === 'string' && movement.metadata.reference.trim() !== ''
                              ? ` | Ref: ${movement.metadata.reference}`
                              : ''}
                          </div>
                        </td>
                      <td className={`p-3 text-right font-semibold ${movement.type === 'cash_in' ? 'text-emerald-700' : 'text-red-700'}`}>
                        {movement.type === 'cash_out' ? '-' : ''}{formatCurrency(movement.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!showAllActiveMovements && hiddenActiveMovementsCount > 0 ? (
            <div className="flex justify-center pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAllActiveMovements(true)}
                className="rounded-full"
              >
                <ArrowDownCircle className="w-4 h-4 mr-1" />
                Ver listado completo
              </Button>
            </div>
          ) : null}
          {!showAllActiveMovements && hiddenActiveMovementsCount > 0 ? (
            <p className="text-sm text-gray-600">
              {hiddenActiveMovementsCount} movimientos ocultos. Usa "Ver listado completo" para desplegarlos.
            </p>
          ) : null}
        </Card>
      )}

      {showAllActiveMovements && latestActiveMovements.length > activeMovementsCollapsedLimit ? (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAllActiveMovements(false)}
            className="rounded-full bg-white/95 shadow-lg backdrop-blur"
          >
            <ArrowUpCircle className="w-4 h-4 mr-1" />
            Ocultar listado
          </Button>
        </div>
      ) : null}

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
            {lastClosedSession.countedCashBreakdown && (
              <>
                <div>
                  <p className="text-xs text-gray-600">Billetes contados</p>
                  <p className="text-sm font-semibold">{formatCurrency(lastClosedSession.countedCashBreakdown.billsTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Monedas contadas</p>
                  <p className="text-sm font-semibold">{formatCurrency(lastClosedSession.countedCashBreakdown.coinsTotal)}</p>
                </div>
              </>
            )}
          </div>
          <div className="mt-4">
            <Button variant="outline" onClick={() => openCloseReport(lastClosedSession.id)}>
              Ver tirilla detallada
            </Button>
          </div>
        </Card>
      )}

      {closedSessions.length > 0 && (
        <Card className="p-6">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[var(--primary)]" />
              <h2 className="text-lg font-bold">Historial de cierres de caja</h2>
            </div>

            {storeConfig.userRole === 'admin' && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleSelectAllClosedSessions(!allClosedSelected)}
                >
                  {allClosedSelected ? 'Quitar selección' : 'Seleccionar todos'}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={selectedClosedCount === 0 || isDeletingSelectedReports}
                  onClick={() => setShowDeleteSelectedDialog(true)}
                >
                  {isDeletingSelectedReports
                    ? 'Eliminando...'
                    : `Eliminar seleccionados (${selectedClosedCount})`}
                </Button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary border-b">
                <tr>
                  {storeConfig.userRole === 'admin' && (
                    <th className="p-3 text-center">
                      <Checkbox
                        checked={allClosedSelected ? true : selectedClosedCount > 0 ? 'indeterminate' : false}
                        onCheckedChange={(checked) => toggleSelectAllClosedSessions(checked === true)}
                        aria-label="Seleccionar todos los cierres"
                      />
                    </th>
                  )}
                  <th className="text-left p-3">Fecha cierre</th>
                  <th className="text-right p-3">Esperado</th>
                  <th className="text-right p-3">Contado</th>
                  <th className="text-right p-3">Diferencia</th>
                  <th className="text-left p-3">Estado</th>
                  <th className="text-right p-3">Acción</th>
                </tr>
              </thead>
              <tbody>
                {visibleClosedSessions.map((session) => {
                  const report = getCashSessionReport(session.id);
                  const expected = session.expectedCash ?? report.expectedCash;
                  const counted = session.countedCash ?? 0;
                  const difference = session.difference ?? roundToHundred(counted - expected);

                  return (
                    <tr key={session.id} className="border-b">
                      {storeConfig.userRole === 'admin' && (
                        <td className="p-3 text-center">
                          <Checkbox
                            checked={selectedClosedSet.has(session.id)}
                            onCheckedChange={(checked) => toggleClosedSessionSelection(session.id, checked === true)}
                            aria-label={`Seleccionar cierre ${session.id}`}
                          />
                        </td>
                      )}
                      <td className="p-3">
                        {session.closedAt
                          ? format(new Date(session.closedAt), "d MMM yyyy, HH:mm", { locale: es })
                          : format(new Date(session.openedAt), "d MMM yyyy, HH:mm", { locale: es })}
                      </td>
                      <td className="p-3 text-right font-medium">{formatCurrency(expected)}</td>
                      <td className="p-3 text-right font-medium">{formatCurrency(counted)}</td>
                      <td className={`p-3 text-right font-semibold ${difference >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatCurrency(difference)}
                      </td>
                      <td className="p-3">{getClosedStatusLabel(session.status)}</td>
                      <td className="p-3 text-right">
                        <Button variant="outline" size="sm" onClick={() => openCloseReport(session.id)}>
                          Ver tirilla
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visibleClosedSessions.length < closedSessions.length && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => setVisibleClosedSessionsCount((current) => current + 20)}
              >
                Mostrar 20 cierres más ({closedSessions.length - visibleClosedSessions.length} pendientes)
              </Button>
            </div>
          )}
        </Card>
      )}

      <Dialog open={showCloseReportDialog && !!selectedClosedSession && !!selectedClosedReport} onOpenChange={setShowCloseReportDialog}>
        <DialogContent className="w-[96vw] max-w-[96vw] sm:max-w-5xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Tirilla detallada de cierre</DialogTitle>
          </DialogHeader>

          {selectedClosedSession && selectedClosedReport && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Apertura</p>
                  <p className="text-sm font-semibold">
                    {format(new Date(selectedClosedSession.openedAt), "d MMM yyyy, HH:mm", { locale: es })}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">Base: {formatCurrency(selectedClosedSession.openingCash)}</p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Cierre</p>
                  <p className="text-sm font-semibold">
                    {selectedClosedSession.closedAt
                      ? format(new Date(selectedClosedSession.closedAt), "d MMM yyyy, HH:mm", { locale: es })
                      : 'Sin fecha de cierre'}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">Estado: {getClosedStatusLabel(selectedClosedSession.status)}</p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Sesión</p>
                  <p className="text-sm font-semibold break-all">{selectedClosedSession.id}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
                  <p className="text-xs text-violet-700">Esperado</p>
                  <p className="text-lg font-bold text-violet-700">{formatCurrency(selectedClosedSession.expectedCash ?? selectedClosedReport.expectedCash)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-600">Contado</p>
                  <p className="text-lg font-bold text-slate-800">{formatCurrency(selectedClosedSession.countedCash ?? 0)}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs text-emerald-700">Ventas totales</p>
                  <p className="text-lg font-bold text-emerald-700">{formatCurrency(selectedClosedReport.salesTotal)}</p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs text-blue-700">Ventas efectivo</p>
                  <p className="text-lg font-bold text-blue-700">{formatCurrency(selectedClosedReport.cashSalesTotal)}</p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-700">Ventas por método</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.keys(selectedClosedReport.salesByMethod).length === 0 && (
                    <p className="text-sm text-gray-500">No hubo ventas registradas en esta sesión.</p>
                  )}
                  {Object.entries(selectedClosedReport.salesByMethod).map(([method, total]) => (
                    <div key={method} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
                      <span className="text-sm text-slate-700">{formatMethodLabel(method)}</span>
                      <span className="text-sm font-semibold text-slate-900">{formatCurrency(total)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {selectedClosedSession.countedCashBreakdown && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="mb-2 text-sm font-semibold text-slate-700">Detalle de billetes</p>
                    <div className="space-y-2">
                      {CASH_BILL_DENOMINATIONS
                        .filter((denomination) => (selectedClosedSession.countedCashBreakdown?.bills[String(denomination)] ?? 0) > 0)
                        .map((denomination) => {
                          const qty = selectedClosedSession.countedCashBreakdown?.bills[String(denomination)] ?? 0;
                          const subtotal = denomination * qty;
                          return (
                            <div key={denomination} className="grid grid-cols-[110px_1fr_120px] items-center gap-2 text-sm">
                              <span>{formatDenomination(denomination)}</span>
                              <span>Cantidad: {qty}</span>
                              <span className="text-right font-semibold">{formatExactCurrency(subtotal)}</span>
                            </div>
                          );
                        })}
                      {CASH_BILL_DENOMINATIONS.every((denomination) => (selectedClosedSession.countedCashBreakdown?.bills[String(denomination)] ?? 0) === 0) && (
                        <p className="text-sm text-gray-500">No se registraron billetes en el desglose.</p>
                      )}
                    </div>
                    <div className="mt-3 border-t border-slate-200 pt-2 text-sm font-semibold text-slate-800">
                      Total billetes: {formatExactCurrency(selectedClosedSession.countedCashBreakdown.billsTotal)}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="mb-2 text-sm font-semibold text-slate-700">Detalle de monedas</p>
                    <div className="space-y-2">
                      {CASH_COIN_DENOMINATIONS
                        .filter((denomination) => (selectedClosedSession.countedCashBreakdown?.coins[String(denomination)] ?? 0) > 0)
                        .map((denomination) => {
                          const qty = selectedClosedSession.countedCashBreakdown?.coins[String(denomination)] ?? 0;
                          const subtotal = denomination * qty;
                          return (
                            <div key={denomination} className="grid grid-cols-[110px_1fr_120px] items-center gap-2 text-sm">
                              <span>{formatDenomination(denomination)}</span>
                              <span>Cantidad: {qty}</span>
                              <span className="text-right font-semibold">{formatExactCurrency(subtotal)}</span>
                            </div>
                          );
                        })}
                      {CASH_COIN_DENOMINATIONS.every((denomination) => (selectedClosedSession.countedCashBreakdown?.coins[String(denomination)] ?? 0) === 0) && (
                        <p className="text-sm text-gray-500">No se registraron monedas en el desglose.</p>
                      )}
                    </div>
                    <div className="mt-3 border-t border-slate-200 pt-2 text-sm font-semibold text-slate-800">
                      Total monedas: {formatExactCurrency(selectedClosedSession.countedCashBreakdown.coinsTotal)}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Nota de apertura</p>
                  <p className="text-sm text-slate-700">{selectedClosedSession.openingNote || 'Sin observación'}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Nota de cierre</p>
                  <p className="text-sm text-slate-700">{selectedClosedSession.closingNote || 'Sin observación'}</p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-700">Movimientos de caja de la sesión</p>
                {selectedClosedMovements.length === 0 ? (
                  <p className="text-sm text-gray-500">No hay movimientos registrados para esta sesión.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary border-b">
                        <tr>
                          <th className="text-left p-2">Fecha</th>
                          <th className="text-left p-2">Categoría</th>
                          <th className="text-left p-2">Detalle</th>
                          <th className="text-right p-2">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedClosedMovements.map((movement) => (
                          <tr key={movement.id} className="border-b">
                            <td className="p-2">{format(new Date(movement.date), "d MMM yyyy, HH:mm", { locale: es })}</td>
                            <td className="p-2">{getMovementCategoryLabel(movement)}</td>
                            <td className="p-2">
                              {movement.reason || 'Sin motivo'}
                              <div className="text-xs text-gray-500">
                                {movement.paymentMethod ? `Medio: ${formatMethodLabel(movement.paymentMethod)}` : 'Medio: n/a'}
                              </div>
                            </td>
                            <td className={`p-2 text-right font-semibold ${movement.type === 'cash_in' ? 'text-emerald-700' : 'text-red-700'}`}>
                              {movement.type === 'cash_out' ? '-' : ''}{formatCurrency(movement.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={showCancelCountingDialog}
        onOpenChange={setShowCancelCountingDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Salir del arqueo?</AlertDialogTitle>
            <AlertDialogDescription>
              Volverás la caja al estado abierta y podrás continuar con ventas normales.
              Los valores que escribiste en billetes y monedas no se guardarán para el cierre.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelCounting}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Sí, salir del arqueo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showDeleteSelectedDialog}
        onOpenChange={(open) => {
          setShowDeleteSelectedDialog(open);
          if (!open) setDeleteConfirmationPassword('');
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar reportes de caja seleccionados?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán {selectedClosedCount} reporte(s) seleccionados en el sistema y en la base de datos.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Acción crítica e irreversible. Para confirmar, ingresa tu contraseña de administrador.
          </div>

          <div className="space-y-2">
            <Label htmlFor="delete-report-confirmation">Confirmación de borrado</Label>
            <Input
              id="delete-report-confirmation"
              type="password"
              value={deleteConfirmationPassword}
              onChange={(event) => setDeleteConfirmationPassword(event.target.value)}
              placeholder="Ingresa tu contraseña"
              autoComplete="off"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingSelectedReports}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSelectedReports}
              disabled={isDeletingSelectedReports || selectedClosedCount === 0 || !isDeleteConfirmationValid}
              className="bg-[#E74C3C] hover:bg-[#C0392B]"
            >
              {isDeletingSelectedReports ? 'Eliminando...' : 'Sí, eliminar seleccionados'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
