# Supabase DB setup (POS)

Project ref detectado en el proyecto: `wujuzvjilkfrddmofyxa`.

## 1) Ejecutar migraciones

### Opción A: Supabase Dashboard (rápida)
1. Abre `SQL Editor` en tu proyecto Supabase.
2. Ejecuta en orden:
   - `supabase/migrations/202603040001_init_pos_schema.sql`
   - `supabase/migrations/202603040002_bootstrap_store.sql`

### Opción B: Supabase CLI
```bash
supabase login
supabase link --project-ref wujuzvjilkfrddmofyxa
supabase db push
```

## 2) Crear tu tienda inicial

Con un usuario autenticado en la app (o desde SQL con JWT de usuario), ejecuta:

```sql
select public.bootstrap_my_store(
  'Mi Tienda',
  '900123456-1',
  'Calle 123 #45-67',
  '3001234567',
  'contacto@mitienda.com'
);
```

Esto crea:
- 1 tienda en `stores`
- 1 relación admin en `store_users`
- categorías iniciales en `categories`

## 3) Modelo creado

Tablas principales:
- `stores`, `profiles`, `store_users`
- `categories`, `suppliers`, `products`
- `customers`, `customer_debt_transactions`
- `sales`, `sale_items`
- `purchases`, `purchase_items`
- `kardex_movements`, `recharges`

Incluye:
- RLS habilitado en todas las tablas
- políticas por pertenencia a tienda (`store_users`)
- índices para listados y reportes
- triggers `updated_at`

## 4) Siguiente paso recomendado

Migrar `POSContext` de `localStorage` a consultas Supabase usando estas tablas, empezando por:
1. `products` + `categories`
2. `sales` + `sale_items`
3. `customers` + deuda

## 5) Importar lo actual de localStorage

Sí se puede. Ya quedó una función para importar backup local:
- `public.import_local_pos_backup(store_id, backup_json, clear_existing)`

### Paso A: descargar backup desde la app
1. En la app, ve a Configuración → Backup.
2. Descarga el archivo `backup-tiendapos-YYYY-MM-DD.json`.

### Paso B: ejecutar import en SQL Editor
1. Abre el JSON descargado y copia su contenido completo.
2. En SQL Editor ejecuta (reemplaza `<STORE_ID>` y `<JSON_AQUI>`):

```sql
select public.import_local_pos_backup(
  '<STORE_ID>'::uuid,
  '<JSON_AQUI>'::jsonb,
  true
);
```

Notas:
- Usa `true` en el tercer parámetro para limpiar datos previos de esa tienda antes de importar.
- Usa `false` si quieres anexar (sin borrar existentes).
- El resultado devuelve conteos importados por tabla.
