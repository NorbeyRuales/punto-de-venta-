-- Extensiones necesarias
create extension if not exists pgcrypto;

-- Enumerados
create type public.payment_method as enum ('efectivo', 'tarjeta', 'transferencia', 'credito', 'otro');
create type public.kardex_type as enum ('entry', 'sale', 'adjustment');
create type public.recharge_type as enum ('mobile', 'service', 'pin');
create type public.purchase_price_policy as enum ('automatic', 'manual');
create type public.user_role as enum ('admin', 'cashier');
create type public.debt_tx_type as enum ('debt', 'payment');

-- Funciones utilitarias
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Núcleo de tienda y usuarios
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nit text,
  address text,
  phone text,
  email text,
  logo text,
  dian_resolution text,
  printer_type text not null default 'thermal',
  show_iva boolean not null default true,
  purchase_price_policy public.purchase_price_policy not null default 'automatic',
  currency text not null default 'COP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.store_users (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.user_role not null default 'cashier',
  created_at timestamptz not null default now(),
  unique (store_id, user_id)
);

create or replace function public.is_store_member(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_users su
    where su.store_id = target_store_id
      and su.user_id = auth.uid()
  );
$$;

create or replace function public.is_store_admin(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_users su
    where su.store_id = target_store_id
      and su.user_id = auth.uid()
      and su.role = 'admin'
  );
$$;

-- Catálogo
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  nit text,
  phone text,
  email text,
  address text,
  bank_accounts text[] not null default '{}',
  debt numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  name text not null,
  sku text,
  barcode text,
  cost_price numeric(14,2) not null default 0,
  sale_price numeric(14,2) not null default 0,
  stock numeric(14,3) not null default 0,
  min_stock numeric(14,3) not null default 0,
  unit text not null default 'unidad',
  is_bulk boolean not null default false,
  iva numeric(5,2) not null default 0,
  units_per_purchase numeric(14,3),
  profit_margin numeric(7,3),
  unit_price numeric(14,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, sku),
  unique (store_id, barcode),
  check (iva >= 0),
  check (stock >= 0)
);

-- Clientes
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  phone text,
  address text,
  email text,
  nit text,
  points integer not null default 0,
  debt numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_debt_transactions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  type public.debt_tx_type not null,
  amount numeric(14,2) not null,
  description text,
  balance numeric(14,2) not null,
  created_at timestamptz not null default now(),
  check (amount >= 0)
);

-- Ventas
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  cashier_user_id uuid references auth.users(id) on delete set null,
  invoice_number text,
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  iva numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  payment_method public.payment_method not null default 'efectivo',
  cash_received numeric(14,2) not null default 0,
  change_value numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (store_id, invoice_number)
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity numeric(14,3) not null,
  unit_cost numeric(14,2) not null default 0,
  unit_sale_price numeric(14,2) not null default 0,
  discount_percent numeric(6,3) not null default 0,
  line_subtotal numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  iva numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

-- Compras
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  total numeric(14,2) not null default 0,
  paid boolean not null default false,
  price_policy public.purchase_price_policy not null default 'automatic',
  reference text,
  created_at timestamptz not null default now()
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity_packages numeric(14,3) not null,
  units_per_package numeric(14,3) not null default 1,
  entered_units numeric(14,3) not null,
  package_cost numeric(14,2) not null,
  unit_cost_with_iva numeric(14,2) not null,
  subtotal numeric(14,2) not null,
  created_at timestamptz not null default now()
);

-- Kardex
create table public.kardex_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  type public.kardex_type not null,
  reference text,
  quantity numeric(14,3) not null,
  stock_before numeric(14,3) not null,
  stock_after numeric(14,3) not null,
  unit_cost numeric(14,2) not null default 0,
  unit_sale_price numeric(14,2),
  total_cost numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

-- Recargas
create table public.recharges (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  type public.recharge_type not null,
  provider text not null,
  phone_number text,
  amount numeric(14,2) not null,
  commission numeric(14,2) not null,
  total numeric(14,2) not null,
  created_at timestamptz not null default now()
);

-- Índices
create index idx_store_users_user on public.store_users(user_id);
create index idx_categories_store on public.categories(store_id);
create unique index ux_categories_store_name_ci on public.categories (store_id, lower(name));
create index idx_suppliers_store on public.suppliers(store_id);
create unique index ux_suppliers_store_name_ci on public.suppliers (store_id, lower(name));
create index idx_products_store on public.products(store_id);
create index idx_products_category on public.products(category_id);
create index idx_products_supplier on public.products(supplier_id);
create index idx_products_name on public.products using gin (to_tsvector('spanish', name));
create index idx_customers_store on public.customers(store_id);
create index idx_sales_store_created on public.sales(store_id, created_at desc);
create index idx_sale_items_sale on public.sale_items(sale_id);
create index idx_purchases_store_created on public.purchases(store_id, created_at desc);
create index idx_purchase_items_purchase on public.purchase_items(purchase_id);
create index idx_kardex_store_product_created on public.kardex_movements(store_id, product_id, created_at desc);
create index idx_recharges_store_created on public.recharges(store_id, created_at desc);

-- Triggers de updated_at
create trigger trg_stores_updated_at before update on public.stores for each row execute function public.set_updated_at();
create trigger trg_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger trg_categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger trg_suppliers_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
create trigger trg_products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger trg_customers_updated_at before update on public.customers for each row execute function public.set_updated_at();

-- RLS
alter table public.stores enable row level security;
alter table public.profiles enable row level security;
alter table public.store_users enable row level security;
alter table public.categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.customer_debt_transactions enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.kardex_movements enable row level security;
alter table public.recharges enable row level security;

-- Políticas base por pertenencia a tienda
create policy "stores_member_select" on public.stores
for select
using (public.is_store_member(id));

create policy "stores_admin_update" on public.stores
for update
using (public.is_store_admin(id))
with check (public.is_store_admin(id));

create policy "profiles_owner_all" on public.profiles
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "store_users_member_select" on public.store_users
for select
using (public.is_store_member(store_id));

create policy "store_users_admin_manage" on public.store_users
for all
using (public.is_store_admin(store_id))
with check (public.is_store_admin(store_id));

-- Helper para políticas repetitivas
create policy "categories_member_all" on public.categories
for all using (public.is_store_member(store_id))
with check (public.is_store_member(store_id));

create policy "suppliers_member_all" on public.suppliers
for all using (public.is_store_member(store_id))
with check (public.is_store_member(store_id));

create policy "products_member_all" on public.products
for all using (public.is_store_member(store_id))
with check (public.is_store_member(store_id));

create policy "customers_member_all" on public.customers
for all using (public.is_store_member(store_id))
with check (public.is_store_member(store_id));

create policy "customer_debt_member_all" on public.customer_debt_transactions
for all using (public.is_store_member(store_id))
with check (public.is_store_member(store_id));

create policy "sales_member_all" on public.sales
for all using (public.is_store_member(store_id))
with check (public.is_store_member(store_id));

create policy "sale_items_member_all" on public.sale_items
for all using (public.is_store_member(store_id))
with check (public.is_store_member(store_id));

create policy "purchases_member_all" on public.purchases
for all using (public.is_store_member(store_id))
with check (public.is_store_member(store_id));

create policy "purchase_items_member_all" on public.purchase_items
for all using (public.is_store_member(store_id))
with check (public.is_store_member(store_id));

create policy "kardex_member_all" on public.kardex_movements
for all using (public.is_store_member(store_id))
with check (public.is_store_member(store_id));

create policy "recharges_member_all" on public.recharges
for all using (public.is_store_member(store_id))
with check (public.is_store_member(store_id));
