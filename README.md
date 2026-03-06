
  # Punto de Venta completo

  This is a code bundle for Punto de Venta completo. The original project is available at https://www.figma.com/design/vWSgmOCGSRhgnBVG85Afde/Punto-de-Venta-completo.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.
  # punto-de-venta-


## Variables de entorno

Crea un archivo `.env.local` (puedes copiar `.env.example`) con:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Sin estas variables, la app mostrará error al iniciar la integración con Supabase.

## Logo personalizado

- Coloca tu archivo JPEG en `public/branding/logo.jpeg`.
- En la app puedes ajustar la ruta en Configuración → Tienda → “Ruta pública del logo”.
- Si no subes ningún archivo, se mostrará un placeholder y no se romperá la interfaz.
