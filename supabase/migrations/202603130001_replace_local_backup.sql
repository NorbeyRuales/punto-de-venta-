-- Reemplaza el contenido remoto por un backup local (modo espejo).
create or replace function public.replace_local_pos_backup(
  p_store_id uuid,
  p_backup jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes estar autenticado para importar datos';
  end if;

  if not public.is_store_admin(p_store_id) then
    raise exception 'Solo un usuario admin de la tienda puede importar';
  end if;

  delete from public.sale_draft_items where store_id = p_store_id;
  delete from public.sale_drafts where store_id = p_store_id;
  delete from public.store_invoice_sequences where store_id = p_store_id;

  return public.import_local_pos_backup(p_store_id, p_backup, true);
end;
$$;

revoke all on function public.replace_local_pos_backup(uuid, jsonb) from public;
grant execute on function public.replace_local_pos_backup(uuid, jsonb) to authenticated;
