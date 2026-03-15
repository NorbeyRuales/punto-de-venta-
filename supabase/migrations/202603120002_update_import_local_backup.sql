-- Función para importar backup local JSON al esquema del POS.
create or replace function public.import_local_pos_backup(
  p_store_id uuid,
  p_backup jsonb,
  p_clear_existing boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  products_j jsonb := '[]'::jsonb;
  sales_j jsonb := '[]'::jsonb;
  customers_j jsonb := '[]'::jsonb;
  suppliers_j jsonb := '[]'::jsonb;
  kardex_j jsonb := '[]'::jsonb;
  recharges_j jsonb := '[]'::jsonb;
  cash_sessions_j jsonb := '[]'::jsonb;
  cash_movements_j jsonb := '[]'::jsonb;
  config_j jsonb := '{}'::jsonb;

  rec jsonb;
  rec2 jsonb;

  v_product_id uuid;
  v_supplier_id uuid;
  v_customer_id uuid;
  v_category_id uuid;
  v_sale_id uuid;
  v_purchase_id uuid;
  v_cash_session_id uuid;

  v_category_name text;
  v_supplier_name text;
  v_sku text;
  v_barcode text;
  v_is_bulk boolean;
  v_show_iva boolean;
  v_payment_method public.payment_method;
  v_stock numeric;
  v_units_per_purchase numeric;
  v_qty numeric;
  v_price numeric;
  v_discount numeric;
  v_subtotal numeric;
  v_line_total numeric;
  v_entered_units numeric;
  v_iva numeric;

  cnt_products int := 0;
  cnt_sales int := 0;
  cnt_sale_items int := 0;
  cnt_customers int := 0;
  cnt_suppliers int := 0;
  cnt_purchases int := 0;
  cnt_purchase_items int := 0;
  cnt_kardex int := 0;
  cnt_recharges int := 0;
  cnt_cash_sessions int := 0;
  cnt_cash_movements int := 0;
  cnt_debt_txs int := 0;
begin
  if auth.uid() is null then
    raise exception 'Debes estar autenticado para importar datos';
  end if;

  if not public.is_store_admin(p_store_id) then
    raise exception 'Solo un usuario admin de la tienda puede importar';
  end if;

  if p_backup ? 'products' then
    products_j := case
      when jsonb_typeof(p_backup->'products') = 'string' then coalesce((p_backup->>'products')::jsonb, '[]'::jsonb)
      else coalesce(p_backup->'products', '[]'::jsonb)
    end;
  end if;

  if p_backup ? 'sales' then
    sales_j := case
      when jsonb_typeof(p_backup->'sales') = 'string' then coalesce((p_backup->>'sales')::jsonb, '[]'::jsonb)
      else coalesce(p_backup->'sales', '[]'::jsonb)
    end;
  end if;

  if p_backup ? 'customers' then
    customers_j := case
      when jsonb_typeof(p_backup->'customers') = 'string' then coalesce((p_backup->>'customers')::jsonb, '[]'::jsonb)
      else coalesce(p_backup->'customers', '[]'::jsonb)
    end;
  end if;

  if p_backup ? 'suppliers' then
    suppliers_j := case
      when jsonb_typeof(p_backup->'suppliers') = 'string' then coalesce((p_backup->>'suppliers')::jsonb, '[]'::jsonb)
      else coalesce(p_backup->'suppliers', '[]'::jsonb)
    end;
  end if;

  if p_backup ? 'kardex' then
    kardex_j := case
      when jsonb_typeof(p_backup->'kardex') = 'string' then coalesce((p_backup->>'kardex')::jsonb, '[]'::jsonb)
      else coalesce(p_backup->'kardex', '[]'::jsonb)
    end;
  end if;

  if p_backup ? 'recharges' then
    recharges_j := case
      when jsonb_typeof(p_backup->'recharges') = 'string' then coalesce((p_backup->>'recharges')::jsonb, '[]'::jsonb)
      else coalesce(p_backup->'recharges', '[]'::jsonb)
    end;
  end if;

  if p_backup ? 'cash_sessions' then
    cash_sessions_j := case
      when jsonb_typeof(p_backup->'cash_sessions') = 'string' then coalesce((p_backup->>'cash_sessions')::jsonb, '[]'::jsonb)
      else coalesce(p_backup->'cash_sessions', '[]'::jsonb)
    end;
  end if;

  if p_backup ? 'cash_movements' then
    cash_movements_j := case
      when jsonb_typeof(p_backup->'cash_movements') = 'string' then coalesce((p_backup->>'cash_movements')::jsonb, '[]'::jsonb)
      else coalesce(p_backup->'cash_movements', '[]'::jsonb)
    end;
  end if;

  if p_backup ? 'config' then
    config_j := case
      when jsonb_typeof(p_backup->'config') = 'string' then coalesce((p_backup->>'config')::jsonb, '{}'::jsonb)
      else coalesce(p_backup->'config', '{}'::jsonb)
    end;
  end if;

  create temporary table if not exists tmp_product_map (
    old_id text primary key,
    new_id uuid not null
  ) on commit drop;

  create temporary table if not exists tmp_supplier_map (
    old_id text primary key,
    new_id uuid not null
  ) on commit drop;

  create temporary table if not exists tmp_customer_map (
    old_id text primary key,
    new_id uuid not null
  ) on commit drop;

  create temporary table if not exists tmp_cash_session_map (
    old_id text primary key,
    new_id uuid not null
  ) on commit drop;

  truncate table tmp_product_map;
  truncate table tmp_supplier_map;
  truncate table tmp_customer_map;
  truncate table tmp_cash_session_map;

  if p_clear_existing then
    delete from public.customer_debt_transactions where store_id = p_store_id;
    delete from public.sale_items where store_id = p_store_id;
    delete from public.sales where store_id = p_store_id;
    delete from public.cash_movements where store_id = p_store_id;
    delete from public.cash_sessions where store_id = p_store_id;
    delete from public.purchase_items where store_id = p_store_id;
    delete from public.purchases where store_id = p_store_id;
    delete from public.kardex_movements where store_id = p_store_id;
    delete from public.recharges where store_id = p_store_id;
    delete from public.customers where store_id = p_store_id;
    delete from public.products where store_id = p_store_id;
    delete from public.suppliers where store_id = p_store_id;
    delete from public.categories where store_id = p_store_id;
  end if;

  for rec in select * from jsonb_array_elements(products_j)
  loop
    v_category_name := nullif(trim(rec->>'category'), '');

    if v_category_name is not null then
      select id into v_category_id
      from public.categories
      where store_id = p_store_id
        and lower(name) = lower(v_category_name)
      limit 1;

      if v_category_id is null then
        insert into public.categories (store_id, name)
        values (p_store_id, v_category_name)
        returning id into v_category_id;
      end if;
    else
      v_category_id := null;
    end if;

    v_supplier_name := nullif(trim(rec->>'supplierName'), '');

    if v_supplier_name is not null then
      select id into v_supplier_id
      from public.suppliers
      where store_id = p_store_id
        and lower(name) = lower(v_supplier_name)
      limit 1;

      if v_supplier_id is null then
        insert into public.suppliers (store_id, name)
        values (p_store_id, v_supplier_name)
        returning id into v_supplier_id;
      end if;
    else
      v_supplier_id := null;
    end if;

    v_stock := coalesce(nullif(rec->>'stock', '')::numeric, 0);
    if v_stock < 0 then
      v_stock := 0;
    end if;

    v_sku := nullif(rec->>'sku', '');
    if v_sku is not null and exists (
      select 1 from public.products p where p.store_id = p_store_id and p.sku = v_sku
    ) then
      v_sku := null;
    end if;

    v_barcode := nullif(rec->>'barcode', '');
    if v_barcode is not null and exists (
      select 1 from public.products p where p.store_id = p_store_id and p.barcode = v_barcode
    ) then
      v_barcode := null;
    end if;

    v_is_bulk := case
      when lower(coalesce(rec->>'isBulk', 'false')) = 'true' then true
      when lower(coalesce(rec->>'isBulk', 'false')) = 'false' then false
      else false
    end;

    insert into public.products (
      store_id,
      category_id,
      supplier_id,
      name,
      sku,
      barcode,
      cost_price,
      sale_price,
      stock,
      min_stock,
      unit,
      is_bulk,
      iva,
      units_per_purchase,
      profit_margin,
      unit_price,
      created_at,
      updated_at
    ) values (
      p_store_id,
      v_category_id,
      v_supplier_id,
      coalesce(nullif(rec->>'name', ''), 'Producto sin nombre'),
      v_sku,
      v_barcode,
      coalesce(nullif(rec->>'costPrice', '')::numeric, 0),
      coalesce(nullif(rec->>'salePrice', '')::numeric, 0),
      v_stock,
      coalesce(nullif(rec->>'minStock', '')::numeric, 0),
      coalesce(nullif(rec->>'unit', ''), 'unidad'),
      v_is_bulk,
      coalesce(nullif(rec->>'iva', '')::numeric, 0),
      nullif(rec->>'unitsPerPurchase', '')::numeric,
      nullif(rec->>'profitMargin', '')::numeric,
      nullif(rec->>'unitPrice', '')::numeric,
      coalesce(nullif(rec->>'date', '')::timestamptz, now()),
      now()
    ) returning id into v_product_id;

    if rec ? 'id' then
      insert into tmp_product_map(old_id, new_id)
      values (rec->>'id', v_product_id)
      on conflict (old_id) do update set new_id = excluded.new_id;
    end if;

    cnt_products := cnt_products + 1;
  end loop;

  for rec in select * from jsonb_array_elements(suppliers_j)
  loop
    select id into v_supplier_id
    from public.suppliers
    where store_id = p_store_id
      and lower(name) = lower(coalesce(nullif(rec->>'name', ''), 'Proveedor sin nombre'))
    limit 1;

    if v_supplier_id is null then
      insert into public.suppliers (
        store_id,
        name,
        nit,
        phone,
        email,
        address,
        bank_accounts,
        debt,
        created_at,
        updated_at
      ) values (
        p_store_id,
        coalesce(nullif(rec->>'name', ''), 'Proveedor sin nombre'),
        nullif(rec->>'nit', ''),
        nullif(rec->>'phone', ''),
        nullif(rec->>'email', ''),
        nullif(rec->>'address', ''),
        coalesce(
          case
            when rec ? 'bankAccounts' then array(select jsonb_array_elements_text(rec->'bankAccounts'))
            when rec ? 'bankAccount' and nullif(rec->>'bankAccount', '') is not null then array[rec->>'bankAccount']
            else array[]::text[]
          end,
          array[]::text[]
        ),
        coalesce(nullif(rec->>'debt', '')::numeric, 0),
        now(),
        now()
      )
      returning id into v_supplier_id;
    else
      update public.suppliers
      set
        nit = nullif(rec->>'nit', ''),
        phone = nullif(rec->>'phone', ''),
        email = nullif(rec->>'email', ''),
        address = nullif(rec->>'address', ''),
        bank_accounts = coalesce(
          case
            when rec ? 'bankAccounts' then array(select jsonb_array_elements_text(rec->'bankAccounts'))
            when rec ? 'bankAccount' and nullif(rec->>'bankAccount', '') is not null then array[rec->>'bankAccount']
            else array[]::text[]
          end,
          array[]::text[]
        ),
        debt = coalesce(nullif(rec->>'debt', '')::numeric, 0),
        updated_at = now()
      where id = v_supplier_id;
    end if;

    if rec ? 'id' then
      insert into tmp_supplier_map(old_id, new_id)
      values (rec->>'id', v_supplier_id)
      on conflict (old_id) do update set new_id = excluded.new_id;
    end if;

    cnt_suppliers := cnt_suppliers + 1;
  end loop;

  for rec in select * from jsonb_array_elements(customers_j)
  loop
    insert into public.customers (
      store_id,
      name,
      phone,
      address,
      email,
      nit,
      points,
      debt,
      created_at,
      updated_at
    ) values (
      p_store_id,
      coalesce(nullif(rec->>'name', ''), 'Cliente sin nombre'),
      nullif(rec->>'phone', ''),
      nullif(rec->>'address', ''),
      nullif(rec->>'email', ''),
      nullif(rec->>'nit', ''),
      coalesce(nullif(rec->>'points', '')::integer, 0),
      coalesce(nullif(rec->>'debt', '')::numeric, 0),
      now(),
      now()
    ) returning id into v_customer_id;

    if rec ? 'id' then
      insert into tmp_customer_map(old_id, new_id)
      values (rec->>'id', v_customer_id)
      on conflict (old_id) do update set new_id = excluded.new_id;
    end if;

    if rec ? 'debtHistory' and jsonb_typeof(rec->'debtHistory') = 'array' then
      for rec2 in select * from jsonb_array_elements(rec->'debtHistory')
      loop
        insert into public.customer_debt_transactions (
          store_id,
          customer_id,
          type,
          amount,
          description,
          balance,
          created_at
        ) values (
          p_store_id,
          v_customer_id,
          case when coalesce(rec2->>'type', 'debt') = 'payment' then 'payment'::public.debt_tx_type else 'debt'::public.debt_tx_type end,
          coalesce(nullif(rec2->>'amount', '')::numeric, 0),
          nullif(rec2->>'description', ''),
          coalesce(nullif(rec2->>'balance', '')::numeric, 0),
          coalesce(nullif(rec2->>'date', '')::timestamptz, now())
        );
        cnt_debt_txs := cnt_debt_txs + 1;
      end loop;
    end if;

    cnt_customers := cnt_customers + 1;
  end loop;

  for rec in select * from jsonb_array_elements(cash_sessions_j)
  loop
    insert into public.cash_sessions (
      store_id,
      user_id,
      opened_at,
      closed_at,
      opening_cash,
      expected_cash,
      counted_cash,
      difference,
      status,
      created_at,
      updated_at
    ) values (
      p_store_id,
      case
        when rec ? 'userId'
          and (rec->>'userId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (rec->>'userId')::uuid
        else null
      end,
      coalesce(nullif(rec->>'openedAt', '')::timestamptz, now()),
      nullif(rec->>'closedAt', '')::timestamptz,
      coalesce(nullif(rec->>'openingCash', '')::numeric, 0),
      nullif(rec->>'expectedCash', '')::numeric,
      nullif(rec->>'countedCash', '')::numeric,
      nullif(rec->>'difference', '')::numeric,
      case
        when coalesce(rec->>'status', '') = 'closed' then 'closed'::public.cash_session_status
        else 'open'::public.cash_session_status
      end,
      now(),
      now()
    ) returning id into v_cash_session_id;

    if rec ? 'id' then
      insert into tmp_cash_session_map(old_id, new_id)
      values (rec->>'id', v_cash_session_id)
      on conflict (old_id) do update set new_id = excluded.new_id;
    end if;

    cnt_cash_sessions := cnt_cash_sessions + 1;
  end loop;

  for rec in select * from jsonb_array_elements(sales_j)
  loop
    v_payment_method := case
      when coalesce(rec->>'paymentMethod', '') = 'efectivo' then 'efectivo'::public.payment_method
      when coalesce(rec->>'paymentMethod', '') = 'tarjeta' then 'tarjeta'::public.payment_method
      when coalesce(rec->>'paymentMethod', '') = 'transferencia' then 'transferencia'::public.payment_method
      when coalesce(rec->>'paymentMethod', '') = 'credito' then 'credito'::public.payment_method
      else 'otro'::public.payment_method
    end;

    v_customer_id := null;
    if rec ? 'customerId' and nullif(rec->>'customerId', '') is not null then
      select new_id into v_customer_id
      from tmp_customer_map
      where old_id = rec->>'customerId'
      limit 1;
    end if;

    v_cash_session_id := null;
    if rec ? 'cashSessionId' and nullif(rec->>'cashSessionId', '') is not null then
      select new_id into v_cash_session_id
      from tmp_cash_session_map
      where old_id = rec->>'cashSessionId'
      limit 1;
    end if;

    insert into public.sales (
      store_id,
      customer_id,
      cashier_user_id,
      cash_session_id,
      invoice_number,
      subtotal,
      discount,
      iva,
      total,
      payment_method,
      cash_received,
      change_value,
      created_at,
      returned_at
    ) values (
      p_store_id,
      v_customer_id,
      auth.uid(),
      v_cash_session_id,
      nullif(rec->>'invoiceNumber', ''),
      coalesce(nullif(rec->>'subtotal', '')::numeric, 0),
      coalesce(nullif(rec->>'discount', '')::numeric, 0),
      coalesce(nullif(rec->>'iva', '')::numeric, 0),
      coalesce(nullif(rec->>'total', '')::numeric, 0),
      v_payment_method,
      coalesce(nullif(rec->>'cashReceived', '')::numeric, 0),
      coalesce(nullif(rec->>'change', '')::numeric, 0),
      coalesce(nullif(rec->>'date', '')::timestamptz, now()),
      nullif(rec->>'returnedAt', '')::timestamptz
    ) returning id into v_sale_id;

    cnt_sales := cnt_sales + 1;

    if rec ? 'items' and jsonb_typeof(rec->'items') = 'array' then
      for rec2 in select * from jsonb_array_elements(rec->'items')
      loop
        v_product_id := null;
        if rec2 ? 'product' and (rec2->'product') ? 'id' then
          select new_id into v_product_id
          from tmp_product_map
          where old_id = rec2->'product'->>'id'
          limit 1;
        end if;

        v_qty := coalesce(nullif(rec2->>'quantity', '')::numeric, 0);
        v_price := coalesce(nullif(rec2->'product'->>'salePrice', '')::numeric, 0);
        v_discount := coalesce(nullif(rec2->>'discount', '')::numeric, 0);
        v_subtotal := v_qty * v_price;
        v_line_total := v_subtotal - ((v_subtotal * v_discount) / 100);
        v_iva := coalesce(nullif(rec2->'product'->>'iva', '')::numeric, 0);

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
        ) values (
          v_sale_id,
          p_store_id,
          v_product_id,
          coalesce(nullif(rec2->'product'->>'name', ''), 'Producto'),
          v_qty,
          coalesce(nullif(rec2->'product'->>'costPrice', '')::numeric, 0),
          v_price,
          v_discount,
          v_subtotal,
          v_line_total,
          (v_line_total * v_iva) / nullif((100 + v_iva), 0),
          coalesce(nullif(rec->>'date', '')::timestamptz, now())
        );

        cnt_sale_items := cnt_sale_items + 1;
      end loop;
    end if;
  end loop;

  for rec in select * from jsonb_array_elements(cash_movements_j)
  loop
    v_cash_session_id := null;
    if rec ? 'cashSessionId' and nullif(rec->>'cashSessionId', '') is not null then
      select new_id into v_cash_session_id
      from tmp_cash_session_map
      where old_id = rec->>'cashSessionId'
      limit 1;
    end if;

    if v_cash_session_id is null then
      continue;
    end if;

    insert into public.cash_movements (
      store_id,
      cash_session_id,
      user_id,
      type,
      amount,
      reason,
      created_at
    ) values (
      p_store_id,
      v_cash_session_id,
      case
        when rec ? 'userId'
          and (rec->>'userId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (rec->>'userId')::uuid
        else null
      end,
      case
        when coalesce(rec->>'type', '') = 'cash_out' then 'cash_out'::public.cash_movement_type
        else 'cash_in'::public.cash_movement_type
      end,
      coalesce(nullif(rec->>'amount', '')::numeric, 0),
      nullif(rec->>'reason', ''),
      coalesce(nullif(rec->>'date', '')::timestamptz, now())
    );

    cnt_cash_movements := cnt_cash_movements + 1;
  end loop;

  for rec in select * from jsonb_array_elements(suppliers_j)
  loop
    if rec ? 'purchases' and jsonb_typeof(rec->'purchases') = 'array' then
      select new_id into v_supplier_id
      from tmp_supplier_map
      where old_id = rec->>'id'
      limit 1;

      for rec2 in select * from jsonb_array_elements(rec->'purchases')
      loop
        insert into public.purchases (
          store_id,
          supplier_id,
          total,
          paid,
          price_policy,
          reference,
          created_at
        ) values (
          p_store_id,
          v_supplier_id,
          coalesce(nullif(rec2->>'total', '')::numeric, 0),
          coalesce((rec2->>'paid')::boolean, false),
          'automatic',
          nullif(rec2->>'id', ''),
          coalesce(nullif(rec2->>'date', '')::timestamptz, now())
        ) returning id into v_purchase_id;

        cnt_purchases := cnt_purchases + 1;

        if rec2 ? 'items' and jsonb_typeof(rec2->'items') = 'array' then
          for rec in select * from jsonb_array_elements(rec2->'items')
          loop
            v_product_id := null;
            if rec ? 'productId' and nullif(rec->>'productId', '') is not null then
              select new_id into v_product_id
              from tmp_product_map
              where old_id = rec->>'productId'
              limit 1;
            end if;

            select coalesce(units_per_purchase, 1) into v_units_per_purchase
            from public.products
            where id = v_product_id;

            if v_units_per_purchase is null or v_units_per_purchase <= 0 then
              v_units_per_purchase := 1;
            end if;

            v_qty := coalesce(nullif(rec->>'quantity', '')::numeric, 0);
            v_entered_units := v_qty * v_units_per_purchase;

            insert into public.purchase_items (
              purchase_id,
              store_id,
              product_id,
              product_name,
              quantity_packages,
              units_per_package,
              entered_units,
              package_cost,
              unit_cost_with_iva,
              subtotal,
              created_at
            ) values (
              v_purchase_id,
              p_store_id,
              v_product_id,
              coalesce((select name from public.products where id = v_product_id), 'Producto'),
              v_qty,
              v_units_per_purchase,
              v_entered_units,
              coalesce(nullif(rec->>'cost', '')::numeric, 0),
              coalesce(nullif(rec->>'cost', '')::numeric, 0) / nullif(v_units_per_purchase, 0),
              coalesce(nullif(rec->>'cost', '')::numeric, 0) * v_qty,
              coalesce(nullif(rec2->>'date', '')::timestamptz, now())
            );

            cnt_purchase_items := cnt_purchase_items + 1;
          end loop;
        end if;
      end loop;
    end if;
  end loop;

  for rec in select * from jsonb_array_elements(kardex_j)
  loop
    v_product_id := null;
    if rec ? 'productId' and nullif(rec->>'productId', '') is not null then
      select new_id into v_product_id
      from tmp_product_map
      where old_id = rec->>'productId'
      limit 1;
    end if;

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
      v_product_id,
      coalesce(nullif(rec->>'productName', ''), 'Producto'),
      case
        when coalesce(rec->>'type', '') = 'sale' then 'sale'::public.kardex_type
        when coalesce(rec->>'type', '') = 'adjustment' then 'adjustment'::public.kardex_type
        else 'entry'::public.kardex_type
      end,
      nullif(rec->>'reference', ''),
      coalesce(nullif(rec->>'quantity', '')::numeric, 0),
      coalesce(nullif(rec->>'stockBefore', '')::numeric, 0),
      coalesce(nullif(rec->>'stockAfter', '')::numeric, 0),
      coalesce(nullif(rec->>'unitCost', '')::numeric, 0),
      nullif(rec->>'unitSalePrice', '')::numeric,
      coalesce(nullif(rec->>'totalCost', '')::numeric, 0),
      coalesce(nullif(rec->>'date', '')::timestamptz, now())
    );

    cnt_kardex := cnt_kardex + 1;
  end loop;

  for rec in select * from jsonb_array_elements(recharges_j)
  loop
    insert into public.recharges (
      store_id,
      type,
      provider,
      phone_number,
      amount,
      commission,
      total,
      created_at
    ) values (
      p_store_id,
      case
        when coalesce(rec->>'type', '') = 'service' then 'service'::public.recharge_type
        when coalesce(rec->>'type', '') = 'pin' then 'pin'::public.recharge_type
        else 'mobile'::public.recharge_type
      end,
      coalesce(nullif(rec->>'provider', ''), 'N/A'),
      nullif(rec->>'phoneNumber', ''),
      coalesce(nullif(rec->>'amount', '')::numeric, 0),
      coalesce(nullif(rec->>'commission', '')::numeric, 0),
      coalesce(nullif(rec->>'total', '')::numeric, 0),
      coalesce(nullif(rec->>'date', '')::timestamptz, now())
    );

    cnt_recharges := cnt_recharges + 1;
  end loop;

  if jsonb_typeof(config_j) = 'object' then
    v_show_iva := case
      when lower(coalesce(config_j->>'showIVA', 'false')) = 'true' then true
      when lower(coalesce(config_j->>'showIVA', 'false')) = 'false' then false
      else null
    end;

    update public.stores
    set
      name = coalesce(nullif(config_j->>'name', ''), name),
      nit = coalesce(nullif(config_j->>'nit', ''), nit),
      address = coalesce(nullif(config_j->>'address', ''), address),
      phone = coalesce(nullif(config_j->>'phone', ''), phone),
      email = coalesce(nullif(config_j->>'email', ''), email),
      logo = coalesce(nullif(config_j->>'logo', ''), logo),
      dian_resolution = coalesce(nullif(config_j->>'dianResolution', ''), dian_resolution),
      printer_type = coalesce(nullif(config_j->>'printerType', ''), printer_type),
      show_iva = coalesce(v_show_iva, show_iva),
      purchase_price_policy = case
        when coalesce(config_j->>'purchasePricePolicy', '') = 'manual' then 'manual'::public.purchase_price_policy
        when coalesce(config_j->>'purchasePricePolicy', '') = 'automatic' then 'automatic'::public.purchase_price_policy
        else purchase_price_policy
      end,
      currency = coalesce(nullif(config_j->>'currency', ''), currency),
      updated_at = now()
    where id = p_store_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'store_id', p_store_id,
    'imported', jsonb_build_object(
      'products', cnt_products,
      'suppliers', cnt_suppliers,
      'customers', cnt_customers,
      'customer_debt_transactions', cnt_debt_txs,
      'sales', cnt_sales,
      'sale_items', cnt_sale_items,
      'purchases', cnt_purchases,
      'purchase_items', cnt_purchase_items,
      'kardex_movements', cnt_kardex,
      'recharges', cnt_recharges,
      'cash_sessions', cnt_cash_sessions,
      'cash_movements', cnt_cash_movements
    )
  );
end;
$$;

revoke all on function public.import_local_pos_backup(uuid, jsonb, boolean) from public;
grant execute on function public.import_local_pos_backup(uuid, jsonb, boolean) to authenticated;
