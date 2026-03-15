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
  createCustomer,
  createCashMovement,
  createCashSession,
  createKardexMovementRow,
  createProduct,
  createPurchaseWithItems,
  createRechargeRow,
  createSaleDraftRow,
  createSupplierRow,
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

const toNumber = (value: unknown, fallback = 0): number => {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const uuidLike = (value?: string | null): boolean =>
  !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

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
  customerId?: string;
  invoiceNumber?: string;
  cashSessionId?: string;
  returnedAt?: string | null;
}

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
  openedAt: string;
  closedAt?: string;
  openingCash: number;
  expectedCash?: number;
  countedCash?: number;
  difference?: number;
  status: 'open' | 'closed';
}

export interface CashMovement {
  id: string;
  cashSessionId: string;
  userId?: string;
  type: 'cash_in' | 'cash_out';
  amount: number;
  reason?: string;
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
  setOfflinePin: (pin: string) => Promise<boolean>;
  setOfflineDefaultRole: (role: 'admin' | 'cashier') => void;
  createStore: (store: { name: string; nit?: string; address?: string; phone?: string; email?: string }) => Promise<boolean>;
  syncWithSupabase: () => Promise<boolean>;
  uploadLocalBackupToSupabase: (clearExisting?: boolean) => Promise<boolean>;
  hasConnectedStore: boolean;
  
