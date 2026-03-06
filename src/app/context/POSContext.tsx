import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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
  createProduct,
  fetchMyStoreMembership,
  importLocalBackup,
  loadCategoriesAndProducts,
  patchProduct,
  removeCategory,
  removeProduct,
  renameCategory,
} from '../services/posSupabase';

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

interface POSContextType {
  // Autenticación
  isAuthenticated: boolean;
  currentUser: { username: string; role: 'admin' | 'cashier' } | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
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
  
  // Carrito
  cart: CartItem[];
  addToCart: (product: Product, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  updateCartDiscount: (productId: string, discount: number) => void;
  clearCart: () => void;
  cartTotal: number;
  
  // Ventas
  sales: Sale[];
  completeSale: (paymentMethod: string, cashReceived: number, customerId?: string) => Sale;
  getSalesToday: () => Sale[];
  getSalesInRange: (startDate: Date, endDate: Date) => Sale[];

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
  updateStoreConfig: (config: Partial<StoreConfig>) => void;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

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
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [currentStoreId, setCurrentStoreId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<{ username: string; role: 'admin' | 'cashier' } | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [kardexMovements, setKardexMovements] = useState<KardexMovement[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [recharges, setRecharges] = useState<RechargeTransaction[]>([]);
  const [storeConfig, setStoreConfig] = useState<StoreConfig>({
    name: 'Mi Tienda',
    nit: '900123456-1',
    address: 'Calle 123 #45-67, Bogotá',
    phone: '3001234567',
    email: 'contacto@mitienda.com',
    printerType: 'thermal',
    showIVA: true,
    purchasePricePolicy: 'automatic',
    currency: 'COP',
    userRole: 'admin',
  });

  const syncProductsFromSupabase = async (nextSession: SupabaseSession, storeId: string): Promise<boolean> => {
    try {
      const remote = await loadCategoriesAndProducts(nextSession.access_token, storeId);
      setCategories(remote.categories);
      setProducts(remote.products);
      return true;
    } catch (error) {
      console.error('No se pudieron cargar productos/categorías desde Supabase', error);
      return false;
    }
  };

  // Cargar datos del localStorage
  useEffect(() => {
    const loadedProducts = localStorage.getItem('pos_products');
    const loadedCategories = localStorage.getItem('pos_categories');
    const loadedSales = localStorage.getItem('pos_sales');
    const loadedKardex = localStorage.getItem('pos_kardex');
    const loadedCustomers = localStorage.getItem('pos_customers');
    const loadedSuppliers = localStorage.getItem('pos_suppliers');
    const loadedRecharges = localStorage.getItem('pos_recharges');
    const loadedConfig = localStorage.getItem('pos_config');
    const authData = localStorage.getItem('pos_auth');

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
    if (loadedConfig) {
      const parsedConfig = JSON.parse(loadedConfig) as Partial<StoreConfig>;
      setStoreConfig(prev => ({
        ...prev,
        ...parsedConfig,
        purchasePricePolicy: parsedConfig.purchasePricePolicy || 'automatic'
      }));
    }
    if (authData) {
      const auth = JSON.parse(authData);
      setIsAuthenticated(auth.isAuthenticated);
      setCurrentUser(auth.currentUser);
    }

    const storedSession = getStoredSession();
    if (!storedSession) return;

    setSession(storedSession);
    setIsAuthenticated(true);

    fetchMyStoreMembership(storedSession.access_token, storedSession.user.id)
      .then((membership) => {
        if (!membership) return;
        setCurrentStoreId(membership.store_id);
        setCurrentUser({
          username: storedSession.user.email || 'usuario',
          role: membership.role,
        });
        return syncProductsFromSupabase(storedSession, membership.store_id);
      })
      .catch((error) => {
        console.error('No se pudo restaurar la sesión de Supabase', error);
        toast.error('No se pudo restaurar la sesión con Supabase');
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

  // Guardar configuración
  useEffect(() => {
    localStorage.setItem('pos_config', JSON.stringify(storeConfig));
  }, [storeConfig]);

  // Guardar autenticación
  useEffect(() => {
    localStorage.setItem('pos_auth', JSON.stringify({ isAuthenticated, currentUser }));
  }, [isAuthenticated, currentUser]);

  // Funciones de autenticación
  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const nextSession = await signInWithPassword(username, password);
      storeSession(nextSession);
      setSession(nextSession);

      const membership = await fetchMyStoreMembership(nextSession.access_token, nextSession.user.id);

      setIsAuthenticated(true);
      setCurrentUser({
        username: nextSession.user.email || username,
        role: membership?.role || 'admin'
      });

      if (membership) {
        setCurrentStoreId(membership.store_id);
        const synced = await syncProductsFromSupabase(nextSession, membership.store_id);
        if (!synced) {
          toast.error('Sesión iniciada, pero falló la sincronización de catálogo');
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

  const logout = () => {
    if (session?.access_token) {
      void signOut(session.access_token).catch(() => undefined);
    }
    storeSession(null);
    setSession(null);
    setCurrentStoreId(null);
    setIsAuthenticated(false);
    setCurrentUser(null);
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
      const synced = await syncProductsFromSupabase(session, storeId);
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
    if (!session?.access_token || !currentStoreId) {
      toast.info('No hay tienda conectada para sincronizar.');
      return false;
    }

    const ok = await syncProductsFromSupabase(session, currentStoreId);
    if (!ok) {
      toast.error('No se pudo sincronizar con Supabase.');
      return false;
    }

    toast.success('Catálogo sincronizado con Supabase.');
    return true;
  };

  const uploadLocalBackupToSupabase = async (clearExisting = false): Promise<boolean> => {
    if (!session?.access_token || !currentStoreId) {
      toast.info('No hay tienda conectada para sincronizar.');
      return false;
    }

    const backupPayload = {
      products: localStorage.getItem('pos_products'),
      sales: localStorage.getItem('pos_sales'),
      customers: localStorage.getItem('pos_customers'),
      suppliers: localStorage.getItem('pos_suppliers'),
      kardex: localStorage.getItem('pos_kardex'),
      recharges: localStorage.getItem('pos_recharges'),
      config: localStorage.getItem('pos_config'),
    };

    try {
      await importLocalBackup(session.access_token, currentStoreId, backupPayload, clearExisting);
      const synced = await syncProductsFromSupabase(session, currentStoreId);
      if (!synced) {
        toast.error('Importación finalizada, pero falló la actualización del catálogo en pantalla.');
      } else {
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

    if (session?.access_token && currentStoreId) {
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
    setProducts(products.map(p => p.id === id ? { ...p, ...updatedProduct } : p));

    if (session?.access_token && currentStoreId) {
      void patchProduct(session.access_token, currentStoreId, id, updatedProduct)
        .catch((error) => {
          console.error('No se pudo actualizar producto en Supabase', error);
          toast.error('Producto actualizado localmente, pero falló la sincronización en Supabase.');
        });
    }
  };

  const deleteProduct = (id: string) => {
    setProducts(products.filter(p => p.id !== id));

    if (session?.access_token && currentStoreId) {
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

    if (session?.access_token && currentStoreId) {
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

    if (session?.access_token && currentStoreId) {
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

    if (session?.access_token && currentStoreId) {
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

  // Funciones de carrito
  const addToCart = (product: Product, quantity: number) => {
    const existingItem = cart.find(item => item.product.id === product.id);
    if (existingItem) {
      setCart(cart.map(item => 
        item.product.id === product.id 
          ? { ...item, quantity: item.quantity + quantity }
          : item
      ));
    } else {
      setCart([...cart, { product, quantity, discount: 0 }]);
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    setCart(cart.map(item => 
      item.product.id === productId ? { ...item, quantity } : item
    ));
  };

  const updateCartDiscount = (productId: string, discount: number) => {
    setCart(cart.map(item => 
      item.product.id === productId ? { ...item, discount } : item
    ));
  };

  const clearCart = () => {
    setCart([]);
  };

  const buildUnitCostWithIva = (product: Product, nextCostPrice?: number): number => {
    const units = Number(product.unitsPerPurchase ?? 1) || 1;
    const baseCost = typeof nextCostPrice === 'number' ? nextCostPrice : product.costPrice;
    const ivaFactor = 1 + (Number(product.iva || 0) / 100);
    return (baseCost * ivaFactor) / units;
  };

  const appendKardexMovement = (movement: Omit<KardexMovement, 'id' | 'date'>) => {
    const nextMovement: KardexMovement = {
      ...movement,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: new Date().toISOString()
    };

    setKardexMovements(prev => [...prev, nextMovement]);
  };

  const cartTotal = cart.reduce((total, item) => {
    const itemPrice = item.product.salePrice * item.quantity;
    const discountAmount = (itemPrice * item.discount) / 100;
    return total + (itemPrice - discountAmount);
  }, 0);

  // Funciones de ventas
  const completeSale = (paymentMethod: string, cashReceived: number, customerId?: string): Sale => {
    const subtotal = cart.reduce((sum, item) => sum + (item.product.salePrice * item.quantity), 0);
    const totalDiscount = cart.reduce((sum, item) => {
      const itemPrice = item.product.salePrice * item.quantity;
      return sum + ((itemPrice * item.discount) / 100);
    }, 0);
    const iva = cart.reduce((sum, item) => {
      const itemPrice = item.product.salePrice * item.quantity;
      const discountAmount = (itemPrice * item.discount) / 100;
      const netPrice = itemPrice - discountAmount;
      return sum + ((netPrice * item.product.iva) / (100 + item.product.iva));
    }, 0);
    const total = subtotal - totalDiscount;
    const change = cashReceived - total;

    const newSale: Sale = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      items: [...cart],
      subtotal,
      discount: totalDiscount,
      iva,
      total,
      paymentMethod,
      cashReceived,
      change,
      customerId,
      invoiceNumber: `FAC-${(sales.length + 1).toString().padStart(6, '0')}`,
    };

    // Actualizar stock
    cart.forEach(item => {
      const stockBefore = item.product.stock;
      const stockAfter = stockBefore - item.quantity;

      updateProduct(item.product.id, {
        stock: stockAfter
      });

      appendKardexMovement({
        productId: item.product.id,
        productName: item.product.name,
        type: 'sale',
        reference: newSale.invoiceNumber || newSale.id,
        quantity: -item.quantity,
        stockBefore,
        stockAfter,
        unitCost: buildUnitCostWithIva(item.product),
        unitSalePrice: item.product.salePrice,
        totalCost: buildUnitCostWithIva(item.product) * item.quantity
      });
    });

    // Si hay cliente, actualizar puntos
    if (customerId) {
      const customer = customers.find(c => c.id === customerId);
      if (customer) {
        const points = Math.floor(total / 1000); // 1 punto por cada $1000
        updateCustomer(customerId, {
          points: customer.points + points,
          purchases: [...customer.purchases, newSale]
        });
      }
    }

    setSales([...sales, newSale]);
    clearCart();
    return newSale;
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
  };

  const updateCustomer = (id: string, updatedCustomer: Partial<Customer>) => {
    setCustomers(customers.map(c => c.id === id ? { ...c, ...updatedCustomer } : c));
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
  };

  const updateSupplier = (id: string, updatedSupplier: Partial<Supplier>) => {
    setSuppliers(suppliers.map(s => s.id === id ? { ...s, ...updatedSupplier } : s));
  };

  const deleteSupplier = (id: string) => {
    setSuppliers(suppliers.filter(s => s.id !== id));
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
  };

  // Funciones de recargas
  const addRecharge = (recharge: Omit<RechargeTransaction, 'id' | 'date'>) => {
    const newRecharge: RechargeTransaction = {
      ...recharge,
      id: Date.now().toString(),
      date: new Date().toISOString()
    };
    setRecharges([...recharges, newRecharge]);
  };

  // Funciones de configuración
  const updateStoreConfig = (config: Partial<StoreConfig>) => {
    setStoreConfig({ ...storeConfig, ...config });
  };

  return (
    <POSContext.Provider value={{
      isAuthenticated,
      currentUser,
      login,
      logout,
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
  const context = useContext(POSContext);
  if (context === undefined) {
    throw new Error('usePOS must be used within a POSProvider');
  }
  return context;
}
