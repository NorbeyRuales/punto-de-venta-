import { deleteRows, insertRows, rpc, selectRows, updateRows } from '../../lib/supabaseClient';
import type { Product } from '../context/POSContext';

type StoreUserRow = {
  role: 'admin' | 'cashier';
  store_id: string;
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
  units_per_purchase: number | null;
  profit_margin: number | null;
  unit_price: number | null;
  category_id: string | null;
  supplier_id: string | null;
  is_active: boolean;
};

export async function fetchMyStoreMembership(token: string, userId: string): Promise<StoreUserRow | null> {
  const rows = await selectRows<StoreUserRow>(
    'store_users',
    `select=role,store_id&user_id=eq.${encodeURIComponent(userId)}&order=created_at.asc&limit=1`,
    token,
  );

  return rows[0] ?? null;
}

export async function bootstrapStore(token: string, payload: {
  name: string;
  nit?: string;
  address?: string;
  phone?: string;
  email?: string;
}): Promise<string> {
  const storeId = await rpc<string>('bootstrap_my_store', {
    p_name: payload.name,
    p_nit: payload.nit || null,
    p_address: payload.address || null,
    p_phone: payload.phone || null,
    p_email: payload.email || null,
  }, token);

  return storeId;
}

export async function loadCategoriesAndProducts(token: string, storeId: string): Promise<{ categories: string[]; products: Product[] }> {
  const categories = await selectRows<CategoryRow>(
    'categories',
    `select=id,name&store_id=eq.${storeId}&order=name.asc`,
    token,
  );

  const categoryById = new Map(categories.map(category => [category.id, category.name]));

  const products = await selectRows<ProductRow>(
    'products',
    `select=id,name,sku,barcode,cost_price,sale_price,stock,min_stock,unit,is_bulk,iva,units_per_purchase,profit_margin,unit_price,category_id,supplier_id,is_active&store_id=eq.${storeId}&order=created_at.asc`,
    token,
  );

  return {
    categories: categories.map(category => category.name),
    products: products.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku ?? '',
      barcode: row.barcode ?? '',
      category: row.category_id ? (categoryById.get(row.category_id) ?? 'Sin categoría') : 'Sin categoría',
      supplierName: undefined,
      costPrice: Number(row.cost_price ?? 0),
      salePrice: Number(row.sale_price ?? 0),
      stock: Number(row.stock ?? 0),
      minStock: Number(row.min_stock ?? 0),
      unit: row.unit ?? 'unidad',
      isBulk: Boolean(row.is_bulk),
      iva: Number(row.iva ?? 0),
      unitsPerPurchase: row.units_per_purchase ?? undefined,
      profitMargin: row.profit_margin ?? undefined,
      unitPrice: row.unit_price ?? undefined,
    })),
  };
}

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

export async function createProduct(token: string, storeId: string, product: Omit<Product, 'id'>): Promise<Product | null> {
  const categoryId = await findCategoryId(token, storeId, product.category);

  const rows = await insertRows<ProductRow>('products', [{
    store_id: storeId,
    category_id: categoryId,
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
    unitsPerPurchase: created.units_per_purchase ?? undefined,
    profitMargin: created.profit_margin ?? undefined,
    unitPrice: created.unit_price ?? undefined,
  };
}

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
  if (patch.unitsPerPurchase !== undefined) dbPatch.units_per_purchase = patch.unitsPerPurchase ?? null;
  if (patch.profitMargin !== undefined) dbPatch.profit_margin = patch.profitMargin ?? null;
  if (patch.unitPrice !== undefined) dbPatch.unit_price = patch.unitPrice ?? null;

  if (patch.category !== undefined) {
    dbPatch.category_id = await findCategoryId(token, storeId, patch.category);
  }

  if (Object.keys(dbPatch).length === 0) return;

  await updateRows('products', `store_id=eq.${storeId}&id=eq.${productId}`, dbPatch, token);
}

export async function removeProduct(token: string, storeId: string, productId: string): Promise<void> {
  await deleteRows('products', `store_id=eq.${storeId}&id=eq.${productId}`, token);
}
