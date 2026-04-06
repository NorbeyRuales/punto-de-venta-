-- Compatibilidad para motores Postgres donde jsonb_object_length no esta disponible.
create or replace function public.jsonb_object_length(p_doc jsonb)
returns integer
language sql
immutable
parallel safe
as $$
  select case
    when p_doc is null then 0
    when jsonb_typeof(p_doc) <> 'object' then 0
    else coalesce((select count(*)::int from jsonb_object_keys(p_doc)), 0)
  end;
$$;
