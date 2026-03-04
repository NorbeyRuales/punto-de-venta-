-- Crea la primera tienda para el usuario autenticado y lo vincula como admin
create or replace function public.bootstrap_my_store(
  p_name text,
  p_nit text default null,
  p_address text default null,
  p_phone text default null,
  p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_store_id uuid;
  categories_seed text[] := array[
    'Lácteos', 'Bebidas', 'Aseo', 'Snacks', 'Granos', 'Carnes Frías'
  ];
begin
  if auth.uid() is null then
    raise exception 'Debes estar autenticado para crear una tienda';
  end if;

  insert into public.stores (name, nit, address, phone, email)
  values (p_name, p_nit, p_address, p_phone, p_email)
  returning id into new_store_id;

  insert into public.store_users (store_id, user_id, role)
  values (new_store_id, auth.uid(), 'admin');

  insert into public.categories (store_id, name)
  select new_store_id, category_name
  from unnest(categories_seed) as category_name
  on conflict do nothing;

  return new_store_id;
end;
$$;

revoke all on function public.bootstrap_my_store(text, text, text, text, text) from public;
grant execute on function public.bootstrap_my_store(text, text, text, text, text) to authenticated;