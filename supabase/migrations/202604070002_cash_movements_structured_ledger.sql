-- Fase 2: movimientos de caja estructurados (sin perdida de datos).
-- Cambios aditivos para soportar APERTURA/VENTA por metodo con referencias.

alter table public.cash_movements
  add column if not exists category text not null default 'manual',
  add column if not exists subtype text,
  add column if not exists payment_method text,
  add column if not exists reference_type text,
  add column if not exists reference_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.cash_movements
  drop constraint if exists cash_movements_category_chk;

alter table public.cash_movements
  add constraint cash_movements_category_chk
  check (
    category in (
      'manual',
      'opening',
      'sale',
      'manual_income',
      'manual_expense',
      'return',
      'credit_payment',
      'adjustment',
      'other'
    )
  );

alter table public.cash_movements
  drop constraint if exists cash_movements_payment_method_chk;

alter table public.cash_movements
  add constraint cash_movements_payment_method_chk
  check (
    payment_method is null
    or lower(payment_method) in (
      'efectivo',
      'tarjeta',
      'transferencia',
      'nequi',
      'daviplata',
      'credito',
      'otro'
    )
  );

alter table public.cash_movements
  drop constraint if exists cash_movements_reference_type_chk;

alter table public.cash_movements
  add constraint cash_movements_reference_type_chk
  check (
    reference_type is null
    or reference_type in ('sale', 'cash_session', 'customer', 'manual', 'system', 'other')
  );

-- Backfill seguro para historico sin romper datos existentes.
update public.cash_movements
set category = case
  when type = 'cash_in' and coalesce(reason, '') ilike 'Apertura%' then 'opening'
  when type = 'cash_out' and coalesce(reason, '') ilike 'Devolución venta %' then 'return'
  when type = 'cash_in' and coalesce(reason, '') ilike 'Abono fiado %' then 'credit_payment'
  when type = 'cash_in' then 'manual_income'
  when type = 'cash_out' then 'manual_expense'
  else 'manual'
end
where category = 'manual';

update public.cash_movements
set payment_method = 'efectivo'
where payment_method is null
  and category in ('opening', 'manual_income', 'manual_expense', 'return', 'credit_payment');

create index if not exists idx_cash_movements_session_category_created
  on public.cash_movements(cash_session_id, category, created_at desc);

create index if not exists idx_cash_movements_session_method_created
  on public.cash_movements(cash_session_id, payment_method, created_at desc);

create index if not exists idx_cash_movements_reference
  on public.cash_movements(reference_type, reference_id)
  where reference_id is not null;
