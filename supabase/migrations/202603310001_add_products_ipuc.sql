begin;

-- Agrega IPUC como impuesto adicional acumulable con IVA.
-- Es una migracion aditiva: no elimina ni modifica filas existentes.
alter table public.products
  add column if not exists ipuc numeric(5,2) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_ipuc_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_ipuc_check check (ipuc >= 0);
  end if;
end
$$;

commit;
