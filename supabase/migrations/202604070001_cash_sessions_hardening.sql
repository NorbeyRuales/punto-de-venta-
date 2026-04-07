-- Fase 1: hardening de caja sin perdida de datos.
-- Cambios aditivos y compatibles con informacion existente.

-- 1) Extender estados de caja.
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'cash_session_status'
      and e.enumlabel = 'counting'
  ) then
    alter type public.cash_session_status add value 'counting';
  end if;

  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'cash_session_status'
      and e.enumlabel = 'closed_with_difference'
  ) then
    alter type public.cash_session_status add value 'closed_with_difference';
  end if;
end
$$;

-- 2) Auditoria adicional de apertura/cierre (aditivo).
alter table public.cash_sessions
  add column if not exists opening_note text,
  add column if not exists closing_note text,
  add column if not exists counted_at timestamptz,
  add column if not exists opened_by uuid references auth.users(id) on delete set null,
  add column if not exists closed_by uuid references auth.users(id) on delete set null;

-- Backfill seguro: preserva historial y evita nulos innecesarios.
update public.cash_sessions
set opened_by = user_id
where opened_by is null
  and user_id is not null;

create index if not exists idx_cash_sessions_store_status_closed
  on public.cash_sessions(store_id, status, closed_at desc);

-- 3) Blindaje del cierre de venta: no permite finalizar sin caja abierta valida.
create or replace function public.finalize_sale_draft(
  p_store_id uuid,
  p_draft_id uuid,
  p_payment_method public.payment_method,
  p_cash_received numeric,
  p_payment_breakdown jsonb default '{}'::jsonb,
  p_credited_amount numeric default null
) returns jsonb
language plpgsql
as $$
declare
  v_draft record;
  v_cash_session record;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_iva numeric := 0;
  v_total numeric := 0;
  v_cash_received numeric := 0;
  v_sale_id uuid;
  v_invoice text;
  v_change numeric := 0;
  v_now timestamptz := now();
  v_points integer := 0;
  v_stock_before numeric;
  v_stock_after numeric;
  v_item record;
  v_result jsonb;
  v_cash_alloc numeric := 0;
  v_card_alloc numeric := 0;
  v_transfer_alloc numeric := 0;
  v_nequi_alloc numeric := 0;
  v_daviplata_alloc numeric := 0;
  v_other_alloc numeric := 0;
  v_credit_alloc numeric := 0;
  v_paid_alloc numeric := 0;
  v_has_breakdown boolean := false;
  v_breakdown jsonb := '{}'::jsonb;
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

  if v_draft.cash_session_id is null then
    raise exception 'Debes abrir una caja antes de registrar ventas';
  end if;

  select id, status
  into v_cash_session
  from public.cash_sessions
  where id = v_draft.cash_session_id
    and store_id = p_store_id
  for update;

  if not found then
    raise exception 'Caja no encontrada para este borrador';
  end if;

  if v_cash_session.status <> 'open' then
    raise exception 'La caja asociada no esta abierta';
  end if;

  -- Regla clave: redondear primero el unitario, luego multiplicar por cantidad.
  select
    coalesce(sum((round(unit_sale_price / 100) * 100) * quantity), 0),
    coalesce(sum(round((((round(unit_sale_price / 100) * 100) * quantity) * (discount_percent / 100)) / 100) * 100), 0),
    coalesce(sum(round((
      (((round(unit_sale_price / 100) * 100) * quantity)
      - (round((((round(unit_sale_price / 100) * 100) * quantity) * (discount_percent / 100)) / 100) * 100))
      * (iva / (100 + iva))
    ) / 100) * 100), 0)
  into v_subtotal, v_discount, v_iva
  from public.sale_draft_items
  where draft_id = p_draft_id and store_id = p_store_id;

  v_total := round((v_subtotal - v_discount) / 100) * 100;

  if v_total <= 0 then
    raise exception 'Borrador sin items';
  end if;

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

  v_has_breakdown := p_payment_breakdown is not null
    and jsonb_typeof(p_payment_breakdown) = 'object'
    and exists (
      select 1
      from jsonb_object_keys(p_payment_breakdown)
      limit 1
    );

  if v_has_breakdown then
    begin
      v_cash_alloc := round(greatest(coalesce((p_payment_breakdown ->> 'efectivo')::numeric, 0), 0) / 100) * 100;
      v_card_alloc := round(greatest(coalesce((p_payment_breakdown ->> 'tarjeta')::numeric, 0), 0) / 100) * 100;
      v_transfer_alloc := round(greatest(coalesce((p_payment_breakdown ->> 'transferencia')::numeric, 0), 0) / 100) * 100;
      v_nequi_alloc := round(greatest(coalesce((p_payment_breakdown ->> 'nequi')::numeric, 0), 0) / 100) * 100;
      v_daviplata_alloc := round(greatest(coalesce((p_payment_breakdown ->> 'daviplata')::numeric, 0), 0) / 100) * 100;
      v_other_alloc := round(greatest(coalesce((p_payment_breakdown ->> 'otro')::numeric, 0), 0) / 100) * 100;
      v_credit_alloc := round(greatest(coalesce((p_payment_breakdown ->> 'credito')::numeric, 0), 0) / 100) * 100;
    exception
      when invalid_text_representation then
        raise exception 'payment_breakdown invalido';
    end;

    v_paid_alloc := round((v_cash_alloc + v_card_alloc + v_transfer_alloc + v_nequi_alloc + v_daviplata_alloc + v_other_alloc) / 100) * 100;

    if v_paid_alloc > v_total then
      raise exception 'El pago registrado supera el total de la venta';
    end if;

    if p_credited_amount is not null then
      v_credit_alloc := round(greatest(p_credited_amount, 0) / 100) * 100;
    else
      v_credit_alloc := round(greatest(v_total - v_paid_alloc, v_credit_alloc, 0) / 100) * 100;
    end if;

    if round((v_paid_alloc + v_credit_alloc - v_total) / 100) * 100 <> 0 then
      raise exception 'La suma de pagos y fiado no coincide con el total';
    end if;

    v_cash_received := round(greatest(coalesce(p_cash_received, v_cash_alloc), 0) / 100) * 100;

    if v_cash_received < v_cash_alloc then
      raise exception 'El efectivo recibido no puede ser menor al efectivo aplicado';
    end if;

    v_change := round(greatest(v_cash_received - v_cash_alloc, 0) / 100) * 100;

    if v_change > 0 and (v_card_alloc + v_transfer_alloc + v_nequi_alloc + v_daviplata_alloc + v_other_alloc + v_credit_alloc) > 0 then
      raise exception 'El cambio solo aplica cuando el pago es completamente en efectivo';
    end if;
  else
    if p_payment_method = 'efectivo' then
      v_cash_received := round(coalesce(p_cash_received, 0) / 100) * 100;
      if v_cash_received < v_total then
        raise exception 'Monto insuficiente en efectivo';
      end if;
      v_cash_alloc := v_total;
      v_change := round((v_cash_received - v_total) / 100) * 100;
      v_paid_alloc := v_total;
      v_credit_alloc := 0;
    elsif p_payment_method = 'credito' then
      v_cash_received := 0;
      v_change := 0;
      v_paid_alloc := 0;
      v_credit_alloc := v_total;
    elsif p_payment_method = 'tarjeta' then
      v_cash_received := 0;
      v_change := 0;
      v_card_alloc := v_total;
      v_paid_alloc := v_total;
      v_credit_alloc := 0;
    elsif p_payment_method = 'transferencia' then
      v_cash_received := 0;
      v_change := 0;
      v_transfer_alloc := v_total;
      v_paid_alloc := v_total;
      v_credit_alloc := 0;
    else
      v_cash_received := 0;
      v_change := 0;
      v_other_alloc := v_total;
      v_paid_alloc := v_total;
      v_credit_alloc := 0;
    end if;
  end if;

  if v_credit_alloc > 0 and v_draft.customer_id is null then
    raise exception 'Selecciona un cliente para registrar saldo fiado';
  end if;

  v_breakdown := jsonb_strip_nulls(jsonb_build_object(
    'efectivo', case when v_cash_alloc > 0 then v_cash_alloc else null end,
    'tarjeta', case when v_card_alloc > 0 then v_card_alloc else null end,
    'transferencia', case when v_transfer_alloc > 0 then v_transfer_alloc else null end,
    'nequi', case when v_nequi_alloc > 0 then v_nequi_alloc else null end,
    'daviplata', case when v_daviplata_alloc > 0 then v_daviplata_alloc else null end,
    'otro', case when v_other_alloc > 0 then v_other_alloc else null end,
    'credito', case when v_credit_alloc > 0 then v_credit_alloc else null end
  ));

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
    payment_breakdown,
    credited_amount,
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
    v_cash_received,
    v_change,
    v_breakdown,
    v_credit_alloc,
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
    (round(unit_sale_price / 100) * 100) * quantity,
    ((round(unit_sale_price / 100) * 100) * quantity)
      - (round((((round(unit_sale_price / 100) * 100) * quantity) * (discount_percent / 100)) / 100) * 100),
    round((
      (
        ((round(unit_sale_price / 100) * 100) * quantity)
        - (round((((round(unit_sale_price / 100) * 100) * quantity) * (discount_percent / 100)) / 100) * 100)
      ) * (iva / (100 + iva))
    ) / 100) * 100,
    v_now
  from public.sale_draft_items
  where draft_id = p_draft_id and store_id = p_store_id;

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
