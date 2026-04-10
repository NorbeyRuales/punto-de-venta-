-- Hardening de roles por tienda sin pérdida de información.
-- Objetivos:
-- 1) Permitir activar/desactivar usuarios por tienda.
-- 2) Asegurar que siempre exista al menos un admin activo.
-- 3) Considerar solo miembros activos para permisos RLS de tienda.

alter table public.store_users
  add column if not exists is_active boolean not null default true;

update public.store_users
set is_active = true
where is_active is null;

create index if not exists idx_store_users_store_role_active
  on public.store_users(store_id, role, is_active);

create or replace function public.is_store_member(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_users su
    where su.store_id = target_store_id
      and su.user_id = auth.uid()
      and su.is_active = true
  );
$$;

create or replace function public.is_store_admin(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_users su
    where su.store_id = target_store_id
      and su.user_id = auth.uid()
      and su.role = 'admin'
      and su.is_active = true
  );
$$;

create or replace function public.prevent_last_active_admin_in_store_users()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_admins integer;
begin
  if tg_op = 'DELETE' then
    if old.role = 'admin' and coalesce(old.is_active, true) then
      select count(*)
      into remaining_admins
      from public.store_users su
      where su.store_id = old.store_id
        and su.id <> old.id
        and su.role = 'admin'
        and su.is_active = true;

      if remaining_admins = 0 then
        raise exception 'Debe existir al menos un administrador activo por tienda';
      end if;
    end if;

    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.role = 'admin'
       and coalesce(old.is_active, true)
       and (
         new.role <> 'admin'
         or coalesce(new.is_active, false) = false
       ) then
      select count(*)
      into remaining_admins
      from public.store_users su
      where su.store_id = old.store_id
        and su.id <> old.id
        and su.role = 'admin'
        and su.is_active = true;

      if remaining_admins = 0 then
        raise exception 'No puedes desactivar o cambiar el último administrador activo de la tienda';
      end if;
    end if;

    return new;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_store_users_prevent_last_admin on public.store_users;

create trigger trg_store_users_prevent_last_admin
before update or delete on public.store_users
for each row
execute function public.prevent_last_active_admin_in_store_users();
