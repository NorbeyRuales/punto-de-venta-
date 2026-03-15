-- Marca devoluciones en ventas y permite reportes netos.
alter table public.sales
  add column if not exists returned_at timestamptz;

-- Backfill usando movimientos de Kardex con referencia DEV-<sale_id>.
update public.sales s
set returned_at = km.created_at
from public.kardex_movements km
where s.returned_at is null
  and km.reference = ('DEV-' || s.id::text);

create index if not exists idx_sales_store_returned_at
  on public.sales (store_id, returned_at);
