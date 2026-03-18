-- Permite compartir el mismo código de barras entre presentaciones del mismo producto
-- (ej: paquete y unidad) dentro de una misma tienda.

alter table public.products
  drop constraint if exists products_store_id_barcode_key;

create index if not exists idx_products_store_barcode
  on public.products(store_id, barcode);