  // Productos
  products: Product[];
  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (id: string, product: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  searchProducts: (query: string) => Product[];
  categories: string[];
  addCategory: (name: string) => boolean;
  updateCategory: (oldName: string, newName: string) => boolean;
  deleteCategory: (name: string, replacementCategory?: string) => boolean;
  adjustStock: (
    productId: string,
    nextStock: number,
    options?: {
      reference?: string;
      unitCost?: number;
      unitSalePrice?: number;
      nextCostPrice?: number;
      nextIva?: number;
      nextUnitsPerPurchase?: number;
      productName?: string;
    }
  ) => void;
  
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
  completeSale: (paymentMethod: string, cashReceived: number) => Promise<Sale | null>;
  getSalesToday: () => Sale[];
  getSalesInRange: (startDate: Date, endDate: Date) => Sale[];
  registerReturn: (saleId: string) => boolean;

  // Caja
  cashSessions: CashSession[];
  cashMovements: CashMovement[];
  currentCashSession: CashSession | null;
  openCashSession: (openingCash: number) => Promise<boolean>;
  closeCashSession: (countedCash: number) => Promise<CashSession | null>;
  addCashMovement: (type: 'cash_in' | 'cash_out', amount: number, reason?: string) => Promise<CashMovement | null>;
  getCashSessionReport: (sessionId: string) => CashSessionReport;

  // Kardex
  kardexMovements: KardexMovement[];
  getKardexByProduct: (productId: string) => KardexMovement[];
  
  // Clientes
  customers: Customer[];
  addCustomer: (customer: Omit<Customer, 'id' | 'points' | 'debt' | 'purchases' | 'debtHistory'>) => void;
  updateCustomer: (id: string, customer: Partial<Customer>) => void;
  addDebtToCustomer: (customerId: string, amount: number, description: string) => void;
  addPaymentToCustomer: (customerId: string, amount: number, description: string) => void;
  
  // Proveedores
  suppliers: Supplier[];
  addSupplier: (supplier: Omit<Supplier, 'id' | 'debt' | 'purchases'>) => void;
  updateSupplier: (id: string, supplier: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;
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

  const buildLocalBackupPayload = () => ({
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

  const buildStateBackupPayload = () => ({
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
        openedAt: row.opened_at,
        closedAt: row.closed_at ?? undefined,
        openingCash: toNumber(row.opening_cash),
        expectedCash: row.expected_cash == null ? undefined : toNumber(row.expected_cash),
        countedCash: row.counted_cash == null ? undefined : toNumber(row.counted_cash),
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
      const hasOfflineBackup = Boolean(localStorage.getItem(OFFLINE_BACKUP_KEY));
      if (hasOfflineBackup) {
        setHasPendingSync(true);
        localStorage.setItem(OFFLINE_DIRTY_KEY, 'true');
      } else {
        setHasPendingSync(false);
        localStorage.removeItem(OFFLINE_DIRTY_KEY);
      }

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
    if (loadedCashSessions) setCashSessions(JSON.parse(loadedCashSessions));
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
      localStorage.setItem('pos_products', JSON.stringify(products));
    }
  }, [products]);

  // Guardar categorías
  useEffect(() => {
    localStorage.setItem('pos_categories', JSON.stringify(categories));
  }, [categories]);

  // Guardar ventas
  useEffect(() => {
    localStorage.setItem('pos_sales', JSON.stringify(sales));
  }, [sales]);

  // Guardar kardex
  useEffect(() => {
    localStorage.setItem('pos_kardex', JSON.stringify(kardexMovements));
  }, [kardexMovements]);

  // Guardar clientes
  useEffect(() => {
    localStorage.setItem('pos_customers', JSON.stringify(customers));
  }, [customers]);

  // Guardar proveedores
  useEffect(() => {
    localStorage.setItem('pos_suppliers', JSON.stringify(suppliers));
  }, [suppliers]);

  // Guardar recargas
  useEffect(() => {
    localStorage.setItem('pos_recharges', JSON.stringify(recharges));
  }, [recharges]);

  // Guardar sesiones de caja
  useEffect(() => {
    localStorage.setItem('pos_cash_sessions', JSON.stringify(cashSessions));
  }, [cashSessions]);

  // Guardar movimientos de caja
  useEffect(() => {
    localStorage.setItem('pos_cash_movements', JSON.stringify(cashMovements));
  }, [cashMovements]);

  // Guardar configuración
  useEffect(() => {
    localStorage.setItem('pos_config', JSON.stringify(storeConfig));
  }, [storeConfig]);

  // Guardar autenticación
  useEffect(() => {
    if (!isAuthReady) return;
    localStorage.setItem('pos_auth', JSON.stringify({ isAuthenticated, currentUser }));
  }, [isAuthenticated, currentUser, isAuthReady]);

  // Guardar borradores locales para modo offline.
  useEffect(() => {
    localStorage.setItem(OFFLINE_DRAFTS_KEY, JSON.stringify(saleDrafts));
    if (activeDraftId) {
      localStorage.setItem(OFFLINE_ACTIVE_DRAFT_KEY, activeDraftId);
    } else {
      localStorage.removeItem(OFFLINE_ACTIVE_DRAFT_KEY);
    }
  }, [saleDrafts, activeDraftId]);

  // Marcar cambios offline pendientes de sincronización.
  useEffect(() => {
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

    if (isConnectedToSupabase) return;

    setHasPendingSync(true);
    localStorage.setItem(OFFLINE_DIRTY_KEY, 'true');
    localStorage.setItem(OFFLINE_BACKUP_KEY, JSON.stringify(buildStateBackupPayload()));
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

    let backupPayload = buildLocalBackupPayload();
    const offlineBackupRaw = localStorage.getItem(OFFLINE_BACKUP_KEY);
    if (offlineBackupRaw) {
      try {
        backupPayload = JSON.parse(offlineBackupRaw) as Record<string, unknown>;
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
        toast.error('Importación finalizada, pero falló la actualización de datos en pantalla.');
      } else {
        setHasPendingSync(false);
        localStorage.removeItem(OFFLINE_DIRTY_KEY);
        localStorage.removeItem(OFFLINE_BACKUP_KEY);
        toast.success('Datos locales importados a Supabase correctamente.');
      }
      return true;
    } catch (error) {
      console.error('No se pudo importar el backup local en Supabase', error);
      toast.error('Falló la importación a Supabase. Verifica permisos/RLS y sesión.');
      return false;
    }
  };

  // Funciones de productos
  const addProduct = (product: Omit<Product, 'id'>) => {
    const newProduct = { ...product, id: Date.now().toString() };
    setProducts([...products, newProduct]);

    if (isConnectedToSupabase && session && currentStoreId) {
      void createProduct(session.access_token, currentStoreId, product)
        .then((created) => {
          if (!created) return;
          setProducts(prev => prev.map(p => p.id === newProduct.id ? created : p));
        })
        .catch((error) => {
          console.error('No se pudo crear producto en Supabase', error);
          toast.error('Producto guardado localmente, pero falló el guardado en Supabase.');
        });
    }

    if (newProduct.stock > 0) {
      appendKardexMovement({
        productId: newProduct.id,
        productName: newProduct.name,
        type: 'entry',
        reference: `INI-${newProduct.id}`,
        quantity: newProduct.stock,
        stockBefore: 0,
        stockAfter: newProduct.stock,
        unitCost: buildUnitCostWithIva(newProduct),
        unitSalePrice: newProduct.salePrice,
        totalCost: buildUnitCostWithIva(newProduct) * newProduct.stock
      });
    }
  };

  const updateProduct = (id: string, updatedProduct: Partial<Product>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updatedProduct } : p));

    if (isConnectedToSupabase && session && currentStoreId) {
      void patchProduct(session.access_token, currentStoreId, id, updatedProduct)
        .catch((error) => {
          console.error('No se pudo actualizar producto en Supabase', error);
          toast.error('Producto actualizado localmente, pero falló la sincronización en Supabase.');
      });
    }
  };

  const adjustStock = (
    productId: string,
    nextStock: number,
    options?: {
      reference?: string;
      unitCost?: number;
      unitSalePrice?: number;
      nextCostPrice?: number;
      nextIva?: number;
      nextUnitsPerPurchase?: number;
      productName?: string;
    }
  ) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const stockAfter = Number.isFinite(nextStock) ? nextStock : product.stock;
    const stockBefore = product.stock;
    if (stockAfter === stockBefore) return;

    updateProduct(productId, { stock: stockAfter });

    const effectiveCostPrice = typeof options?.nextCostPrice === 'number' ? options.nextCostPrice : product.costPrice;
    const effectiveIva = typeof options?.nextIva === 'number' ? options.nextIva : product.iva;
    const effectiveUnits = typeof options?.nextUnitsPerPurchase === 'number'
      ? options.nextUnitsPerPurchase
      : Number(product.unitsPerPurchase ?? 1) || 1;
    const unitCost = typeof options?.unitCost === 'number'
      ? options.unitCost
      : buildUnitCostWithIva({
          ...product,
          costPrice: effectiveCostPrice,
          iva: effectiveIva,
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
  };

  const deleteProduct = (id: string) => {
    setProducts(products.filter(p => p.id !== id));

    if (isConnectedToSupabase && session && currentStoreId) {
      void removeProduct(session.access_token, currentStoreId, id)
        .catch((error) => {
          console.error('No se pudo eliminar producto en Supabase', error);
          toast.error('Producto eliminado localmente, pero falló en Supabase.');
        });
    }
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
  const addCategory = (name: string): boolean => {
    const normalizedName = name.trim();
    if (!normalizedName) return false;

    const alreadyExists = categories.some(
      category => category.toLowerCase() === normalizedName.toLowerCase()
    );
    if (alreadyExists) return false;

    setCategories([...categories, normalizedName]);

    if (isConnectedToSupabase && session && currentStoreId) {
      void createCategory(session.access_token, currentStoreId, normalizedName)
        .catch((error) => {
          console.error('No se pudo crear categoría en Supabase', error);
          toast.error('Categoría creada localmente, pero falló en Supabase.');
        });
    }

    return true;
  };

  const updateCategory = (oldName: string, newName: string): boolean => {
    const normalizedNewName = newName.trim();
    if (!normalizedNewName) return false;
    if (oldName === normalizedNewName) return true;

    const oldCategoryExists = categories.includes(oldName);
    if (!oldCategoryExists) return false;

    const duplicate = categories.some(
      category => category.toLowerCase() === normalizedNewName.toLowerCase() && category !== oldName
    );
    if (duplicate) return false;

    setCategories(categories.map(category => category === oldName ? normalizedNewName : category));
    setProducts(products.map(product =>
      product.category === oldName
        ? { ...product, category: normalizedNewName }
        : product
    ));

    if (isConnectedToSupabase && session && currentStoreId) {
      void renameCategory(session.access_token, currentStoreId, oldName, normalizedNewName)
        .then(() => {
          const productIds = products
            .filter(product => product.category === oldName)
            .map(product => product.id);
          productIds.forEach((productId) => {
            void patchProduct(session.access_token, currentStoreId, productId, { category: normalizedNewName });
          });
        })
        .catch((error) => {
          console.error('No se pudo editar categoría en Supabase', error);
          toast.error('Categoría actualizada localmente, pero falló en Supabase.');
        });
    }

    return true;
  };

  const deleteCategory = (name: string, replacementCategory?: string): boolean => {
    if (!categories.includes(name)) return false;

    const hasProductsInCategory = products.some(product => product.category === name);

    if (hasProductsInCategory) {
      const replacement = replacementCategory?.trim();
      if (!replacement || replacement === name || !categories.includes(replacement)) {
        return false;
      }

      setProducts(products.map(product =>
        product.category === name
          ? { ...product, category: replacement }
          : product
      ));
    }

    setCategories(categories.filter(category => category !== name));

    if (isConnectedToSupabase && session && currentStoreId) {
      const productsToMove = products.filter(product => product.category === name);

      if (productsToMove.length > 0 && replacementCategory) {
        productsToMove.forEach((product) => {
          void patchProduct(session.access_token, currentStoreId, product.id, { category: replacementCategory });
        });
      }

      void removeCategory(session.access_token, currentStoreId, name)
        .catch((error) => {
          console.error('No se pudo eliminar categoría en Supabase', error);
          toast.error('Categoría eliminada localmente, pero falló en Supabase.');
        });
    }

    return true;
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
    const ivaFactor = 1 + (Number(product.iva || 0) / 100);
    return (baseCost * ivaFactor) / units;
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
      });
    }
  };

