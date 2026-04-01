-- Alinea finalize_sale_draft con POS: redondear precio unitario antes de multiplicar por cantidad.
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
  v_cash_received := round(coalesce(p_cash_received, 0) / 100) * 100;
  v_change := round((v_cash_received - v_total) / 100) * 100;

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
    v_cash_received,
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
