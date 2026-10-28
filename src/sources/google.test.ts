import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Some Node versions ship a stub global localStorage that shadows jsdom's; use an in-memory one.
vi.hoisted(() => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
});
import { useStore } from '../store';
import { fetchGoogleSource, GoogleApiError, mapGoogleEvent, type GEvent } from './google';

const timed = (patch: Partial<GEvent> = {}): GEvent => ({
  id: 'e1',
  summary: 'Lunch',
  start: { dateTime: '2026-10-30T12:00:00-07:00' },
  end: { dateTime: '2026-10-30T13:00:00-07:00' },
  htmlLink: 'https://calendar.google.com/event?eid=1',
  ...patch,
});

describe('mapGoogleEvent', () => {
  it('maps timed events', () => {
    const e = mapGoogleEvent(timed({ description: '<b>Bring</b> notes' }), 'google:a:cal', 'cal')!;
    expect(e).toMatchObject({
      id: 'google:a:cal:e1', uid: 'cal:e1', kind: 'event', allDay: false, title: 'Lunch',
      description: 'Bring notes', url: 'https://calendar.google.com/event?eid=1',
    });
    expect(e.start).toBe('2026-10-30T19:00:00.000Z');
  });

  it('maps all-day events to local midnight', () => {
    const e = mapGoogleEvent({ id: 'e2', summary: 'Trip', start: { date: '2026-11-02' }, end: { date: '2026-11-04' } }, 'g', 'cal')!;
    expect(e.allDay).toBe(true);
    expect(e.start).toBe(new Date(2026, 10, 2).toISOString());
    expect(e.end).toBe(new Date(2026, 10, 4).toISOString());
  });

  it('skips cancelled events and fills missing titles', () => {
    expect(mapGoogleEvent(timed({ status: 'cancelled' }), 'g', 'cal')).toBeNull();
    expect(mapGoogleEvent(timed({ summary: '  ' }), 'g', 'cal')!.title).toBe('(No title)');
  });

  it('skips working-location markers but keeps other event types', () => {
    expect(mapGoogleEvent(timed({ eventType: 'workingLocation' }), 'g', 'cal')).toBeNull();
    expect(mapGoogleEvent(timed({ eventType: 'outOfOffice' }), 'g', 'cal')).not.toBeNull();
  });
});

describe('GoogleApiError.retryable', () => {
  it('retries rate limits and server errors, not permission errors', () => {
    expect(new GoogleApiError(429, 'x').retryable).toBe(true);
    expect(new GoogleApiError(503, 'x').retryable).toBe(true);
    expect(new GoogleApiError(403, 'x', 'rateLimitExceeded').retryable).toBe(true);
    expect(new GoogleApiError(403, 'x', 'userRateLimitExceeded').retryable).toBe(true);
    expect(new GoogleApiError(403, 'x', 'quotaExceeded').retryable).toBe(true);
    expect(new GoogleApiError(403, 'x', 'forbidden').retryable).toBe(false);
    expect(new GoogleApiError(404, 'x', 'notFound').retryable).toBe(false);
  });
});

describe('fetchGoogleSource', () => {
  const ACCOUNT = 'acct';
  const jsonRes = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const apiError = (status: number, reason: string) => jsonRes(status, { error: { message: reason, errors: [{ reason }] } });
  const calendarList = jsonRes(200, { items: [{ id: 'primary' }, { id: 'gone' }] });

  beforeEach(() => {
    useStore.getState().upsertAccount({
      id: ACCOUNT, email: 'me@example.com', refreshToken: 'r', accessToken: 'a', accessTokenExpiry: Date.now() + 3_600_000,
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    useStore.getState().removeAccount(ACCOUNT);
  });

  it('follows nextPageToken and skips calendars that 404', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/calendarList')) return calendarList.clone();
      if (url.pathname.includes('/gone/')) return apiError(404, 'notFound');
      return url.searchParams.get('pageToken') === 'p2'
        ? jsonRes(200, { items: [timed({ id: 'b' })] })
        : jsonRes(200, { items: [timed({ id: 'a' })], nextPageToken: 'p2' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { calendars, events } = await fetchGoogleSource(ACCOUNT, new Date(2026, 9, 1), new Date(2026, 11, 1));
    expect(calendars.map((c) => c.id)).toEqual(['google:acct:primary', 'google:acct:gone']);
    expect(events.map((e) => e.uid)).toEqual(['primary:a', 'primary:b']);
  });

  it('retries a rate-limited calendar, then fails the sync instead of dropping its events', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/calendarList')) return calendarList.clone();
      if (url.pathname.includes('/gone/')) return jsonRes(200, { items: [] });
      return apiError(403, 'rateLimitExceeded');
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = fetchGoogleSource(ACCOUNT, new Date(2026, 9, 1), new Date(2026, 11, 1));
    const assertion = expect(result).rejects.toThrow('rateLimitExceeded');
    await vi.runAllTimersAsync();
    await assertion;
    // calendarList + 3 attempts for "primary" + 1 for "gone"
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('recovers when a retry succeeds', async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/calendarList')) return jsonRes(200, { items: [{ id: 'primary' }] });
      return ++calls === 1 ? apiError(429, 'rateLimitExceeded') : jsonRes(200, { items: [timed()] });
    }));
    const result = fetchGoogleSource(ACCOUNT, new Date(2026, 9, 1), new Date(2026, 11, 1));
    await vi.runAllTimersAsync();
    expect((await result).events).toHaveLength(1);
  });
});
