-- Fase 4: backfill historico seguro para consistencia operativa de caja.
-- No elimina informacion. Solo normaliza estados y agrega ledger estructurado faltante.

-- 1) Normalizar cierres historicos: si hubo diferencia, marcar closed_with_difference.
update public.cash_sessions
set status = 'closed_with_difference'
where status = 'closed'
  and coalesce(difference, 0) <> 0;

-- 2) Backfill de movimientos de venta por metodo para trazabilidad estructurada.
with sales_scope as (
  select
    s.id as sale_id,
    s.store_id,
    s.cash_session_id,
    s.cashier_user_id,
    s.created_at,
    s.invoice_number,
    coalesce(s.payment_breakdown, '{}'::jsonb) as payment_breakdown,
    round(coalesce(s.total, 0) / 100) * 100 as rounded_total
  from public.sales s
  where s.cash_session_id is not null
),
exploded as (
  select
    ss.sale_id,
    ss.store_id,
    ss.cash_session_id,
    ss.cashier_user_id,
    ss.created_at,
    ss.invoice_number,
    m.method,
    round(greatest(coalesce((ss.payment_breakdown ->> m.method)::numeric, 0), 0) / 100) * 100 as amount
  from sales_scope ss
  cross join lateral (
    values
      ('efectivo'),
      ('tarjeta'),
      ('transferencia'),
      ('nequi'),
      ('daviplata'),
      ('credito'),
      ('otro')
  ) as m(method)
),
rows_to_insert as (
  select
    e.store_id,
    e.cash_session_id,
    e.cashier_user_id,
    e.created_at,
    e.invoice_number,
    e.sale_id,
    e.method,
    e.amount
  from exploded e
  where e.amount > 0
    and not exists (
      select 1
      from public.cash_movements cm
      where cm.category = 'sale'
        and cm.reference_type = 'sale'
        and cm.reference_id = e.sale_id
        and lower(coalesce(cm.payment_method, '')) = e.method
    )
)
insert into public.cash_movements (
  store_id,
  cash_session_id,
  user_id,
  type,
  amount,
  reason,
  category,
  subtype,
  payment_method,
  reference_type,
  reference_id,
  metadata,
  created_at
)
select
  r.store_id,
  r.cash_session_id,
  r.cashier_user_id,
  'cash_in'::public.cash_movement_type,
  r.amount,
  format('Venta %s - %s', coalesce(r.invoice_number, r.sale_id::text), r.method),
  'sale',
  format('sale_%s', r.method),
  r.method,
  'sale',
  r.sale_id,
  jsonb_build_object(
    'auto_backfill', true,
    'source', 'sales',
    'saleId', r.sale_id,
    'invoiceNumber', r.invoice_number,
    'method', r.method
  ),
  r.created_at
from rows_to_insert r;
