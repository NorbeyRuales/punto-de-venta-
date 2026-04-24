// Capa de acceso a datos en Supabase (REST + RPC) para el POS.
import { deleteRows, insertRows, refreshSession, rpc, selectAllRows, selectRows, supabaseAnonKey, supabaseUrl, updateRows } from '../../lib/supabaseClient';
import type { Product } from '../context/POSContext';

// Tipos "shape" de filas usadas en llamadas REST.
type StoreUserRow = {
  role: 'admin' | 'cashier';
  store_id: string;
  is_active?: boolean;
};

export type StoreManagedUser = {
  id: string;
  userId: string;
  email: string;
  fullName?: string;
  role: 'admin' | 'cashier';
  isActive: boolean;
  createdAt: string;
};

type CategoryRow = {
  id: string;
  name: string;
};

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  cost_price: number;
  sale_price: number;
  stock: number;
  min_stock: number;
  unit: string;
  is_bulk: boolean;
  iva: number;
  ipuc: number;
  units_per_purchase: number | null;
  profit_margin: number | null;
  unit_price: number | null;
  category_id: string | null;
  supplier_id: string | null;
  is_active: boolean;
  supplier?: { name: string } | null;
};

type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia' | 'credito' | 'otro';
type RechargeType = 'mobile' | 'service' | 'pin';
type CashSessionStatus = 'open' | 'closed' | 'counting' | 'closed_with_difference';
type CashMovementType = 'cash_in' | 'cash_out';

type CustomerDebtRow = {
  id: string;
  type: 'debt' | 'payment';
  amount: number;
  description: string | null;
  balance: number;
  created_at: string;
};

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  email: string | null;
  nit: string | null;
  points: number;
  debt: number;
  customer_debt_transactions?: CustomerDebtRow[] | null;
};

type PurchaseItemRow = {
  product_id: string | null;
  quantity_packages: number;
  package_cost: number;
  units_per_package?: number | null;
};

type PurchaseRow = {
  id: string;
  supplier_id: string | null;
  total: number;
  paid: boolean;
  reference: string | null;
  price_policy: 'automatic' | 'manual';
  created_at: string;
  purchase_items?: PurchaseItemRow[] | null;
};

type SupplierRow = {
  id: string;
  name: string;
  nit: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  bank_accounts: string[] | null;
  debt: number;
  purchases?: PurchaseRow[] | null;
};

type SaleItemRow = {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_cost: number;
  unit_sale_price: number;
  discount_percent: number;
  iva: number;
  created_at: string;
};

type SaleItemWithSaleIdRow = SaleItemRow & {
  sale_id: string;
};

type SaleRow = {
  id: string;
  created_at: string;
  returned_at: string | null;
  subtotal: number;
  discount: number;
  iva: number;
  total: number;
  payment_method: PaymentMethod;
  cash_received: number;
  change_value: number;
  payment_breakdown: Record<string, number> | null;
  credited_amount: number;
  customer_id: string | null;
  invoice_number: string | null;
  cash_session_id: string | null;
  sale_items?: SaleItemRow[] | null;
};

type SaleSummaryRow = Omit<SaleRow, 'sale_items'>;

type SaleDraftStatus = 'open' | 'void' | 'completed';

type SaleDraftItemRow = {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_cost: number;
  unit_sale_price: number;
  discount_percent: number;
  iva: number;
  created_at: string;
};

type SaleDraftRow = {
  id: string;
  store_id: string;
  user_id: string | null;
  cash_session_id: string | null;
  customer_id: string | null;
  status: SaleDraftStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  sale_draft_items?: SaleDraftItemRow[] | null;
};

type FinalizeSaleDraftResponse = {
  sale: SaleRow;
  product_updates: Array<{ product_id: string; stock_after: number }>;
};

type KardexRow = {
  id: string;
  product_id: string | null;
  product_name: string;
  type: 'entry' | 'sale' | 'adjustment';
  reference: string | null;
  quantity: number;
  stock_before: number;
  stock_after: number;
  unit_cost: number;
  unit_sale_price: number | null;
  total_cost: number;
  created_at: string;
};

type RechargeRow = {
  id: string;
  type: RechargeType;
  provider: string;
  phone_number: string | null;
  amount: number;
  commission: number;
  total: number;
  created_at: string;
};

type CashSessionRow = {
  id: string;
  store_id: string;
  user_id: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  opening_note: string | null;
  expected_cash: number | null;
  counted_cash: number | null;
  counted_cash_breakdown: Record<string, unknown> | null;
  counted_at: string | null;
  closing_note: string | null;
  difference: number | null;
  status: CashSessionStatus;
  opened_by: string | null;
  closed_by: string | null;
  created_at: string;
};

type CashMovementRow = {
  id: string;
  store_id: string;
  cash_session_id: string;
  user_id: string | null;
  type: CashMovementType;
  amount: number;
  reason: string | null;
  category: string | null;
  subtype: string | null;
  payment_method: string | null;
  reference_type: string | null;
  reference_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type StoreRow = {
  id: string;
  name: string;
  nit: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo: string | null;
  dian_resolution: string | null;
  printer_type: string;
  show_iva: boolean;
  purchase_price_policy: 'automatic' | 'manual';
  currency: string | null;
};

// Valida UUIDs antes de hacer operaciones sensibles.
const uuidLike = (value?: string | null): boolean =>
  !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const isMissingColumnError = (error: unknown, columnName: string): boolean => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('column')
    && message.includes(columnName.toLowerCase())
    && message.includes('does not exist');
};

const MANAGE_USERS_EDGE_BASE_URL = `${supabaseUrl}/functions/v1/server/store-users`;

