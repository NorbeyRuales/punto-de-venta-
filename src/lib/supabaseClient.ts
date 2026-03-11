// Cliente HTTP liviano para Supabase (Auth + REST + RPC).
const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!envUrl || !envAnon) {
  // Fallar rápido si faltan credenciales en tiempo de compilación/ejecución.
  throw new Error('Faltan variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY');
}

export const supabaseUrl = envUrl;
export const supabaseAnonKey = envAnon;

// Forma mínima de sesión que guardamos en localStorage.
export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email?: string;
  };
};

export const SESSION_STORAGE_KEY = 'pos_supabase_session';

// Lee la sesión del navegador si existe.
export function getStoredSession(): SupabaseSession | null {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SupabaseSession;
  } catch {
    return null;
  }
}

// Guarda o limpia la sesión en localStorage.
export function storeSession(session: SupabaseSession | null) {
  if (!session) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

// Helper genérico para invocar endpoints de Supabase con headers base.
async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: token ? `Bearer ${token}` : `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    // Normaliza mensajes de error de Supabase.
    const message = json?.msg || json?.message || json?.error_description || 'Error en Supabase';
    throw new Error(message);
  }

  return json as T;
}

// Inicio de sesión usando email/clave (Auth).
export async function signInWithPassword(email: string, password: string): Promise<SupabaseSession> {
  const data = await request<{ access_token: string; refresh_token: string; user: SupabaseSession['user'] }>(
    '/auth/v1/token?grant_type=password',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
  );

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    user: data.user,
  };
}

// Cierra sesión (revoca token).
export async function signOut(token: string): Promise<void> {
  await request('/auth/v1/logout', { method: 'POST' }, token);
}

// Ejecuta una función RPC en la base de datos.
export async function rpc<T>(fn: string, params: Record<string, unknown>, token: string): Promise<T> {
  return request<T>(`/rest/v1/rpc/${fn}`, {
    method: 'POST',
    body: JSON.stringify(params),
  }, token);
}

// Consultas básicas a tablas vía REST.
export async function selectRows<T>(table: string, query: string, token: string): Promise<T[]> {
  return request<T[]>(`/rest/v1/${table}?${query}`, { method: 'GET' }, token);
}

// Inserta filas y devuelve representación.
export async function insertRows<T>(table: string, rows: Record<string, unknown>[], token: string): Promise<T[]> {
  return request<T[]>(`/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(rows),
  }, token);
}

// Actualiza filas con PATCH.
export async function updateRows<T>(table: string, query: string, patch: Record<string, unknown>, token: string): Promise<T[]> {
  return request<T[]>(`/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  }, token);
}

// Elimina filas según filtro.
export async function deleteRows(table: string, query: string, token: string): Promise<void> {
  await request(`/rest/v1/${table}?${query}`, {
    method: 'DELETE',
  }, token);
}