  const currentCashSession = [...cashSessions]
    .filter((session) => session.status === 'open')
    .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())[0] ?? null;

  const cartTotal = cart.reduce((total, item) => {
    const itemPrice = item.product.salePrice * item.quantity;
    const discountAmount = (itemPrice * item.discount) / 100;
    return total + (itemPrice - discountAmount);
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

    netSales.forEach((sale) => {
      salesTotal += sale.total;
      const method = sale.paymentMethod || 'otro';
      salesByMethod[method] = (salesByMethod[method] || 0) + sale.total;
    });

    const cashSalesTotal = salesByMethod['efectivo'] || 0;
    const sessionMovements = cashMovements.filter(movement => movement.cashSessionId === sessionId);
    const isReturnMovement = (movement: CashMovement) =>
      movement.type === 'cash_out' && movement.reason?.startsWith('Devolución venta ');
    const salesReturnedTotal = returnedSales.reduce((sum, sale) => sum + sale.total, 0);
    const cashReturnTotal = sessionMovements
      .filter((movement) => isReturnMovement(movement))
      .reduce((sum, movement) => sum + movement.amount, 0);
    const cashInTotal = sessionMovements
      .filter(movement => movement.type === 'cash_in')
      .reduce((sum, movement) => sum + movement.amount, 0);
    const cashOutTotal = sessionMovements
      .filter(movement => movement.type === 'cash_out' && !isReturnMovement(movement))
      .reduce((sum, movement) => sum + movement.amount, 0);

    const expectedCash = session.openingCash + cashSalesTotal + cashInTotal - cashOutTotal - cashReturnTotal;

    return {
      salesTotal,
      salesReturnedTotal,
      salesByMethod,
      cashSalesTotal,
      cashInTotal,
      cashOutTotal,
      cashReturnTotal,
      expectedCash,
    };
  };

  // Funciones de caja
  const openCashSession = async (openingCash: number): Promise<boolean> => {
    if (currentCashSession) {
      toast.info('Ya existe una caja abierta en esta tienda.');
      return false;
    }

    const safeOpeningCash = Number.isFinite(openingCash) ? Math.max(0, openingCash) : 0;
    const openedAt = new Date().toISOString();
    let sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (isConnectedToSupabase && session && currentStoreId) {
      try {
        const remoteId = await createCashSession(session.access_token, currentStoreId, {
          userId: session.user.id,
          openingCash: safeOpeningCash,
          openedAt,
        });
        if (remoteId) {
          sessionId = remoteId;
        }
      } catch (error) {
        console.error('No se pudo abrir caja en Supabase', error);
        toast.error('Caja abierta localmente, pero falló en Supabase.');
      }
    }

    const newSession: CashSession = {
      id: sessionId,
      storeId: currentStoreId ?? undefined,
      userId: session?.user.id,
      openedAt,
      openingCash: safeOpeningCash,
      status: 'open',
    };

    setCashSessions(prev => [...prev, newSession]);
    toast.success('Caja abierta correctamente.');
    return true;
  };

  const addCashMovement = async (
    type: 'cash_in' | 'cash_out',
    amount: number,
    reason?: string,
  ): Promise<CashMovement | null> => {
    if (!currentCashSession) {
      toast.error('No hay una caja abierta.');
      return null;
    }

    const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    if (safeAmount <= 0) {
      toast.error('El monto debe ser mayor a 0.');
      return null;
    }

    const movementDate = new Date().toISOString();
    let movementId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (isConnectedToSupabase && session && currentStoreId && uuidLike(currentCashSession.id)) {
      try {
        const remoteId = await createCashMovement(session.access_token, currentStoreId, {
          cashSessionId: currentCashSession.id,
          userId: session.user.id,
          type,
          amount: safeAmount,
          reason,
          createdAt: movementDate,
        });
        if (remoteId) {
          movementId = remoteId;
        }
      } catch (error) {
        console.error('No se pudo guardar movimiento de caja en Supabase', error);
        toast.error('Movimiento guardado localmente, pero falló en Supabase.');
      }
    }

    const movement: CashMovement = {
      id: movementId,
      cashSessionId: currentCashSession.id,
      userId: session?.user.id,
      type,
      amount: safeAmount,
      reason: reason?.trim() ? reason.trim() : undefined,
      date: movementDate,
    };

    setCashMovements(prev => [...prev, movement]);
    toast.success(type === 'cash_in' ? 'Ingreso registrado.' : 'Retiro registrado.');
    return movement;
  };

  const closeCashSession = async (countedCash: number): Promise<CashSession | null> => {
    if (!currentCashSession) {
      toast.error('No hay una caja abierta para cerrar.');
      return null;
    }

    const safeCounted = Number.isFinite(countedCash) ? Math.max(0, countedCash) : 0;
    const report = getCashSessionReport(currentCashSession.id);
    const expectedCash = report.expectedCash;
    const difference = safeCounted - expectedCash;
    const closedAt = new Date().toISOString();

    const closedSession: CashSession = {
      ...currentCashSession,
      closedAt,
      expectedCash,
      countedCash: safeCounted,
      difference,
      status: 'closed',
    };

    setCashSessions(prev => prev.map(sessionItem => sessionItem.id === currentCashSession.id ? closedSession : sessionItem));

    if (isConnectedToSupabase && session && currentStoreId && uuidLike(currentCashSession.id)) {
      try {
        await updateCashSession(session.access_token, currentStoreId, currentCashSession.id, {
          closedAt,
          expectedCash,
          countedCash: safeCounted,
          difference,
          status: 'closed',
        });
      } catch (error) {
        console.error('No se pudo cerrar caja en Supabase', error);
        toast.error('Caja cerrada localmente, pero falló en Supabase.');
      }
    }

    toast.success('Caja cerrada correctamente.');
    return closedSession;
  };

  // Funciones de ventas
  const completeSale = async (paymentMethod: string, cashReceived: number): Promise<Sale | null> => {
    if (!currentCashSession) {
      toast.error('Debes abrir una caja antes de registrar ventas.');
      return null;
    }

    if (!activeDraft || cart.length === 0) {
      toast.error('No hay productos en la venta.');
      return null;
    }

    const paymentMethodValue = ['efectivo', 'tarjeta', 'transferencia', 'credito'].includes(paymentMethod)
      ? paymentMethod as 'efectivo' | 'tarjeta' | 'transferencia' | 'credito'
      : 'otro';

    if (!isConnectedToSupabase) {
      const saleDate = new Date().toISOString();
      let subtotal = 0;
      let discountTotal = 0;
      let ivaTotal = 0;

      for (const item of cart) {
        const product = products.find(p => p.id === item.product.id) ?? item.product;
        if (product.stock < item.quantity) {
          toast.error(`Stock insuficiente para ${product.name}.`);
          return null;
        }

        const lineSubtotal = item.product.salePrice * item.quantity;
        const lineDiscount = (lineSubtotal * item.discount) / 100;
        const lineTotal = lineSubtotal - lineDiscount;
        const lineIva = lineTotal * (item.product.iva / (100 + item.product.iva));

        subtotal += lineSubtotal;
        discountTotal += lineDiscount;
        ivaTotal += lineIva;
      }

      const total = subtotal - discountTotal;
      if (total <= 0) {
        toast.error('No hay productos en la venta.');
        return null;
      }

      const invoiceNumber = getNextOfflineInvoiceNumber();
      const safeCashReceived = Number.isFinite(cashReceived) ? cashReceived : 0;
      const change = safeCashReceived - total;

      const newSale: Sale = {
        id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date: saleDate,
        items: [...cart],
        subtotal,
        discount: discountTotal,
        iva: ivaTotal,
        total,
        paymentMethod: paymentMethodValue,
        cashReceived: safeCashReceived,
        change,
        customerId: activeDraft.customerId,
        invoiceNumber,
        cashSessionId: currentCashSession.id,
        returnedAt: null,
      };

      setSales(prev => [...prev, newSale]);

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
      }

      const remainingDrafts = saleDrafts.filter(draft => draft.id !== activeDraft.id);
      setSaleDrafts(remainingDrafts);
      if (remainingDrafts.length === 0) {
        await createSaleDraft();
      } else {
        setActiveDraftId(remainingDrafts[0].id);
      }

      toast.success('Venta registrada correctamente.');
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
        cashReceived,
      });

      const saleRow = result.sale;
      const newSale: Sale = {
        id: saleRow.id,
        date: saleRow.created_at,
        items: [...cart],
        subtotal: toNumber(saleRow.subtotal),
        discount: toNumber(saleRow.discount),
        iva: toNumber(saleRow.iva),
        total: toNumber(saleRow.total),
        paymentMethod: saleRow.payment_method || paymentMethodValue,
        cashReceived: toNumber(saleRow.cash_received),
        change: toNumber(saleRow.change_value),
        customerId: saleRow.customer_id ?? activeDraft.customerId,
        invoiceNumber: saleRow.invoice_number ?? undefined,
        cashSessionId: saleRow.cash_session_id ?? currentCashSession.id,
        returnedAt: saleRow.returned_at ?? null,
      };

      setSales(prev => [...prev, newSale]);

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
      }

      const remainingDrafts = saleDrafts.filter(draft => draft.id !== activeDraft.id);
      setSaleDrafts(remainingDrafts);
      if (remainingDrafts.length === 0) {
        await createSaleDraft();
      } else {
        setActiveDraftId(remainingDrafts[0].id);
      }

      toast.success('Venta registrada correctamente.');
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

    if (sale.paymentMethod === 'efectivo') {
      void addCashMovement(
        'cash_out',
        sale.total,
        `Devolución venta ${sale.invoiceNumber || sale.id}`,
      );
    }

    if (isConnectedToSupabase && session && currentStoreId) {
      void updateSaleRow(session.access_token, currentStoreId, sale.id, {
        returnedAt,
      }).catch((error) => {
        console.error('No se pudo registrar devolución en Supabase', error);
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
  const addCustomer = (customer: Omit<Customer, 'id' | 'points' | 'debt' | 'purchases' | 'debtHistory'>) => {
    const newCustomer: Customer = {
      ...customer,
      id: Date.now().toString(),
      points: 0,
      debt: 0,
      purchases: [],
      debtHistory: []
    };
    setCustomers([...customers, newCustomer]);

    if (isConnectedToSupabase && session && currentStoreId) {
      void createCustomer(session.access_token, currentStoreId, {
        name: newCustomer.name,
        phone: newCustomer.phone,
        address: newCustomer.address,
        email: newCustomer.email,
        nit: newCustomer.nit,
        points: newCustomer.points,
        debt: newCustomer.debt,
      }).then((remoteId) => {
        if (!remoteId) return;
        setCustomers(prev => prev.map(c => c.id === newCustomer.id ? { ...c, id: remoteId } : c));
      }).catch((error) => {
        console.error('No se pudo guardar cliente en Supabase', error);
        toast.error('Cliente guardado localmente, pero falló en Supabase.');
      });
    }
  };

  const updateCustomer = (id: string, updatedCustomer: Partial<Customer>) => {
    setCustomers(customers.map(c => c.id === id ? { ...c, ...updatedCustomer } : c));

    if (isConnectedToSupabase && session && currentStoreId) {
      void updateCustomerRow(session.access_token, currentStoreId, id, {
        name: updatedCustomer.name,
        phone: updatedCustomer.phone,
        address: updatedCustomer.address,
        email: updatedCustomer.email,
        nit: updatedCustomer.nit,
        points: updatedCustomer.points,
        debt: updatedCustomer.debt,
      }).catch((error) => {
        console.error('No se pudo actualizar cliente en Supabase', error);
        toast.error('Cliente actualizado localmente, pero falló en Supabase.');
      });
    }
  };

  const addDebtToCustomer = (customerId: string, amount: number, description: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      const newDebt = customer.debt + amount;
      const transaction: DebtTransaction = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        type: 'debt',
        amount,
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
          amount,
          description,
          balance: newDebt,
          createdAt: transaction.date,
        }).catch((error) => {
          console.error('No se pudo guardar movimiento de deuda en Supabase', error);
          toast.error('Movimiento de deuda guardado localmente, pero falló en Supabase.');
        });
      }
    }
  };

  const addPaymentToCustomer = (customerId: string, amount: number, description: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      const newDebt = Math.max(0, customer.debt - amount);
      const transaction: DebtTransaction = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        type: 'payment',
        amount,
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
          type: 'payment',
          amount,
          description,
          balance: newDebt,
          createdAt: transaction.date,
        }).catch((error) => {
          console.error('No se pudo guardar pago de deuda en Supabase', error);
          toast.error('Pago guardado localmente, pero falló en Supabase.');
        });
      }
    }
  };

  // Funciones de proveedores
  const addSupplier = (supplier: Omit<Supplier, 'id' | 'debt' | 'purchases'>) => {
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
    setSuppliers([...suppliers, newSupplier]);

    if (isConnectedToSupabase && session && currentStoreId) {
      void createSupplierRow(session.access_token, currentStoreId, {
        name: newSupplier.name,
        nit: newSupplier.nit,
        phone: newSupplier.phone,
        email: newSupplier.email,
        address: newSupplier.address,
        bankAccounts: newSupplier.bankAccounts,
        debt: newSupplier.debt,
      }).then((remoteId) => {
        if (!remoteId) return;
        setSuppliers(prev => prev.map(s => s.id === newSupplier.id ? { ...s, id: remoteId } : s));
      }).catch((error) => {
        console.error('No se pudo guardar proveedor en Supabase', error);
        toast.error('Proveedor guardado localmente, pero falló en Supabase.');
      });
    }
  };

  const updateSupplier = (id: string, updatedSupplier: Partial<Supplier>) => {
    setSuppliers(suppliers.map(s => s.id === id ? { ...s, ...updatedSupplier } : s));

    if (isConnectedToSupabase && session && currentStoreId) {
      void updateSupplierRow(session.access_token, currentStoreId, id, {
        name: updatedSupplier.name,
        nit: updatedSupplier.nit,
        phone: updatedSupplier.phone,
        email: updatedSupplier.email,
        address: updatedSupplier.address,
        bankAccounts: updatedSupplier.bankAccounts,
        debt: updatedSupplier.debt,
      }).catch((error) => {
        console.error('No se pudo actualizar proveedor en Supabase', error);
        toast.error('Proveedor actualizado localmente, pero falló en Supabase.');
      });
    }
  };

  const deleteSupplier = (id: string) => {
    setSuppliers(suppliers.filter(s => s.id !== id));

    if (isConnectedToSupabase && session && currentStoreId) {
      void deleteSupplierRow(session.access_token, currentStoreId, id)
        .catch((error) => {
          console.error('No se pudo eliminar proveedor en Supabase', error);
          toast.error('Proveedor eliminado localmente, pero falló en Supabase.');
        });
    }
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
      setOfflinePin,
      setOfflineDefaultRole,
      createStore,
      syncWithSupabase,
      uploadLocalBackupToSupabase,
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
      closeCashSession,
      addCashMovement,
      getCashSessionReport,
      kardexMovements,
      getKardexByProduct,
      customers,
      addCustomer,
      updateCustomer,
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