async function manageUsersEdgeRequest<T>(
  token: string,
  path: string,
  init: RequestInit,
): Promise<T> {
  const doFetch = async (authToken: string) => fetch(`${MANAGE_USERS_EDGE_BASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  let response = await doFetch(token);

  if (response.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed?.access_token) {
      response = await doFetch(refreshed.access_token);
    }
  }

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
    }
    const message = json?.error || json?.message || 'No se pudo completar la operación de usuarios.';
    throw new Error(message);
  }

  return json as T;
}

// Devuelve la membresía actual del usuario en una tienda.
export async function fetchMyStoreMembership(token: string, userId: string): Promise<StoreUserRow | null> {
  let rows: StoreUserRow[] = [];

  try {
    rows = await selectRows<StoreUserRow>(
      'store_users',
      `select=role,store_id,is_active&user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&order=created_at.asc&limit=1`,
      token,
    );
  } catch (error) {
    // Compatibilidad con bases aún no migradas que no tienen la columna is_active.
    if (!isMissingColumnError(error, 'is_active')) {
      throw error;
    }

    rows = await selectRows<StoreUserRow>(
      'store_users',
      `select=role,store_id&user_id=eq.${encodeURIComponent(userId)}&order=created_at.asc&limit=1`,
      token,
    );
  }

  return rows[0] ?? null;
}

export async function listManagedStoreUsers(
  token: string,
  storeId: string,
): Promise<StoreManagedUser[]> {
  const result = await manageUsersEdgeRequest<{ users: StoreManagedUser[] }>(
    token,
    `?storeId=${encodeURIComponent(storeId)}`,
    { method: 'GET' },
  );
  return result.users ?? [];
}

export async function createManagedStoreUser(
  token: string,
  payload: {
    storeId: string;
    email: string;
    password: string;
    fullName?: string;
    role: 'admin' | 'cashier';
  },
): Promise<StoreManagedUser> {
  const result = await manageUsersEdgeRequest<{ user: StoreManagedUser }>(
    token,
    '',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  return result.user;
}

export async function updateManagedStoreUser(
  token: string,
  membershipId: string,
  payload: {
    storeId: string;
    role?: 'admin' | 'cashier';
    isActive?: boolean;
  },
): Promise<StoreManagedUser> {
  const result = await manageUsersEdgeRequest<{ user: StoreManagedUser }>(
    token,
    `/${encodeURIComponent(membershipId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
  return result.user;
}

export async function deleteManagedStoreUser(
  token: string,
  membershipId: string,
  storeId: string,
): Promise<void> {
  await manageUsersEdgeRequest<{ ok: boolean }>(
    token,
    `/${encodeURIComponent(membershipId)}?storeId=${encodeURIComponent(storeId)}`,
    { method: 'DELETE' },
  );
}

export async function bootstrapStore(token: string, payload: {
  name: string;
  nit?: string;
  address?: string;
  phone?: string;
  email?: string;
}): Promise<string> {
  // RPC que crea tienda y asigna el usuario como admin.
  const storeId = await rpc<string>('bootstrap_my_store', {
    p_name: payload.name,
    p_nit: payload.nit || null,
    p_address: payload.address || null,
    p_phone: payload.phone || null,
    p_email: payload.email || null,
  }, token);

  return storeId;
}

// Carga catálogo de categorías y productos, normalizando los datos para la UI.
export async function loadCategoriesAndProducts(token: string, storeId: string): Promise<{ categories: string[]; products: Product[] }> {
  const [categories, products] = await Promise.all([
    selectAllRows<CategoryRow>(
      'categories',
      `select=id,name&store_id=eq.${storeId}&order=name.asc`,
      token,
    ),
    selectAllRows<ProductRow>(
      'products',
      `select=id,name,sku,barcode,cost_price,sale_price,stock,min_stock,unit,is_bulk,iva,ipuc,units_per_purchase,profit_margin,unit_price,category_id,supplier_id,is_active,supplier:suppliers(name)&store_id=eq.${storeId}&order=created_at.asc`,
      token,
    ),
  ]);

  const categoryById = new Map(categories.map(category => [category.id, category.name]));

  return {
    categories: categories.map(category => category.name),
    products: products.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku ?? '',
      barcode: row.barcode ?? '',
      category: row.category_id ? (categoryById.get(row.category_id) ?? 'Sin categoría') : 'Sin categoría',
      supplierName: row.supplier?.name ?? undefined,
      costPrice: Number(row.cost_price ?? 0),
      salePrice: Number(row.sale_price ?? 0),
      stock: Number(row.stock ?? 0),
      minStock: Number(row.min_stock ?? 0),
      unit: row.unit ?? 'unidad',
      isBulk: Boolean(row.is_bulk),
      iva: Number(row.iva ?? 0),
      ipuc: Number(row.ipuc ?? 0),
      unitsPerPurchase: row.units_per_purchase ?? undefined,
      profitMargin: row.profit_margin ?? undefined,
      unitPrice: row.unit_price ?? undefined,
    })),
  };
}

// CRUD de categorías.
export async function createCategory(token: string, storeId: string, name: string): Promise<void> {
  await insertRows('categories', [{ store_id: storeId, name }], token);
}

export async function renameCategory(token: string, storeId: string, oldName: string, newName: string): Promise<void> {
  await updateRows(
    'categories',
    `store_id=eq.${storeId}&name=eq.${encodeURIComponent(oldName)}`,
    { name: newName },
    token,
  );
}

export async function removeCategory(token: string, storeId: string, name: string): Promise<void> {
  await deleteRows(
    'categories',
    `store_id=eq.${storeId}&name=eq.${encodeURIComponent(name)}`,
    token,
  );
}

