import { auth } from './firebase.ts';

const TOKEN_STORAGE_KEY = 'kinetix_auth_token';

export function setLocalSessionToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export function getLocalSessionToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export async function getAuthToken(): Promise<string | null> {
  const currentUser = auth.currentUser;
  if (currentUser) {
    return currentUser.getIdToken();
  }
  return getLocalSessionToken();
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getAuthToken();
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(options.body instanceof ArrayBuffer) && !(options.body instanceof Uint8Array) && !(options.body instanceof Blob) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    let parsed: { error?: string } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { error: text || res.statusText };
    }
    throw new Error(parsed.error || `HTTP ${res.status}`);
  }

  return (await res.json()) as T;
}
