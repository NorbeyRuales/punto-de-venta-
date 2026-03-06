const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseUrl = envUrl ?? '';
export const supabaseAnonKey = envAnon ?? '';
export const isSupabaseConfigured = Boolean(envUrl && envAnon);

export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email?: string;
  };
};

export const SESSION_STORAGE_KEY = 'pos_supabase_session';

export function getStoredSession(): SupabaseSession | null {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SupabaseSession;
  } catch {
    return null;
  }
}

export function storeSession(session: SupabaseSession | null) {
  if (!session) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase no está configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  }

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
    const message = json?.msg || json?.message || json?.error_description || 'Error en Supabase';
    throw new Error(message);
  }

  return json as T;
}

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

export async function signOut(token: string): Promise<void> {
  await request('/auth/v1/logout', { method: 'POST' }, token);
}

export async function rpc<T>(fn: string, params: Record<string, unknown>, token: string): Promise<T> {
  return request<T>(`/rest/v1/rpc/${fn}`, {
    method: 'POST',
    body: JSON.stringify(params),
  }, token);
}

export async function selectRows<T>(table: string, query: string, token: string): Promise<T[]> {
  return request<T[]>(`/rest/v1/${table}?${query}`, { method: 'GET' }, token);
}

export async function insertRows<T>(table: string, rows: Record<string, unknown>[], token: string): Promise<T[]> {
  return request<T[]>(`/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(rows),
  }, token);
}

export async function updateRows<T>(table: string, query: string, patch: Record<string, unknown>, token: string): Promise<T[]> {
  return request<T[]>(`/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  }, token);
}

export async function deleteRows(table: string, query: string, token: string): Promise<void> {
  await request(`/rest/v1/${table}?${query}`, {
    method: 'DELETE',
  }, token);
}
