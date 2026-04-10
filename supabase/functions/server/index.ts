// Edge Function: API simple para búsqueda de códigos de barras.
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
const app = new Hono();

type BarcodeLookupResult = {
  found: boolean;
  codigo: string;
  nombre?: string;
  marca?: string;
  detalle?: string;
  fuente?: string;
};

type StoreUserRole = 'admin' | 'cashier';

type StoreUserResponse = {
  id: string;
  userId: string;
  email: string;
  fullName?: string;
  role: StoreUserRole;
  isActive: boolean;
  createdAt: string;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? serviceRoleKey;

const serviceClient = () => createClient(supabaseUrl, serviceRoleKey);

const requesterClient = (authHeader: string) => createClient(supabaseUrl, anonKey, {
  global: {
    headers: {
      Authorization: authHeader,
    },
  },
});

const isValidUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const parseRole = (value: unknown): StoreUserRole | null =>
  value === 'admin' || value === 'cashier' ? value : null;

const extractAuthorizationHeader = (request: Request): string | null => {
  const auth = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) return null;
  return auth;
};

const extractBearerToken = (authHeader: string): string => authHeader.replace(/^Bearer\s+/i, '').trim();

const getStoreIdFromRequest = (request: Request, bodyStoreId?: unknown): string | null => {
  if (typeof bodyStoreId === 'string' && isValidUuid(bodyStoreId)) return bodyStoreId;
  const url = new URL(request.url);
  const queryStoreId = url.searchParams.get('storeId') || '';
  return isValidUuid(queryStoreId) ? queryStoreId : null;
};

const ensureStoreAdmin = async (request: Request, storeId: string): Promise<{ userId: string } | { error: string; status: number }> => {
  const authHeader = extractAuthorizationHeader(request);
  if (!authHeader) {
    return { error: 'Falta token de autorización.', status: 401 };
  }

  const requester = requesterClient(authHeader);
  const userResult = await requester.auth.getUser(extractBearerToken(authHeader));
  const requesterUserId = userResult.data.user?.id;
  if (!requesterUserId) {
    return { error: 'Token inválido o sesión expirada.', status: 401 };
  }

  const adminMembership = await requester
    .from('store_users')
    .select('id, role, is_active')
    .eq('store_id', storeId)
    .eq('user_id', requesterUserId)
    .eq('role', 'admin')
    .eq('is_active', true)
    .maybeSingle();

  if (adminMembership.error || !adminMembership.data) {
    return { error: 'No autorizado: solo administradores de la tienda.', status: 403 };
  }

  return { userId: requesterUserId };
};

const listAllAuthUsers = async () => {
  const client = serviceClient();
  const users: Array<{ id: string; email?: string; user_metadata?: Record<string, unknown> }> = [];
  let page = 1;

  while (true) {
    const result = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (result.error) {
      throw new Error(result.error.message);
    }

    const batch = result.data.users.map((user) => ({
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata as Record<string, unknown> | undefined,
    }));
    users.push(...batch);

    if (batch.length < 200) break;
    page += 1;
  }

  return users;
};

const ensureNotLastActiveAdmin = async (
  storeId: string,
  targetMembershipId: string,
  nextRole?: StoreUserRole,
  nextIsActive?: boolean,
) => {
  const client = serviceClient();
  const target = await client
    .from('store_users')
    .select('id, role, is_active')
    .eq('id', targetMembershipId)
    .eq('store_id', storeId)
    .maybeSingle();

  if (target.error || !target.data) {
    throw new Error('Usuario de tienda no encontrado.');
  }

  const wasActiveAdmin = target.data.role === 'admin' && Boolean(target.data.is_active);
  const willStayActiveAdmin = (nextRole ?? target.data.role) === 'admin' && (nextIsActive ?? target.data.is_active) === true;

  if (!wasActiveAdmin || willStayActiveAdmin) return;

  const adminCount = await client
    .from('store_users')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('role', 'admin')
    .eq('is_active', true)
    .neq('id', targetMembershipId);

  if (adminCount.error) {
    throw new Error(adminCount.error.message);
  }

  if (!adminCount.count || adminCount.count < 1) {
    throw new Error('Debe existir al menos un administrador activo en la tienda.');
  }
};

