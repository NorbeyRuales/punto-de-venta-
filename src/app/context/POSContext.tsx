// Contexto principal del POS: centraliza estado, acciones de negocio y sincronización.
import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { toast } from 'sonner';
import {
  getStoredSession,
  signInWithPassword,
  signOut,
  storeSession,
  type SupabaseSession,
} from '../../lib/supabaseClient';
import {
  bootstrapStore,
  createCategory,
  deleteCashReportsByIds,
  deleteCashReportsByStore,
  createCustomer,
  createCashMovement,
  createCashSession,
  createKardexMovementRow,
  createProduct,
  createPurchaseWithItems,
  createRechargeRow,
  createSaleDraftRow,
  createSupplierRow,
  deleteCustomerRow,
  deleteSupplierRow,
  deleteSaleDraftRow,
  fetchMyStoreMembership,
  finalizeSaleDraft,
  importLocalBackup,
  replaceLocalBackup,
  insertCustomerDebtTx,
  loadCategoriesAndProducts,
  loadCashMovements,
  loadCashSessions,
  loadCustomersWithDebt,
  loadKardexMovements,
  loadRecharges,
  loadSaleDraftsWithItems,
  loadSalesWithItems,
  loadStoreDetails,
  loadSuppliersWithPurchases,
  patchProduct,
  replaceSaleDraftItems,
  removeCategory,
  removeProduct,
  renameCategory,
  updateCashSession,
  updateSaleRow,
  updateSaleDraftRow,
  updateCustomerRow,
  updateSupplierRow,
  updateStoreDetails,
} from '../services/posSupabase';
import { DEFAULT_LOGO_PATH } from '../constants/branding';

const OFFLINE_PIN_KEY = 'pos_offline_pin_hash';
const OFFLINE_ROLE_KEY = 'pos_offline_role_default';
const OFFLINE_AUTH_KEY = 'pos_offline_auth';
const OFFLINE_DIRTY_KEY = 'pos_offline_dirty';
const OFFLINE_INVOICE_KEY = 'pos_offline_invoice_seq';
const OFFLINE_DRAFTS_KEY = 'pos_sale_drafts';
const OFFLINE_ACTIVE_DRAFT_KEY = 'pos_active_draft_id';
const OFFLINE_BACKUP_KEY = 'pos_offline_backup';
const ALLOW_AUTOMATIC_BACKUP_UPLOAD = false;

type LocalBackupPayload = {
  products: string | null;
  sales: string | null;
  customers: string | null;
  suppliers: string | null;
  kardex: string | null;
  recharges: string | null;
  cash_sessions: string | null;
  cash_movements: string | null;
  config: string | null;
} & Record<string, unknown>;

const isLocalBackupField = (value: unknown): value is string | null => value === null || typeof value === 'string';

const isLocalBackupPayload = (value: unknown): value is LocalBackupPayload => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;

  return isLocalBackupField(candidate.products)
    && isLocalBackupField(candidate.sales)
    && isLocalBackupField(candidate.customers)
    && isLocalBackupField(candidate.suppliers)
    && isLocalBackupField(candidate.kardex)
    && isLocalBackupField(candidate.recharges)
    && isLocalBackupField(candidate.cash_sessions)
    && isLocalBackupField(candidate.cash_movements)
    && isLocalBackupField(candidate.config);
};

const toNumber = (value: unknown, fallback = 0): number => {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const roundMoney = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / 100) * 100;
};

const CASH_COUNT_BILL_VALUES = [1000, 2000, 5000, 10000, 20000, 50000, 100000] as const;
const CASH_COUNT_COIN_VALUES = [50, 100, 200, 500, 1000] as const;

const toNonNegativeInteger = (value: unknown): number => {
  const normalized = Math.trunc(toNumber(value));
  return normalized > 0 ? normalized : 0;
};

const sanitizeCashDenominationMap = (
  value: unknown,
  allowedValues: readonly number[],
): Record<string, number> => {
  const source = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  const result: Record<string, number> = {};

  allowedValues.forEach((denomination) => {
    result[String(denomination)] = toNonNegativeInteger(source[String(denomination)]);
  });

  return result;
};

const sumCashDenominationMap = (
  map: Record<string, number>,
  allowedValues: readonly number[],
): number => {
  let total = 0;
  allowedValues.forEach((denomination) => {
    total += denomination * toNonNegativeInteger(map[String(denomination)]);
  });
  return total;
};

const computeLineMoney = (unitSalePrice: number, quantity: number, discountPercent: number, ivaPercent: number) => {
  const roundedUnitSalePrice = roundMoney(unitSalePrice);
  const lineSubtotal = roundMoney(roundedUnitSalePrice * quantity);
  const lineDiscount = roundMoney((lineSubtotal * discountPercent) / 100);
  const lineTotal = roundMoney(lineSubtotal - lineDiscount);
  const lineIva = roundMoney(lineTotal * (ivaPercent / (100 + ivaPercent)));
  return { roundedUnitSalePrice, lineSubtotal, lineDiscount, lineTotal, lineIva };
};

const buildCreditSaleDescription = (reference: string, items: CartItem[]): string => {
  const details = items
    .map((item) => `${item.product.name} x${item.quantity}`)
    .join(', ');
  const condensedDetails = details.length > 220 ? `${details.slice(0, 217)}...` : details;
  return `Venta fiada ${reference}: ${condensedDetails}`;
};

const uuidLike = (value?: string | null): boolean =>
  !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const resolveProductWriteErrorMessage = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return 'No se pudo guardar el producto en Supabase. No se aplicaron cambios locales.';
  }

  const raw = error.message || '';
  const normalized = raw.toLowerCase();

  if (normalized.includes('duplicate key') || normalized.includes('already exists') || normalized.includes('unique')) {
    if (normalized.includes('sku')) {
      return 'No se pudo guardar: el SKU ya existe en la base de datos para esta tienda.';
    }
    if (normalized.includes('barcode') || normalized.includes('codigo') || normalized.includes('código')) {
      return 'No se pudo guardar: el código de barras está restringido como único en la base de datos. Si usarás el mismo código para paquete y unidad, aplica la migración de códigos compartidos.';
    }
    return 'No se pudo guardar: hay un valor único duplicado (SKU o código de barras).';
  }

  if (normalized.includes('permission') || normalized.includes('rls') || normalized.includes('not allowed')) {
    return 'No se pudo guardar por permisos de acceso (RLS). Verifica sesión y tienda activa.';
  }

  if (normalized.includes('jwt') || normalized.includes('token') || normalized.includes('auth')) {
    return 'No se pudo guardar por sesión expirada. Cierra sesión e inicia nuevamente.';
  }

  return `No se pudo guardar el producto en Supabase: ${raw}`;
};

const isMissingTableError = (error: unknown, tableName: string): boolean => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  const table = tableName.toLowerCase();
  return message.includes(table)
    && (message.includes('does not exist') || message.includes('could not find the table') || message.includes('schema cache'));
};

const hashPin = async (pin: string): Promise<string> => {
  if (globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(pin);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  return pin;
};

const getNextOfflineInvoiceNumber = (): string => {
  const stored = localStorage.getItem(OFFLINE_INVOICE_KEY);
  const last = stored ? Number(stored) : 0;
  const next = Number.isFinite(last) ? last + 1 : 1;
  localStorage.setItem(OFFLINE_INVOICE_KEY, String(next));
  return `OFF-${next.toString().padStart(6, '0')}`;
};

// Tipos de datos
export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  supplierName?: string;
  costPrice: number;
  salePrice: number;
  stock: number;
  minStock: number;
  unit: string;
  isBulk: boolean;
  iva: number;
  ipuc?: number;
  unitsPerPurchase?: number;
  profitMargin?: number;
  unitPrice?: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  discount: number;
}

export type SaleDraftStatus = 'open' | 'void' | 'completed';

export interface SaleDraft {
  id: string;
  storeId?: string;
  userId?: string;
  cashSessionId?: string;
  customerId?: string;
  status: SaleDraftStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  items: CartItem[];
}

export type PaymentMethodOption = 'efectivo' | 'tarjeta' | 'transferencia' | 'nequi' | 'daviplata' | 'credito' | 'otro';
export type PaymentBreakdown = Partial<Record<PaymentMethodOption, number>>;
export type CashMovementCategory =
  | 'manual'
  | 'opening'
  | 'sale'
  | 'manual_income'
  | 'manual_expense'
  | 'return'
  | 'credit_payment'
  | 'adjustment'
  | 'other';
export type CashMovementReferenceType = 'sale' | 'cash_session' | 'customer' | 'manual' | 'system' | 'other';

export interface SalePaymentInput {
  primaryMethod: PaymentMethodOption;
  primaryAmount: number;
  secondaryMethod?: PaymentMethodOption;
  secondaryAmount?: number;
}

export interface Sale {
  id: string;
  date: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  iva: number;
  total: number;
  paymentMethod: string;
  cashReceived: number;
  change: number;
  paymentBreakdown?: PaymentBreakdown;
  creditedAmount?: number;
  customerId?: string;
  invoiceNumber?: string;
  cashSessionId?: string;
  returnedAt?: string | null;
}

const PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = ['efectivo', 'tarjeta', 'transferencia', 'nequi', 'daviplata', 'credito', 'otro'];

const sanitizePaymentBreakdown = (value: unknown): PaymentBreakdown => {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const sanitized: PaymentBreakdown = {};

  PAYMENT_METHOD_OPTIONS.forEach((method) => {
    const amount = roundMoney(toNumber(raw[method]));
    if (amount > 0) {
      sanitized[method] = amount;
    }
  });

  return sanitized;
};

const getSalePaymentBreakdown = (sale: Sale): PaymentBreakdown => {
  const normalized = sanitizePaymentBreakdown(sale.paymentBreakdown ?? {});
  if (Object.keys(normalized).length > 0) return normalized;

  const fallback: PaymentBreakdown = {};
  const normalizedMethod = sale.paymentMethod as PaymentMethodOption;
  const effectiveCash = roundMoney(Math.max(0, toNumber(sale.cashReceived) - toNumber(sale.change)));

  if (normalizedMethod === 'efectivo') {
    if (effectiveCash > 0) fallback.efectivo = effectiveCash;
    return fallback;
  }

  if (normalizedMethod === 'credito') {
    const creditAmount = roundMoney(Math.max(0, sale.creditedAmount ?? sale.total));
    if (creditAmount > 0) fallback.credito = creditAmount;
    return fallback;
  }

  const saleTotal = roundMoney(sale.total);
  if (saleTotal <= 0) return fallback;

  if (normalizedMethod === 'tarjeta' || normalizedMethod === 'transferencia' || normalizedMethod === 'nequi' || normalizedMethod === 'daviplata' || normalizedMethod === 'otro') {
    fallback[normalizedMethod] = saleTotal;
    return fallback;
  }

  fallback.otro = saleTotal;
  return fallback;
};

const getSaleCreditedAmount = (sale: Sale): number => {
  const byField = roundMoney(Math.max(0, toNumber(sale.creditedAmount)));
  if (byField > 0) return byField;
  const breakdown = getSalePaymentBreakdown(sale);
  return roundMoney(Math.max(0, toNumber(breakdown.credito)));
};

const CASH_MOVEMENT_CATEGORIES: CashMovementCategory[] = [
  'manual',
  'opening',
  'sale',
  'manual_income',
  'manual_expense',
  'return',
  'credit_payment',
  'adjustment',
  'other',
];

const isCashMovementCategory = (value: unknown): value is CashMovementCategory =>
  typeof value === 'string' && CASH_MOVEMENT_CATEGORIES.includes(value as CashMovementCategory);

const normalizeMovementCategory = (
  value: unknown,
  fallback: CashMovementCategory = 'manual',
): CashMovementCategory => (isCashMovementCategory(value) ? value : fallback);

const normalizeMovementPaymentMethod = (value: unknown): PaymentMethodOption | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toLowerCase();
  if (PAYMENT_METHOD_OPTIONS.includes(normalized as PaymentMethodOption)) {
    return normalized as PaymentMethodOption;
  }
  return undefined;
};

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  email?: string;
  nit?: string;
  points: number;
  debt: number;
  purchases: Sale[];
  debtHistory: DebtTransaction[];
}

export interface DebtTransaction {
  id: string;
  date: string;
  type: 'debt' | 'payment';
  amount: number;
  description: string;
  balance: number;
}

export interface Supplier {
  id: string;
  name: string;
  nit: string;
  phone: string;
  email?: string;
  address?: string;
  bankAccount?: string;
  bankAccounts?: string[];
  debt: number;
  purchases: Purchase[];
}

export interface Purchase {
  id: string;
  date: string;
  supplierId: string;
  items: { productId: string; quantity: number; cost: number }[];
  total: number;
  paid: boolean;
}

export type PurchasePricePolicy = 'automatic' | 'manual';

export interface KardexMovement {
  id: string;
  date: string;
  productId: string;
  productName: string;
  type: 'entry' | 'sale' | 'adjustment';
  reference: string;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  unitCost: number;
  unitSalePrice?: number;
  totalCost: number;
}

export interface RechargeTransaction {
  id: string;
  date: string;
  type: 'mobile' | 'service' | 'pin';
  provider: string;
  phoneNumber?: string;
  amount: number;
  commission: number;
  total: number;
}

export interface CashSession {
  id: string;
  storeId?: string;
  userId?: string;
  openedBy?: string;
  closedBy?: string;
  openedAt: string;
  closedAt?: string;
  openingNote?: string;
  openingCash: number;
  expectedCash?: number;
  countedCash?: number;
  countedCashBreakdown?: CashCountBreakdown;
  countedAt?: string;
  closingNote?: string;
  difference?: number;
  status: 'open' | 'closed' | 'counting' | 'closed_with_difference';
}

export interface CashCountBreakdown {
  bills: Record<string, number>;
  coins: Record<string, number>;
  billsTotal: number;
  coinsTotal: number;
  total: number;
  currency: 'COP';
}

const sanitizeCashCountBreakdown = (value: unknown): CashCountBreakdown | undefined => {
  if (!value || typeof value !== 'object') return undefined;

  const source = value as Record<string, unknown>;
  const bills = sanitizeCashDenominationMap(source.bills, CASH_COUNT_BILL_VALUES);
  const coins = sanitizeCashDenominationMap(source.coins, CASH_COUNT_COIN_VALUES);
  const billsTotal = sumCashDenominationMap(bills, CASH_COUNT_BILL_VALUES);
  const coinsTotal = sumCashDenominationMap(coins, CASH_COUNT_COIN_VALUES);
  const total = billsTotal + coinsTotal;

  return {
    bills,
    coins,
    billsTotal,
    coinsTotal,
    total,
    currency: 'COP',
  };
};

export interface CashMovement {
  id: string;
  cashSessionId: string;
  userId?: string;
  type: 'cash_in' | 'cash_out';
  amount: number;
  reason?: string;
  category?: CashMovementCategory;
  subtype?: string;
  paymentMethod?: PaymentMethodOption;
  referenceType?: CashMovementReferenceType;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  date: string;
}

export interface CashSessionReport {
  salesTotal: number;
  salesReturnedTotal: number;
  salesByMethod: Record<string, number>;
  cashSalesTotal: number;
  cashInTotal: number;
  cashOutTotal: number;
  cashReturnTotal: number;
  expectedCash: number;
}

export interface StoreConfig {
  name: string;
  nit: string;
  address: string;
  phone: string;
  email: string;
  logo?: string;
  dianResolution?: string;
  printerType: 'thermal' | 'standard';
  showIVA: boolean;
  purchasePricePolicy: PurchasePricePolicy;
  currency: string;
  userRole: 'admin' | 'cashier';
}

export interface PendingProductSyncPreview {
  canCompare: boolean;
  reason?: string;
  localTotal: number;
  remoteTotal: number;
  toCreate: number;
  toUpdate: number;
  conflicts: number;
  missingIdentifiers: number;
  duplicateLocalIdentifiers: number;
  sampleConflicts: string[];
}

export type ProductWriteStatus = 'remote-synced' | 'local-pending' | 'failed';
export type CategoryWriteStatus = ProductWriteStatus | 'invalid';

// Contrato público del contexto (estado + acciones expuestas a la UI).
interface POSContextType {
  // Autenticación
  isAuthenticated: boolean;
  isAuthReady: boolean;
  isOfflineMode: boolean;
  offlinePinConfigured: boolean;
  offlineDefaultRole: 'admin' | 'cashier';
  hasPendingSync: boolean;
  currentUser: { username: string; role: 'admin' | 'cashier' } | null;
  login: (username: string, password: string) => Promise<boolean>;
  loginOffline: (pin: string, role: 'admin' | 'cashier', username?: string) => Promise<boolean>;
  logout: () => void;
  verifyAdminPasswordForCriticalAction: (password: string) => Promise<boolean>;
  setOfflinePin: (pin: string) => Promise<boolean>;
  setOfflineDefaultRole: (role: 'admin' | 'cashier') => void;
  createStore: (store: { name: string; nit?: string; address?: string; phone?: string; email?: string }) => Promise<boolean>;
  syncWithSupabase: () => Promise<boolean>;
  uploadLocalBackupToSupabase: (clearExisting?: boolean) => Promise<boolean>;
  getPendingProductSyncPreview: () => Promise<PendingProductSyncPreview>;
  hasConnectedStore: boolean;
  
  // Productos
  products: Product[];
  addProduct: (product: Omit<Product, 'id'>) => Promise<ProductWriteStatus>;
  updateProduct: (id: string, product: Partial<Product>) => Promise<ProductWriteStatus>;
  deleteProduct: (id: string) => Promise<ProductWriteStatus>;
  searchProducts: (query: string) => Product[];
  categories: string[];
  addCategory: (name: string) => Promise<CategoryWriteStatus>;
  updateCategory: (oldName: string, newName: string) => Promise<CategoryWriteStatus>;
  deleteCategory: (name: string, replacementCategory?: string) => Promise<CategoryWriteStatus>;
  adjustStock: (
    productId: string,
    nextStock: number,
    options?: {
      reference?: string;
      unitCost?: number;
      unitSalePrice?: number;
      nextCostPrice?: number;
      nextIva?: number;
      nextIpuc?: number;
      nextUnitsPerPurchase?: number;
      productName?: string;
    }
  ) => Promise<boolean>;
  
