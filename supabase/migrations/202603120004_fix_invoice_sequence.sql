-- Fix invoice sequence to avoid duplicate invoice numbers.
create or replace function public.next_invoice_number(p_store_id uuid)
returns text
language plpgsql
as $$
declare
  v_next bigint;
  v_max bigint;
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'No autorizado';
  end if;

  select max((regexp_replace(invoice_number, '\D', '', 'g'))::bigint)
  into v_max
  from public.sales
  where store_id = p_store_id
    and invoice_number is not null
    and invoice_number ~ '[0-9]';

  insert into public.store_invoice_sequences (store_id, last_number)
  values (p_store_id, coalesce(v_max, 0))
  on conflict (store_id) do update
    set last_number = greatest(public.store_invoice_sequences.last_number, excluded.last_number),
        updated_at = now();

  update public.store_invoice_sequences
  set last_number = last_number + 1,
      updated_at = now()
  where store_id = p_store_id
  returning last_number into v_next;

  return 'FAC-' || lpad(v_next::text, 6, '0');
end;
$$;

-- Backfill sequence per store based on existing invoices.
insert into public.store_invoice_sequences (store_id, last_number)
select
  s.id,
  coalesce(max((regexp_replace(sa.invoice_number, '\D', '', 'g'))::bigint), 0) as last_number
from public.stores s
left join public.sales sa
  on sa.store_id = s.id
  and sa.invoice_number is not null
  and sa.invoice_number ~ '[0-9]'
group by s.id
on conflict (store_id) do update
  set last_number = greatest(public.store_invoice_sequences.last_number, excluded.last_number),
      updated_at = now();
