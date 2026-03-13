-- Borradores de venta para permitir múltiples ventas simultáneas.
create type public.sale_draft_status as enum ('open', 'void', 'completed');

create table public.sale_drafts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  cash_session_id uuid references public.cash_sessions(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  status public.sale_draft_status not null default 'open',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sale_draft_items (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.sale_drafts(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity numeric(14,3) not null,
  unit_cost numeric(14,2) not null default 0,
  unit_sale_price numeric(14,2) not null default 0,
  discount_percent numeric(7,3) not null default 0,
  iva numeric(5,2) not null default 0,
  created_at timestamptz not null default now(),
  check (quantity > 0),
  check (discount_percent >= 0),
  check (iva >= 0)
);

create index idx_sale_drafts_store_status on public.sale_drafts(store_id, status);
create index idx_sale_drafts_store_created on public.sale_drafts(store_id, created_at desc);
create index idx_sale_draft_items_draft on public.sale_draft_items(draft_id);
create index idx_sale_draft_items_store on public.sale_draft_items(store_id);

create trigger trg_sale_drafts_updated_at
before update on public.sale_drafts
for each row execute function public.set_updated_at();

alter table public.sale_drafts enable row level security;
alter table public.sale_draft_items enable row level security;

create policy "sale_drafts_member_all" on public.sale_drafts
for all using (public.is_store_member(store_id))
with check (public.is_store_member(store_id));

create policy "sale_draft_items_member_all" on public.sale_draft_items
for all using (public.is_store_member(store_id))
with check (public.is_store_member(store_id));

-- Secuencia de facturas por tienda.
create table public.store_invoice_sequences (
  store_id uuid primary key references public.stores(id) on delete cascade,
  last_number bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.store_invoice_sequences enable row level security;

create policy "store_invoice_sequences_member_all" on public.store_invoice_sequences
for all using (public.is_store_member(store_id))
with check (public.is_store_member(store_id));

create or replace function public.next_invoice_number(p_store_id uuid)
returns text
language plpgsql
as $$
declare
  v_next bigint;
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'No autorizado';
  end if;

  insert into public.store_invoice_sequences (store_id, last_number)
  values (p_store_id, 1)
  on conflict (store_id) do update
    set last_number = public.store_invoice_sequences.last_number + 1,
        updated_at = now()
  returning last_number into v_next;

  return 'FAC-' || lpad(v_next::text, 6, '0');
end;
$$;

-- Finaliza un borrador de venta en una transacción atómica.
create or replace function public.finalize_sale_draft(
  p_store_id uuid,
  p_draft_id uuid,
  p_payment_method public.payment_method,
  p_cash_received numeric
) returns jsonb
language plpgsql
as $$
declare
  v_draft record;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_iva numeric := 0;
  v_total numeric := 0;
  v_sale_id uuid;
  v_invoice text;
  v_change numeric := 0;
  v_now timestamptz := now();
  v_points integer := 0;
  v_stock_before numeric;
  v_stock_after numeric;
  v_item record;
  v_result jsonb;
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'No autorizado';
  end if;

  select *
  into v_draft
  from public.sale_drafts
  where id = p_draft_id and store_id = p_store_id
  for update;

  if not found then
    raise exception 'Borrador no encontrado';
  end if;

  if v_draft.status <> 'open' then
    raise exception 'Borrador no disponible';
  end if;

  select
    coalesce(sum(unit_sale_price * quantity), 0),
    coalesce(sum((unit_sale_price * quantity) * (discount_percent / 100)), 0),
    coalesce(sum(((unit_sale_price * quantity) - ((unit_sale_price * quantity) * (discount_percent / 100))) * (iva / (100 + iva))), 0)
  into v_subtotal, v_discount, v_iva
  from public.sale_draft_items
  where draft_id = p_draft_id and store_id = p_store_id;

  v_total := v_subtotal - v_discount;

  if v_total <= 0 then
    raise exception 'Borrador sin items';
  end if;

  -- Validar stock antes de registrar la venta.
  for v_item in
    select product_id, product_name, quantity
    from public.sale_draft_items
    where draft_id = p_draft_id and store_id = p_store_id
  loop
    if v_item.product_id is not null then
      select stock
      into v_stock_before
      from public.products
      where id = v_item.product_id and store_id = p_store_id
      for update;

      if not found then
        raise exception 'Producto no encontrado';
      end if;

      if v_stock_before < v_item.quantity then
        raise exception 'Stock insuficiente para %', v_item.product_name;
      end if;
    end if;
  end loop;

  v_invoice := public.next_invoice_number(p_store_id);
  v_change := coalesce(p_cash_received, 0) - v_total;

  insert into public.sales (
    store_id,
    customer_id,
    cashier_user_id,
    invoice_number,
    subtotal,
    discount,
    iva,
    total,
    payment_method,
    cash_received,
    change_value,
    created_at,
    cash_session_id
  ) values (
    p_store_id,
    v_draft.customer_id,
    auth.uid(),
    v_invoice,
    v_subtotal,
    v_discount,
    v_iva,
    v_total,
    p_payment_method,
    coalesce(p_cash_received, 0),
    v_change,
    v_now,
    v_draft.cash_session_id
  ) returning id into v_sale_id;

  insert into public.sale_items (
    sale_id,
    store_id,
    product_id,
    product_name,
    quantity,
    unit_cost,
    unit_sale_price,
    discount_percent,
    line_subtotal,
    line_total,
    iva,
    created_at
  )
  select
    v_sale_id,
    store_id,
    product_id,
    product_name,
    quantity,
    unit_cost,
    unit_sale_price,
    discount_percent,
    (unit_sale_price * quantity),
    (unit_sale_price * quantity) - ((unit_sale_price * quantity) * (discount_percent / 100)),
    ((unit_sale_price * quantity) - ((unit_sale_price * quantity) * (discount_percent / 100))) * (iva / (100 + iva)),
    v_now
  from public.sale_draft_items
  where draft_id = p_draft_id and store_id = p_store_id;

  -- Actualizar inventario y registrar Kardex.
  for v_item in
    select product_id, product_name, quantity, unit_cost, unit_sale_price
    from public.sale_draft_items
    where draft_id = p_draft_id and store_id = p_store_id
  loop
    if v_item.product_id is not null then
      select stock
      into v_stock_before
      from public.products
      where id = v_item.product_id and store_id = p_store_id
      for update;

      v_stock_after := v_stock_before - v_item.quantity;

      update public.products
      set stock = v_stock_after
      where id = v_item.product_id and store_id = p_store_id;

      insert into public.kardex_movements (
        store_id,
        product_id,
        product_name,
        type,
        reference,
        quantity,
        stock_before,
        stock_after,
        unit_cost,
        unit_sale_price,
        total_cost,
        created_at
      ) values (
        p_store_id,
        v_item.product_id,
        v_item.product_name,
        'sale',
        v_invoice,
        -v_item.quantity,
        v_stock_before,
        v_stock_after,
        v_item.unit_cost,
        v_item.unit_sale_price,
        v_item.unit_cost * v_item.quantity,
        v_now
      );
    end if;
  end loop;

  -- Actualizar puntos del cliente si aplica.
  if v_draft.customer_id is not null then
    v_points := floor(v_total / 1000);
    if v_points > 0 then
      update public.customers
      set points = points + v_points
      where id = v_draft.customer_id and store_id = p_store_id;
    end if;
  end if;

  update public.sale_drafts
  set status = 'completed',
      updated_at = now()
  where id = p_draft_id and store_id = p_store_id;

  select jsonb_build_object(
    'sale', to_jsonb(s),
    'product_updates', coalesce((
      select jsonb_agg(jsonb_build_object('product_id', p.id, 'stock_after', p.stock))
      from public.products p
      join public.sale_draft_items i on i.product_id = p.id
      where i.draft_id = p_draft_id and i.store_id = p_store_id
    ), '[]'::jsonb)
  )
  into v_result
  from public.sales s
  where s.id = v_sale_id;

  return v_result;
end;
$$;
