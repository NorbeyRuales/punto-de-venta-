-- Control de caja: sesiones y movimientos
create type public.cash_session_status as enum ('open', 'closed');
create type public.cash_movement_type as enum ('cash_in', 'cash_out');

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cash numeric(14,2) not null default 0,
  expected_cash numeric(14,2),
  counted_cash numeric(14,2),
  difference numeric(14,2),
  status public.cash_session_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (opening_cash >= 0)
);

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  cash_session_id uuid not null references public.cash_sessions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  type public.cash_movement_type not null,
  amount numeric(14,2) not null,
  reason text,
  created_at timestamptz not null default now(),
  check (amount > 0)
);

alter table public.sales
  add column cash_session_id uuid references public.cash_sessions(id) on delete set null;

create index idx_cash_sessions_store_status on public.cash_sessions(store_id, status);
create index idx_cash_sessions_store_opened on public.cash_sessions(store_id, opened_at desc);
create unique index ux_cash_sessions_store_open on public.cash_sessions(store_id) where status = 'open';
create index idx_cash_movements_session on public.cash_movements(cash_session_id);
create index idx_cash_movements_store_created on public.cash_movements(store_id, created_at desc);
create index idx_sales_cash_session on public.sales(cash_session_id);

create trigger trg_cash_sessions_updated_at
before update on public.cash_sessions
for each row execute function public.set_updated_at();

alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;

create policy "cash_sessions_member_all" on public.cash_sessions
for all using (public.is_store_member(store_id))
with check (public.is_store_member(store_id));

create policy "cash_movements_member_all" on public.cash_movements
for all using (public.is_store_member(store_id))
with check (public.is_store_member(store_id));