async function findCategoryId(token: string, storeId: string, categoryName: string): Promise<string | null> {
  const rows = await selectRows<{ id: string }>(
    'categories',
    `select=id&store_id=eq.${storeId}&name=eq.${encodeURIComponent(categoryName)}&limit=1`,
    token,
  );
  return rows[0]?.id ?? null;
}

async function findSupplierId(token: string, storeId: string, supplierName: string): Promise<string | null> {
  const rows = await selectRows<{ id: string }>(
    'suppliers',
    `select=id&store_id=eq.${storeId}&name=eq.${encodeURIComponent(supplierName)}&limit=1`,
    token,
  );
  return rows[0]?.id ?? null;
}

// Crea un producto y devuelve la versión normalizada.
export async function createProduct(token: string, storeId: string, product: Omit<Product, 'id'>): Promise<Product | null> {
  const categoryId = await findCategoryId(token, storeId, product.category);
  const supplierId = product.supplierName ? await findSupplierId(token, storeId, product.supplierName) : null;

  const rows = await insertRows<ProductRow>('products', [{
    store_id: storeId,
    category_id: categoryId,
    supplier_id: supplierId,
    name: product.name,
    sku: product.sku || null,
    barcode: product.barcode || null,
    cost_price: product.costPrice,
    sale_price: product.salePrice,
    stock: product.stock,
    min_stock: product.minStock,
    unit: product.unit,
    is_bulk: product.isBulk,
    iva: product.iva,
    ipuc: product.ipuc ?? 0,
    units_per_purchase: product.unitsPerPurchase ?? null,
    profit_margin: product.profitMargin ?? null,
    unit_price: product.unitPrice ?? null,
    is_active: true,
  }], token);

  const created = rows[0];
  if (!created) return null;

  return {
    id: created.id,
    name: created.name,
    sku: created.sku ?? '',
    barcode: created.barcode ?? '',
    category: product.category,
    supplierName: product.supplierName,
    costPrice: Number(created.cost_price ?? 0),
    salePrice: Number(created.sale_price ?? 0),
    stock: Number(created.stock ?? 0),
    minStock: Number(created.min_stock ?? 0),
    unit: created.unit,
    isBulk: created.is_bulk,
    iva: Number(created.iva ?? 0),
    ipuc: Number(created.ipuc ?? 0),
    unitsPerPurchase: created.units_per_purchase ?? undefined,
    profitMargin: created.profit_margin ?? undefined,
    unitPrice: created.unit_price ?? undefined,
  };
}

// Actualiza un producto con un patch parcial (solo campos provistos).
export async function patchProduct(token: string, storeId: string, productId: string, patch: Partial<Product>): Promise<void> {
  const dbPatch: Record<string, unknown> = {};

  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.sku !== undefined) dbPatch.sku = patch.sku || null;
  if (patch.barcode !== undefined) dbPatch.barcode = patch.barcode || null;
  if (patch.costPrice !== undefined) dbPatch.cost_price = patch.costPrice;
  if (patch.salePrice !== undefined) dbPatch.sale_price = patch.salePrice;
  if (patch.stock !== undefined) dbPatch.stock = patch.stock;
  if (patch.minStock !== undefined) dbPatch.min_stock = patch.minStock;
  if (patch.unit !== undefined) dbPatch.unit = patch.unit;
  if (patch.isBulk !== undefined) dbPatch.is_bulk = patch.isBulk;
  if (patch.iva !== undefined) dbPatch.iva = patch.iva;
  if (patch.ipuc !== undefined) dbPatch.ipuc = patch.ipuc;
  if (patch.unitsPerPurchase !== undefined) dbPatch.units_per_purchase = patch.unitsPerPurchase ?? null;
  if (patch.profitMargin !== undefined) dbPatch.profit_margin = patch.profitMargin ?? null;
  if (patch.unitPrice !== undefined) dbPatch.unit_price = patch.unitPrice ?? null;

  if (patch.category !== undefined) {
    dbPatch.category_id = await findCategoryId(token, storeId, patch.category);
  }

  if (patch.supplierName !== undefined) {
    dbPatch.supplier_id = patch.supplierName
      ? await findSupplierId(token, storeId, patch.supplierName)
      : null;
  }

  if (Object.keys(dbPatch).length === 0) return;

  await updateRows('products', `store_id=eq.${storeId}&id=eq.${productId}`, dbPatch, token);
}

// Elimina un producto por id.
export async function removeProduct(token: string, storeId: string, productId: string): Promise<void> {
  await deleteRows('products', `store_id=eq.${storeId}&id=eq.${productId}`, token);
}

// Importa un backup local (JSON) usando RPC.
export async function importLocalBackup(
  token: string,
  storeId: string,
  backup: Record<string, unknown>,
  clearExisting = false,
): Promise<Record<string, unknown>> {
  return rpc<Record<string, unknown>>(
    'import_local_pos_backup',
    {
      p_store_id: storeId,
      p_backup: backup,
      p_clear_existing: clearExisting,
    },
    token,
  );
}

// Reemplaza el contenido remoto por el backup local (borra datos existentes).
export async function replaceLocalBackup(
  token: string,
  storeId: string,
  backup: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return rpc<Record<string, unknown>>(
    'replace_local_pos_backup',
    {
      p_store_id: storeId,
      p_backup: backup,
    },
    token,
  );
}

