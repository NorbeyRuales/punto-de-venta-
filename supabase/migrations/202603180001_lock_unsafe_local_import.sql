-- Bloquea importaciones locales tipo merge desde clientes autenticados.
-- La restauracion segura queda disponible via replace_local_pos_backup.
revoke execute on function public.import_local_pos_backup(uuid, jsonb, boolean) from authenticated;

grant execute on function public.import_local_pos_backup(uuid, jsonb, boolean) to service_role;
