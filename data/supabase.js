/**
 * data/supabase.js — минимальный клиент Supabase: Auth, PostgREST, Storage.
 *
 * Специально без npm и CDN — обычный fetch. Публичный anon-ключ
 * безопасен только вместе с RLS-политиками из supabase/schema.sql:
 * читают все, пишет только авторизованный владелец.
 */

const SESSION_KEY = 'goritsvet.auth';
const CONTENT_ID = 'goritsvet';

/** Достаёт текст ошибки из ответа Supabase. */
async function errorText(response) {
  try {
    const text = await response.text();
    if (!text) return response.statusText || `HTTP ${response.status}`;
    try {
      const data = JSON.parse(text);
      return (
        data.error_description ||
        data.msg ||
        data.message ||
        data.error ||
        text.slice(0, 300)
      );
    } catch {
      return text.slice(0, 300);
    }
  } catch {
    return `HTTP ${response.status}`;
  }
}

export function createClient({ url = '', anonKey = '' } = {}) {
  const base = String(url || '').replace(/\/+$/, '');
  const key = String(anonKey || '');
  const configured = Boolean(base && key);

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function writeSession(session) {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }

  function toSession(payload, email) {
    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: Date.now() + (Number(payload.expires_in) || 3600) * 1000,
      email: (payload.user && payload.user.email) || email || '',
    };
  }

  async function authRequest(grantType, body) {
    const response = await fetch(`${base}/auth/v1/token?grant_type=${grantType}`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await errorText(response));
    return response.json();
  }

  /** Текущая сессия без похода в сеть. */
  function getSession() {
    const session = readSession();
    if (!session || !session.accessToken) return null;
    return session;
  }

  /** Сессия, обновлённая при необходимости (refresh token). */
  async function ensureSession() {
    const session = readSession();
    if (!session || !session.accessToken) return null;
    if (session.expiresAt && session.expiresAt > Date.now() + 30_000) return session;
    if (!session.refreshToken) {
      writeSession(null);
      return null;
    }
    try {
      const payload = await authRequest('refresh_token', { refresh_token: session.refreshToken });
      const fresh = toSession(payload, session.email);
      writeSession(fresh);
      return fresh;
    } catch {
      writeSession(null);
      return null;
    }
  }

  async function signIn(email, password) {
    const payload = await authRequest('password', { email, password });
    const session = toSession(payload, email);
    writeSession(session);
    return session;
  }

  async function signOut() {
    const session = readSession();
    writeSession(null);
    if (!session || !session.accessToken) return;
    try {
      await fetch(`${base}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${session.accessToken}` },
      });
    } catch {
      /* локальная сессия уже очищена — это главное */
    }
  }

  async function request(path, { method = 'GET', body, session, headers = {} } = {}) {
    const token = (session && session.accessToken) || key;
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await errorText(response));
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  /** Контент сайта из таблицы site_content. null — если строки ещё нет. */
  async function fetchContent() {
    const session = await ensureSession();
    const rows = await request(
      `/rest/v1/site_content?id=eq.${CONTENT_ID}&select=data,updated_at`,
      { session },
    );
    if (!Array.isArray(rows) || !rows.length) return null;
    return rows[0].data;
  }

  /** Сохраняет контент (upsert по id). */
  async function saveContent(data) {
    const session = await ensureSession();
    if (!session) throw new Error('Нужно войти, чтобы сохранять на сайт');
    const result = await request('/rest/v1/site_content', {
      method: 'POST',
      session,
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: [{ id: CONTENT_ID, data }],
    });
    return Array.isArray(result) && result[0] ? result[0].updated_at : null;
  }

  /** Загружает файл в бакет media и возвращает публичный URL. */
  async function uploadImage(blob, { ext = 'webp', folder = 'uploads' } = {}) {
    const session = await ensureSession();
    if (!session) throw new Error('Нужно войти, чтобы загружать изображения');
    const name = `${folder}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const response = await fetch(`${base}/storage/v1/object/media/${name}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${session.accessToken}`,
        'x-upsert': 'true',
        'cache-control': 'max-age=31536000',
        'Content-Type': blob.type || 'application/octet-stream',
      },
      body: blob,
    });
    if (!response.ok) throw new Error(await errorText(response));
    return `${base}/storage/v1/object/public/media/${name}`;
  }

  return {
    configured,
    base,
    getSession,
    ensureSession,
    signIn,
    signOut,
    fetchContent,
    saveContent,
    uploadImage,
  };
}
