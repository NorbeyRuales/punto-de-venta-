# Punto de Venta Completo

## Resumen
POS web para tiendas minoristas. El proyecto nació de una plantilla de Figma y se fue ajustando a flujos reales (venta, inventario, caja, clientes, proveedores, reportes y configuración). La app es **offline-first** con respaldo en `localStorage` y sincronización opcional con Supabase (Auth + DB + Edge Functions).

## Origen del diseño (Figma)
- Plantilla base: https://www.figma.com/design/vWSgmOCGSRhgnBVG85Afde/Punto-de-Venta-completo
- El layout inicial proviene del diseño y se refinó en código para cubrir módulos reales del POS.

## Estado del proyecto
- En desarrollo activo: varias pantallas están completas y otras siguen siendo demo o están en preparación.
- Enfoque actual: consolidar POS + inventario + caja + sincronización Supabase.

## Módulos y rutas principales
| Ruta | Módulo | Qué cubre |
| --- | --- | --- |
| `/` | Login | Autenticación Supabase y modo offline con PIN/rol. |
| `/dashboard` | Dashboard | KPIs, alertas de stock y visión general. |
| `/pos` | Punto de Venta | Venta, descuentos, cobro y manejo de borradores. |
| `/inventory` | Inventario | Productos, categorías, Kardex y búsqueda por código de barras. |
| `/customers` | Clientes | Datos, puntos, fiado y pagos. |
| `/suppliers` | Proveedores | Gestión de proveedores y cuentas. |
| `/purchases` | Compras | Ingreso de compras y política de precios. |
| `/cash-register` | Caja | Apertura, movimientos y cierre de caja. |
| `/recharges` | Recargas | Recargas y servicios con comisión. |
| `/reports` | Reportes | Gráficas y resúmenes de negocio. |
| `/invoice` | Factura | Vista demo de factura electrónica. |
| `/configuration` | Configuración | Tienda, branding, backups y ajustes generales. |

## Stack técnico
- React 18 + Vite 6.
- React Router 7.
- Tailwind CSS 4 + `@tailwindcss/vite`.
- Radix UI + shadcn/ui.
- Supabase (Auth, REST/RPC y Edge Functions).
- Recharts, date-fns, sonner, lucide-react.
- MUI + Emotion para componentes puntuales.

## Arquitectura y flujo de datos
- `src/main.tsx` arranca la app.
- `src/app/App.tsx` monta proveedores globales.
- `src/app/routes.tsx` define rutas y protección con `ProtectedRoute`.
- `src/app/components/Layout.tsx` contiene navegación y layout principal.
- `src/app/context/POSContext.tsx` centraliza estado del POS (productos, ventas, clientes, proveedores, caja, configuración, borradores).
- `src/app/services/posSupabase.ts` es la capa de acceso a datos (REST + RPC).
- `src/lib/supabaseClient.ts` implementa el cliente HTTP liviano para Supabase.

## Persistencia offline y sincronización
- Estado local persistido en `localStorage` para operar sin conexión.
- Modo offline con PIN y rol por defecto; se registra un backup local cuando hay cambios.
- Al reconectar con Supabase se sincronizan catálogos y operaciones.
- Se puede subir el backup local a Supabase desde Configuración.

## Supabase (DB + Edge Functions)
- Esquema y funciones SQL en `supabase/migrations/`.
- Edge Function para búsqueda de códigos de barras en `supabase/functions/server/index.tsx`.
- Guía completa de setup y bootstrap en `supabase/README.md`.

## Estructura de carpetas clave
- `src/app/pages/` módulos funcionales (POS, Inventario, Clientes, etc.).
- `src/app/components/` layout, rutas protegidas y UI.
- `src/app/components/ui/` componentes base tipo shadcn/ui.
- `src/app/components/figma/` piezas originales del diseño.
- `src/styles/` estilos globales y tema.
- `public/branding/` assets de marca.

## Variables de entorno
Crear `.env` o `.env.local` (puedes copiar `.env.example`) con:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Sin estas variables la app falla al iniciar porque el cliente de Supabase valida credenciales.

## Scripts
- `npm i` instalar dependencias.
- `npm run dev` iniciar servidor de desarrollo.
- `npm run build` generar build de producción.

## Branding / logo
- Coloca un JPEG en `public/branding/logo.jpeg`.
- Ajusta la ruta en Configuración → Tienda → “Ruta pública del logo”.
- Si no hay logo, la UI muestra un placeholder sin romperse.

## Notas
- Este proyecto sigue en evolución; algunas pantallas son demostrativas.
- Se recomienda hacer backups periódicos desde la sección de Configuración.