// Actualiza la configuración principal de la tienda.
export async function updateStoreDetails(
  token: string,
  storeId: string,
  patch: {
    name?: string;
    nit?: string;
    address?: string;
    phone?: string;
    email?: string;
    dianResolution?: string;
    printerType?: 'thermal' | 'standard';
    showIVA?: boolean;
    purchasePricePolicy?: 'automatic' | 'manual';
    currency?: string;
  },
): Promise<void> {
  const dbPatch: Record<string, unknown> = {};

  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.nit !== undefined) dbPatch.nit = patch.nit || null;
  if (patch.address !== undefined) dbPatch.address = patch.address || null;
  if (patch.phone !== undefined) dbPatch.phone = patch.phone || null;
  if (patch.email !== undefined) dbPatch.email = patch.email || null;
  if (patch.dianResolution !== undefined) dbPatch.dian_resolution = patch.dianResolution || null;
  if (patch.printerType !== undefined) dbPatch.printer_type = patch.printerType;
  if (patch.showIVA !== undefined) dbPatch.show_iva = patch.showIVA;
  if (patch.purchasePricePolicy !== undefined) dbPatch.purchase_price_policy = patch.purchasePricePolicy;
  if (patch.currency !== undefined) dbPatch.currency = patch.currency;

  if (Object.keys(dbPatch).length === 0) return;

  await updateRows('stores', `id=eq.${storeId}`, dbPatch, token);
}

// CRUD de clientes y movimientos de deuda.
export async function createCustomer(
  token: string,
  storeId: string,
  payload: { name: string; phone?: string; address?: string; email?: string; nit?: string; points?: number; debt?: number },
): Promise<string | null> {
  const rows = await insertRows<{ id: string }>('customers', [{
    store_id: storeId,
    name: payload.name,
    phone: payload.phone || null,
    address: payload.address || null,
    email: payload.email || null,
    nit: payload.nit || null,
    points: payload.points ?? 0,
    debt: payload.debt ?? 0,
  }], token);

  return rows[0]?.id ?? null;
}

export async function updateCustomerRow(
  token: string,
  storeId: string,
  customerId: string,
  patch: { name?: string; phone?: string; address?: string; email?: string; nit?: string; points?: number; debt?: number },
): Promise<void> {
  if (!uuidLike(customerId)) return;
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.phone !== undefined) dbPatch.phone = patch.phone || null;
  if (patch.address !== undefined) dbPatch.address = patch.address || null;
  if (patch.email !== undefined) dbPatch.email = patch.email || null;
  if (patch.nit !== undefined) dbPatch.nit = patch.nit || null;
  if (patch.points !== undefined) dbPatch.points = patch.points;
  if (patch.debt !== undefined) dbPatch.debt = patch.debt;
  if (Object.keys(dbPatch).length === 0) return;
  await updateRows('customers', `store_id=eq.${storeId}&id=eq.${customerId}`, dbPatch, token);
}

export async function deleteCustomerRow(token: string, storeId: string, customerId: string): Promise<void> {
  if (!uuidLike(customerId)) return;
  await deleteRows('customers', `store_id=eq.${storeId}&id=eq.${customerId}`, token);
}

export async function insertCustomerDebtTx(
  token: string,
  storeId: string,
  payload: { customerId: string; type: 'debt' | 'payment'; amount: number; description?: string; balance: number; createdAt?: string },
): Promise<void> {
  if (!uuidLike(payload.customerId)) return;
  await insertRows('customer_debt_transactions', [{
    store_id: storeId,
    customer_id: payload.customerId,
    type: payload.type,
    amount: payload.amount,
    description: payload.description || null,
    balance: payload.balance,
    created_at: payload.createdAt || new Date().toISOString(),
  }], token);
}

// CRUD de proveedores.
export async function createSupplierRow(
  token: string,
  storeId: string,
  payload: { name: string; nit?: string; phone?: string; email?: string; address?: string; bankAccounts?: string[]; debt?: number },
): Promise<string | null> {
  const rows = await insertRows<{ id: string }>('suppliers', [{
    store_id: storeId,
    name: payload.name,
    nit: payload.nit || null,
    phone: payload.phone || null,
    email: payload.email || null,
    address: payload.address || null,
    bank_accounts: payload.bankAccounts ?? [],
    debt: payload.debt ?? 0,
  }], token);
  return rows[0]?.id ?? null;
}

export async function updateSupplierRow(
  token: string,
  storeId: string,
  supplierId: string,
  patch: { name?: string; nit?: string; phone?: string; email?: string; address?: string; bankAccounts?: string[]; debt?: number },
): Promise<void> {
  if (!uuidLike(supplierId)) return;
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.nit !== undefined) dbPatch.nit = patch.nit || null;
  if (patch.phone !== undefined) dbPatch.phone = patch.phone || null;
  if (patch.email !== undefined) dbPatch.email = patch.email || null;
  if (patch.address !== undefined) dbPatch.address = patch.address || null;
  if (patch.bankAccounts !== undefined) dbPatch.bank_accounts = patch.bankAccounts;
  if (patch.debt !== undefined) dbPatch.debt = patch.debt;
  if (Object.keys(dbPatch).length === 0) return;
  await updateRows('suppliers', `store_id=eq.${storeId}&id=eq.${supplierId}`, dbPatch, token);
}

export async function deleteSupplierRow(token: string, storeId: string, supplierId: string): Promise<void> {
  if (!uuidLike(supplierId)) return;
  await deleteRows('suppliers', `store_id=eq.${storeId}&id=eq.${supplierId}`, token);
}

