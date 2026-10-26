// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';

const env: Env = {
  GOOGLE_CLIENT_ID: 'cid',
  GOOGLE_CLIENT_SECRET: 'secret',
  ALLOWED_ORIGINS: 'https://app.example.io,http://localhost:5173',
};
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
const ORIGIN = 'http://localhost:5173';

function call(path: string, init: RequestInit & { origin?: string | null } = {}) {
  const headers = new Headers(init.headers);
  const origin = init.origin === undefined ? ORIGIN : init.origin;
  if (origin) headers.set('Origin', origin);
  return worker.fetch(new Request(`https://proxy.test${path}`, { ...init, headers }), env, ctx);
}

function post(path: string, body: unknown) {
  return call(path, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('worker', () => {
  it('403s disallowed / missing origins', async () => {
    const res = await call('/ics?url=https://example.com/a.ics', { origin: 'https://evil.com' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Origin not allowed' });
    expect((await call('/google/refresh', { origin: null, method: 'POST' })).status).toBe(403);
  });

  it('answers preflight with CORS headers', async () => {
    const res = await call('/google/exchange', { method: 'OPTIONS', origin: 'https://APP.example.io' });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://APP.example.io');
  });

  it('rejects bad feed urls with CORS headers', async () => {
    const res = await call('/ics?url=' + encodeURIComponent('http://127.0.0.1/'));
    expect(res.status).toBe(400);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect((await res.json()) as { error: string }).toHaveProperty('error');
  });

  it('exchanges a code and decodes the profile', async () => {
    const idToken = `h.${Buffer.from(JSON.stringify({ sub: 's1', email: 'e@x.com', name: 'N' })).toString('base64url')}.s`;
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({ access_token: 'at', expires_in: 3599, refresh_token: 'rt', id_token: idToken }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await post('/google/exchange', { code: 'abc' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      access_token: 'at',
      expires_in: 3599,
      refresh_token: 'rt',
      profile: { sub: 's1', email: 'e@x.com', name: 'N' },
    });
    const sent = new URLSearchParams(String(fetchMock.mock.calls[0][1]?.body));
    expect(sent.get('redirect_uri')).toBe('postmessage');
    expect(sent.get('grant_type')).toBe('authorization_code');
  });

  it('400s when Google returns no refresh token', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ access_token: 'at', expires_in: 3599, id_token: 'a.e30.b' }));
    const res = await post('/google/exchange', { code: 'abc' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/refresh token/);
  });

  it('maps invalid_grant on refresh to 401', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: 'invalid_grant' }, { status: 400 }));
    const res = await post('/google/refresh', { refresh_token: 'rt' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid_grant' });
  });

  it('validates JSON bodies', async () => {
    expect((await post('/google/refresh', {})).status).toBe(400);
    expect((await call('/google/refresh', { method: 'POST', body: 'nope' })).status).toBe(400);
    expect((await call('/google/refresh')).status).toBe(405);
    expect((await call('/nope')).status).toBe(404);
  });
});