const mapStoreUsersResponse = async (storeId: string): Promise<StoreUserResponse[]> => {
  const client = serviceClient();
  const membershipsResult = await client
    .from('store_users')
    .select('id, user_id, role, is_active, created_at')
    .eq('store_id', storeId)
    .order('created_at', { ascending: true });

  if (membershipsResult.error) {
    throw new Error(membershipsResult.error.message);
  }

  const memberships = membershipsResult.data ?? [];
  if (memberships.length === 0) return [];

  const authUsers = await listAllAuthUsers();
  const authById = new Map(authUsers.map((user) => [user.id, user]));
  const userIds = memberships.map((membership) => membership.user_id);

  const profilesResult = await client
    .from('profiles')
    .select('user_id, full_name')
    .in('user_id', userIds);

  if (profilesResult.error) {
    throw new Error(profilesResult.error.message);
  }

  const profileByUserId = new Map(
    (profilesResult.data ?? []).map((profile) => [profile.user_id, profile.full_name as string | null]),
  );

  return memberships.map((membership) => {
    const authUser = authById.get(membership.user_id);
    const fullNameFromProfile = profileByUserId.get(membership.user_id) ?? undefined;
    const fullNameFromMetadata = authUser?.user_metadata?.full_name;

    return {
      id: membership.id,
      userId: membership.user_id,
      email: authUser?.email || '',
      fullName: typeof fullNameFromProfile === 'string' && fullNameFromProfile.trim().length > 0
        ? fullNameFromProfile
        : (typeof fullNameFromMetadata === 'string' ? fullNameFromMetadata : undefined),
      role: membership.role as StoreUserRole,
      isActive: Boolean(membership.is_active),
      createdAt: membership.created_at,
    };
  });
};

// Headers para simular un navegador en scrapers externos.
const browserHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-CO,es;q=0.9,en-US;q=0.8,en;q=0.7",
};

// Limpia HTML básico y entidades para obtener texto legible.
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

// Valida formatos comunes de códigos de barras (8-14 dígitos).
const isValidBarcode = (code: string): boolean => /^\d{8,14}$/.test(code);

// Helper de fetch para HTML.
async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: browserHeaders });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return await response.text();
}

// Primera fuente: go-upc.com.
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

// Segunda fuente: DuckDuckGo HTML.
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

// Intenta ambas fuentes en cascada.
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
    allowHeaders: ["Content-Type", "Authorization", "apikey", "x-client-info"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

const handleHealth = (c: Parameters<typeof app.get>[1] extends (arg: infer T) => unknown ? T : never) => {
  return c.json({ status: "ok" });
};

app.get("/health", handleHealth);
app.get("/server/health", handleHealth);
app.get("/make-server-cf6a4e6a/health", handleHealth);

const handleBarcodeScrape = async (c: Parameters<typeof app.get>[1] extends (arg: infer T) => unknown ? T : never) => {
  const code = c.req.param("code")?.trim() ?? "";

  if (!isValidBarcode(code)) {
    return c.json({ found: false, error: "Código inválido" }, 400);
  }

  const result = await lookupBarcodeWeb(code);
  return c.json(result);
};

app.get("/barcode-scrape/:code", handleBarcodeScrape);
app.get("/server/barcode-scrape/:code", handleBarcodeScrape);
app.get("/make-server-cf6a4e6a/barcode-scrape/:code", handleBarcodeScrape);

const handleStoreUsersList = async (c: Parameters<typeof app.get>[1] extends (arg: infer T) => unknown ? T : never) => {
  try {
    const storeId = getStoreIdFromRequest(c.req.raw);
    if (!storeId) {
      return c.json({ error: 'storeId inválido.' }, 400);
    }

    const adminCheck = await ensureStoreAdmin(c.req.raw, storeId);
    if ('error' in adminCheck) {
      return c.json({ error: adminCheck.error }, adminCheck.status);
    }

    const users = await mapStoreUsersResponse(storeId);
    return c.json({ users });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Error al consultar usuarios.' }, 500);
  }
};

app.get('/store-users', handleStoreUsersList);
app.get('/server/store-users', handleStoreUsersList);

const handleStoreUsersCreate = async (c: Parameters<typeof app.post>[1] extends (arg: infer T) => unknown ? T : never) => {
  try {
    const body = await c.req.json();
    const storeId = getStoreIdFromRequest(c.req.raw, body?.storeId);
    if (!storeId) {
      return c.json({ error: 'storeId inválido.' }, 400);
    }

    const adminCheck = await ensureStoreAdmin(c.req.raw, storeId);
    if ('error' in adminCheck) {
      return c.json({ error: adminCheck.error }, adminCheck.status);
    }

    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '').trim();
    const role = parseRole(body?.role);
    const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';

    if (!email) return c.json({ error: 'Email requerido.' }, 400);
    if (!password || password.length < 6) return c.json({ error: 'La contraseña debe tener mínimo 6 caracteres.' }, 400);
    if (!role) return c.json({ error: 'Rol inválido.' }, 400);

    const client = serviceClient();
    const authUsers = await listAllAuthUsers();
    let authUser = authUsers.find((user) => (user.email || '').toLowerCase() === email);

    if (!authUser) {
      const created = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : undefined,
      });

      if (created.error || !created.data.user) {
        return c.json({ error: created.error?.message || 'No se pudo crear usuario en Auth.' }, 400);
      }

      authUser = {
        id: created.data.user.id,
        email: created.data.user.email,
        user_metadata: created.data.user.user_metadata as Record<string, unknown> | undefined,
      };
    }

    if (fullName) {
      const profileUpsert = await client
        .from('profiles')
        .upsert([{ user_id: authUser.id, full_name: fullName, username: email }], { onConflict: 'user_id' });

      if (profileUpsert.error) {
        return c.json({ error: profileUpsert.error.message }, 400);
      }
    }

    const existingMembership = await client
      .from('store_users')
      .select('id')
      .eq('store_id', storeId)
      .eq('user_id', authUser.id)
      .maybeSingle();

    if (existingMembership.error) {
      return c.json({ error: existingMembership.error.message }, 400);
    }

    if (existingMembership.data?.id) {
      const updated = await client
        .from('store_users')
        .update({ role, is_active: true })
        .eq('id', existingMembership.data.id)
        .eq('store_id', storeId);

      if (updated.error) {
        return c.json({ error: updated.error.message }, 400);
      }
    } else {
      const inserted = await client
        .from('store_users')
        .insert([{ store_id: storeId, user_id: authUser.id, role, is_active: true }]);

      if (inserted.error) {
        return c.json({ error: inserted.error.message }, 400);
      }
    }

    const users = await mapStoreUsersResponse(storeId);
    const user = users.find((item) => item.userId === authUser?.id);
    return c.json({ user });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Error al crear usuario.' }, 500);
  }
};