// Registra una venta y sus ítems asociados.
export async function createSaleWithItems(
  token: string,
  storeId: string,
  payload: {
    customerId?: string;
    cashSessionId?: string;
    invoiceNumber?: string;
    subtotal: number;
    discount: number;
    iva: number;
    total: number;
    paymentMethod: PaymentMethod;
    cashReceived: number;
    changeValue: number;
    paymentBreakdown?: Record<string, number>;
    creditedAmount?: number;
    createdAt?: string;
    items: Array<{
      productId?: string;
      productName: string;
      quantity: number;
      unitCost: number;
      unitSalePrice: number;
      discountPercent: number;
      lineSubtotal: number;
      lineTotal: number;
      iva: number;
      createdAt?: string;
    }>;
  },
): Promise<string | null> {
  const saleRows = await insertRows<{ id: string }>('sales', [{
    store_id: storeId,
    customer_id: uuidLike(payload.customerId) ? payload.customerId : null,
    cash_session_id: uuidLike(payload.cashSessionId) ? payload.cashSessionId : null,
    invoice_number: payload.invoiceNumber || null,
    subtotal: payload.subtotal,
    discount: payload.discount,
    iva: payload.iva,
    total: payload.total,
    payment_method: payload.paymentMethod,
    cash_received: payload.cashReceived,
    change_value: payload.changeValue,
    payment_breakdown: payload.paymentBreakdown ?? {},
    credited_amount: payload.creditedAmount ?? 0,
    created_at: payload.createdAt || new Date().toISOString(),
  }], token);

  const saleId = saleRows[0]?.id;
  if (!saleId) return null;

  if (payload.items.length > 0) {
    await insertRows('sale_items', payload.items.map((item) => ({
      sale_id: saleId,
      store_id: storeId,
      product_id: uuidLike(item.productId) ? item.productId : null,
      product_name: item.productName,
      quantity: item.quantity,
      unit_cost: item.unitCost,
      unit_sale_price: item.unitSalePrice,
      discount_percent: item.discountPercent,
      line_subtotal: item.lineSubtotal,
      line_total: item.lineTotal,
      iva: item.iva,
      created_at: item.createdAt || new Date().toISOString(),
    })), token);
  }

  return saleId;
}

// Borradores de venta (multi-ventas).
export async function createSaleDraftRow(
  token: string,
  storeId: string,
  payload: {
    userId?: string;
    cashSessionId?: string;
    customerId?: string;
    status?: SaleDraftStatus;
    notes?: string;
  },
): Promise<string | null> {
  const rows = await insertRows<{ id: string }>('sale_drafts', [{
    store_id: storeId,
    user_id: uuidLike(payload.userId) ? payload.userId : null,
    cash_session_id: uuidLike(payload.cashSessionId) ? payload.cashSessionId : null,
    customer_id: uuidLike(payload.customerId) ? payload.customerId : null,
    status: payload.status ?? 'open',
    notes: payload.notes ?? null,
  }], token);
  return rows[0]?.id ?? null;
}

export async function updateSaleDraftRow(
  token: string,
  storeId: string,
  draftId: string,
  patch: {
    cashSessionId?: string | null;
    customerId?: string | null;
    status?: SaleDraftStatus;
    notes?: string | null;
  },
): Promise<void> {
  if (!uuidLike(draftId)) return;
  const dbPatch: Record<string, unknown> = {};
  if (patch.cashSessionId !== undefined) dbPatch.cash_session_id = uuidLike(patch.cashSessionId) ? patch.cashSessionId : null;
  if (patch.customerId !== undefined) dbPatch.customer_id = uuidLike(patch.customerId) ? patch.customerId : null;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.notes !== undefined) dbPatch.notes = patch.notes || null;
  if (Object.keys(dbPatch).length === 0) return;
  await updateRows('sale_drafts', `store_id=eq.${storeId}&id=eq.${draftId}`, dbPatch, token);
}

export async function updateSaleRow(
  token: string,
  storeId: string,
  saleId: string,
  patch: {
    returnedAt?: string | null;
  },
): Promise<void> {
  if (!uuidLike(saleId)) return;
  const dbPatch: Record<string, unknown> = {};
  if (patch.returnedAt !== undefined) dbPatch.returned_at = patch.returnedAt;
  if (Object.keys(dbPatch).length === 0) return;
  await updateRows('sales', `store_id=eq.${storeId}&id=eq.${saleId}`, dbPatch, token);
}

export async function deleteSaleDraftRow(
  token: string,
  storeId: string,
  draftId: string,
): Promise<void> {
  if (!uuidLike(draftId)) return;
  await deleteRows('sale_drafts', `store_id=eq.${storeId}&id=eq.${draftId}`, token);
}

export async function replaceSaleDraftItems(
  token: string,
  storeId: string,
  draftId: string,
  items: Array<{
    productId?: string;
    productName: string;
    quantity: number;
    unitCost: number;
    unitSalePrice: number;
    discountPercent: number;
    iva: number;
    createdAt?: string;
  }>,
): Promise<void> {
  if (!uuidLike(draftId)) return;
  await deleteRows('sale_draft_items', `store_id=eq.${storeId}&draft_id=eq.${draftId}`, token);

  if (items.length === 0) return;

  await insertRows('sale_draft_items', items.map((item) => ({
    draft_id: draftId,
    store_id: storeId,
    product_id: uuidLike(item.productId) ? item.productId : null,
    product_name: item.productName,
    quantity: item.quantity,
    unit_cost: item.unitCost,
    unit_sale_price: item.unitSalePrice,
    discount_percent: item.discountPercent,
    iva: item.iva,
    created_at: item.createdAt || new Date().toISOString(),
  })), token);
}

