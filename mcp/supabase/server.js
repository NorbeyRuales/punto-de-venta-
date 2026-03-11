import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pg from "pg";

const { Pool } = pg;

const DB_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const ALLOW_WRITE = (process.env.MCP_DB_ALLOW_WRITE || "false").toLowerCase() === "true";
const MAX_ROWS = Number.parseInt(process.env.MCP_DB_MAX_ROWS || "200", 10);
const STATEMENT_TIMEOUT_MS = Number.parseInt(
  process.env.MCP_DB_STATEMENT_TIMEOUT_MS || "5000",
  10
);
const SSL_MODE = (process.env.MCP_DB_SSL || "").toLowerCase();

if (!DB_URL) {
  console.error(
    "Missing SUPABASE_DB_URL (or DATABASE_URL). Provide a Postgres connection string."
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString: DB_URL,
  ...(SSL_MODE === "true" ? { ssl: { rejectUnauthorized: false } } : {}),
});

pool.on("connect", (client) => {
  if (Number.isFinite(STATEMENT_TIMEOUT_MS) && STATEMENT_TIMEOUT_MS > 0) {
    client
      .query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`)
      .catch(() => undefined);
  }
});

function normalizeSql(sql) {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim()
    .toLowerCase();
}

function isReadOnlyQuery(sql) {
  const normalized = normalizeSql(sql);
  return /^(select|with|show|explain)\b/.test(normalized);
}

function ensureSafeQuery(sql) {
  if (ALLOW_WRITE) {
    return;
  }
  if (!isReadOnlyQuery(sql)) {
    throw new Error(
      "Write queries are disabled. Set MCP_DB_ALLOW_WRITE=true to enable."
    );
  }
}

function formatRows(rows) {
  const truncated = rows.length > MAX_ROWS;
  const safeRows = truncated ? rows.slice(0, MAX_ROWS) : rows;
  return {
    rows: safeRows,
    rowCount: rows.length,
    truncated,
    maxRows: MAX_ROWS,
  };
}

const server = new McpServer({
  name: "supabase-mcp",
  version: "1.0.0",
});

server.tool(
  "query",
  {
    sql: z.string().min(1),
    params: z.array(z.any()).optional(),
  },
  async ({ sql, params }) => {
    ensureSafeQuery(sql);
    const result = await pool.query(sql, params || []);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(formatRows(result.rows || []), null, 2),
        },
      ],
    };
  }
);

server.tool(
  "list_tables",
  {
    schema: z.string().optional(),
  },
  async ({ schema }) => {
    const result = await pool.query(
      `
      select table_schema, table_name
      from information_schema.tables
      where table_type = 'BASE TABLE'
        and table_schema not in ('pg_catalog', 'information_schema')
        and ($1::text is null or table_schema = $1)
      order by table_schema, table_name
      `,
      [schema ?? null]
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(formatRows(result.rows || []), null, 2),
        },
      ],
    };
  }
);

server.tool(
  "describe_table",
  {
    table: z.string(),
    schema: z.string().optional(),
  },
  async ({ table, schema }) => {
    const result = await pool.query(
      `
      select
        column_name,
        data_type,
        is_nullable,
        column_default
      from information_schema.columns
      where table_schema = coalesce($2, 'public')
        and table_name = $1
      order by ordinal_position
      `,
      [table, schema ?? null]
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(formatRows(result.rows || []), null, 2),
        },
      ],
    };
  }
);

server.tool(
  "ping",
  {},
  async () => {
    const result = await pool.query("select 1 as ok");
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(formatRows(result.rows || []), null, 2),
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await pool.end().catch(() => undefined);
  process.exit(0);
});
