-- Cierra permisos residuales: solo service_role puede ejecutar import_local_pos_backup.
revoke execute on function public.import_local_pos_backup(uuid, jsonb, boolean) from public;
revoke execute on function public.import_local_pos_backup(uuid, jsonb, boolean) from anon;
revoke execute on function public.import_local_pos_backup(uuid, jsonb, boolean) from authenticated;

grant execute on function public.import_local_pos_backup(uuid, jsonb, boolean) to service_role;