export async function loadSaleDraftsWithItems(
  token: string,
  storeId: string,
  userId?: string,
): Promise<SaleDraftRow[]> {
  const userFilter = uuidLike(userId) ? `&user_id=eq.${userId}` : '';
  return selectAllRows<SaleDraftRow>(
    'sale_drafts',
    'select=id,store_id,user_id,cash_session_id,customer_id,status,notes,created_at,updated_at,'
      + 'sale_draft_items(id,product_id,product_name,quantity,unit_cost,unit_sale_price,discount_percent,iva,created_at)'
      + `&store_id=eq.${storeId}&status=eq.open${userFilter}&order=created_at.desc`,
    token,
  );
}

export async function finalizeSaleDraft(
  token: string,
  storeId: string,
  payload: {
    draftId: string;
    paymentMethod: PaymentMethod;
    cashReceived: number;
    paymentBreakdown?: Record<string, number>;
    creditedAmount?: number;
  },
): Promise<FinalizeSaleDraftResponse> {
  return rpc<FinalizeSaleDraftResponse>(
    'finalize_sale_draft',
    {
      p_store_id: storeId,
      p_draft_id: payload.draftId,
      p_payment_method: payload.paymentMethod,
      p_cash_received: payload.cashReceived,
      p_payment_breakdown: payload.paymentBreakdown ?? {},
      p_credited_amount: payload.creditedAmount ?? null,
    },
    token,
  );
}

// Registra una compra con ítems detallados.
export async function createPurchaseWithItems(
  token: string,
  storeId: string,
  payload: {
    supplierId?: string;
    total: number;
    paid: boolean;
    pricePolicy: 'automatic' | 'manual';
    reference?: string;
    createdAt?: string;
    items: Array<{
      productId?: string;
      productName: string;
      quantityPackages: number;
      unitsPerPackage: number;
      enteredUnits: number;
      packageCost: number;
      unitCostWithIva: number;
      subtotal: number;
      createdAt?: string;
    }>;
  },
): Promise<string | null> {
  const purchaseRows = await insertRows<{ id: string }>('purchases', [{
    store_id: storeId,
    supplier_id: uuidLike(payload.supplierId) ? payload.supplierId : null,
    total: payload.total,
    paid: payload.paid,
    price_policy: payload.pricePolicy,
    reference: payload.reference || null,
    created_at: payload.createdAt || new Date().toISOString(),
  }], token);

  const purchaseId = purchaseRows[0]?.id;
  if (!purchaseId) return null;

  if (payload.items.length > 0) {
    await insertRows('purchase_items', payload.items.map((item) => ({
      purchase_id: purchaseId,
      store_id: storeId,
      product_id: uuidLike(item.productId) ? item.productId : null,
      product_name: item.productName,
      quantity_packages: item.quantityPackages,
      units_per_package: item.unitsPerPackage,
      entered_units: item.enteredUnits,
      package_cost: item.packageCost,
      unit_cost_with_iva: item.unitCostWithIva,
      subtotal: item.subtotal,
      created_at: item.createdAt || new Date().toISOString(),
    })), token);
  }

  return purchaseId;
}

// Actualiza una compra y reemplaza sus ítems.
export async function updatePurchaseWithItems(
  token: string,
  storeId: string,
  purchaseId: string,
  payload: {
    supplierId?: string;
    total: number;
    paid: boolean;
    pricePolicy: 'automatic' | 'manual';
    reference?: string;
    createdAt?: string;
    items: Array<{
      productId?: string;
      productName: string;
      quantityPackages: number;
      unitsPerPackage: number;
      enteredUnits: number;
      packageCost: number;
      unitCostWithIva: number;
      subtotal: number;
      createdAt?: string;
    }>;
  },
): Promise<void> {
  if (!uuidLike(purchaseId)) return;

  const dbPatch: Record<string, unknown> = {
    supplier_id: uuidLike(payload.supplierId) ? payload.supplierId : null,
    total: payload.total,
    paid: payload.paid,
    price_policy: payload.pricePolicy,
    reference: payload.reference || null,
  };

  if (payload.createdAt) {
    dbPatch.created_at = payload.createdAt;
  }

  await updateRows('purchases', `store_id=eq.${storeId}&id=eq.${purchaseId}`, dbPatch, token);
  await deleteRows('purchase_items', `store_id=eq.${storeId}&purchase_id=eq.${purchaseId}`, token);

  if (payload.items.length === 0) return;

  await insertRows('purchase_items', payload.items.map((item) => ({
    purchase_id: purchaseId,
    store_id: storeId,
    product_id: uuidLike(item.productId) ? item.productId : null,
    product_name: item.productName,
    quantity_packages: item.quantityPackages,
    units_per_package: item.unitsPerPackage,
    entered_units: item.enteredUnits,
    package_cost: item.packageCost,
    unit_cost_with_iva: item.unitCostWithIva,
    subtotal: item.subtotal,
    created_at: item.createdAt || new Date().toISOString(),
  })), token);
}

// Actualiza solo el estado de pago de una compra.
export async function updatePurchasePaid(
  token: string,
  storeId: string,
  purchaseId: string,
  paid: boolean,
): Promise<void> {
  if (!uuidLike(purchaseId)) return;
  await updateRows('purchases', `store_id=eq.${storeId}&id=eq.${purchaseId}`, { paid }, token);
}

// Elimina una compra y sus ítems asociados.
export async function deletePurchaseWithItems(
  token: string,
  storeId: string,
  purchaseId: string,
): Promise<void> {
  if (!uuidLike(purchaseId)) return;
  await deleteRows('purchase_items', `store_id=eq.${storeId}&purchase_id=eq.${purchaseId}`, token);
  await deleteRows('purchases', `store_id=eq.${storeId}&id=eq.${purchaseId}`, token);
}