app.post('/store-users', handleStoreUsersCreate);
app.post('/server/store-users', handleStoreUsersCreate);

const handleStoreUsersPatch = async (c: Parameters<typeof app.patch>[1] extends (arg: infer T) => unknown ? T : never) => {
  try {
    const body = await c.req.json();
    const storeId = getStoreIdFromRequest(c.req.raw, body?.storeId);
    if (!storeId) {
      return c.json({ error: 'storeId inválido.' }, 400);
    }

    const membershipId = c.req.param('membershipId') || '';
    if (!isValidUuid(membershipId)) {
      return c.json({ error: 'membershipId inválido.' }, 400);
    }

    const adminCheck = await ensureStoreAdmin(c.req.raw, storeId);
    if ('error' in adminCheck) {
      return c.json({ error: adminCheck.error }, adminCheck.status);
    }

    const nextRole = body?.role === undefined ? undefined : parseRole(body.role);
    const nextIsActive = typeof body?.isActive === 'boolean' ? body.isActive : undefined;
    if (body?.role !== undefined && !nextRole) {
      return c.json({ error: 'Rol inválido.' }, 400);
    }

    await ensureNotLastActiveAdmin(storeId, membershipId, nextRole ?? undefined, nextIsActive);

    const client = serviceClient();
    const patch: Record<string, unknown> = {};
    if (nextRole) patch.role = nextRole;
    if (typeof nextIsActive === 'boolean') patch.is_active = nextIsActive;

    const updated = await client
      .from('store_users')
      .update(patch)
      .eq('id', membershipId)
      .eq('store_id', storeId);

    if (updated.error) {
      return c.json({ error: updated.error.message }, 400);
    }

    const users = await mapStoreUsersResponse(storeId);
    const user = users.find((item) => item.id === membershipId);
    return c.json({ user });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Error al actualizar usuario.' }, 500);
  }
};

app.patch('/store-users/:membershipId', handleStoreUsersPatch);
app.patch('/server/store-users/:membershipId', handleStoreUsersPatch);

const handleStoreUsersDelete = async (c: Parameters<typeof app.delete>[1] extends (arg: infer T) => unknown ? T : never) => {
  try {
    const storeId = getStoreIdFromRequest(c.req.raw);
    if (!storeId) {
      return c.json({ error: 'storeId inválido.' }, 400);
    }

    const membershipId = c.req.param('membershipId') || '';
    if (!isValidUuid(membershipId)) {
      return c.json({ error: 'membershipId inválido.' }, 400);
    }

    const adminCheck = await ensureStoreAdmin(c.req.raw, storeId);
    if ('error' in adminCheck) {
      return c.json({ error: adminCheck.error }, adminCheck.status);
    }

    await ensureNotLastActiveAdmin(storeId, membershipId);

    const client = serviceClient();
    const deleted = await client
      .from('store_users')
      .delete()
      .eq('id', membershipId)
      .eq('store_id', storeId);

    if (deleted.error) {
      return c.json({ error: deleted.error.message }, 400);
    }

    return c.json({ ok: true });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Error al eliminar usuario.' }, 500);
  }
};

app.delete('/store-users/:membershipId', handleStoreUsersDelete);
app.delete('/server/store-users/:membershipId', handleStoreUsersDelete);

Deno.serve(app.fetch);
