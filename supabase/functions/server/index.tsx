import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
const app = new Hono();

type BarcodeLookupResult = {
  found: boolean;
  codigo: string;
  nombre?: string;
  marca?: string;
  detalle?: string;
  fuente?: string;
};

const browserHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-CO,es;q=0.9,en-US;q=0.8,en;q=0.7",
};

const htmlDecode = (value: string): string =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll(/<[^>]*>/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();

const isValidBarcode = (code: string): boolean => /^\d{8,14}$/.test(code);

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: browserHeaders });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return await response.text();
}

async function lookupGoUpc(code: string): Promise<BarcodeLookupResult | null> {
  try {
    const html = await fetchText(`https://go-upc.com/search?q=${code}`);
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = h1Match ? htmlDecode(h1Match[1]) : "";

    if (!title || title.includes(code) || /not found/i.test(title)) {
      return null;
    }

    let brand = "";
    const brandRow = html.match(/<td[^>]*>\s*Brand\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
    if (brandRow?.[1]) {
      brand = htmlDecode(brandRow[1]);
    }

    return {
      found: true,
      codigo: code,
      nombre: title,
      marca: brand,
      fuente: "Go-UPC",
    };
  } catch {
    return null;
  }
}

async function lookupDuckDuckGo(code: string): Promise<BarcodeLookupResult | null> {
  try {
    const html = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(`${code} producto`)}`);

    const titleMatch = html.match(/<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch = html.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
    const title = titleMatch ? htmlDecode(titleMatch[1]) : "";
    const detail = snippetMatch ? htmlDecode(snippetMatch[1]).slice(0, 220) : "";

    if (!title || title.length < 4 || /wikipedia|facebook|login|definition/i.test(title)) {
      return null;
    }

    const normalizedName = title.split(" - ")[0].split(" | ")[0].trim();

    const commonBrands = [
      "Listerine", "Colgate", "Nestle", "Alpina", "Bimbo", "Coca-Cola", "Familia", "Palmolive", "Nutella", "Oreo",
      "Heinz", "Maggi", "Gillette", "Dove", "Nivea", "Ariel", "Suavitel", "Duracell",
    ];

    let brand = "";
    const textForBrand = `${normalizedName} ${detail}`.toLowerCase();
    for (const b of commonBrands) {
      if (textForBrand.includes(b.toLowerCase())) {
        brand = b;
        break;
      }
    }

    return {
      found: true,
      codigo: code,
      nombre: normalizedName,
      marca: brand,
      detalle: detail,
      fuente: "DuckDuckGo Web",
    };
  } catch {
    return null;
  }
}

async function lookupBarcodeWeb(code: string): Promise<BarcodeLookupResult> {
  const goUpc = await lookupGoUpc(code);
  if (goUpc) return goUpc;

  const ddg = await lookupDuckDuckGo(code);
  if (ddg) return ddg;

  return {
    found: false,
    codigo: code,
  };
}

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

app.get("/make-server-cf6a4e6a/health", (c) => {
  return c.json({ status: "ok" });
});

app.get("/barcode-scrape/:code", async (c) => {
  const code = c.req.param("code")?.trim() ?? "";

  if (!isValidBarcode(code)) {
    return c.json({ found: false, error: "Código inválido" }, 400);
  }

  const result = await lookupBarcodeWeb(code);
  return c.json(result);
});

app.get("/make-server-cf6a4e6a/barcode-scrape/:code", async (c) => {
  const code = c.req.param("code")?.trim() ?? "";

  if (!isValidBarcode(code)) {
    return c.json({ found: false, error: "Código inválido" }, 400);
  }

  const result = await lookupBarcodeWeb(code);
  return c.json(result);
});

Deno.serve(app.fetch);