// Inserta un movimiento de Kardex (entradas/salidas/ajustes).
export async function createKardexMovementRow(
  token: string,
  storeId: string,
  movement: {
    productId?: string;
    productName: string;
    type: 'entry' | 'sale' | 'adjustment';
    reference?: string;
    quantity: number;
    stockBefore: number;
    stockAfter: number;
    unitCost: number;
    unitSalePrice?: number;
    totalCost: number;
    createdAt?: string;
  },
): Promise<void> {
  await insertRows('kardex_movements', [{
    store_id: storeId,
    product_id: uuidLike(movement.productId) ? movement.productId : null,
    product_name: movement.productName,
    type: movement.type,
    reference: movement.reference || null,
    quantity: movement.quantity,
    stock_before: movement.stockBefore,
    stock_after: movement.stockAfter,
    unit_cost: movement.unitCost,
    unit_sale_price: movement.unitSalePrice ?? null,
    total_cost: movement.totalCost,
    created_at: movement.createdAt || new Date().toISOString(),
  }], token);
}

// Registra una recarga (celular/servicio/pin).
export async function createRechargeRow(
  token: string,
  storeId: string,
  recharge: {
    type: RechargeType;
    provider: string;
    phoneNumber?: string;
    amount: number;
    commission: number;
    total: number;
    createdAt?: string;
  },
): Promise<void> {
  await insertRows('recharges', [{
    store_id: storeId,
    type: recharge.type,
    provider: recharge.provider,
    phone_number: recharge.phoneNumber || null,
    amount: recharge.amount,
    commission: recharge.commission,
    total: recharge.total,
    created_at: recharge.createdAt || new Date().toISOString(),
  }], token);
}

// Apertura de caja.
export async function createCashSession(
  token: string,
  storeId: string,
  payload: {
    userId?: string;
    openingCash: number;
    openingNote?: string;
    openedAt?: string;
  },
): Promise<string | null> {
  const rows = await insertRows<{ id: string }>('cash_sessions', [{
    store_id: storeId,
    user_id: uuidLike(payload.userId) ? payload.userId : null,
    opened_by: uuidLike(payload.userId) ? payload.userId : null,
    opening_cash: payload.openingCash,
    opening_note: payload.openingNote || null,
    opened_at: payload.openedAt || new Date().toISOString(),
    status: 'open',
  }], token);
  return rows[0]?.id ?? null;
}

// Actualiza una sesión de caja (cierre).
export async function updateCashSession(
  token: string,
  storeId: string,
  sessionId: string,
  patch: {
    closedAt?: string;
    expectedCash?: number;
    countedCash?: number;
    countedCashBreakdown?: unknown;
    countedAt?: string;
    closingNote?: string;
    closedBy?: string;
    difference?: number;
    status?: CashSessionStatus;
  },
): Promise<void> {
  if (!uuidLike(sessionId)) return;
  const dbPatch: Record<string, unknown> = {};
  if (patch.closedAt !== undefined) dbPatch.closed_at = patch.closedAt;
  if (patch.expectedCash !== undefined) dbPatch.expected_cash = patch.expectedCash;
  if (patch.countedCash !== undefined) dbPatch.counted_cash = patch.countedCash;
  if (patch.countedCashBreakdown !== undefined) dbPatch.counted_cash_breakdown = patch.countedCashBreakdown;
  if (patch.countedAt !== undefined) dbPatch.counted_at = patch.countedAt;
  if (patch.closingNote !== undefined) dbPatch.closing_note = patch.closingNote || null;
  if (patch.closedBy !== undefined) dbPatch.closed_by = uuidLike(patch.closedBy) ? patch.closedBy : null;
  if (patch.difference !== undefined) dbPatch.difference = patch.difference;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (Object.keys(dbPatch).length === 0) return;
  try {
    await updateRows('cash_sessions', `store_id=eq.${storeId}&id=eq.${sessionId}`, dbPatch, token);
  } catch (error) {
    if (patch.countedCashBreakdown !== undefined && isMissingColumnError(error, 'counted_cash_breakdown')) {
      const legacyPatch = { ...dbPatch };
      delete legacyPatch.counted_cash_breakdown;
      await updateRows('cash_sessions', `store_id=eq.${storeId}&id=eq.${sessionId}`, legacyPatch, token);
      return;
    }
    throw error;
  }
}

// Movimiento manual de caja.
export async function createCashMovement(
  token: string,
  storeId: string,
  movement: {
    cashSessionId: string;
    userId?: string;
    type: CashMovementType;
    amount: number;
    reason?: string;
    category?: string;
    subtype?: string;
    paymentMethod?: string;
    referenceType?: string;
    referenceId?: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  },
): Promise<string | null> {
  const rows = await insertRows<{ id: string }>('cash_movements', [{
    store_id: storeId,
    cash_session_id: uuidLike(movement.cashSessionId) ? movement.cashSessionId : null,
    user_id: uuidLike(movement.userId) ? movement.userId : null,
    type: movement.type,
    amount: movement.amount,
    reason: movement.reason || null,
    category: movement.category || 'manual',
    subtype: movement.subtype || null,
    payment_method: movement.paymentMethod || null,
    reference_type: movement.referenceType || null,
    reference_id: uuidLike(movement.referenceId) ? movement.referenceId : null,
    metadata: movement.metadata ?? {},
    created_at: movement.createdAt || new Date().toISOString(),
  }], token);
  return rows[0]?.id ?? null;
}

export async function deleteCashReportsByStore(
  token: string,
  storeId: string,
): Promise<void> {
  await deleteRows('cash_sessions', `store_id=eq.${storeId}`, token);
}

