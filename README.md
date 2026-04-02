# Punto de Venta Completo

Aplicacion web POS para tiendas minoristas, pensada para operar con internet y tambien en contingencia offline.

Este repositorio ya incluye modulos funcionales de:

- ventas
- inventario
- caja
- clientes
- proveedores
- compras
- recargas
- reportes
- configuracion

## Que es este proyecto

Es una SPA construida con React + Vite que centraliza el estado del negocio en un contexto global y combina dos fuentes de datos:

- Supabase como backend principal (auth, tablas y RPC)
- localStorage como respaldo operativo para trabajar sin conexion

Objetivo practico: que el negocio siga vendiendo aun cuando falle internet, y luego pueda sincronizar cambios cuando vuelva la conectividad.

## Como funciona (resumen rapido)

1. La app inicia en Login.
2. Si el usuario entra con email y clave, autentica contra Supabase.
3. Se identifica la tienda del usuario y se cargan catalogos y operaciones desde la base de datos.
4. Las pantallas internas usan rutas protegidas (si no hay sesion, vuelve a Login).
5. Si no hay conectividad, se puede ingresar con PIN offline y operar con datos locales.
6. Los cambios hechos offline quedan marcados como pendientes y luego se suben manualmente a Supabase.

## Mapa de modulos

| Ruta | Modulo | Uso principal |
| --- | --- | --- |
| / | Login | Acceso online y acceso offline con PIN. |
| /dashboard | Dashboard | Resumen general del negocio. |
| /pos | Punto de venta | Venta, carrito, cobro y borradores. |
| /inventory | Inventario | Productos, categorias, stock y kardex. |
| /customers | Clientes | Clientes, deuda y pagos. |
| /suppliers | Proveedores | Proveedores y datos de contacto. |
| /purchases | Compras | Registro de compras e impacto en inventario. |
| /cash-register | Caja | Apertura, movimientos, arqueo y cierre. |
| /recharges | Recargas | Recargas y servicios con comision. |
| /reports | Reportes | Vistas operativas y analiticas. |
| /invoice | Factura | Vista de factura/demo. |
| /configuration | Configuracion | Datos de tienda, backup, PIN y sincronizacion. |

## Arquitectura clave

- src/main.tsx: punto de entrada de la SPA.
- src/app/App.tsx: integra contexto global, rutas y notificaciones.
- src/app/routes.tsx: define rutas publicas/protegidas y carga lazy de paginas.
- src/app/components/ProtectedRoute.tsx: bloquea acceso si no hay sesion lista.
- src/app/context/POSContext.tsx: nucleo del negocio (estado, auth, offline, sync, acciones CRUD).
- src/app/services/posSupabase.ts: capa de acceso a tablas y RPC de Supabase.
- src/lib/supabaseClient.ts: cliente HTTP base para Auth, REST y RPC.
- supabase/migrations/: esquema SQL y evolucion de base de datos.

## Stack tecnico

- React 18
- Vite 6
- React Router 7
- Tailwind CSS 4
- Radix UI (componentes base)
- Supabase (Auth + PostgREST + RPC)
- Sonner, Lucide React, Recharts
- MUI/Emotion (uso puntual)

## Requisitos

- Node.js 18 o superior
- npm
- Proyecto Supabase activo con Auth y DB disponibles

## Puesta en marcha local

1. Instalar dependencias:

```bash
npm install
```

2. Crear archivo de entorno desde .env.example:

```bash
cp .env.example .env
```

3. Configurar variables:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

4. Preparar base de datos y tienda inicial siguiendo supabase/README.md.

5. Levantar entorno de desarrollo:

```bash
npm run dev
```

6. Generar build de produccion:

```bash
npm run build
```

## Importante sobre modo offline

Aunque el proyecto opera con logica offline, hoy el frontend exige VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para arrancar.

En otras palabras:

- si faltan variables de entorno, la app no inicia
- si hay variables y luego se cae internet, si puedes operar con PIN offline

## Sincronizacion y backups

- El estado operativo se persiste en localStorage.
- Cuando hay cambios offline, se marca estado pendiente de sincronizacion.
- Desde Configuracion puedes:
  - revisar pendientes
  - subir cambios a Supabase
  - descargar backup JSON local
- La sincronizacion prioriza que Supabase vuelva a ser fuente de verdad cuando la carga remota es exitosa.

## Scripts disponibles

En la raiz del proyecto solo hay dos scripts:

- npm run dev
- npm run build

No hay scripts de test, lint ni preview definidos en package.json.

## Estructura del repositorio

```text
src/
  app/
    components/
    constants/
    context/
    pages/
    services/
  assets/
  lib/
  styles/
public/
  branding/
supabase/
  functions/
  migrations/
mcp/
  supabase/
```

## Despliegue

El proyecto compila como SPA estatica. En Vercel, vercel.json ya contempla:

- cache para assets
- manejo de branding
- rewrite a index.html para soportar rutas del frontend

Si despliegas en otro hosting, configura un rewrite equivalente hacia index.html.

## Referencias utiles

- README principal de base de datos: supabase/README.md
- MCP para consultas Postgres: mcp/supabase/README.md
- Atribuciones: ATTRIBUTIONS.md

