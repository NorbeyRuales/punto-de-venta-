-- Índices aditivos para acelerar cargas y sincronizaciones del POS.
-- Esta migración no modifica ni elimina filas, tablas o columnas.

create index if not exists idx_categories_store_name
  on public.categories (store_id, name);

create index if not exists idx_suppliers_store_name
  on public.suppliers (store_id, name);

create index if not exists idx_products_store_created
  on public.products (store_id, created_at);

create index if not exists idx_customers_store_created
  on public.customers (store_id, created_at);

create index if not exists idx_customer_debt_customer_created
  on public.customer_debt_transactions (customer_id, created_at);

create index if not exists idx_sale_items_store_created
  on public.sale_items (store_id, created_at);

create index if not exists idx_kardex_store_created
  on public.kardex_movements (store_id, created_at);

create index if not exists idx_sale_drafts_store_status_user_created
  on public.sale_drafts (store_id, status, user_id, created_at desc);