  // Ventas en curso (borradores)
  saleDrafts: SaleDraft[];
  activeDraftId: string | null;
  activeDraft: SaleDraft | null;
  createSaleDraft: () => Promise<SaleDraft | null>;
  switchSaleDraft: (draftId: string) => void;
  discardSaleDraft: (draftId: string) => Promise<void>;
  setActiveDraftCustomerId: (customerId: string | null) => void;

  // Carrito (draft activo)
  cart: CartItem[];
  addToCart: (product: Product, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  updateCartDiscount: (productId: string, discount: number) => void;
  clearCart: () => void;
  cartTotal: number;
  
  // Ventas
  sales: Sale[];
  completeSale: (paymentInput: SalePaymentInput) => Promise<Sale | null>;
  getSalesToday: () => Sale[];
  getSalesInRange: (startDate: Date, endDate: Date) => Sale[];
  registerReturn: (saleId: string) => boolean;

  // Caja
  cashSessions: CashSession[];
  cashMovements: CashMovement[];
  currentCashSession: CashSession | null;
  openCashSession: (openingCash: number, openingNote?: string) => Promise<boolean>;
  startCashCounting: () => Promise<boolean>;
  cancelCashCounting: () => Promise<boolean>;
  closeCashSession: (
    countedCash: number,
    closingNote?: string,
    countedCashBreakdown?: CashCountBreakdown,
  ) => Promise<CashSession | null>;
  clearSelectedCashReports: (sessionIds: string[]) => Promise<boolean>;
  clearCashReports: () => Promise<boolean>;
  addCashMovement: (
    type: 'cash_in' | 'cash_out',
    amount: number,
    reason?: string,
    options?: {
      category?: CashMovementCategory;
      subtype?: string;
      paymentMethod?: PaymentMethodOption;
      referenceType?: CashMovementReferenceType;
      referenceId?: string;
      metadata?: Record<string, unknown>;
      silent?: boolean;
      sessionId?: string;
      date?: string;
    }
  ) => Promise<CashMovement | null>;
  getCashSessionReport: (sessionId: string) => CashSessionReport;

  // Kardex
  kardexMovements: KardexMovement[];
  getKardexByProduct: (productId: string) => KardexMovement[];
  
  // Clientes
  customers: Customer[];
  addCustomer: (customer: Omit<Customer, 'id' | 'points' | 'debt' | 'purchases' | 'debtHistory'>) => Promise<ProductWriteStatus>;
  updateCustomer: (id: string, customer: Partial<Customer>) => Promise<ProductWriteStatus>;
  deleteCustomer: (id: string) => Promise<ProductWriteStatus>;
  addDebtToCustomer: (customerId: string, amount: number, description: string) => void;
  addPaymentToCustomer: (
    customerId: string,
    amount: number,
    description: string,
    options?: { registerCashIn?: boolean }
  ) => void;
  
  // Proveedores
  suppliers: Supplier[];
  addSupplier: (supplier: Omit<Supplier, 'id' | 'debt' | 'purchases'>) => Promise<ProductWriteStatus>;
  updateSupplier: (id: string, supplier: Partial<Supplier>) => Promise<ProductWriteStatus>;
  deleteSupplier: (id: string) => Promise<ProductWriteStatus>;
  registerPurchase: (
    supplierId: string,
    items: { productId: string; quantity: number; cost: number }[],
    options?: { pricePolicy?: PurchasePricePolicy }
  ) => void;
  
  // Recargas
  recharges: RechargeTransaction[];
  addRecharge: (recharge: Omit<RechargeTransaction, 'id' | 'date'>) => void;
  
  // Configuración
  storeConfig: StoreConfig;
  updateStoreConfig: (config: Partial<StoreConfig>) => Promise<boolean>;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

// Datos semilla locales (para que el POS funcione sin conexión al iniciar).
// Base de datos inicial con productos colombianos
const initialProducts: Product[] = [
  // Lácteos
  { id: '1', name: 'Leche Alpina Entera 1L', sku: 'LAC001', barcode: '7702001000001', category: 'Lácteos', costPrice: 3500, salePrice: 4200, stock: 50, minStock: 10, unit: 'unidad', isBulk: false, iva: 0, unitPrice: 0 },
  { id: '2', name: 'Queso Alpina Campesino 500g', sku: 'LAC002', barcode: '7702001000002', category: 'Lácteos', costPrice: 8000, salePrice: 10000, stock: 30, minStock: 5, unit: 'unidad', isBulk: false, iva: 0, unitPrice: 0 },
  { id: '3', name: 'Yogurt Alpina Avena 1L', sku: 'LAC003', barcode: '7702001000003', category: 'Lácteos', costPrice: 4000, salePrice: 5200, stock: 40, minStock: 8, unit: 'unidad', isBulk: false, iva: 0, unitPrice: 0 },
  { id: '4', name: 'Mantequilla Alpina 250g', sku: 'LAC004', barcode: '7702001000004', category: 'Lácteos', costPrice: 5500, salePrice: 7000, stock: 25, minStock: 5, unit: 'unidad', isBulk: false, iva: 0, unitPrice: 0 },
  
  // Bebidas
  { id: '5', name: 'Gaseosa Coca-Cola 2L', sku: 'BEB001', barcode: '7702002000001', category: 'Bebidas', costPrice: 4000, salePrice: 5500, stock: 60, minStock: 12, unit: 'unidad', isBulk: false, iva: 8, unitPrice: 0 },
  { id: '6', name: 'Gaseosa Colombiana 1.5L', sku: 'BEB002', barcode: '7702002000002', category: 'Bebidas', costPrice: 2800, salePrice: 3800, stock: 45, minStock: 10, unit: 'unidad', isBulk: false, iva: 8, unitPrice: 0 },
  { id: '7', name: 'Agua Brisa 600ml', sku: 'BEB003', barcode: '7702002000003', category: 'Bebidas', costPrice: 800, salePrice: 1200, stock: 100, minStock: 20, unit: 'unidad', isBulk: false, iva: 0, unitPrice: 0 },
  { id: '8', name: 'Cerveza Águila 330ml', sku: 'BEB004', barcode: '7702002000004', category: 'Bebidas', costPrice: 1500, salePrice: 2200, stock: 80, minStock: 15, unit: 'unidad', isBulk: false, iva: 8, unitPrice: 0 },
  { id: '9', name: 'Jugo Hit Naranja 1L', sku: 'BEB005', barcode: '7702002000005', category: 'Bebidas', costPrice: 2200, salePrice: 3000, stock: 35, minStock: 8, unit: 'unidad', isBulk: false, iva: 0, unitPrice: 0 },
  
  // Aseo
  { id: '10', name: 'Jabón Líquido Fab 1L', sku: 'ASE001', barcode: '7702003000001', category: 'Aseo', costPrice: 5000, salePrice: 6800, stock: 40, minStock: 8, unit: 'unidad', isBulk: false, iva: 19, unitPrice: 0 },
  { id: '11', name: 'Papel Higiénico Familia x4', sku: 'ASE002', barcode: '7702003000002', category: 'Aseo', costPrice: 3500, salePrice: 4800, stock: 50, minStock: 10, unit: 'paquete', isBulk: false, iva: 19, unitPrice: 0 },
  { id: '12', name: 'Detergente Ariel 500g', sku: 'ASE003', barcode: '7702003000003', category: 'Aseo', costPrice: 4200, salePrice: 5500, stock: 30, minStock: 6, unit: 'unidad', isBulk: false, iva: 19, unitPrice: 0 },
  { id: '13', name: 'Suavizante Suavitel 1L', sku: 'ASE004', barcode: '7702003000004', category: 'Aseo', costPrice: 4500, salePrice: 6000, stock: 25, minStock: 5, unit: 'unidad', isBulk: false, iva: 19, unitPrice: 0 },
  
  // Snacks
  { id: '14', name: 'Papas Margarita Natural 150g', sku: 'SNK001', barcode: '7702004000001', category: 'Snacks', costPrice: 2000, salePrice: 2800, stock: 70, minStock: 15, unit: 'unidad', isBulk: false, iva: 19, unitPrice: 0 },
  { id: '15', name: 'Choclitos Super Ricas 60g', sku: 'SNK002', barcode: '7702004000002', category: 'Snacks', costPrice: 800, salePrice: 1200, stock: 90, minStock: 20, unit: 'unidad', isBulk: false, iva: 19, unitPrice: 0 },
  { id: '16', name: 'Galletas Festival 245g', sku: 'SNK003', barcode: '7702004000003', category: 'Snacks', costPrice: 2500, salePrice: 3500, stock: 40, minStock: 8, unit: 'paquete', isBulk: false, iva: 19, unitPrice: 0 },
  { id: '17', name: 'Chocolatina Jet 35g', sku: 'SNK004', barcode: '7702004000004', category: 'Snacks', costPrice: 1000, salePrice: 1500, stock: 100, minStock: 20, unit: 'unidad', isBulk: false, iva: 19, unitPrice: 0 },
  
  // Granos
  { id: '18', name: 'Arroz Diana Premium 1kg', sku: 'GRA001', barcode: '7702005000001', category: 'Granos', costPrice: 2800, salePrice: 3800, stock: 60, minStock: 12, unit: 'kg', isBulk: true, iva: 0, unitPrice: 0 },
  { id: '19', name: 'Frijol Rojo 500g', sku: 'GRA002', barcode: '7702005000002', category: 'Granos', costPrice: 3000, salePrice: 4200, stock: 40, minStock: 8, unit: 'kg', isBulk: true, iva: 0, unitPrice: 0 },
  { id: '20', name: 'Lenteja 500g', sku: 'GRA003', barcode: '7702005000003', category: 'Granos', costPrice: 2500, salePrice: 3500, stock: 35, minStock: 7, unit: 'kg', isBulk: true, iva: 0, unitPrice: 0 },
  { id: '21', name: 'Panela La Cabaña 500g', sku: 'GRA004', barcode: '7702005000004', category: 'Granos', costPrice: 2000, salePrice: 2800, stock: 50, minStock: 10, unit: 'unidad', isBulk: false, iva: 0, unitPrice: 0 },
  
  // Carnes Frías
  { id: '22', name: 'Jamón Zenú 250g', sku: 'CAR001', barcode: '7702006000001', category: 'Carnes Frías', costPrice: 5500, salePrice: 7500, stock: 20, minStock: 4, unit: 'unidad', isBulk: false, iva: 5, unitPrice: 0 },
  { id: '23', name: 'Salchichas Zenú x6', sku: 'CAR002', barcode: '7702006000002', category: 'Carnes Frías', costPrice: 4000, salePrice: 5500, stock: 30, minStock: 6, unit: 'paquete', isBulk: false, iva: 5, unitPrice: 0 },
  { id: '24', name: 'Mortadela Zenú 250g', sku: 'CAR003', barcode: '7702006000003', category: 'Carnes Frías', costPrice: 3500, salePrice: 4800, stock: 25, minStock: 5, unit: 'unidad', isBulk: false, iva: 5, unitPrice: 0 },
  { id: '25', name: 'Salchichón Zenú 250g', sku: 'CAR004', barcode: '7702006000004', category: 'Carnes Frías', costPrice: 4500, salePrice: 6200, stock: 22, minStock: 5, unit: 'unidad', isBulk: false, iva: 5, unitPrice: 0 },
];

// Productos semilla de un proveedor específico (para pruebas/demo).
const distribunzelSeedProducts: Omit<Product, 'id'>[] = [
  { name: 'APRONAX CAPSULAS', sku: 'DZL001', barcode: '7799000000001', category: 'Aseo', costPrice: 11551, salePrice: 2063, stock: 0, minStock: 5, unit: 'unidad', isBulk: false, iva: 0, unitsPerPurchase: 8, profitMargin: 30, unitPrice: 2063 },
  { name: 'BALANCE CLIN 1', sku: 'DZL002', barcode: '7799000000002', category: 'Aseo', costPrice: 22500, salePrice: 4688, stock: 0, minStock: 5, unit: 'unidad', isBulk: false, iva: 0, unitsPerPurchase: 6, profitMargin: 20, unitPrice: 4688 },
  { name: 'BALANCE CLIN 2', sku: 'DZL003', barcode: '7799000000003', category: 'Aseo', costPrice: 18416, salePrice: 1462, stock: 0, minStock: 5, unit: 'unidad', isBulk: false, iva: 0, unitsPerPurchase: 18, profitMargin: 30, unitPrice: 1462 },
  { name: 'BALANCE CREMA', sku: 'DZL004', barcode: '7799000000004', category: 'Aseo', costPrice: 18350, salePrice: 1638, stock: 0, minStock: 5, unit: 'unidad', isBulk: false, iva: 0, unitsPerPurchase: 16, profitMargin: 30, unitPrice: 1638 },
  { name: 'KONZIL A.C', sku: 'DZL005', barcode: '7799000000005', category: 'Aseo', costPrice: 15000, salePrice: 1190, stock: 0, minStock: 5, unit: 'unidad', isBulk: false, iva: 0, unitsPerPurchase: 18, profitMargin: 30, unitPrice: 1190 },
  { name: 'KONZIL C.P', sku: 'DZL006', barcode: '7799000000006', category: 'Aseo', costPrice: 15834, salePrice: 1257, stock: 0, minStock: 5, unit: 'unidad', isBulk: false, iva: 0, unitsPerPurchase: 18, profitMargin: 30, unitPrice: 1257 },
  { name: 'KONZIL SH', sku: 'DZL007', barcode: '7799000000007', category: 'Aseo', costPrice: 15000, salePrice: 1190, stock: 0, minStock: 5, unit: 'unidad', isBulk: false, iva: 0, unitsPerPurchase: 18, profitMargin: 30, unitPrice: 1190 },
  { name: 'KOTEX NOCTURNA', sku: 'DZL008', barcode: '7799000000008', category: 'Aseo', costPrice: 43562, salePrice: 9075, stock: 0, minStock: 5, unit: 'unidad', isBulk: false, iva: 0, unitsPerPurchase: 6, profitMargin: 20, unitPrice: 9075 },
  { name: 'CUCHILLA XTR', sku: 'DZL009', barcode: '7799000000009', category: 'Aseo', costPrice: 31700, salePrice: 3751, stock: 0, minStock: 5, unit: 'unidad', isBulk: false, iva: 0, unitsPerPurchase: 13, profitMargin: 35, unitPrice: 3751 },
  { name: 'JABON REY 300G', sku: 'DZL010', barcode: '7799000000010', category: 'Aseo', costPrice: 14302, salePrice: 3405, stock: 0, minStock: 5, unit: 'unidad', isBulk: false, iva: 0, unitsPerPurchase: 6, profitMargin: 30, unitPrice: 3405 },
  { name: 'OF TALCO MED', sku: 'DZL011', barcode: '7799000000011', category: 'Aseo', costPrice: 39444, salePrice: 24653, stock: 0, minStock: 5, unit: 'unidad', isBulk: false, iva: 0, unitsPerPurchase: 2, profitMargin: 20, unitPrice: 24653 },
  { name: 'PALETTE', sku: 'DZL012', barcode: '7799000000012', category: 'Aseo', costPrice: 61384, salePrice: 12788, stock: 0, minStock: 5, unit: 'unidad', isBulk: false, iva: 0, unitsPerPurchase: 6, profitMargin: 20, unitPrice: 12788 },
  { name: 'PILA CARBON', sku: 'DZL013', barcode: '7799000000013', category: 'Aseo', costPrice: 19429, salePrice: 2591, stock: 0, minStock: 5, unit: 'unidad', isBulk: false, iva: 0, unitsPerPurchase: 10, profitMargin: 25, unitPrice: 2591 },
  { name: 'PROTECTORES X1', sku: 'DZL014', barcode: '7799000000014', category: 'Aseo', costPrice: 17650, salePrice: 22063, stock: 0, minStock: 5, unit: 'unidad', isBulk: false, iva: 0, unitsPerPurchase: 1, profitMargin: 20, unitPrice: 22063 },
  { name: 'PROTECTORES X150', sku: 'DZL015', barcode: '7799000000015', category: 'Aseo', costPrice: 17650, salePrice: 235, stock: 0, minStock: 5, unit: 'unidad', isBulk: false, iva: 0, unitsPerPurchase: 150, profitMargin: 50, unitPrice: 235 },
  { name: 'TALCO MEXANA', sku: 'DZL016', barcode: '7799000000016', category: 'Aseo', costPrice: 38600, salePrice: 9190, stock: 0, minStock: 5, unit: 'unidad', isBulk: false, iva: 0, unitsPerPurchase: 6, profitMargin: 30, unitPrice: 9190 },
  { name: 'TAMPONES K', sku: 'DZL017', barcode: '7799000000017', category: 'Aseo', costPrice: 13000, salePrice: 3714, stock: 0, minStock: 5, unit: 'unidad', isBulk: false, iva: 0, unitsPerPurchase: 5, profitMargin: 30, unitPrice: 3714 },
].map(product => ({
  ...product,
  supplierName: 'DISTRIBUNZEL'
}));

// Lista base de proveedores para demo.
const supplierSeedNames = [
  'DISTRITIENDAS DE COLOMBIA',
  'COLOMBINA',
  'PRODUCTOS LONCHIPS',
  'ALQUERIA',
  'YUPI',
  'FRITOLAY',
  'CADMIEL',
  'DISTRIBUNZEL',
  'CREMHELADO',
  'DISTRIBUIDORA SURTICOMERCIO',
  'FRUTA CREAM',
  'TECNOQUIMICAS',
  'TIENDAS DEL NORTE "NESTLE"',
  'CONDIMENTOS DEL VALLE',
  'BIMBO',
  'CASA LUKER',
  'ELITE,ANDRES Y DISTRIJASS',
  'QUALA',
  'UNILEVER',
  'CORBETA',
  'DISTRIROMEL S.A.S',
  'DISTRIJASS',
  'LA RED JUMBO & JET',
  'DISTRI VARIOS Y VARIOS',
  'PRODUCTOS DE REVISTAS',
  'DISTRIJASS 2',
  'LA TORRE',
  'PAPELERIA',
  'DISTRIBUIDORA EL CALEÑO',
  'VARIEDADES JAIROGA Y LOCIONES',
  'CAJAS Y AFICHES',
  'EL PALACIO DE LOS SENTIMIENTOS',
  'CALI DULCE (LSC DISTRIBUCIONES)',
  'BOLSAS DE REGALODEISY',
  'BISUTERIA CALIMAX',
  'CORDONES JAVIER ALFONSO',
  'PIERCING JOSE CASTAÑO',
  'BODEGA ILUSION',
  'DISTRIBUIDORA IMPORTIENDAS',
  'BOLSAS PLASTICAS'
];

// Proveedores semilla con datos ficticios.
const initialSuppliers: Supplier[] = supplierSeedNames.map((name, index) => {
  const suffix = (index + 1).toString().padStart(3, '0');
  return {
    id: `seed-supplier-${suffix}`,
    name,
    nit: `900${(100000 + index).toString()}-${index % 9}`,
    phone: `3${(100000000 + index).toString().padStart(9, '0')}`,
    email: `proveedor${suffix}@correo-ficticio.com`,
    address: `Calle ${10 + index} #${20 + index}-${30 + index}, Cali`,
    bankAccounts: [`Bancolombia 1234${suffix}`],
    debt: 0,
    purchases: []
  };
});

export function POSProvider({ children }: { children: ReactNode }) {
  // Estado principal: sesión, tienda actual, catálogo y transacciones.
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [currentStoreId, setCurrentStoreId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);
  const [offlinePinHash, setOfflinePinHash] = useState<string | null>(null);
  const [offlineDefaultRole, setOfflineDefaultRoleState] = useState<'admin' | 'cashier'>('cashier');
  const [hasPendingSync, setHasPendingSync] = useState<boolean>(false);
  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [currentUser, setCurrentUser] = useState<{ username: string; role: 'admin' | 'cashier' } | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [saleDrafts, setSaleDrafts] = useState<SaleDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [kardexMovements, setKardexMovements] = useState<KardexMovement[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [recharges, setRecharges] = useState<RechargeTransaction[]>([]);
  const [cashSessions, setCashSessions] = useState<CashSession[]>([]);
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [storeConfig, setStoreConfig] = useState<StoreConfig>({
    name: 'Mi Tienda',
    nit: '900123456-1',
    address: 'Calle 123 #45-67, Bogotá',
    phone: '3001234567',
    email: 'contacto@mitienda.com',
    logo: DEFAULT_LOGO_PATH,
    printerType: 'thermal',
    showIVA: true,
    purchasePricePolicy: 'automatic',
    currency: 'COP',
    userRole: 'admin',
  });

  const activeDraft = saleDrafts.find((draft) => draft.id === activeDraftId) ?? null;
  const cart = activeDraft?.items ?? [];
  const draftSyncTimers = useRef<Record<string, number>>({});
  const isHydratingRef = useRef(true);
  const offlineSnapshotRef = useRef<string | null>(null);
  const localStorageCacheRef = useRef<Record<string, string | null>>({});
  const isAutoSyncingRef = useRef(false);
  const autoSyncTimerRef = useRef<number | null>(null);
  const pendingSyncNoticeRef = useRef(false);
  const offlinePinConfigured = Boolean(offlinePinHash);
  const canReachSupabase = Boolean(session?.access_token && isBrowserOnline && !isOfflineMode);
  const isConnectedToSupabase = Boolean(canReachSupabase && currentStoreId);

  useEffect(() => {
    const updateOnline = () => setIsBrowserOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  // Mantener título y favicon sincronizados con la tienda
  useEffect(() => {
    const title = storeConfig.name ? `${storeConfig.name} | Punto de Venta` : 'Punto de Venta';
    if (document.title !== title) {
      document.title = title;
    }

    const faviconUrl = storeConfig.logo || DEFAULT_LOGO_PATH;
    const existing = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
    const resolveHref = (href: string) => {
      if (href.startsWith('data:')) return href;
      try {
        return new URL(href, window.location.href).href;
      } catch {
        return href;
      }
    };
    const nextHref = resolveHref(faviconUrl);
    const type = faviconUrl.startsWith('data:') ? '' : 'image/jpeg';

    if (existing) {
      if (existing.href !== nextHref) existing.href = nextHref;
      if (existing.type !== type) existing.type = type;
    } else {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.type = type;
      link.href = nextHref;
      document.head.appendChild(link);
    }
  }, [storeConfig.name, storeConfig.logo]);

  const buildLocalBackupPayload = (): LocalBackupPayload => ({
    products: localStorage.getItem('pos_products'),
    sales: localStorage.getItem('pos_sales'),
    customers: localStorage.getItem('pos_customers'),
    suppliers: localStorage.getItem('pos_suppliers'),
    kardex: localStorage.getItem('pos_kardex'),
    recharges: localStorage.getItem('pos_recharges'),
    cash_sessions: localStorage.getItem('pos_cash_sessions'),
    cash_movements: localStorage.getItem('pos_cash_movements'),
    config: localStorage.getItem('pos_config'),
  });

  const buildStateBackupPayload = (): LocalBackupPayload => ({
    products: JSON.stringify(products),
    sales: JSON.stringify(sales),
    customers: JSON.stringify(customers),
    suppliers: JSON.stringify(suppliers),
    kardex: JSON.stringify(kardexMovements),
    recharges: JSON.stringify(recharges),
    cash_sessions: JSON.stringify(cashSessions),
    cash_movements: JSON.stringify(cashMovements),
    config: JSON.stringify(storeConfig),
  });

  const persistLocalStorageValue = (key: string, value: string | null) => {
    if (localStorageCacheRef.current[key] === value) return;
    localStorageCacheRef.current[key] = value;
    if (value === null) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, value);
  };

  const persistLocalStorageJson = (key: string, value: unknown) => {
    persistLocalStorageValue(key, JSON.stringify(value));
  };

  const markPendingSync = () => {
    setHasPendingSync(true);
    localStorage.setItem(OFFLINE_DIRTY_KEY, 'true');
    localStorage.setItem(OFFLINE_BACKUP_KEY, JSON.stringify(buildStateBackupPayload()));
  };

  const clearPendingSync = () => {
    setHasPendingSync(false);
    localStorage.removeItem(OFFLINE_DIRTY_KEY);
    localStorage.removeItem(OFFLINE_BACKUP_KEY);
  };

  // Sincroniza datos remotos (catálogo + operaciones) desde Supabase.
  const syncFromSupabase = async (nextSession: SupabaseSession, storeId: string): Promise<boolean> => {
    try {
      const draftRowsPromise = loadSaleDraftsWithItems(nextSession.access_token, storeId, nextSession.user.id)
        .catch((error) => {
          console.error('No se pudieron cargar borradores en Supabase', error);
          if (isMissingTableError(error, 'sale_drafts') || isMissingTableError(error, 'sale_draft_items')) {
            toast.error('Faltan tablas de borradores en Supabase. Aplica la migración de ventas múltiples.');
          } else {
            toast.error('No se pudieron cargar los borradores de venta desde Supabase.');
          }
          return [];
        });

      const [
        catalog,
        customerRows,
        supplierRows,
        salesRows,
        draftRows,
        kardexRows,
        rechargeRows,
        cashSessionRows,
        cashMovementRows,
        storeRow,
      ] = await Promise.all([
        loadCategoriesAndProducts(nextSession.access_token, storeId),
        loadCustomersWithDebt(nextSession.access_token, storeId),
        loadSuppliersWithPurchases(nextSession.access_token, storeId),
        loadSalesWithItems(nextSession.access_token, storeId),
        draftRowsPromise,
        loadKardexMovements(nextSession.access_token, storeId),
        loadRecharges(nextSession.access_token, storeId),
        loadCashSessions(nextSession.access_token, storeId),
        loadCashMovements(nextSession.access_token, storeId),
        loadStoreDetails(nextSession.access_token, storeId),
      ]);

      setCategories(catalog.categories);
      setProducts(catalog.products);

      const productById = new Map(catalog.products.map(product => [product.id, product]));

      const sales = salesRows.map((sale) => {
        const items: CartItem[] = (sale.sale_items ?? []).map((item) => {
          const productId = item.product_id ?? '';
          const existingProduct = productById.get(productId);
          const fallbackProduct: Product = {
            id: productId || `unknown-${item.id}`,
            name: item.product_name || 'Producto',
            sku: '',
            barcode: '',
            category: existingProduct?.category ?? 'Sin categoría',
            supplierName: existingProduct?.supplierName,
            costPrice: existingProduct ? existingProduct.costPrice : toNumber(item.unit_cost),
            salePrice: existingProduct ? existingProduct.salePrice : toNumber(item.unit_sale_price),
            stock: existingProduct ? existingProduct.stock : 0,
            minStock: existingProduct ? existingProduct.minStock : 0,
            unit: existingProduct ? existingProduct.unit : 'unidad',
            isBulk: existingProduct ? existingProduct.isBulk : false,
            iva: existingProduct ? existingProduct.iva : toNumber(item.iva),
            unitsPerPurchase: existingProduct?.unitsPerPurchase,
            profitMargin: existingProduct?.profitMargin,
            unitPrice: existingProduct?.unitPrice ?? (existingProduct ? existingProduct.salePrice : toNumber(item.unit_sale_price)),
          };

          return {
            product: existingProduct ? { ...existingProduct } : fallbackProduct,
            quantity: toNumber(item.quantity),
            discount: toNumber(item.discount_percent),
          };
        });

        return {
          id: sale.id,
          date: sale.created_at,
          items,
          subtotal: toNumber(sale.subtotal),
          discount: toNumber(sale.discount),
          iva: toNumber(sale.iva),
          total: toNumber(sale.total),
          paymentMethod: sale.payment_method || 'efectivo',
          cashReceived: toNumber(sale.cash_received),
          change: toNumber(sale.change_value),
          paymentBreakdown: sanitizePaymentBreakdown(sale.payment_breakdown),
          creditedAmount: toNumber(sale.credited_amount),
          customerId: sale.customer_id ?? undefined,
          invoiceNumber: sale.invoice_number ?? undefined,
          cashSessionId: sale.cash_session_id ?? undefined,
          returnedAt: sale.returned_at ?? undefined,
        };
      });

      setSales(sales);

      const drafts: SaleDraft[] = draftRows.map((draft) => {
        const items: CartItem[] = (draft.sale_draft_items ?? []).map((item) => {
          const productId = item.product_id ?? '';
          const existingProduct = productById.get(productId);
          const fallbackProduct: Product = {
            id: productId || `unknown-${item.id}`,
            name: item.product_name || 'Producto',
            sku: '',
            barcode: '',
            category: existingProduct?.category ?? 'Sin categoría',
            supplierName: existingProduct?.supplierName,
            costPrice: existingProduct ? existingProduct.costPrice : toNumber(item.unit_cost),
            salePrice: existingProduct ? existingProduct.salePrice : toNumber(item.unit_sale_price),
            stock: existingProduct ? existingProduct.stock : 0,
            minStock: existingProduct ? existingProduct.minStock : 0,
            unit: existingProduct ? existingProduct.unit : 'unidad',
            isBulk: existingProduct ? existingProduct.isBulk : false,
            iva: existingProduct ? existingProduct.iva : toNumber(item.iva),
            unitsPerPurchase: existingProduct?.unitsPerPurchase,
            profitMargin: existingProduct?.profitMargin,
            unitPrice: existingProduct?.unitPrice ?? (existingProduct ? existingProduct.salePrice : toNumber(item.unit_sale_price)),
          };

          return {
            product: existingProduct ? { ...existingProduct } : fallbackProduct,
            quantity: toNumber(item.quantity),
            discount: toNumber(item.discount_percent),
          };
        });

        return {
          id: draft.id,
          storeId: draft.store_id,
          userId: draft.user_id ?? undefined,
          cashSessionId: draft.cash_session_id ?? undefined,
          customerId: draft.customer_id ?? undefined,
          status: draft.status,
          notes: draft.notes ?? undefined,
          createdAt: draft.created_at,
          updatedAt: draft.updated_at,
          items,
        };
      });

      setSaleDrafts(drafts);
      setActiveDraftId((prev) => {
        if (prev && drafts.some((draft) => draft.id === prev)) return prev;
        return drafts[0]?.id ?? null;
      });

      const salesByCustomerId = new Map<string, Sale[]>();
      sales.forEach((sale) => {
        if (sale.returnedAt) return;
        if (!sale.customerId) return;
        const current = salesByCustomerId.get(sale.customerId) ?? [];
        current.push(sale);
        salesByCustomerId.set(sale.customerId, current);
      });

      const customers: Customer[] = customerRows.map((row) => ({
        id: row.id,
        name: row.name || 'Cliente',
        phone: row.phone ?? '',
        address: row.address ?? '',
        email: row.email ?? undefined,
        nit: row.nit ?? undefined,
        points: toNumber(row.points),
        debt: toNumber(row.debt),
        purchases: salesByCustomerId.get(row.id) ?? [],
        debtHistory: (row.customer_debt_transactions ?? []).map((tx) => ({
          id: tx.id,
          date: tx.created_at,
          type: tx.type,
          amount: toNumber(tx.amount),
          description: tx.description ?? '',
          balance: toNumber(tx.balance),
        })),
      }));

      setCustomers(customers);

      const suppliers: Supplier[] = supplierRows.map((row) => ({
        id: row.id,
        name: row.name || 'Proveedor',
        nit: row.nit ?? '',
        phone: row.phone ?? '',
        email: row.email ?? undefined,
        address: row.address ?? undefined,
        bankAccounts: row.bank_accounts ?? [],
        debt: toNumber(row.debt),
        purchases: (row.purchases ?? []).map((purchase) => ({
          id: purchase.id,
          date: purchase.created_at,
          supplierId: row.id,
          total: toNumber(purchase.total),
          paid: Boolean(purchase.paid),
          items: (purchase.purchase_items ?? []).map((item) => ({
            productId: item.product_id ?? '',
            quantity: toNumber(item.quantity_packages),
            cost: toNumber(item.package_cost),
          })),
        })),
      }));

      setSuppliers(suppliers);

      setKardexMovements(kardexRows.map((row) => ({
        id: row.id,
        date: row.created_at,
        productId: row.product_id ?? '',
        productName: row.product_name || 'Producto',
        type: row.type,
        reference: row.reference ?? '',
        quantity: toNumber(row.quantity),
        stockBefore: toNumber(row.stock_before),
        stockAfter: toNumber(row.stock_after),
        unitCost: toNumber(row.unit_cost),
        unitSalePrice: row.unit_sale_price == null ? undefined : toNumber(row.unit_sale_price),
        totalCost: toNumber(row.total_cost),
      })));

      setRecharges(rechargeRows.map((row) => ({
        id: row.id,
        date: row.created_at,
        type: row.type,
        provider: row.provider || 'N/A',
        phoneNumber: row.phone_number ?? undefined,
        amount: toNumber(row.amount),
        commission: toNumber(row.commission),
        total: toNumber(row.total),
      })));

      setCashSessions(cashSessionRows.map((row) => ({
        id: row.id,
        storeId: row.store_id,
        userId: row.user_id ?? undefined,
        openedBy: row.opened_by ?? undefined,
        closedBy: row.closed_by ?? undefined,
        openedAt: row.opened_at,
        closedAt: row.closed_at ?? undefined,
        openingNote: row.opening_note ?? undefined,
        openingCash: toNumber(row.opening_cash),
        expectedCash: row.expected_cash == null ? undefined : toNumber(row.expected_cash),
        countedCash: row.counted_cash == null ? undefined : toNumber(row.counted_cash),
        countedCashBreakdown: sanitizeCashCountBreakdown(row.counted_cash_breakdown),
        countedAt: row.counted_at ?? undefined,
        closingNote: row.closing_note ?? undefined,
        difference: row.difference == null ? undefined : toNumber(row.difference),
        status: row.status,
      })));

      setCashMovements(cashMovementRows.map((row) => ({
        id: row.id,
        cashSessionId: row.cash_session_id,
        userId: row.user_id ?? undefined,
        type: row.type,
        amount: toNumber(row.amount),
        reason: row.reason ?? undefined,
        category: normalizeMovementCategory(row.category, row.type === 'cash_in' ? 'manual_income' : 'manual_expense'),
        subtype: row.subtype ?? undefined,
        paymentMethod: normalizeMovementPaymentMethod(row.payment_method),
        referenceType: row.reference_type == null ? undefined : row.reference_type as CashMovementReferenceType,
        referenceId: row.reference_id ?? undefined,
        metadata: row.metadata ?? {},
        date: row.created_at,
      })));

      if (storeRow) {
        setStoreConfig(prev => ({
          ...prev,
          name: storeRow.name || prev.name,
          nit: storeRow.nit ?? '',
          address: storeRow.address ?? '',
          phone: storeRow.phone ?? '',
          email: storeRow.email ?? '',
          logo: storeRow.logo || prev.logo,
          dianResolution: storeRow.dian_resolution ?? undefined,
          printerType: storeRow.printer_type === 'standard' ? 'standard' : 'thermal',
          showIVA: storeRow.show_iva ?? prev.showIVA,
          purchasePricePolicy: storeRow.purchase_price_policy || prev.purchasePricePolicy,
          currency: storeRow.currency ?? prev.currency,
        }));
      }

      setIsOfflineMode(false);
      // Supabase queda como fuente de verdad al descargar datos remotos.
      clearPendingSync();

      return true;
    } catch (error) {
      console.error('No se pudieron cargar datos desde Supabase', error);
      return false;
    }
  };

  // Asegura que exista al menos un borrador activo.
  useEffect(() => {
    if (!isAuthenticated) return;
    if (saleDrafts.length === 0) {
      void createSaleDraft();
      return;
    }
    if (!activeDraftId) {
      setActiveDraftId(saleDrafts[0].id);
    }
  }, [saleDrafts.length, activeDraftId, isAuthenticated]);

  // Cargar datos del localStorage
  useEffect(() => {
    const storedPin = localStorage.getItem(OFFLINE_PIN_KEY);
    if (storedPin) {
      setOfflinePinHash(storedPin);
    }
    const storedRole = localStorage.getItem(OFFLINE_ROLE_KEY);
    if (storedRole === 'admin' || storedRole === 'cashier') {
      setOfflineDefaultRoleState(storedRole);
    }
    const pendingSync = localStorage.getItem(OFFLINE_DIRTY_KEY);
    if (pendingSync === 'true') {
      setHasPendingSync(true);
    }
    const offlineAuthRaw = localStorage.getItem(OFFLINE_AUTH_KEY);
    const offlineAuth = offlineAuthRaw ? JSON.parse(offlineAuthRaw) as { username?: string; role: 'admin' | 'cashier' } : null;

    const loadedProducts = localStorage.getItem('pos_products');
    const loadedCategories = localStorage.getItem('pos_categories');
    const loadedSales = localStorage.getItem('pos_sales');
    const loadedKardex = localStorage.getItem('pos_kardex');
    const loadedCustomers = localStorage.getItem('pos_customers');
    const loadedSuppliers = localStorage.getItem('pos_suppliers');
    const loadedRecharges = localStorage.getItem('pos_recharges');
    const loadedCashSessions = localStorage.getItem('pos_cash_sessions');
    const loadedCashMovements = localStorage.getItem('pos_cash_movements');
    const loadedConfig = localStorage.getItem('pos_config');
    const loadedDrafts = localStorage.getItem(OFFLINE_DRAFTS_KEY);
    const loadedActiveDraftId = localStorage.getItem(OFFLINE_ACTIVE_DRAFT_KEY);

    const productData: Product[] = loadedProducts ? JSON.parse(loadedProducts) : initialProducts;
    const distribunzelKeySet = new Set(
      distribunzelSeedProducts.map(
        product => `${product.name.trim().toLowerCase()}|${product.category.trim().toLowerCase()}`
      )
    );

    const normalizedProductData = productData.map(product => {
      const key = `${product.name.trim().toLowerCase()}|${product.category.trim().toLowerCase()}`;
      if (!product.supplierName && distribunzelKeySet.has(key)) {
        return { ...product, supplierName: 'DISTRIBUNZEL' };
      }
      return product;
    });

    const existingProductKeys = new Set(
      normalizedProductData.map(product => `${product.name.trim().toLowerCase()}|${product.category.trim().toLowerCase()}`)
    );

    const missingDistribunzelProducts: Product[] = distribunzelSeedProducts
      .filter(product => {
        const key = `${product.name.trim().toLowerCase()}|${product.category.trim().toLowerCase()}`;
        return !existingProductKeys.has(key);
      })
      .map((product, index) => ({
        ...product,
        id: `seed-distribunzel-${(index + 1).toString().padStart(3, '0')}`
      }));

    const mergedProducts = [...normalizedProductData, ...missingDistribunzelProducts];
    setProducts(mergedProducts);

    if (loadedCategories) {
      setCategories(JSON.parse(loadedCategories));
    } else {
      setCategories(Array.from(new Set(mergedProducts.map(product => product.category))));
    }
    
    if (loadedSales) setSales(JSON.parse(loadedSales));
    if (loadedKardex) setKardexMovements(JSON.parse(loadedKardex));
    if (loadedCustomers) setCustomers(JSON.parse(loadedCustomers));
    if (loadedSuppliers) {
      const parsedSuppliers: Supplier[] = JSON.parse(loadedSuppliers);
      const normalizedSuppliers = parsedSuppliers.map((supplier) => {
        const normalizedAccounts = (
          supplier.bankAccounts && supplier.bankAccounts.length > 0
            ? supplier.bankAccounts
            : supplier.bankAccount
              ? [supplier.bankAccount]
              : []
        )
          .map(account => account.trim())
          .filter(account => account.length > 0);

        return {
          ...supplier,
          bankAccounts: normalizedAccounts
        };
      });

      const existingNames = new Set(
        normalizedSuppliers.map(supplier => supplier.name.trim().toLowerCase())
      );
      const missingSeedSuppliers = initialSuppliers.filter(
        supplier => !existingNames.has(supplier.name.trim().toLowerCase())
      );

      setSuppliers([...normalizedSuppliers, ...missingSeedSuppliers]);
    } else {
      setSuppliers(initialSuppliers);
    }
    if (loadedRecharges) setRecharges(JSON.parse(loadedRecharges));
    if (loadedCashSessions) {
      const parsedCashSessions = JSON.parse(loadedCashSessions) as CashSession[];
      setCashSessions(parsedCashSessions.map((sessionItem) => ({
        ...sessionItem,
        countedCashBreakdown: sanitizeCashCountBreakdown(sessionItem.countedCashBreakdown),
      })));
    }
    if (loadedCashMovements) setCashMovements(JSON.parse(loadedCashMovements));
    if (loadedConfig) {
      const parsedConfig = JSON.parse(loadedConfig) as Partial<StoreConfig>;
      setStoreConfig(prev => ({
        ...prev,
        ...parsedConfig,
        purchasePricePolicy: parsedConfig.purchasePricePolicy || 'automatic'
      }));
    }
    if (loadedDrafts) {
      try {
        const parsedDrafts = JSON.parse(loadedDrafts) as SaleDraft[];
        setSaleDrafts(parsedDrafts);
        if (loadedActiveDraftId) {
          setActiveDraftId(loadedActiveDraftId);
        }
      } catch {
        setSaleDrafts([]);
      }
    }
    const storedSession = getStoredSession();
    if (!storedSession) {
      setSession(null);
      setCurrentStoreId(null);
      localStorage.removeItem('pos_auth');

      if (offlineAuth?.role) {
        setIsOfflineMode(true);
        setIsAuthenticated(true);
        setCurrentUser({
          username: offlineAuth.username || 'offline',
          role: offlineAuth.role,
        });
      } else {
        setIsAuthenticated(false);
        setCurrentUser(null);
      }

      setIsAuthReady(true);
      isHydratingRef.current = false;
      return;
    }

    setSession(storedSession);
    setIsAuthenticated(true);
    setIsOfflineMode(false);

    fetchMyStoreMembership(storedSession.access_token, storedSession.user.id)
      .then((membership) => {
        if (!membership) return;
        setCurrentStoreId(membership.store_id);
        setCurrentUser({
          username: storedSession.user.email || 'usuario',
          role: membership.role,
        });
        if (pendingSync === 'true') {
          toast.info('Hay cambios offline pendientes. Puedes subirlos manualmente si deseas.');
        }
        return syncFromSupabase(storedSession, membership.store_id);
      })
      .catch((error) => {
        console.error('No se pudo restaurar la sesión de Supabase', error);
        toast.error('No se pudo restaurar la sesión con Supabase');
      })
      .finally(() => {
        setIsAuthReady(true);
        isHydratingRef.current = false;
      });
  }, []);

  // Guardar productos
  useEffect(() => {
    if (products.length > 0) {
      persistLocalStorageJson('pos_products', products);
    }
  }, [products]);

  // Guardar categorías
  useEffect(() => {
    persistLocalStorageJson('pos_categories', categories);
  }, [categories]);

  // Guardar ventas
  useEffect(() => {
    persistLocalStorageJson('pos_sales', sales);
  }, [sales]);

  // Guardar kardex
  useEffect(() => {
    persistLocalStorageJson('pos_kardex', kardexMovements);
  }, [kardexMovements]);

  // Guardar clientes
  useEffect(() => {
    persistLocalStorageJson('pos_customers', customers);
  }, [customers]);

  // Guardar proveedores
  useEffect(() => {
    persistLocalStorageJson('pos_suppliers', suppliers);
  }, [suppliers]);

  // Guardar recargas
  useEffect(() => {
    persistLocalStorageJson('pos_recharges', recharges);
  }, [recharges]);

  // Guardar sesiones de caja
  useEffect(() => {
    persistLocalStorageJson('pos_cash_sessions', cashSessions);
  }, [cashSessions]);

  // Guardar movimientos de caja
  useEffect(() => {
    persistLocalStorageJson('pos_cash_movements', cashMovements);
  }, [cashMovements]);

  // Guardar configuración
  useEffect(() => {
    persistLocalStorageJson('pos_config', storeConfig);
  }, [storeConfig]);

  // Guardar autenticación
  useEffect(() => {
    if (!isAuthReady) return;
    persistLocalStorageJson('pos_auth', { isAuthenticated, currentUser });
  }, [isAuthenticated, currentUser, isAuthReady]);

  // Guardar borradores locales para modo offline.
  useEffect(() => {
    persistLocalStorageJson(OFFLINE_DRAFTS_KEY, saleDrafts);
    if (activeDraftId) {
      persistLocalStorageValue(OFFLINE_ACTIVE_DRAFT_KEY, activeDraftId);
    } else {
      persistLocalStorageValue(OFFLINE_ACTIVE_DRAFT_KEY, null);
    }
  }, [saleDrafts, activeDraftId]);

  // Marcar cambios offline pendientes de sincronización.
  useEffect(() => {
    if (!isHydratingRef.current && isConnectedToSupabase) {
      return;
    }

    const snapshot = JSON.stringify({
      products,
      categories,
      sales,
      kardexMovements,
      customers,
      suppliers,
      recharges,
      cashSessions,
      cashMovements,
      storeConfig,
      saleDrafts,
    });

    if (isHydratingRef.current) {
      offlineSnapshotRef.current = snapshot;
      return;
    }

    if (snapshot === offlineSnapshotRef.current) return;
    offlineSnapshotRef.current = snapshot;

    markPendingSync();
  }, [
    products,
    categories,
    sales,
    kardexMovements,
    customers,
    suppliers,
    recharges,
    cashSessions,
    cashMovements,
    storeConfig,
    saleDrafts,
    isConnectedToSupabase,
  ]);

  // Funciones de autenticación
  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const nextSession = await signInWithPassword(username, password);
      storeSession(nextSession);
      setSession(nextSession);
      setIsOfflineMode(false);
      localStorage.removeItem(OFFLINE_AUTH_KEY);

      const membership = await fetchMyStoreMembership(nextSession.access_token, nextSession.user.id);

      setIsAuthenticated(true);
      setCurrentUser({
        username: nextSession.user.email || username,
        role: membership?.role || 'admin'
      });

      if (membership) {
        setCurrentStoreId(membership.store_id);
        const pendingSync = localStorage.getItem(OFFLINE_DIRTY_KEY) === 'true';
        if (pendingSync) {
          setHasPendingSync(true);
          toast.info('Hay cambios offline pendientes. Puedes subirlos manualmente si deseas.');
        }
        const synced = await syncFromSupabase(nextSession, membership.store_id);
        if (!synced) {
          toast.error('Sesión iniciada, pero falló la sincronización de datos');
        }
      } else {
        setCurrentStoreId(null);
        toast.info('Sesión iniciada. Ahora crea tu tienda para sincronizar datos.');
      }

      return true;
    } catch (error) {
      console.error('Error de autenticación con Supabase', error);
      toast.error('No se pudo iniciar sesión con Supabase. Verifica email/contraseña.');
      return false;
    }
  };

  const loginOffline = async (
    pin: string,
    role: 'admin' | 'cashier',
    username?: string,
  ): Promise<boolean> => {
    const trimmed = pin.trim();
    if (!/^\d{4}$/.test(trimmed)) {
      toast.error('El PIN debe tener 4 dígitos.');
      return false;
    }

    if (!offlinePinHash) {
      toast.error('Configura un PIN offline antes de ingresar.');
      return false;
    }

    const hashed = await hashPin(trimmed);
    if (hashed !== offlinePinHash) {
      toast.error('PIN incorrecto.');
      return false;
    }

    storeSession(null);
    setSession(null);
    setIsAuthenticated(true);
    setIsOfflineMode(true);
    const safeRole = role || offlineDefaultRole;
    const safeUsername = username?.trim() || 'offline';
    setCurrentUser({ username: safeUsername, role: safeRole });
    localStorage.setItem(OFFLINE_AUTH_KEY, JSON.stringify({ username: safeUsername, role: safeRole }));
    return true;
  };

  const setOfflinePin = async (pin: string): Promise<boolean> => {
    const trimmed = pin.trim();
    if (!/^\d{4}$/.test(trimmed)) {
      toast.error('El PIN debe tener 4 dígitos.');
      return false;
    }

    const hashed = await hashPin(trimmed);
    setOfflinePinHash(hashed);
    localStorage.setItem(OFFLINE_PIN_KEY, hashed);
    localStorage.removeItem(OFFLINE_AUTH_KEY);
    return true;
  };

  const setOfflineDefaultRole = (role: 'admin' | 'cashier') => {
    setOfflineDefaultRoleState(role);
    localStorage.setItem(OFFLINE_ROLE_KEY, role);
  };

  const logout = () => {
    if (session?.access_token) {
      void signOut(session.access_token).catch(() => undefined);
    }
    storeSession(null);
    setSession(null);
    setCurrentStoreId(null);
    setIsAuthenticated(false);
    setCurrentUser(null);
    setIsOfflineMode(false);
    localStorage.removeItem(OFFLINE_AUTH_KEY);
    setSaleDrafts([]);
    setActiveDraftId(null);
  };

  const verifyAdminPasswordForCriticalAction = async (password: string): Promise<boolean> => {
    if (storeConfig.userRole !== 'admin') {
      toast.error('Solo un administrador puede ejecutar esta acción.');
      return false;
    }

    const trimmedPassword = password.trim();
    if (!trimmedPassword) {
      toast.error('Ingresa tu contraseña para continuar.');
      return false;
    }

    if (!session?.user?.email) {
      toast.error('No se pudo validar la contraseña con la sesión actual.');
      return false;
    }

    try {
      await signInWithPassword(session.user.email, trimmedPassword);
      return true;
    } catch (error) {
      console.error('Validación de contraseña crítica fallida', error);
      toast.error('Contraseña incorrecta.');
      return false;
    }
  };

  const createStore = async (store: { name: string; nit?: string; address?: string; phone?: string; email?: string }): Promise<boolean> => {
    if (!session?.access_token) {
      toast.error('Debes iniciar sesión antes de crear la tienda');
      return false;
    }

    if (currentStoreId) {
      toast.info('Esta cuenta ya tiene una tienda asociada.');
      return false;
    }

    try {
      const storeId = await bootstrapStore(session.access_token, store);
      setCurrentStoreId(storeId);
      const synced = await syncFromSupabase(session, storeId);
      if (!synced) {
        toast.error('Tienda creada, pero falló la sincronización inicial.');
      }
      return true;
    } catch (error) {
      console.error('No se pudo crear la tienda en Supabase', error);
      toast.error('No se pudo crear la tienda (RLS/red). Revisa permisos y sesión.');
      return false;
    }
  };

  const syncWithSupabase = async (): Promise<boolean> => {
    if (!canReachSupabase || !session || !currentStoreId) {
      toast.info('No hay conexión o tienda conectada para sincronizar.');
      return false;
    }

    const ok = await syncFromSupabase(session, currentStoreId);
    if (!ok) {
      toast.error('No se pudo sincronizar con Supabase.');
      return false;
    }

    toast.success('Datos sincronizados con Supabase.');
    return true;
  };

  const uploadLocalBackupToSupabase = async (clearExisting = false): Promise<boolean> => {
    if (!canReachSupabase || !session || !currentStoreId) {
      toast.info('No hay conexión o tienda conectada para sincronizar.');
      return false;
    }

    if (!clearExisting) {
      if (!isAutoSyncingRef.current) {
        toast.error('Importación bloqueada por seguridad. Solo se permite restauración manual que reemplaza remoto.');
      }
      return false;
    }

    let backupPayload = buildLocalBackupPayload();
    const offlineBackupRaw = localStorage.getItem(OFFLINE_BACKUP_KEY);
    if (offlineBackupRaw) {
      try {
        const parsedBackup: unknown = JSON.parse(offlineBackupRaw);
        if (isLocalBackupPayload(parsedBackup)) {
          backupPayload = parsedBackup;
        }
      } catch {
        // Si el backup offline está corrupto, usamos el estado local actual.
      }
    }

    try {
      if (clearExisting) {
        await replaceLocalBackup(session.access_token, currentStoreId, backupPayload);
      } else {
        await importLocalBackup(session.access_token, currentStoreId, backupPayload, false);
      }
      const synced = await syncFromSupabase(session, currentStoreId);
      if (!synced) {
        if (!isAutoSyncingRef.current) {
          toast.error('Importación finalizada, pero falló la actualización de datos en pantalla.');
        }
      } else {
        clearPendingSync();
        if (!isAutoSyncingRef.current) {
          toast.success('Datos locales importados a Supabase correctamente.');
        }
      }
      return true;
    } catch (error) {
      console.error('No se pudo importar el backup local en Supabase', error);
      markPendingSync();
      if (!isAutoSyncingRef.current) {
        toast.error('Falló la importación a Supabase. Verifica permisos/RLS y sesión.');
      }
      return false;
    }
  };

  const getPendingProductSyncPreview = async (): Promise<PendingProductSyncPreview> => {
    const emptyPreview: PendingProductSyncPreview = {
      canCompare: false,
      reason: 'No hay conexión o tienda vinculada en Supabase.',
      localTotal: 0,
      remoteTotal: 0,
      toCreate: 0,
      toUpdate: 0,
      conflicts: 0,
      missingIdentifiers: 0,
      duplicateLocalIdentifiers: 0,
      sampleConflicts: [],
    };

    const offlineBackupRaw = localStorage.getItem(OFFLINE_BACKUP_KEY);
    let localProductsRaw = localStorage.getItem('pos_products');

    if (offlineBackupRaw) {
      try {
        const parsedBackup: unknown = JSON.parse(offlineBackupRaw);
        if (isLocalBackupPayload(parsedBackup) && typeof parsedBackup.products === 'string') {
          localProductsRaw = parsedBackup.products;
        }
      } catch {
        // Ignorar backup corrupto y usar estado local actual.
      }
    }

    const localProducts: Product[] = (() => {
      try {
        const parsed = localProductsRaw ? JSON.parse(localProductsRaw) : [];
        return Array.isArray(parsed) ? parsed as Product[] : [];
      } catch {
        return [];
      }
    })();

    if (!canReachSupabase || !session || !currentStoreId) {
      return {
        ...emptyPreview,
        localTotal: localProducts.length,
      };
    }

    try {
      const remoteCatalog = await loadCategoriesAndProducts(session.access_token, currentStoreId);
      const remoteProducts = remoteCatalog.products;
      const remoteBySku = new Map<string, Product>();
      const remoteByBarcode = new Map<string, Product[]>();

      remoteProducts.forEach((product) => {
        const skuKey = (product.sku || '').trim().toLowerCase();
        const barcodeKey = (product.barcode || '').trim();
        if (skuKey && !remoteBySku.has(skuKey)) remoteBySku.set(skuKey, product);
        if (barcodeKey) {
          const current = remoteByBarcode.get(barcodeKey) ?? [];
          current.push(product);
          remoteByBarcode.set(barcodeKey, current);
        }
      });

      const seenSku = new Set<string>();
      const seenBarcode = new Set<string>();

      let toCreate = 0;
      let toUpdate = 0;
      let conflicts = 0;
      let missingIdentifiers = 0;
      let duplicateLocalIdentifiers = 0;
      const sampleConflicts: string[] = [];

      localProducts.forEach((localProduct) => {
        const skuKey = (localProduct.sku || '').trim().toLowerCase();
        const barcodeKey = (localProduct.barcode || '').trim();

        if (!skuKey && !barcodeKey) {
          missingIdentifiers += 1;
          if (sampleConflicts.length < 8) {
            sampleConflicts.push(`${localProduct.name}: sin SKU ni código de barras`);
          }
          return;
        }

        if (skuKey) {
          if (seenSku.has(skuKey)) duplicateLocalIdentifiers += 1;
          seenSku.add(skuKey);
        }

        if (barcodeKey) {
          if (seenBarcode.has(barcodeKey)) duplicateLocalIdentifiers += 1;
          seenBarcode.add(barcodeKey);
        }

        const remoteBySkuMatch = skuKey ? remoteBySku.get(skuKey) : undefined;
        const remoteBarcodeCandidates = barcodeKey ? (remoteByBarcode.get(barcodeKey) ?? []) : [];
        const remoteByBarcodeMatch = remoteBarcodeCandidates.length === 1
          ? remoteBarcodeCandidates[0]
          : undefined;

        if (remoteBySkuMatch && remoteBarcodeCandidates.length > 0 && !remoteBarcodeCandidates.some((candidate) => candidate.id === remoteBySkuMatch.id)) {
          conflicts += 1;
          if (sampleConflicts.length < 8) {
            sampleConflicts.push(`${localProduct.name}: SKU y código apuntan a productos remotos distintos`);
          }
          return;
        }

        if (!remoteBySkuMatch && remoteBarcodeCandidates.length > 1) {
          conflicts += 1;
          if (sampleConflicts.length < 8) {
            sampleConflicts.push(`${localProduct.name}: código de barras compartido con múltiples productos remotos, usa SKU para decidir actualización`);
          }
          return;
        }

        if (remoteBySkuMatch || remoteByBarcodeMatch) {
          toUpdate += 1;
          return;
        }

        toCreate += 1;
      });

      return {
        canCompare: true,
        localTotal: localProducts.length,
        remoteTotal: remoteProducts.length,
        toCreate,
        toUpdate,
        conflicts,
        missingIdentifiers,
        duplicateLocalIdentifiers,
        sampleConflicts,
      };
    } catch (error) {
      console.error('No se pudo comparar pendientes locales con Supabase', error);
      return {
        ...emptyPreview,
        reason: 'No se pudo consultar Supabase para comparar pendientes.',
        localTotal: localProducts.length,
      };
    }
  };

  // Auto-sync: deshabilitado por seguridad para evitar reimportaciones locales accidentales.
  useEffect(() => {
    if (!hasPendingSync || !canReachSupabase || !session || !currentStoreId) {
      pendingSyncNoticeRef.current = false;
      if (autoSyncTimerRef.current) {
        window.clearTimeout(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }
      return;
    }

    if (!ALLOW_AUTOMATIC_BACKUP_UPLOAD) {
      if (!pendingSyncNoticeRef.current) {
        toast.info('Hay cambios locales pendientes. La subida automática está desactivada por seguridad del inventario remoto.');
        pendingSyncNoticeRef.current = true;
      }
      return;
    }

    if (isAutoSyncingRef.current || autoSyncTimerRef.current) {
      return;
    }

    autoSyncTimerRef.current = window.setTimeout(() => {
      autoSyncTimerRef.current = null;
      if (isAutoSyncingRef.current) return;

      isAutoSyncingRef.current = true;
      void uploadLocalBackupToSupabase(false)
        .finally(() => {
          isAutoSyncingRef.current = false;
        });
    }, 1200);

    return () => {
      if (autoSyncTimerRef.current) {
        window.clearTimeout(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }
    };
  }, [hasPendingSync, canReachSupabase, session, currentStoreId]);

  // Funciones de productos
  const addProduct = async (product: Omit<Product, 'id'>): Promise<ProductWriteStatus> => {
    if (isConnectedToSupabase && session && currentStoreId) {
      try {
        const created = await createProduct(session.access_token, currentStoreId, product);
        if (!created) {
          toast.error('Supabase no devolvió el producto creado.');
          return 'failed';
        }

        setProducts(prev => [...prev, created]);

        if (created.stock > 0) {
          const unitCost = buildUnitCostWithIva(created);
          appendKardexMovement({
            productId: created.id,
            productName: created.name,
            type: 'entry',
            reference: `INI-${created.id}`,
            quantity: created.stock,
            stockBefore: 0,
            stockAfter: created.stock,
            unitCost,
            unitSalePrice: created.salePrice,
            totalCost: unitCost * created.stock,
          });
        }

        return 'remote-synced';
      } catch (error) {
        console.error('No se pudo crear producto en Supabase', error);
        toast.error(resolveProductWriteErrorMessage(error));
        return 'failed';
      }
    }

    const newProduct = { ...product, id: Date.now().toString() };
    setProducts(prev => [...prev, newProduct]);
    markPendingSync();

    if (newProduct.stock > 0) {
      const unitCost = buildUnitCostWithIva(newProduct);
      appendKardexMovement({
        productId: newProduct.id,
        productName: newProduct.name,
        type: 'entry',
        reference: `INI-${newProduct.id}`,
        quantity: newProduct.stock,
        stockBefore: 0,
        stockAfter: newProduct.stock,
        unitCost,
        unitSalePrice: newProduct.salePrice,
        totalCost: unitCost * newProduct.stock,
      });
    }

    return 'local-pending';
  };

  const updateProduct = async (id: string, updatedProduct: Partial<Product>): Promise<ProductWriteStatus> => {
    if (isConnectedToSupabase && session && currentStoreId) {
      try {
        await patchProduct(session.access_token, currentStoreId, id, updatedProduct);
        setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updatedProduct } : p));
        return 'remote-synced';
      } catch (error) {
        console.error('No se pudo actualizar producto en Supabase', error);
        toast.error(resolveProductWriteErrorMessage(error));
        return 'failed';
      }
    }

    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updatedProduct } : p));
    markPendingSync();
    return 'local-pending';
  };

  const adjustStock = async (
    productId: string,
    nextStock: number,
    options?: {
      reference?: string;
      unitCost?: number;
      unitSalePrice?: number;
      nextCostPrice?: number;
      nextIva?: number;
      nextIpuc?: number;
      nextUnitsPerPurchase?: number;
      productName?: string;
    }
  ): Promise<boolean> => {
    const product = products.find(p => p.id === productId);
    if (!product) return false;

    const stockAfter = Number.isFinite(nextStock) ? nextStock : product.stock;
    const stockBefore = product.stock;
    if (stockAfter === stockBefore) return true;

    const status = await updateProduct(productId, { stock: stockAfter });
    if (status === 'failed') return false;

    const effectiveCostPrice = typeof options?.nextCostPrice === 'number' ? options.nextCostPrice : product.costPrice;
    const effectiveIva = typeof options?.nextIva === 'number' ? options.nextIva : product.iva;
    const effectiveIpuc = typeof options?.nextIpuc === 'number' ? options.nextIpuc : Number(product.ipuc || 0);
    const effectiveUnits = typeof options?.nextUnitsPerPurchase === 'number'
      ? options.nextUnitsPerPurchase
      : Number(product.unitsPerPurchase ?? 1) || 1;
    const unitCost = typeof options?.unitCost === 'number'
      ? options.unitCost
      : buildUnitCostWithIva({
          ...product,
          costPrice: effectiveCostPrice,
          iva: effectiveIva,
          ipuc: effectiveIpuc,
          unitsPerPurchase: effectiveUnits,
        });
    const unitSalePrice = typeof options?.unitSalePrice === 'number'
      ? options.unitSalePrice
      : product.salePrice;

    const delta = stockAfter - stockBefore;
    appendKardexMovement({
      productId,
      productName: options?.productName || product.name,
      type: 'adjustment',
      reference: options?.reference || `AJU-${Date.now().toString().slice(-6)}`,
      quantity: delta,
      stockBefore,
      stockAfter,
      unitCost,
      unitSalePrice,
      totalCost: Math.abs(delta) * unitCost,
    });
    return true;
  };

  const deleteProduct = async (id: string): Promise<ProductWriteStatus> => {
    if (isConnectedToSupabase && session && currentStoreId) {
      try {
        await removeProduct(session.access_token, currentStoreId, id);
        setProducts(prev => prev.filter(p => p.id !== id));
        return 'remote-synced';
      } catch (error) {
        console.error('No se pudo eliminar producto en Supabase', error);
        const message = error instanceof Error ? error.message : '';
        toast.error(message ? `No se pudo eliminar en Supabase: ${message}` : 'No se pudo eliminar en Supabase. No se aplicaron cambios locales.');
        return 'failed';
      }
    }

    setProducts(prev => prev.filter(p => p.id !== id));
    markPendingSync();
    return 'local-pending';
  };

  const searchProducts = (query: string): Product[] => {
    const lowerQuery = query.toLowerCase();
    return products.filter(p => 
      p.name.toLowerCase().includes(lowerQuery) ||
      p.sku.toLowerCase().includes(lowerQuery) ||
      p.barcode.includes(query)
    );
  };

  // Funciones de categorías
  const addCategory = async (name: string): Promise<CategoryWriteStatus> => {
    const normalizedName = name.trim();
    if (!normalizedName) return 'invalid';

    const alreadyExists = categories.some(
      category => category.toLowerCase() === normalizedName.toLowerCase()
    );
    if (alreadyExists) return 'invalid';

    if (isConnectedToSupabase && session && currentStoreId) {
      try {
        await createCategory(session.access_token, currentStoreId, normalizedName);
        setCategories(prev => [...prev, normalizedName]);
        return 'remote-synced';
      } catch (error) {
        console.error('No se pudo crear categoría en Supabase', error);
        toast.error('No se pudo crear la categoría en Supabase.');
        return 'failed';
      }
    }

    setCategories(prev => [...prev, normalizedName]);
    markPendingSync();
    return 'local-pending';
  };

  const updateCategory = async (oldName: string, newName: string): Promise<CategoryWriteStatus> => {
    const normalizedNewName = newName.trim();
    if (!normalizedNewName) return 'invalid';
    if (oldName === normalizedNewName) return 'remote-synced';

    const oldCategoryExists = categories.includes(oldName);
    if (!oldCategoryExists) return 'invalid';

    const duplicate = categories.some(
      category => category.toLowerCase() === normalizedNewName.toLowerCase() && category !== oldName
    );
    if (duplicate) return 'invalid';

    const productsToMove = products
      .filter(product => product.category === oldName)
      .map(product => product.id);

    if (isConnectedToSupabase && session && currentStoreId) {
      try {
        await renameCategory(session.access_token, currentStoreId, oldName, normalizedNewName);
        await Promise.all(productsToMove.map((productId) =>
          patchProduct(session.access_token, currentStoreId, productId, { category: normalizedNewName })
        ));

        setCategories(prev => prev.map(category => category === oldName ? normalizedNewName : category));
        setProducts(prev => prev.map(product =>
          product.category === oldName
            ? { ...product, category: normalizedNewName }
            : product
        ));
        return 'remote-synced';
      } catch (error) {
        console.error('No se pudo editar categoría en Supabase', error);
        toast.error('No se pudo actualizar la categoría en Supabase.');
        return 'failed';
      }
    }

    setCategories(prev => prev.map(category => category === oldName ? normalizedNewName : category));
    setProducts(prev => prev.map(product =>
      product.category === oldName
        ? { ...product, category: normalizedNewName }
        : product
    ));
    markPendingSync();
    return 'local-pending';
  };

  const deleteCategory = async (name: string, replacementCategory?: string): Promise<CategoryWriteStatus> => {
    if (!categories.includes(name)) return 'invalid';

    const hasProductsInCategory = products.some(product => product.category === name);
    const replacement = replacementCategory?.trim();

    if (hasProductsInCategory) {
      if (!replacement || replacement === name || !categories.includes(replacement)) {
        return 'invalid';
      }
    }

    const productsToMove = products.filter(product => product.category === name);

    if (isConnectedToSupabase && session && currentStoreId) {
      try {
        if (productsToMove.length > 0 && replacement) {
          await Promise.all(productsToMove.map((product) =>
            patchProduct(session.access_token, currentStoreId, product.id, { category: replacement })
          ));
        }

        await removeCategory(session.access_token, currentStoreId, name);

        if (productsToMove.length > 0 && replacement) {
          setProducts(prev => prev.map(product =>
            product.category === name
              ? { ...product, category: replacement }
              : product
          ));
        }
        setCategories(prev => prev.filter(category => category !== name));
        return 'remote-synced';
      } catch (error) {
        console.error('No se pudo eliminar categoría en Supabase', error);
        toast.error('No se pudo eliminar la categoría en Supabase.');
        return 'failed';
      }
    }

    if (productsToMove.length > 0 && replacement) {
      setProducts(prev => prev.map(product =>
        product.category === name
          ? { ...product, category: replacement }
          : product
      ));
    }
    setCategories(prev => prev.filter(category => category !== name));
    markPendingSync();
    return 'local-pending';
  };

  // Borradores de venta (multi-ventas).
  const persistDraftSnapshot = async (draft: SaleDraft) => {
    if (!isConnectedToSupabase || !session || !currentStoreId) return;
    await updateSaleDraftRow(session.access_token, currentStoreId, draft.id, {
      cashSessionId: currentCashSession?.id ?? draft.cashSessionId ?? null,
      customerId: draft.customerId ?? null,
      status: draft.status,
    });
    await replaceSaleDraftItems(session.access_token, currentStoreId, draft.id, draft.items.map((item) => ({
      productId: item.product.id,
      productName: item.product.name,
      quantity: item.quantity,
      unitCost: buildUnitCostWithIva(item.product),
      unitSalePrice: item.product.salePrice,
      discountPercent: item.discount,
      iva: item.product.iva,
    })));
  };

  const queueDraftSync = (draft: SaleDraft) => {
    if (!isConnectedToSupabase) return;
    const existingTimer = draftSyncTimers.current[draft.id];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }
    draftSyncTimers.current[draft.id] = window.setTimeout(() => {
      persistDraftSnapshot(draft)
        .catch((error) => {
          console.error('No se pudo sincronizar borrador en Supabase', error);
          markPendingSync();
          toast.error('No se pudo sincronizar el borrador con Supabase.');
        })
        .finally(() => {
          delete draftSyncTimers.current[draft.id];
        });
    }, 250);
  };

  const updateDraft = (draftId: string, updater: (draft: SaleDraft) => SaleDraft) => {
    let nextDraft: SaleDraft | null = null;
    setSaleDrafts(prev => prev.map((draft) => {
      if (draft.id !== draftId) return draft;
      nextDraft = updater(draft);
      return nextDraft;
    }));
    if (nextDraft) {
      queueDraftSync(nextDraft);
    }
  };

  const createSaleDraft = async (): Promise<SaleDraft | null> => {
    try {
      const createdAt = new Date().toISOString();
      if (!isConnectedToSupabase) {
        const draftId = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const draft: SaleDraft = {
          id: draftId,
          storeId: currentStoreId ?? undefined,
          userId: session?.user.id,
          cashSessionId: currentCashSession?.id,
          status: 'open',
          createdAt,
          updatedAt: createdAt,
          items: [],
        };
        setSaleDrafts(prev => [draft, ...prev]);
        setActiveDraftId(draftId);
        return draft;
      }

      if (!session || !currentStoreId) {
        return null;
      }

      const draftId = await createSaleDraftRow(session.access_token, currentStoreId, {
        userId: session.user.id,
        cashSessionId: currentCashSession?.id,
        status: 'open',
      });
      if (!draftId) return null;

      const draft: SaleDraft = {
        id: draftId,
        storeId: currentStoreId,
        userId: session.user.id,
        cashSessionId: currentCashSession?.id,
        status: 'open',
        createdAt,
        updatedAt: createdAt,
        items: [],
      };
      setSaleDrafts(prev => [draft, ...prev]);
      setActiveDraftId(draftId);
      return draft;
    } catch (error) {
      console.error('No se pudo crear borrador en Supabase', error);
      markPendingSync();
      if (isMissingTableError(error, 'sale_drafts')) {
        toast.error('Faltan tablas de borradores en Supabase. Aplica la migración de ventas múltiples.');
      } else {
        toast.error('No se pudo crear el borrador de venta.');
      }
      return null;
    }
  };

  const switchSaleDraft = (draftId: string) => {
    if (saleDrafts.some(draft => draft.id === draftId)) {
      setActiveDraftId(draftId);
    }
  };

  const discardSaleDraft = async (draftId: string) => {
    const nextDrafts = saleDrafts.filter(draft => draft.id !== draftId);
    setSaleDrafts(nextDrafts);

    if (activeDraftId === draftId) {
      setActiveDraftId(nextDrafts[0]?.id ?? null);
    }

    const pendingTimer = draftSyncTimers.current[draftId];
    if (pendingTimer) {
      window.clearTimeout(pendingTimer);
      delete draftSyncTimers.current[draftId];
    }

    if (isConnectedToSupabase && session && currentStoreId) {
      try {
        await deleteSaleDraftRow(session.access_token, currentStoreId, draftId);
      } catch (error) {
        console.error('No se pudo eliminar borrador en Supabase', error);
        markPendingSync();
        toast.error('No se pudo eliminar el borrador en Supabase.');
      }
    }

    if (nextDrafts.length === 0) {
      void createSaleDraft();
    }
  };

  const setActiveDraftCustomerId = (customerId: string | null) => {
    if (!activeDraft) return;
    updateDraft(activeDraft.id, (draft) => ({
      ...draft,
      customerId: customerId || undefined,
      updatedAt: new Date().toISOString(),
    }));
  };

  // Funciones de carrito (sobre el draft activo).
  const addToCart = (product: Product, quantity: number) => {
    if (!activeDraft) {
      toast.error('No hay una venta activa.');
      return;
    }

    const existingItem = cart.find(item => item.product.id === product.id);
    const nextItems = existingItem
      ? cart.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      : [...cart, { product, quantity, discount: 0 }];

    updateDraft(activeDraft.id, (draft) => ({
      ...draft,
      items: nextItems,
      updatedAt: new Date().toISOString(),
    }));
  };

  const removeFromCart = (productId: string) => {
    if (!activeDraft) return;
    const nextItems = cart.filter(item => item.product.id !== productId);
    updateDraft(activeDraft.id, (draft) => ({
      ...draft,
      items: nextItems,
      updatedAt: new Date().toISOString(),
    }));
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (!activeDraft) return;
    const nextItems = cart.map(item =>
      item.product.id === productId ? { ...item, quantity } : item
    );
    updateDraft(activeDraft.id, (draft) => ({
      ...draft,
      items: nextItems,
      updatedAt: new Date().toISOString(),
    }));
  };

  const updateCartDiscount = (productId: string, discount: number) => {
    if (!activeDraft) return;
    const nextItems = cart.map(item =>
      item.product.id === productId ? { ...item, discount } : item
    );
    updateDraft(activeDraft.id, (draft) => ({
      ...draft,
      items: nextItems,
      updatedAt: new Date().toISOString(),
    }));
  };

  const clearCart = () => {
    if (!activeDraft) return;
    updateDraft(activeDraft.id, (draft) => ({
      ...draft,
      items: [],
      updatedAt: new Date().toISOString(),
    }));
  };

  // Calcula costo unitario con IVA según unidades por compra.
  const buildUnitCostWithIva = (product: Product, nextCostPrice?: number): number => {
    const units = Number(product.unitsPerPurchase ?? 1) || 1;
    const baseCost = typeof nextCostPrice === 'number' ? nextCostPrice : product.costPrice;
    const taxFactor = 1 + ((Number(product.iva || 0) + Number(product.ipuc || 0)) / 100);
    return (baseCost * taxFactor) / units;
  };

  // Registra un movimiento de Kardex local y lo intenta persistir en Supabase.
  const appendKardexMovement = (movement: Omit<KardexMovement, 'id' | 'date'>) => {
    const nextMovement: KardexMovement = {
      ...movement,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: new Date().toISOString()
    };

    setKardexMovements(prev => [...prev, nextMovement]);

    if (isConnectedToSupabase && session && currentStoreId) {
      void createKardexMovementRow(session.access_token, currentStoreId, {
        productId: movement.productId,
        productName: movement.productName,
        type: movement.type,
        reference: movement.reference,
        quantity: movement.quantity,
        stockBefore: movement.stockBefore,
        stockAfter: movement.stockAfter,
        unitCost: movement.unitCost,
        unitSalePrice: movement.unitSalePrice,
        totalCost: movement.totalCost,
        createdAt: nextMovement.date,
      }).catch((error) => {
        console.error('No se pudo guardar movimiento kardex en Supabase', error);
        markPendingSync();
      });
    }
  };

  const currentCashSession = [...cashSessions]
    .filter((session) => session.status === 'open' || session.status === 'counting')
    .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())[0] ?? null;

  const cartTotal = cart.reduce((total, item) => {
    const { lineTotal } = computeLineMoney(
      item.product.salePrice,
      item.quantity,
      item.discount,
      item.product.iva,
    );
    return roundMoney(total + lineTotal);
  }, 0);

  const getCashSessionReport = (sessionId: string): CashSessionReport => {
    const session = cashSessions.find(s => s.id === sessionId);
    if (!session) {
      return {
        salesTotal: 0,
        salesReturnedTotal: 0,
        salesByMethod: {},
        cashSalesTotal: 0,
        cashInTotal: 0,
        cashOutTotal: 0,
        cashReturnTotal: 0,
        expectedCash: 0,
      };
    }

    const sessionSales = sales.filter(sale => sale.cashSessionId === sessionId);
    const returnedSales = sessionSales.filter((sale) => Boolean(sale.returnedAt));
    const netSales = sessionSales.filter((sale) => !sale.returnedAt);
    const salesByMethod: Record<string, number> = {};
    let salesTotal = 0;
    let cashSalesTotal = 0;

    netSales.forEach((sale) => {
      salesTotal += sale.total;

      const breakdown = getSalePaymentBreakdown(sale);
      const breakdownEntries = Object.entries(breakdown).filter(([, amount]) => toNumber(amount) > 0);

      if (breakdownEntries.length === 0) {
        const method = sale.paymentMethod || 'otro';
        const amount = roundMoney(sale.total);
        salesByMethod[method] = roundMoney((salesByMethod[method] || 0) + amount);
        if (method === 'efectivo') {
          cashSalesTotal = roundMoney(cashSalesTotal + amount);
        }
        return;
      }

      breakdownEntries.forEach(([method, amount]) => {
        const roundedAmount = roundMoney(toNumber(amount));
        salesByMethod[method] = roundMoney((salesByMethod[method] || 0) + roundedAmount);
      });

      cashSalesTotal = roundMoney(cashSalesTotal + toNumber(breakdown.efectivo));
    });

    const sessionMovements = cashMovements.filter(movement => movement.cashSessionId === sessionId);
    const isLegacyReturnMovement = (movement: CashMovement) =>
      movement.type === 'cash_out' && movement.reason?.startsWith('Devolución venta ');
    const resolveCategory = (movement: CashMovement): CashMovementCategory => {
      if (movement.category) return movement.category;
      if (isLegacyReturnMovement(movement)) return 'return';
      return movement.type === 'cash_in' ? 'manual_income' : 'manual_expense';
    };
    const affectsPhysicalCash = (movement: CashMovement): boolean => {
      if (!movement.paymentMethod) return true;
      return movement.paymentMethod === 'efectivo';
    };
    const salesReturnedTotal = returnedSales.reduce((sum, sale) => sum + sale.total, 0);
    const cashReturnTotal = sessionMovements
      .filter((movement) => movement.type === 'cash_out' && resolveCategory(movement) === 'return' && affectsPhysicalCash(movement))
      .reduce((sum, movement) => sum + movement.amount, 0);
    const cashInTotal = sessionMovements
      .filter((movement) => {
        if (movement.type !== 'cash_in') return false;
        if (!affectsPhysicalCash(movement)) return false;
        const category = resolveCategory(movement);
        return category === 'manual_income' || category === 'credit_payment' || category === 'adjustment';
      })
      .reduce((sum, movement) => sum + movement.amount, 0);
    const cashOutTotal = sessionMovements
      .filter((movement) => {
        if (movement.type !== 'cash_out') return false;
        if (!affectsPhysicalCash(movement)) return false;
        const category = resolveCategory(movement);
        return category === 'manual_expense' || category === 'adjustment';
      })
      .reduce((sum, movement) => sum + movement.amount, 0);

    const roundedSalesByMethod: Record<string, number> = Object.fromEntries(
      Object.entries(salesByMethod).map(([method, total]) => [method, roundMoney(total)])
    );

    const expectedCash = roundMoney(session.openingCash + cashSalesTotal + cashInTotal - cashOutTotal - cashReturnTotal);

    return {
      salesTotal: roundMoney(salesTotal),
      salesReturnedTotal: roundMoney(salesReturnedTotal),
      salesByMethod: roundedSalesByMethod,
      cashSalesTotal: roundMoney(cashSalesTotal),
      cashInTotal: roundMoney(cashInTotal),
      cashOutTotal: roundMoney(cashOutTotal),
      cashReturnTotal: roundMoney(cashReturnTotal),
      expectedCash,
    };
  };

  // Funciones de caja
  const openCashSession = async (openingCash: number, openingNote?: string): Promise<boolean> => {
    if (currentCashSession) {
      const statusLabel = currentCashSession.status === 'counting' ? 'en arqueo' : 'abierta';
      toast.info(`Ya existe una caja ${statusLabel} en esta tienda.`);
      return false;
    }

    const safeOpeningCash = roundMoney(Number.isFinite(openingCash) ? Math.max(0, openingCash) : 0);
    const normalizedOpeningNote = openingNote?.trim() || undefined;
    const openedAt = new Date().toISOString();
    let sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (isConnectedToSupabase && session && currentStoreId) {
      try {
        const remoteId = await createCashSession(session.access_token, currentStoreId, {
          userId: session.user.id,
          openingCash: safeOpeningCash,
          openingNote: normalizedOpeningNote,
          openedAt,
        });
        if (remoteId) {
          sessionId = remoteId;
        }
      } catch (error) {
        console.error('No se pudo abrir caja en Supabase', error);
        markPendingSync();
        toast.error('Caja abierta localmente, pero falló en Supabase.');
      }
    }

    const newSession: CashSession = {
      id: sessionId,
      storeId: currentStoreId ?? undefined,
      userId: session?.user.id,
      openedBy: session?.user.id,
      openedAt,
      openingNote: normalizedOpeningNote,
      openingCash: safeOpeningCash,
      status: 'open',
    };

    setCashSessions(prev => [...prev, newSession]);

    if (safeOpeningCash > 0) {
      await addCashMovement(
        'cash_in',
        safeOpeningCash,
        'Apertura de caja',
        {
          category: 'opening',
          subtype: 'initial_float',
          paymentMethod: 'efectivo',
          referenceType: 'cash_session',
          referenceId: uuidLike(sessionId) ? sessionId : undefined,
          metadata: { auto: true },
          silent: true,
          sessionId,
          date: openedAt,
        },
      );
    }

    toast.success('Caja abierta correctamente.');
    return true;
  };

  const addCashMovement = async (
    type: 'cash_in' | 'cash_out',
    amount: number,
    reason?: string,
    options?: {
      category?: CashMovementCategory;
      subtype?: string;
      paymentMethod?: PaymentMethodOption;
      referenceType?: CashMovementReferenceType;
      referenceId?: string;
      metadata?: Record<string, unknown>;
      silent?: boolean;
      sessionId?: string;
      date?: string;
    },
  ): Promise<CashMovement | null> => {
    const targetSessionId = options?.sessionId ?? currentCashSession?.id;
    if (!targetSessionId) {
      if (!options?.silent) {
        toast.error('No hay una caja abierta.');
      }
      return null;
    }

    const targetSession = cashSessions.find((session) => session.id === targetSessionId);
    if (!options?.silent && targetSession && targetSession.status !== 'open') {
      toast.error('Solo puedes registrar movimientos manuales con la caja abierta.');
      return null;
    }

    const safeAmount = roundMoney(Number.isFinite(amount) ? Math.max(0, amount) : 0);
    if (safeAmount <= 0) {
      if (!options?.silent) {
        toast.error('El monto debe ser mayor a 0.');
      }
      return null;
    }

    const fallbackCategory = type === 'cash_in' ? 'manual_income' : 'manual_expense';
    const movementCategory = normalizeMovementCategory(options?.category, fallbackCategory);
    const movementPaymentMethod = options?.paymentMethod
      ?? (movementCategory === 'sale' ? undefined : 'efectivo');
    const movementDate = options?.date || new Date().toISOString();
    let movementId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (isConnectedToSupabase && session && currentStoreId && uuidLike(targetSessionId)) {
      try {
        const remoteId = await createCashMovement(session.access_token, currentStoreId, {
          cashSessionId: targetSessionId,
          userId: session.user.id,
          type,
          amount: safeAmount,
          reason,
          category: movementCategory,
          subtype: options?.subtype,
          paymentMethod: movementPaymentMethod,
          referenceType: options?.referenceType,
          referenceId: options?.referenceId,
          metadata: options?.metadata,
          createdAt: movementDate,
        });
        if (remoteId) {
          movementId = remoteId;
        }
      } catch (error) {
        console.error('No se pudo guardar movimiento de caja en Supabase', error);
        markPendingSync();
        if (!options?.silent) {
          toast.error('Movimiento guardado localmente, pero falló en Supabase.');
        }
      }
    }

    const movement: CashMovement = {
      id: movementId,
      cashSessionId: targetSessionId,
      userId: session?.user.id,
      type,
      amount: safeAmount,
      reason: reason?.trim() ? reason.trim() : undefined,
      category: movementCategory,
      subtype: options?.subtype,
      paymentMethod: movementPaymentMethod,
      referenceType: options?.referenceType,
      referenceId: options?.referenceId,
      metadata: options?.metadata ?? {},
      date: movementDate,
    };

    setCashMovements(prev => [...prev, movement]);
    if (!options?.silent) {
      toast.success(type === 'cash_in' ? 'Ingreso registrado.' : 'Retiro registrado.');
    }
    return movement;
  };

  const startCashCounting = async (): Promise<boolean> => {
    if (!currentCashSession) {
      toast.error('No hay una caja activa para iniciar arqueo.');
      return false;
    }

    if (currentCashSession.status === 'counting') {
      toast.info('La caja ya está en arqueo.');
      return true;
    }

    if (currentCashSession.status !== 'open') {
      toast.error('Solo una caja abierta puede pasar a arqueo.');
      return false;
    }

    const updated: CashSession = {
      ...currentCashSession,
      status: 'counting',
    };

    setCashSessions((prev) => prev.map((sessionItem) => (
      sessionItem.id === currentCashSession.id ? updated : sessionItem
    )));

    if (isConnectedToSupabase && session && currentStoreId && uuidLike(currentCashSession.id)) {
      try {
        await updateCashSession(session.access_token, currentStoreId, currentCashSession.id, {
          status: 'counting',
        });
      } catch (error) {
        console.error('No se pudo iniciar arqueo en Supabase', error);
        markPendingSync();
        toast.error('Arqueo iniciado localmente, pero falló en Supabase.');
      }
    }

    toast.success('Arqueo iniciado. Las ventas quedan bloqueadas hasta cerrar caja.');
    return true;
  };

  const cancelCashCounting = async (): Promise<boolean> => {
    if (!currentCashSession) {
      toast.error('No hay una caja activa.');
      return false;
    }

    if (currentCashSession.status !== 'counting') {
      toast.info('La caja no está en arqueo.');
      return true;
    }

    const updated: CashSession = {
      ...currentCashSession,
      status: 'open',
    };

    setCashSessions((prev) => prev.map((sessionItem) => (
      sessionItem.id === currentCashSession.id ? updated : sessionItem
    )));

    if (isConnectedToSupabase && session && currentStoreId && uuidLike(currentCashSession.id)) {
      try {
        await updateCashSession(session.access_token, currentStoreId, currentCashSession.id, {
          status: 'open',
        });
      } catch (error) {
        console.error('No se pudo cancelar arqueo en Supabase', error);
        markPendingSync();
        toast.error('Se salió del arqueo localmente, pero falló en Supabase.');
      }
    }

    toast.success('Saliste del arqueo. La caja vuelve a estado abierta.');
    return true;
  };

  const closeCashSession = async (
    countedCash: number,
    closingNote?: string,
    countedCashBreakdown?: CashCountBreakdown,
  ): Promise<CashSession | null> => {
    if (!currentCashSession) {
      toast.error('No hay una caja activa para cerrar.');
      return null;
    }

    const sanitizedBreakdown = sanitizeCashCountBreakdown(countedCashBreakdown);
    const safeCounted = sanitizedBreakdown
      ? Math.max(0, Math.round(sanitizedBreakdown.total))
      : roundMoney(Number.isFinite(countedCash) ? Math.max(0, countedCash) : 0);
    const report = getCashSessionReport(currentCashSession.id);
    const expectedCash = roundMoney(report.expectedCash);
    const difference = roundMoney(safeCounted - expectedCash);
    const closedAt = new Date().toISOString();
    const normalizedClosingNote = closingNote?.trim() || undefined;
    const nextStatus: CashSession['status'] = difference === 0 ? 'closed' : 'closed_with_difference';

    const closedSession: CashSession = {
      ...currentCashSession,
      closedAt,
      expectedCash,
      countedCash: safeCounted,
      countedCashBreakdown: sanitizedBreakdown,
      countedAt: closedAt,
      closingNote: normalizedClosingNote,
      closedBy: session?.user.id,
      difference,
      status: nextStatus,
    };

    setCashSessions(prev => prev.map(sessionItem => sessionItem.id === currentCashSession.id ? closedSession : sessionItem));

    if (isConnectedToSupabase && session && currentStoreId && uuidLike(currentCashSession.id)) {
      try {
        await updateCashSession(session.access_token, currentStoreId, currentCashSession.id, {
          closedAt,
          expectedCash,
          countedCash: safeCounted,
          countedCashBreakdown: sanitizedBreakdown,
          countedAt: closedAt,
          closingNote: normalizedClosingNote,
          closedBy: session.user.id,
          difference,
          status: nextStatus,
        });
      } catch (error) {
        console.error('No se pudo cerrar caja en Supabase', error);
        markPendingSync();
        toast.error('Caja cerrada localmente, pero falló en Supabase.');
      }
    }

    if (difference === 0) {
      toast.success('Caja cerrada correctamente.');
    } else {
      toast.warning('Caja cerrada con diferencia. Revisa el arqueo para auditoría.');
    }
    return closedSession;
  };

  const clearCashReports = async (): Promise<boolean> => {
    if (storeConfig.userRole !== 'admin') {
      toast.error('Solo un administrador puede limpiar reportes de caja.');
      return false;
    }

    if (currentCashSession) {
      toast.error('Cierra o finaliza la caja activa antes de limpiar reportes.');
      return false;
    }

    if (!isConnectedToSupabase || !session || !currentStoreId) {
      toast.error('Para limpiar sistema y base de datos necesitas conexión activa a Supabase.');
      return false;
    }

    try {
      await deleteCashReportsByStore(session.access_token, currentStoreId);
    } catch (error) {
      console.error('No se pudieron limpiar reportes de caja en Supabase', error);
      toast.error('No se pudo limpiar en base de datos. No se aplicaron cambios locales.');
      return false;
    }

    setCashSessions([]);
    setCashMovements([]);
    setSales((prev) => prev.map((sale) => (
      sale.cashSessionId
        ? { ...sale, cashSessionId: undefined }
        : sale
    )));
    setSaleDrafts((prev) => prev.map((draft) => (
      draft.cashSessionId
        ? { ...draft, cashSessionId: undefined }
        : draft
    )));

    toast.success('Reportes de caja eliminados en sistema y base de datos.');
    return true;
  };

  const clearSelectedCashReports = async (sessionIds: string[]): Promise<boolean> => {
    if (storeConfig.userRole !== 'admin') {
      toast.error('Solo un administrador puede eliminar reportes de caja.');
      return false;
    }

    const selectedUniqueIds = Array.from(new Set(sessionIds.filter((id) => typeof id === 'string' && id.trim().length > 0)));
    if (selectedUniqueIds.length === 0) {
      toast.error('Selecciona al menos un reporte para eliminar.');
      return false;
    }

    if (currentCashSession && selectedUniqueIds.includes(currentCashSession.id)) {
      toast.error('No puedes eliminar una caja activa. Cierra o finaliza esa caja primero.');
      return false;
    }

    if (!isConnectedToSupabase || !session || !currentStoreId) {
      toast.error('Para eliminar reportes en sistema y base de datos necesitas conexión activa a Supabase.');
      return false;
    }

    try {
      await deleteCashReportsByIds(session.access_token, currentStoreId, selectedUniqueIds);
    } catch (error) {
      console.error('No se pudieron eliminar reportes de caja seleccionados en Supabase', error);
      toast.error('No se pudo eliminar en base de datos. No se aplicaron cambios locales.');
      return false;
    }

    const selectedSet = new Set(selectedUniqueIds);

    setCashSessions((prev) => prev.filter((cashSession) => !selectedSet.has(cashSession.id)));
    setCashMovements((prev) => prev.filter((movement) => !selectedSet.has(movement.cashSessionId)));
    setSales((prev) => prev.map((sale) => (
      sale.cashSessionId && selectedSet.has(sale.cashSessionId)
        ? { ...sale, cashSessionId: undefined }
        : sale
    )));
    setSaleDrafts((prev) => prev.map((draft) => (
      draft.cashSessionId && selectedSet.has(draft.cashSessionId)
        ? { ...draft, cashSessionId: undefined }
        : draft
    )));

    toast.success(`Se eliminaron ${selectedUniqueIds.length} reporte(s) de caja.`);
    return true;
  };

  const registerSaleMovements = async (sale: Sale, sessionId: string, movementDate: string) => {
    const breakdown = getSalePaymentBreakdown(sale);
    const entries = Object.entries(breakdown)
      .map(([method, amount]) => [method as PaymentMethodOption, roundMoney(toNumber(amount))] as const)
      .filter(([, amount]) => amount > 0);

    for (const [method, amount] of entries) {
      await addCashMovement(
        'cash_in',
        amount,
        `Venta ${sale.invoiceNumber || sale.id} - ${method}`,
        {
          category: 'sale',
          subtype: `sale_${method}`,
          paymentMethod: method,
          referenceType: 'sale',
          referenceId: sale.id,
          metadata: {
            auto: true,
            saleId: sale.id,
            invoiceNumber: sale.invoiceNumber ?? null,
          },
          silent: true,
          sessionId,
          date: movementDate,
        },
      );
    }
  };

  // Funciones de ventas
  const completeSale = async (paymentInput: SalePaymentInput): Promise<Sale | null> => {
    if (!currentCashSession) {
      toast.error('Debes abrir una caja antes de registrar ventas.');
      return null;
    }

    if (currentCashSession.status !== 'open') {
      toast.error('La caja está en arqueo. Finaliza el cierre para volver a vender.');
      return null;
    }

    if (!activeDraft || cart.length === 0) {
      toast.error('No hay productos en la venta.');
      return null;
    }

    let subtotal = 0;
    let discountTotal = 0;
    let ivaTotal = 0;

    for (const item of cart) {
      const product = products.find(p => p.id === item.product.id) ?? item.product;
      if (product.stock < item.quantity) {
        toast.error(`Stock insuficiente para ${product.name}.`);
        return null;
      }

      const { lineSubtotal, lineDiscount, lineIva } = computeLineMoney(
        item.product.salePrice,
        item.quantity,
        item.discount,
        item.product.iva,
      );

      subtotal = roundMoney(subtotal + lineSubtotal);
      discountTotal = roundMoney(discountTotal + lineDiscount);
      ivaTotal = roundMoney(ivaTotal + lineIva);
    }

    const roundedSubtotal = roundMoney(subtotal);
    const roundedDiscount = roundMoney(discountTotal);
    const roundedIva = roundMoney(ivaTotal);
    const roundedTotal = roundMoney(roundedSubtotal - roundedDiscount);

    if (roundedTotal <= 0) {
      toast.error('No hay productos en la venta.');
      return null;
    }

    const primaryMethod = PAYMENT_METHOD_OPTIONS.includes(paymentInput.primaryMethod)
      ? paymentInput.primaryMethod
      : 'otro';
    const secondaryMethod = paymentInput.secondaryMethod
      && paymentInput.secondaryMethod !== primaryMethod
      && paymentInput.secondaryMethod !== 'credito'
      && PAYMENT_METHOD_OPTIONS.includes(paymentInput.secondaryMethod)
      ? paymentInput.secondaryMethod
      : undefined;

    const primaryRawAmount = roundMoney(Math.max(0, toNumber(paymentInput.primaryAmount)));
    const primaryAmount = primaryMethod === 'credito'
      ? 0
      : (primaryRawAmount > 0 ? primaryRawAmount : roundedTotal);
    const secondaryAmount = secondaryMethod
      ? roundMoney(Math.max(0, toNumber(paymentInput.secondaryAmount)))
      : 0;

    const paymentBreakdown: PaymentBreakdown = {};
    const addPaymentAmount = (method: PaymentMethodOption, amount: number) => {
      if (amount <= 0 || method === 'credito') return;
      paymentBreakdown[method] = roundMoney(toNumber(paymentBreakdown[method]) + amount);
    };

    addPaymentAmount(primaryMethod, primaryAmount);
    if (secondaryMethod) {
      addPaymentAmount(secondaryMethod, secondaryAmount);
    }

    const cashApplied = roundMoney(toNumber(paymentBreakdown.efectivo));
    const nonCashApplied = roundMoney(
      toNumber(paymentBreakdown.tarjeta)
      + toNumber(paymentBreakdown.transferencia)
      + toNumber(paymentBreakdown.nequi)
      + toNumber(paymentBreakdown.daviplata)
      + toNumber(paymentBreakdown.otro)
    );

    const hasOnlyCashPayment = cashApplied > 0 && nonCashApplied === 0;
    let allocatedPaid = roundMoney(cashApplied + nonCashApplied);
    let cashTendered = cashApplied;
    let change = 0;

    if (primaryMethod === 'credito' && allocatedPaid <= 0) {
      allocatedPaid = 0;
      cashTendered = 0;
    } else if (allocatedPaid <= 0) {
      toast.error('Ingresa al menos un abono para registrar la venta.');
      return null;
    }

    if (allocatedPaid > roundedTotal) {
      if (!hasOnlyCashPayment) {
        toast.error('El pago total no puede superar el valor de la venta en pagos mixtos.');
        return null;
      }

      cashTendered = allocatedPaid;
      change = roundMoney(cashTendered - roundedTotal);
      paymentBreakdown.efectivo = roundedTotal;
      allocatedPaid = roundedTotal;
    }

    let creditedAmount = roundMoney(Math.max(0, roundedTotal - allocatedPaid));
    if (primaryMethod === 'credito' && allocatedPaid <= 0) {
      creditedAmount = roundedTotal;
    }

    if (creditedAmount > 0) {
      paymentBreakdown.credito = creditedAmount;
    } else {
      delete paymentBreakdown.credito;
    }

    if (creditedAmount > 0 && !activeDraft.customerId) {
      toast.error('Selecciona un cliente para registrar el saldo pendiente como fiado.');
      return null;
    }

    if (!hasOnlyCashPayment) {
      cashTendered = cashApplied;
      change = 0;
    }

    const nonCreditMethods = Object.entries(paymentBreakdown)
      .filter(([method, amount]) => method !== 'credito' && toNumber(amount) > 0)
      .map(([method]) => method as PaymentMethodOption);

    const toDbPaymentMethod = (method: PaymentMethodOption): 'efectivo' | 'tarjeta' | 'transferencia' | 'credito' | 'otro' => {
      if (method === 'efectivo') return 'efectivo';
      if (method === 'tarjeta') return 'tarjeta';
      if (method === 'transferencia' || method === 'nequi' || method === 'daviplata') return 'transferencia';
      if (method === 'credito') return 'credito';
      return 'otro';
    };

    const paymentMethodValue: 'efectivo' | 'tarjeta' | 'transferencia' | 'credito' | 'otro' =
      creditedAmount === roundedTotal
        ? 'credito'
        : (nonCreditMethods.length === 1 && creditedAmount === 0)
          ? toDbPaymentMethod(nonCreditMethods[0])
          : 'otro';

    if (!isConnectedToSupabase) {
      const saleDate = new Date().toISOString();
      const invoiceNumber = getNextOfflineInvoiceNumber();

      const newSale: Sale = {
        id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date: saleDate,
        items: [...cart],
        subtotal: roundedSubtotal,
        discount: roundedDiscount,
        iva: roundedIva,
        total: roundedTotal,
        paymentMethod: paymentMethodValue,
        cashReceived: cashTendered,
        change,
        paymentBreakdown,
        creditedAmount,
        customerId: activeDraft.customerId,
        invoiceNumber,
        cashSessionId: currentCashSession.id,
        returnedAt: null,
      };

      setSales(prev => [...prev, newSale]);

      await registerSaleMovements(newSale, currentCashSession.id, saleDate);

      setProducts(prev => prev.map((product) => {
        const item = cart.find(cartItem => cartItem.product.id === product.id);
        if (!item) return product;
        return { ...product, stock: product.stock - item.quantity };
      }));

      cart.forEach((item) => {
        const product = products.find(p => p.id === item.product.id) ?? item.product;
        const stockBefore = product.stock;
        const stockAfter = stockBefore - item.quantity;
        appendKardexMovement({
          productId: product.id,
          productName: product.name,
          type: 'sale',
          reference: invoiceNumber,
          quantity: -item.quantity,
          stockBefore,
          stockAfter,
          unitCost: buildUnitCostWithIva(product),
          unitSalePrice: product.salePrice,
          totalCost: buildUnitCostWithIva(product) * item.quantity,
        });
      });

      if (newSale.customerId) {
        const points = Math.floor(newSale.total / 1000);
        setCustomers(prev => prev.map((customer) => {
          if (customer.id !== newSale.customerId) return customer;
          return {
            ...customer,
            points: customer.points + points,
            purchases: [...customer.purchases, newSale],
          };
        }));

        if (creditedAmount > 0) {
          const reference = newSale.invoiceNumber || newSale.id;
          addDebtToCustomer(newSale.customerId, creditedAmount, buildCreditSaleDescription(reference, cart));
        }
      }

      const remainingDrafts = saleDrafts.filter(draft => draft.id !== activeDraft.id);
      setSaleDrafts(remainingDrafts);
      if (remainingDrafts.length === 0) {
        await createSaleDraft();
      } else {
        setActiveDraftId(remainingDrafts[0].id);
      }

      toast.success(creditedAmount > 0
        ? 'Venta registrada con abono y saldo a fiado.'
        : 'Venta registrada correctamente.');
      return newSale;
    }

    if (!session || !currentStoreId) {
      toast.error('Debes iniciar sesión para registrar ventas.');
      return null;
    }

    try {
      const pendingTimer = draftSyncTimers.current[activeDraft.id];
      if (pendingTimer) {
        window.clearTimeout(pendingTimer);
        delete draftSyncTimers.current[activeDraft.id];
      }

      await persistDraftSnapshot({
        ...activeDraft,
        cashSessionId: currentCashSession.id,
      });

      const result = await finalizeSaleDraft(session.access_token, currentStoreId, {
        draftId: activeDraft.id,
        paymentMethod: paymentMethodValue,
        cashReceived: cashTendered,
        paymentBreakdown,
        creditedAmount,
      });

      const saleRow = result.sale;
      const rowBreakdown = sanitizePaymentBreakdown(saleRow.payment_breakdown);
      const newSale: Sale = {
        id: saleRow.id,
        date: saleRow.created_at,
        items: [...cart],
        subtotal: roundMoney(toNumber(saleRow.subtotal)),
        discount: roundMoney(toNumber(saleRow.discount)),
        iva: roundMoney(toNumber(saleRow.iva)),
        total: roundMoney(toNumber(saleRow.total)),
        paymentMethod: saleRow.payment_method || paymentMethodValue,
        cashReceived: roundMoney(toNumber(saleRow.cash_received)),
        change: roundMoney(toNumber(saleRow.change_value)),
        paymentBreakdown: Object.keys(rowBreakdown).length > 0 ? rowBreakdown : paymentBreakdown,
        creditedAmount: roundMoney(toNumber(saleRow.credited_amount, creditedAmount)),
        customerId: saleRow.customer_id ?? activeDraft.customerId,
        invoiceNumber: saleRow.invoice_number ?? undefined,
        cashSessionId: saleRow.cash_session_id ?? currentCashSession.id,
        returnedAt: saleRow.returned_at ?? null,
      };

      setSales(prev => [...prev, newSale]);

      await registerSaleMovements(newSale, currentCashSession.id, saleRow.created_at);

      if (result.product_updates?.length) {
        const updates = new Map(result.product_updates.map((update) => [update.product_id, update.stock_after]));
        setProducts(prev => prev.map((product) => {
          const stockAfter = updates.get(product.id);
          return stockAfter === undefined ? product : { ...product, stock: stockAfter };
        }));

        const newMovements: KardexMovement[] = [];
        cart.forEach((item) => {
          const stockAfter = updates.get(item.product.id);
          if (stockAfter === undefined) return;
          const stockBefore = stockAfter + item.quantity;
          newMovements.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            date: saleRow.created_at,
            productId: item.product.id,
            productName: item.product.name,
            type: 'sale',
            reference: saleRow.invoice_number || saleRow.id,
            quantity: -item.quantity,
            stockBefore,
            stockAfter,
            unitCost: buildUnitCostWithIva(item.product),
            unitSalePrice: item.product.salePrice,
            totalCost: buildUnitCostWithIva(item.product) * item.quantity,
          });
        });
        if (newMovements.length > 0) {
          setKardexMovements(prev => [...prev, ...newMovements]);
        }
      }

      if (newSale.customerId) {
        const points = Math.floor(newSale.total / 1000);
        setCustomers(prev => prev.map((customer) => {
          if (customer.id !== newSale.customerId) return customer;
          return {
            ...customer,
            points: customer.points + points,
            purchases: [...customer.purchases, newSale],
          };
        }));

        if (getSaleCreditedAmount(newSale) > 0) {
          const reference = newSale.invoiceNumber || newSale.id;
          addDebtToCustomer(newSale.customerId, getSaleCreditedAmount(newSale), buildCreditSaleDescription(reference, cart));
        }
      }

      const remainingDrafts = saleDrafts.filter(draft => draft.id !== activeDraft.id);
      setSaleDrafts(remainingDrafts);
      if (remainingDrafts.length === 0) {
        await createSaleDraft();
      } else {
        setActiveDraftId(remainingDrafts[0].id);
      }

      toast.success(getSaleCreditedAmount(newSale) > 0
        ? 'Venta registrada con abono y saldo a fiado.'
        : 'Venta registrada correctamente.');
      return newSale;
    } catch (error) {
      console.error('No se pudo registrar venta en Supabase', error);
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar la venta.');
      return null;
    }
  };

  const registerReturn = (saleId: string): boolean => {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) {
      toast.error('No se encontró la venta para devolver.');
      return false;
    }

    const saleBreakdown = getSalePaymentBreakdown(sale);
    const cashRefund = roundMoney(toNumber(saleBreakdown.efectivo));
    if (cashRefund > 0 && (!currentCashSession || currentCashSession.status !== 'open')) {
      toast.error('Debes abrir la caja para registrar una devolución con reembolso en efectivo.');
      return false;
    }

    const reference = `DEV-${sale.id}`;
    const alreadyReturned = Boolean(sale.returnedAt)
      || kardexMovements.some(movement => movement.reference === reference);
    if (alreadyReturned) {
      toast.info('Esta venta ya tiene una devolución registrada.');
      return false;
    }

    const returnedAt = new Date().toISOString();

    sale.items.forEach(item => {
      const product = products.find(p => p.id === item.product.id) ?? item.product;
      const stockBefore = product.stock;
      const stockAfter = stockBefore + item.quantity;

      updateProduct(product.id, { stock: stockAfter });

      const unitCost = buildUnitCostWithIva(product);
      appendKardexMovement({
        productId: product.id,
        productName: product.name,
        type: 'adjustment',
        reference,
        quantity: item.quantity,
        stockBefore,
        stockAfter,
        unitCost,
        unitSalePrice: product.salePrice,
        totalCost: unitCost * item.quantity,
      });
    });

    setSales(prev => prev.map((item) => (
      item.id === sale.id ? { ...item, returnedAt } : item
    )));

    if (sale.customerId) {
      const points = Math.floor(sale.total / 1000);
      const customer = customers.find(c => c.id === sale.customerId);
      if (customer) {
        const nextPoints = Math.max(0, customer.points - points);
        const nextPurchases = customer.purchases.filter(purchase => purchase.id !== sale.id);
        updateCustomer(customer.id, {
          points: nextPoints,
          purchases: nextPurchases,
        });
      }
    }

    const creditedRefund = getSaleCreditedAmount(sale);

    if (cashRefund > 0) {
      void addCashMovement(
        'cash_out',
        cashRefund,
        `Devolución venta ${sale.invoiceNumber || sale.id}`,
        {
          category: 'return',
          subtype: 'sale_return',
          paymentMethod: 'efectivo',
          referenceType: 'sale',
          referenceId: sale.id,
          metadata: {
            auto: true,
            saleId: sale.id,
            invoiceNumber: sale.invoiceNumber ?? null,
          },
        },
      );
    }

    if (creditedRefund > 0 && sale.customerId) {
      addPaymentToCustomer(
        sale.customerId,
        creditedRefund,
        `Reverso por devolución ${sale.invoiceNumber || sale.id}`,
        { registerCashIn: false },
      );
    }

    if (isConnectedToSupabase && session && currentStoreId) {
      void updateSaleRow(session.access_token, currentStoreId, sale.id, {
        returnedAt,
      }).catch((error) => {
        console.error('No se pudo registrar devolución en Supabase', error);
        markPendingSync();
        toast.error('Devolución registrada localmente, pero falló en Supabase.');
      });
    }

    toast.success('Devolución registrada en Kardex.');
    return true;
  };

  const getSalesToday = (): Sale[] => {
    const today = new Date().toDateString();
    return sales.filter(sale => new Date(sale.date).toDateString() === today);
  };

  const getSalesInRange = (startDate: Date, endDate: Date): Sale[] => {
    return sales.filter(sale => {
      const saleDate = new Date(sale.date);
      return saleDate >= startDate && saleDate <= endDate;
    });
  };

  const getKardexByProduct = (productId: string): KardexMovement[] => {
    return kardexMovements
      .filter(movement => movement.productId === productId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  // Funciones de clientes
  const addCustomer = async (customer: Omit<Customer, 'id' | 'points' | 'debt' | 'purchases' | 'debtHistory'>): Promise<ProductWriteStatus> => {
    const newCustomer: Customer = {
      ...customer,
      id: Date.now().toString(),
      points: 0,
      debt: 0,
      purchases: [],
      debtHistory: []
    };

    if (isConnectedToSupabase && session && currentStoreId) {
      try {
        const remoteId = await createCustomer(session.access_token, currentStoreId, {
          name: newCustomer.name,
          phone: newCustomer.phone,
          address: newCustomer.address,
          email: newCustomer.email,
          nit: newCustomer.nit,
          points: newCustomer.points,
          debt: newCustomer.debt,
        });

        if (!remoteId) {
          toast.error('Supabase no devolvió el cliente creado.');
          return 'failed';
        }

        setCustomers(prev => [...prev, { ...newCustomer, id: remoteId }]);
        return 'remote-synced';
      } catch (error) {
        console.error('No se pudo guardar cliente en Supabase', error);
        toast.error('No se pudo guardar el cliente en Supabase.');
        return 'failed';
      }
    }

    setCustomers(prev => [...prev, newCustomer]);
    markPendingSync();
    return 'local-pending';
  };

  const updateCustomer = async (id: string, updatedCustomer: Partial<Customer>): Promise<ProductWriteStatus> => {
    if (isConnectedToSupabase && session && currentStoreId) {
      try {
        await updateCustomerRow(session.access_token, currentStoreId, id, {
          name: updatedCustomer.name,
          phone: updatedCustomer.phone,
          address: updatedCustomer.address,
          email: updatedCustomer.email,
          nit: updatedCustomer.nit,
          points: updatedCustomer.points,
          debt: updatedCustomer.debt,
        });
        setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...updatedCustomer } : c));
        return 'remote-synced';
      } catch (error) {
        console.error('No se pudo actualizar cliente en Supabase', error);
        toast.error('No se pudo actualizar el cliente en Supabase.');
        return 'failed';
      }
    }

    setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...updatedCustomer } : c));
    markPendingSync();
    return 'local-pending';
  };

  const deleteCustomer = async (id: string): Promise<ProductWriteStatus> => {
    const customer = customers.find((item) => item.id === id);
    if (!customer) {
      return 'failed';
    }

    if (customer.debt > 0) {
      toast.error('No puedes eliminar un cliente con deuda pendiente.');
      return 'failed';
    }

    const clearCustomerReferences = () => {
      setSaleDrafts((prev) => prev.map((draft) => (
        draft.customerId === id
          ? { ...draft, customerId: undefined }
          : draft
      )));
      setSales((prev) => prev.map((sale) => (
        sale.customerId === id
          ? { ...sale, customerId: undefined }
          : sale
      )));
    };

    if (isConnectedToSupabase && session && currentStoreId && uuidLike(id)) {
      try {
        await deleteCustomerRow(session.access_token, currentStoreId, id);
        setCustomers((prev) => prev.filter((item) => item.id !== id));
        clearCustomerReferences();
        return 'remote-synced';
      } catch (error) {
        console.error('No se pudo eliminar cliente en Supabase', error);
        toast.error('No se pudo eliminar el cliente en Supabase.');
        return 'failed';
      }
    }

    setCustomers((prev) => prev.filter((item) => item.id !== id));
    clearCustomerReferences();
    markPendingSync();
    return 'local-pending';
  };

  const addDebtToCustomer = (customerId: string, amount: number, description: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      const safeAmount = roundMoney(Number.isFinite(amount) ? Math.max(0, amount) : 0);
      if (safeAmount <= 0) return;
      const newDebt = roundMoney(customer.debt + safeAmount);
      const transaction: DebtTransaction = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        type: 'debt',
        amount: safeAmount,
        description,
        balance: newDebt
      };
      updateCustomer(customerId, {
        debt: newDebt,
        debtHistory: [...customer.debtHistory, transaction]
      });

      if (isConnectedToSupabase && session && currentStoreId) {
        void insertCustomerDebtTx(session.access_token, currentStoreId, {
          customerId,
          type: 'debt',
          amount: safeAmount,
          description,
          balance: newDebt,
          createdAt: transaction.date,
        }).catch((error) => {
          console.error('No se pudo guardar movimiento de deuda en Supabase', error);
          markPendingSync();
          toast.error('Movimiento de deuda guardado localmente, pero falló en Supabase.');
        });
      }
    }
  };

  const addPaymentToCustomer = (
    customerId: string,
    amount: number,
    description: string,
    options?: { registerCashIn?: boolean },
  ) => {
    const registerCashIn = options?.registerCashIn ?? true;
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      const safeAmount = roundMoney(Number.isFinite(amount) ? Math.max(0, amount) : 0);
      if (safeAmount <= 0) return;
      const paidAmount = Math.min(safeAmount, roundMoney(customer.debt));
      if (paidAmount <= 0) {
        toast.info('El cliente no tiene deuda pendiente.');
        return;
      }

      if (registerCashIn && !currentCashSession) {
        toast.error('Debes abrir una caja para registrar pagos de fiados.');
        return;
      }

      if (registerCashIn && currentCashSession.status !== 'open') {
        toast.error('La caja debe estar abierta para registrar pagos de fiados.');
        return;
      }

      const newDebt = roundMoney(Math.max(0, customer.debt - paidAmount));
      const transaction: DebtTransaction = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        type: 'payment',
        amount: paidAmount,
        description,
        balance: newDebt
      };
      updateCustomer(customerId, {
        debt: newDebt,
        debtHistory: [...customer.debtHistory, transaction]
      });

      if (registerCashIn) {
        void addCashMovement(
          'cash_in',
          paidAmount,
          `Abono fiado ${customer.name}`,
          {
            category: 'credit_payment',
            subtype: 'customer_debt_payment',
            paymentMethod: 'efectivo',
            referenceType: 'customer',
            referenceId: customer.id,
            metadata: {
              auto: true,
              customerId: customer.id,
            },
          },
        );
      }

      if (isConnectedToSupabase && session && currentStoreId) {
        void insertCustomerDebtTx(session.access_token, currentStoreId, {
          customerId,
          type: 'payment',
          amount: paidAmount,
          description,
          balance: newDebt,
          createdAt: transaction.date,
        }).catch((error) => {
          console.error('No se pudo guardar pago de deuda en Supabase', error);
          markPendingSync();
          toast.error('Pago guardado localmente, pero falló en Supabase.');
        });
      }
    }
  };

  // Funciones de proveedores
  const addSupplier = async (supplier: Omit<Supplier, 'id' | 'debt' | 'purchases'>): Promise<ProductWriteStatus> => {
    const normalizedAccounts = (supplier.bankAccounts || [])
      .map(account => account.trim())
      .filter(account => account.length > 0);

    const newSupplier: Supplier = {
      ...supplier,
      bankAccounts: normalizedAccounts,
      id: Date.now().toString(),
      debt: 0,
      purchases: []
    };

    if (isConnectedToSupabase && session && currentStoreId) {
      try {
        const remoteId = await createSupplierRow(session.access_token, currentStoreId, {
          name: newSupplier.name,
          nit: newSupplier.nit,
          phone: newSupplier.phone,
          email: newSupplier.email,
          address: newSupplier.address,
          bankAccounts: newSupplier.bankAccounts,
          debt: newSupplier.debt,
        });

        if (!remoteId) {
          toast.error('Supabase no devolvió el proveedor creado.');
          return 'failed';
        }

        setSuppliers(prev => [...prev, { ...newSupplier, id: remoteId }]);
        return 'remote-synced';
      } catch (error) {
        console.error('No se pudo guardar proveedor en Supabase', error);
        toast.error('No se pudo guardar el proveedor en Supabase.');
        return 'failed';
      }
    }

    setSuppliers(prev => [...prev, newSupplier]);
    markPendingSync();
    return 'local-pending';
  };

  const updateSupplier = async (id: string, updatedSupplier: Partial<Supplier>): Promise<ProductWriteStatus> => {
    if (isConnectedToSupabase && session && currentStoreId) {
      try {
        await updateSupplierRow(session.access_token, currentStoreId, id, {
          name: updatedSupplier.name,
          nit: updatedSupplier.nit,
          phone: updatedSupplier.phone,
          email: updatedSupplier.email,
          address: updatedSupplier.address,
          bankAccounts: updatedSupplier.bankAccounts,
          debt: updatedSupplier.debt,
        });
        setSuppliers(prev => prev.map(s => s.id === id ? { ...s, ...updatedSupplier } : s));
        return 'remote-synced';
      } catch (error) {
        console.error('No se pudo actualizar proveedor en Supabase', error);
        toast.error('No se pudo actualizar el proveedor en Supabase.');
        return 'failed';
      }
    }

    setSuppliers(prev => prev.map(s => s.id === id ? { ...s, ...updatedSupplier } : s));
    markPendingSync();
    return 'local-pending';
  };

  const deleteSupplier = async (id: string): Promise<ProductWriteStatus> => {
    if (isConnectedToSupabase && session && currentStoreId) {
      try {
        await deleteSupplierRow(session.access_token, currentStoreId, id);
        setSuppliers(prev => prev.filter(s => s.id !== id));
        return 'remote-synced';
      } catch (error) {
        console.error('No se pudo eliminar proveedor en Supabase', error);
        toast.error('No se pudo eliminar el proveedor en Supabase.');
        return 'failed';
      }
    }

    setSuppliers(prev => prev.filter(s => s.id !== id));
    markPendingSync();
    return 'local-pending';
  };

  const registerPurchase = (
    supplierId: string,
    items: { productId: string; quantity: number; cost: number }[],
    options?: { pricePolicy?: PurchasePricePolicy }
  ) => {
    const pricePolicy = options?.pricePolicy ?? 'automatic';
    const total = items.reduce((sum, item) => sum + (item.quantity * item.cost), 0);
    const purchaseReference = `COMP-${Date.now().toString().slice(-6)}`;
    const newPurchase: Purchase = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      supplierId,
      items,
      total,
      paid: false
    };

    // Actualizar stock de productos
    items.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        const unitsPerPurchase = Number(product.unitsPerPurchase ?? 1) || 1;
        const stockBefore = product.stock;
        const purchasedPackages = item.quantity;
        const enteredUnits = purchasedPackages * unitsPerPurchase;
        const stockAfter = product.stock + enteredUnits;
        const ivaFactor = 1 + (Number(product.iva || 0) / 100);

        const currentUnitCostWithIva = buildUnitCostWithIva(product);
        const incomingUnitCostWithIva = (item.cost * ivaFactor) / unitsPerPurchase;
        const weightedUnitCostWithIva = stockAfter > 0
          ? ((stockBefore * currentUnitCostWithIva) + (enteredUnits * incomingUnitCostWithIva)) / stockAfter
          : incomingUnitCostWithIva;

        const weightedCostPrice = ivaFactor > 0
          ? (weightedUnitCostWithIva * unitsPerPurchase) / ivaFactor
          : weightedUnitCostWithIva * unitsPerPurchase;

        const margin = Number(product.profitMargin ?? 30);
        const marginFactor = 1 - (margin / 100);
        const autoUnitSalePrice = marginFactor > 0
          ? weightedUnitCostWithIva / marginFactor
          : Number(product.unitPrice ?? product.salePrice);
        const nextUnitSalePrice = pricePolicy === 'automatic'
          ? autoUnitSalePrice
          : Number(product.unitPrice ?? product.salePrice);

        updateProduct(item.productId, {
          stock: stockAfter,
          costPrice: weightedCostPrice,
          salePrice: nextUnitSalePrice,
          unitPrice: nextUnitSalePrice,
          profitMargin: margin
        });

        appendKardexMovement({
          productId: product.id,
          productName: product.name,
          type: 'entry',
          reference: purchaseReference,
          quantity: enteredUnits,
          stockBefore,
          stockAfter,
          unitCost: incomingUnitCostWithIva,
          unitSalePrice: nextUnitSalePrice,
          totalCost: incomingUnitCostWithIva * enteredUnits
        });
      }
    });

    // Actualizar proveedor
    const supplier = suppliers.find(s => s.id === supplierId);
    if (supplier) {
      updateSupplier(supplierId, {
        purchases: [...supplier.purchases, newPurchase],
        debt: supplier.debt + total
      });
    }

    if (isConnectedToSupabase && session && currentStoreId) {
      const purchaseItems = items.map((item) => {
        const product = products.find(p => p.id === item.productId);
        const unitsPerPurchase = Number(product?.unitsPerPurchase ?? 1) || 1;
        const enteredUnits = item.quantity * unitsPerPurchase;
        const ivaFactor = 1 + (Number(product?.iva || 0) / 100);
        return {
          productId: item.productId,
          productName: product?.name || 'Producto',
          quantityPackages: item.quantity,
          unitsPerPackage: unitsPerPurchase,
          enteredUnits,
          packageCost: item.cost,
          unitCostWithIva: (item.cost * ivaFactor) / unitsPerPurchase,
          subtotal: item.cost * item.quantity,
          createdAt: newPurchase.date,
        };
      });

      void createPurchaseWithItems(session.access_token, currentStoreId, {
        supplierId,
        total,
        paid: false,
        pricePolicy,
        reference: purchaseReference,
        createdAt: newPurchase.date,
        items: purchaseItems,
      }).catch((error) => {
        console.error('No se pudo guardar compra en Supabase', error);
        markPendingSync();
        toast.error('Compra guardada localmente, pero falló en Supabase.');
      });
    }
  };

  // Funciones de recargas
  const addRecharge = (recharge: Omit<RechargeTransaction, 'id' | 'date'>) => {
    const newRecharge: RechargeTransaction = {
      ...recharge,
      id: Date.now().toString(),
      date: new Date().toISOString()
    };
    setRecharges([...recharges, newRecharge]);

    if (isConnectedToSupabase && session && currentStoreId) {
      void createRechargeRow(session.access_token, currentStoreId, {
        type: recharge.type,
        provider: recharge.provider,
        phoneNumber: recharge.phoneNumber,
        amount: recharge.amount,
        commission: recharge.commission,
        total: recharge.total,
        createdAt: newRecharge.date,
      }).catch((error) => {
        console.error('No se pudo guardar recarga en Supabase', error);
        markPendingSync();
        toast.error('Recarga guardada localmente, pero falló en Supabase.');
      });
    }
  };

  // Funciones de configuración
  const updateStoreConfig = async (config: Partial<StoreConfig>): Promise<boolean> => {
    const merged = { ...storeConfig, ...config };
    setStoreConfig(merged);

    if (!canReachSupabase) {
      return true;
    }

    if (!session) {
      return true;
    }

    let targetStoreId = currentStoreId;

    if (!targetStoreId) {
      try {
        const membership = await fetchMyStoreMembership(session.access_token, session.user.id);
        if (membership?.store_id) {
          targetStoreId = membership.store_id;
          setCurrentStoreId(membership.store_id);
        }
      } catch (error) {
        console.error('No se pudo verificar membresía de tienda', error);
      }
    }

    if (!targetStoreId) {
      toast.error('No hay tienda conectada para guardar en Supabase.');
      return false;
    }

    try {
      await updateStoreDetails(session.access_token, targetStoreId, {
        name: merged.name,
        nit: merged.nit,
        address: merged.address,
        phone: merged.phone,
        email: merged.email,
        dianResolution: merged.dianResolution,
        printerType: merged.printerType,
        showIVA: merged.showIVA,
        purchasePricePolicy: merged.purchasePricePolicy,
        currency: merged.currency,
      });
      return true;
    } catch (error) {
      console.error('No se pudo guardar configuración de tienda en Supabase', error);
      markPendingSync();
      toast.error('Guardado local OK, pero falló guardar configuración en Supabase.');
      return false;
    }
  };

  return (
    <POSContext.Provider value={{
      isAuthenticated,
      isAuthReady,
      isOfflineMode,
      offlinePinConfigured,
      offlineDefaultRole,
      hasPendingSync,
      currentUser,
      login,
      loginOffline,
      logout,
      verifyAdminPasswordForCriticalAction,
      setOfflinePin,
      setOfflineDefaultRole,
      createStore,
      syncWithSupabase,
      uploadLocalBackupToSupabase,
      getPendingProductSyncPreview,
      hasConnectedStore: Boolean(currentStoreId),
      products,
      addProduct,
      updateProduct,
      deleteProduct,
      searchProducts,
      categories,
      addCategory,
      updateCategory,
      deleteCategory,
      adjustStock,
      saleDrafts,
      activeDraftId,
      activeDraft,
      createSaleDraft,
      switchSaleDraft,
      discardSaleDraft,
      setActiveDraftCustomerId,
      cart,
      addToCart,
      removeFromCart,
      updateCartQuantity,
      updateCartDiscount,
      clearCart,
      cartTotal,
      sales,
      completeSale,
      getSalesToday,
      getSalesInRange,
      registerReturn,
      cashSessions,
      cashMovements,
      currentCashSession,
      openCashSession,
      startCashCounting,
      cancelCashCounting,
      closeCashSession,
      clearSelectedCashReports,
      clearCashReports,
      addCashMovement,
      getCashSessionReport,
      kardexMovements,
      getKardexByProduct,
      customers,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      addDebtToCustomer,
      addPaymentToCustomer,
      suppliers,
      addSupplier,
      updateSupplier,
      deleteSupplier,
      registerPurchase,
      recharges,
      addRecharge,
      storeConfig,
      updateStoreConfig,
    }}>
      {children}
    </POSContext.Provider>
  );
}

export function usePOS() {
  // Hook de conveniencia para consumir el contexto con validación.
  const context = useContext(POSContext);
  if (context === undefined) {
    throw new Error('usePOS must be used within a POSProvider');
  }
  return context;
}
