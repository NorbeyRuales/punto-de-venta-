# Punto de Venta Completo

## Descripción
Proyecto de **Punto de Venta (POS)** para tiendas minoristas. Se partió de **una plantilla de Figma** y luego se han ido **adaptando y agregando más funciones**, ya que el proyecto **aún está en proceso**.

## Origen del Diseño (Figma)
- Plantilla base: https://www.figma.com/design/vWSgmOCGSRhgnBVG85Afde/Punto-de-Venta-completo
- El layout inicial proviene del diseño y se fue refinando en código para cubrir flujos reales del POS.

## Estado del Proyecto
- En desarrollo activo: algunas funciones están completas y otras son demo o están en preparación.
- Enfoque actual: consolidar POS + inventario + sincronización con Supabase.

## Funcionalidades Principales
- Autenticación y roles (admin/cajero)
- Dashboard con KPIs y alertas de stock
- Punto de venta (ventas, descuentos, cobro)
- Inventario con Kardex, exportación y búsqueda por código de barras
- Clientes, puntos, fiados y pagos
- Proveedores y compras con política de precio
- Recargas y servicios con cálculo de comisión
- Reportes con gráficos
- Configuración de tienda, categorías y backups
- Factura electrónica (vista demo)

## Stack Técnico
- React 18 + Vite
- React Router
- Tailwind CSS + Radix UI + shadcn/ui
- Supabase (Auth, Base de datos, Edge Functions)
- Recharts, date-fns, sonner

## Estructura del Proyecto
- `src/main.tsx` Entrada de la app
- `src/app/App.tsx` Componente raíz + proveedores
- `src/app/routes.tsx` Rutas y protección
- `src/app/context/POSContext.tsx` Estado global del POS
- `src/app/services/posSupabase.ts` Acceso a datos en Supabase
- `src/app/pages/` Módulos del sistema (POS, Inventario, Clientes, etc.)
- `src/app/components/` Layout, rutas protegidas y UI base
- `src/lib/supabaseClient.ts` Cliente HTTP para Supabase
- `src/styles/` Estilos globales y tema
- `supabase/migrations/` Esquema y funciones SQL
- `supabase/functions/` Edge Functions
- `public/branding/` Logo y branding

## Variables de Entorno
Crea un archivo `.env.local` (puedes copiar `.env.example`) con:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Sin estas variables, la app mostrará error al iniciar la integración con Supabase.

## Scripts
- `npm i` Instalar dependencias
- `npm run dev` Iniciar servidor de desarrollo
- `npm run build` Build de producción

## Supabase
- Migraciones: `supabase/migrations/`
- Edge Function para búsqueda de códigos de barras: `supabase/functions/server/index.tsx`
- La app funciona offline con localStorage y sincroniza cuando hay conexión.

## Branding / Logo
- Coloca tu archivo JPEG en `public/branding/logo.jpeg`.
- En la app puedes ajustar la ruta en Configuración → Tienda → “Ruta pública del logo”.
- Si no subes ningún archivo, se mostrará un placeholder y no se romperá la interfaz.

## Notas
- Este proyecto sigue en evolución; algunas pantallas son demostrativas y se irán completando.
- Se recomienda hacer backups periódicos desde la sección de Configuración.
