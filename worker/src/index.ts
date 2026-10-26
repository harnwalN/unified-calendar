// Stateless proxy for the Unified Calendar web app:
//   GET  /ics?url=…        CORS proxy for .ics feeds (Canvas, Google public, …)
//   POST /google/exchange  OAuth auth code -> tokens (needs the client secret)
//   POST /google/refresh   refresh token -> access token
//   POST /google/revoke    revoke a token (best effort)
// Never log URLs or tokens: feed links are secret (they embed per-user keys).
import { decodeJwtPayload, isOriginAllowed, looksLikeIcs, parseAllowedOrigins, validateFeedUrl } from './validate';

export interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET?: string;
  ALLOWED_ORIGINS: string;
}

const ICS_TIMEOUT_MS = 15_000;
const ICS_MAX_BYTES = 5 * 1024 * 1024;
const ICS_CACHE_SECONDS = 300;
const MAX_REDIRECTS = 5;
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get('Origin');
    if (!isOriginAllowed(origin, parseAllowedOrigins(env.ALLOWED_ORIGINS))) {
      return json({ error: 'Origin not allowed' }, 403);
    }
    const cors = corsHeaders(origin as string);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    let res: Response;
    try {
      res = await route(request, env, ctx);
    } catch (err) {
      res =
        err instanceof HttpError
          ? json({ error: err.message }, err.status)
          : json({ error: 'Internal error' }, 500);
    }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
} satisfies ExportedHandler<Env>;

function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { pathname } = new URL(request.url);
  const method = request.method;
  if (pathname === '/ics') return method === 'GET' ? handleIcs(request, ctx) : notAllowed();
  if (pathname.startsWith('/google/')) {
    if (method !== 'POST') return notAllowed();
    switch (pathname) {
      case '/google/exchange':
        return handleExchange(request, env);
      case '/google/refresh':
        return handleRefresh(request, env);
      case '/google/revoke':
        return handleRevoke(request);
    }
  }
  return Promise.resolve(json({ error: 'Not found' }, 404));
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function notAllowed(): Promise<Response> {
  return Promise.resolve(json({ error: 'Method not allowed' }, 405));
}

// ---------------------------------------------------------------- /ics

async function handleIcs(request: Request, ctx: ExecutionContext): Promise<Response> {
  const check = validateFeedUrl(new URL(request.url).searchParams.get('url'));
  if (!check.ok) throw new HttpError(400, check.error);

  const cache = caches.default;
  const cacheKey = new Request(check.url, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const text = await fetchFeed(check.url);
  if (!looksLikeIcs(text)) throw new HttpError(422, 'That link did not return an iCalendar (.ics) feed');

  const res = new Response(text, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': `public, max-age=${ICS_CACHE_SECONDS}`,
    },
  });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

/** Fetches a feed following redirects manually so every hop is re-validated. */
async function fetchFeed(startUrl: string): Promise<string> {
  const signal = AbortSignal.timeout(ICS_TIMEOUT_MS);
  let url = startUrl;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetch(url, {
        redirect: 'manual',
        signal,
        headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5', 'User-Agent': 'UnifiedCalendar/1.0' },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('Location');
        if (!location) throw new HttpError(502, 'Feed server sent a redirect without a location');
        const next = validateFeedUrl(new URL(location, url).toString());
        if (!next.ok) throw new HttpError(400, `Feed redirected to a disallowed URL: ${next.error}`);
        url = next.url;
        continue;
      }
      if (!res.ok) {
        const status = res.status === 404 || res.status === 410 ? 404 : 502;
        throw new HttpError(status, `Feed server responded ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`);
      }
      return await readLimited(res, ICS_MAX_BYTES);
    }
    throw new HttpError(502, 'Too many redirects');
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new HttpError(504, 'Feed server took too long to respond');
    }
    throw new HttpError(502, 'Could not reach the feed server');
  }
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get('Content-Length'));
  if (declared > maxBytes) throw new HttpError(413, 'Feed is larger than 5 MB');
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, 'Feed is larger than 5 MB');
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder('utf-8').decode(buf);
}

// ---------------------------------------------------------------- Google OAuth

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    if (body && typeof body === 'object') return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new HttpError(400, 'Expected a JSON body');
}

function requireString(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== 'string' || !v || v.length > 4096) throw new HttpError(400, `Missing "${key}"`);
  return v;
}

function requireGoogleConfig(env: Env): { id: string; secret: string } {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new HttpError(500, 'Worker is missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET');
  }
  return { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET };
}

async function googleToken(params: Record<string, string>): Promise<{ status: number; data: GoogleTokenResponse }> {
  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
  } catch {
    throw new HttpError(502, 'Could not reach Google');
  }
  const data = (await res.json().catch(() => ({}))) as GoogleTokenResponse;
  return { status: res.status, data };
}

async function handleExchange(request: Request, env: Env): Promise<Response> {
  const code = requireString(await readJsonBody(request), 'code');
  const client = requireGoogleConfig(env);
  const { status, data } = await googleToken({
    code,
    client_id: client.id,
    client_secret: client.secret,
    redirect_uri: 'postmessage',
    grant_type: 'authorization_code',
  });
  if (status !== 200 || !data.access_token) {
    throw new HttpError(400, data.error_description || data.error || 'Google rejected the sign-in code');
  }
  if (!data.refresh_token) {
    throw new HttpError(
      400,
      'Google did not return a refresh token. Remove this app at myaccount.google.com/permissions and connect again.',
    );
  }
  const claims = data.id_token ? decodeJwtPayload(data.id_token) : null;
  if (!claims || typeof claims.sub !== 'string') throw new HttpError(400, 'Google did not return an ID token');
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  return json({
    access_token: data.access_token,
    expires_in: data.expires_in ?? 3600,
    refresh_token: data.refresh_token,
    profile: { sub: claims.sub, email: str(claims.email), name: str(claims.name), picture: str(claims.picture) },
  });
}

async function handleRefresh(request: Request, env: Env): Promise<Response> {
  const refreshToken = requireString(await readJsonBody(request), 'refresh_token');
  const client = requireGoogleConfig(env);
  const { status, data } = await googleToken({
    refresh_token: refreshToken,
    client_id: client.id,
    client_secret: client.secret,
    grant_type: 'refresh_token',
  });
  if (data.error === 'invalid_grant') return json({ error: 'invalid_grant' }, 401);
  if (status !== 200 || !data.access_token) {
    throw new HttpError(status >= 500 ? 502 : 400, data.error_description || data.error || 'Token refresh failed');
  }
  return json({ access_token: data.access_token, expires_in: data.expires_in ?? 3600 });
}

async function handleRevoke(request: Request): Promise<Response> {
  const token = requireString(await readJsonBody(request), 'token');
  try {
    await fetch(GOOGLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
  } catch {
    // Best effort: the client removes the account regardless.
  }
  return json({ ok: true });
}