export async function deleteCashReportsByIds(
  token: string,
  storeId: string,
  sessionIds: string[],
): Promise<void> {
  if (sessionIds.length === 0) return;
  const normalizedIds = sessionIds
    .filter((id) => uuidLike(id))
    .map((id) => id.trim());
  if (normalizedIds.length === 0) return;

  const inClause = normalizedIds.join(',');
  await deleteRows('cash_sessions', `store_id=eq.${storeId}&id=in.(${inClause})`, token);
}

// Consultas de sincronización remota.
export async function loadCustomersWithDebt(token: string, storeId: string): Promise<CustomerRow[]> {
  return selectAllRows<CustomerRow>(
    'customers',
    'select=id,name,phone,address,email,nit,points,debt,customer_debt_transactions(id,type,amount,description,balance,created_at)'
      + `&store_id=eq.${storeId}&order=created_at.asc`,
    token,
  );
}

export async function loadSuppliersWithPurchases(token: string, storeId: string): Promise<SupplierRow[]> {
  return selectAllRows<SupplierRow>(
    'suppliers',
    'select=id,name,nit,phone,email,address,bank_accounts,debt,'
      + 'purchases(id,created_at,total,paid,reference,price_policy,'
      + 'purchase_items(product_id,quantity_packages,package_cost,units_per_package))'
      + `&store_id=eq.${storeId}&order=name.asc`,
    token,
  );
}

export async function loadSalesWithItems(token: string, storeId: string): Promise<SaleRow[]> {
  const salesBaseQuery =
    'select=id,created_at,returned_at,subtotal,discount,iva,total,payment_method,cash_received,change_value,payment_breakdown,credited_amount,customer_id,invoice_number,cash_session_id';
  const salesWithItemsQuery = `${salesBaseQuery},sale_items(id,product_id,product_name,quantity,unit_cost,unit_sale_price,discount_percent,iva,created_at)`
    + `&store_id=eq.${storeId}&order=created_at.asc`;

  try {
    return await selectAllRows<SaleRow>(
      'sales',
      salesWithItemsQuery,
      token,
    );
  } catch (error) {
    console.warn('La carga anidada de ventas falló. Reintentando ventas e ítems por separado.', error);

    const [salesRows, saleItemRows] = await Promise.all([
      selectAllRows<SaleSummaryRow>(
        'sales',
        `${salesBaseQuery}&store_id=eq.${storeId}&order=created_at.asc`,
        token,
      ),
      selectAllRows<SaleItemWithSaleIdRow>(
        'sale_items',
        'select=id,sale_id,product_id,product_name,quantity,unit_cost,unit_sale_price,discount_percent,iva,created_at'
          + `&store_id=eq.${storeId}&order=created_at.asc`,
        token,
      ),
    ]);

    const itemsBySaleId = new Map<string, SaleItemRow[]>();
    saleItemRows.forEach(({ sale_id, ...item }) => {
      const existing = itemsBySaleId.get(sale_id);
      if (existing) {
        existing.push(item);
        return;
      }
      itemsBySaleId.set(sale_id, [item]);
    });

    return salesRows.map((sale) => ({
      ...sale,
      sale_items: itemsBySaleId.get(sale.id) ?? [],
    }));
  }
}

export async function loadKardexMovements(token: string, storeId: string): Promise<KardexRow[]> {
  return selectAllRows<KardexRow>(
    'kardex_movements',
    'select=id,product_id,product_name,type,reference,quantity,stock_before,stock_after,unit_cost,unit_sale_price,total_cost,created_at'
      + `&store_id=eq.${storeId}&order=created_at.asc`,
    token,
  );
}

export async function loadRecharges(token: string, storeId: string): Promise<RechargeRow[]> {
  return selectAllRows<RechargeRow>(
    'recharges',
    'select=id,type,provider,phone_number,amount,commission,total,created_at'
      + `&store_id=eq.${storeId}&order=created_at.asc`,
    token,
  );
}

export async function loadCashSessions(token: string, storeId: string): Promise<CashSessionRow[]> {
  try {
    return await selectAllRows<CashSessionRow>(
      'cash_sessions',
      'select=id,store_id,user_id,opened_at,closed_at,opening_cash,opening_note,expected_cash,counted_cash,counted_cash_breakdown,counted_at,closing_note,difference,status,opened_by,closed_by,created_at'
        + `&store_id=eq.${storeId}&order=opened_at.asc`,
      token,
    );
  } catch (error) {
    if (isMissingColumnError(error, 'counted_cash_breakdown')) {
      const legacyRows = await selectAllRows<CashSessionRow>(
        'cash_sessions',
        'select=id,store_id,user_id,opened_at,closed_at,opening_cash,opening_note,expected_cash,counted_cash,counted_at,closing_note,difference,status,opened_by,closed_by,created_at'
          + `&store_id=eq.${storeId}&order=opened_at.asc`,
        token,
      );
      return legacyRows.map((row) => ({
        ...row,
        counted_cash_breakdown: null,
      }));
    }
    throw error;
  }
}

export async function loadCashMovements(token: string, storeId: string): Promise<CashMovementRow[]> {
  return selectAllRows<CashMovementRow>(
    'cash_movements',
    'select=id,store_id,cash_session_id,user_id,type,amount,reason,category,subtype,payment_method,reference_type,reference_id,metadata,created_at'
      + `&store_id=eq.${storeId}&order=created_at.asc`,
    token,
  );
}

export async function loadStoreDetails(token: string, storeId: string): Promise<StoreRow | null> {
  const rows = await selectRows<StoreRow>(
    'stores',
    'select=id,name,nit,address,phone,email,logo,dian_resolution,printer_type,show_iva,purchase_price_policy,currency'
      + `&id=eq.${storeId}&limit=1`,
    token,
  );
  return rows[0] ?? null;
}
