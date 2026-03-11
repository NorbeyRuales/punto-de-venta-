# MCP Supabase (Postgres)

Servidor MCP por `stdio` para consultar tu base de datos de Supabase usando Postgres directo.

## Requisitos
- Node.js 18+
- La cadena de conexion Postgres de Supabase (por ejemplo `SUPABASE_DB_URL`)

## Instalacion
1. `cd mcp/supabase`
2. `npm install`

## Variables de entorno
- `SUPABASE_DB_URL` o `DATABASE_URL` (obligatorio)
- `MCP_DB_ALLOW_WRITE` (opcional, `true` para permitir writes; por defecto es solo lectura)
- `MCP_DB_MAX_ROWS` (opcional, por defecto `200`)
- `MCP_DB_STATEMENT_TIMEOUT_MS` (opcional, por defecto `5000`)
- `MCP_DB_SSL` (opcional, `true` para forzar SSL con `rejectUnauthorized=false`)

## Ejemplo de configuracion MCP
Ejemplo generico, ajusta segun tu cliente MCP (Cursor, Claude Desktop, etc.):

```json
{
  "mcpServers": {
    "supabase": {
      "command": "node",
      "args": ["mcp/supabase/server.js"],
      "env": {
        "SUPABASE_DB_URL": "postgresql://USER:PASSWORD@HOST:5432/postgres?sslmode=require",
        "MCP_DB_ALLOW_WRITE": "false",
        "MCP_DB_MAX_ROWS": "200"
      }
    }
  }
}
```

## Tools disponibles
- `query` ejecuta SQL (por defecto solo lectura)
- `list_tables` lista tablas por esquema
- `describe_table` describe columnas de una tabla
- `ping` valida conexion
