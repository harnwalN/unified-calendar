// Orchestrates syncing every source into the store + IndexedDB cache.
import { useEffect } from 'react';
import { GOOGLE_CLIENT_ID, SYNC_INTERVAL_MS } from '../config';
import { deleteSourceEvents, loadAllSourceEvents, saveSourceEvents } from '../lib/db';
import { sourceKeyFor, useStore, type AppState } from '../store';
import type { CalendarInfo, CalEvent } from '../types';
import { parseCanvas } from './canvas';
import { fetchGoogleSource, loadGoogleIdentity } from './google';
import { fetchIcsText, parseIcs } from './ics';
import { errorMessage } from './text';

const DAY = 86_400_000;
/** Re-sync on focus/online only if the last full sync is older than this. */
const STALE_AFTER_MS = 2 * 60 * 1000;
/** A Google window "covers" the cursor if this much padding (≈ a month view) fits on both sides. */
const VIEW_PADDING_MS = 42 * DAY;

function daysFromToday(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

interface Span {
  start: number;
  end: number;
}

/** Ranges of time already fetched per Google account (module memory; reset on reload). */
const googleWindows = new Map<string, Span[]>();
const inflight = new Map<string, Promise<void>>();
const extending = new Set<string>();
let syncAllPromise: Promise<void> | null = null;
let lastFullSync = 0;

function sourceExists(state: AppState, key: string): boolean {
  return activeSourceKeys(state).has(key);
}

function activeSourceKeys(state: Pick<AppState, 'accounts' | 'feeds'>): Set<string> {
  return new Set([
    ...state.accounts.map((a) => sourceKeyFor.google(a.id)),
    ...state.feeds.map((f) => sourceKeyFor.feed(f)),
  ]);
}

/** Sync a single source by its source key (see store/sourceKeyFor). */
export function syncSource(sourceKey: string): Promise<void> {
  const existing = inflight.get(sourceKey);
  if (existing) return existing;
  const p = runSync(sourceKey).finally(() => inflight.delete(sourceKey));
  inflight.set(sourceKey, p);
  return p;
}

async function runSync(sourceKey: string): Promise<void> {
  const store = useStore.getState();
  if (!sourceExists(store, sourceKey)) return;
  const prev = store.syncStatus[sourceKey];
  store.setSyncStatus(sourceKey, { state: 'loading', lastSync: prev?.lastSync });
  try {
    const result = await fetchSource(sourceKey);
    const now = useStore.getState();
    if (!sourceExists(now, sourceKey)) return; // removed while syncing
    now.setCalendarsForSource(sourceKey, result.calendars);
    now.setEventsForSource(sourceKey, result.events);
    now.setSyncStatus(sourceKey, { state: 'idle', lastSync: Date.now() });
    await saveSourceEvents(sourceKey, result.events).catch(() => undefined);
  } catch (err) {
    if (!sourceExists(useStore.getState(), sourceKey)) return;
    useStore.getState().setSyncStatus(sourceKey, {
      state: 'error',
      error: errorMessage(err),
      lastSync: prev?.lastSync,
    });
  }
}

async function fetchSource(sourceKey: string): Promise<{ calendars: CalendarInfo[]; events: CalEvent[] }> {
  const sep = sourceKey.indexOf(':');
  const kind = sourceKey.slice(0, sep);
  const id = sourceKey.slice(sep + 1);
  const state = useStore.getState();

  if (kind === 'google') {
    const account = state.accounts.find((a) => a.id === id);
    if (!account) throw new Error('Google account not found.');
    if (account.needsReconnect) throw new Error(`Reconnect ${account.email || 'this account'} to keep syncing.`);
    return fetchGoogleWindows(id);
  }

  const feed = state.feeds.find((f) => f.kind === kind && f.id === id);
  if (!feed) throw new Error('Feed not found.');
  const range = { rangeStart: daysFromToday(-180), rangeEnd: daysFromToday(365) };
  const text = await fetchIcsText(feed.url);
  if (feed.kind === 'canvas') return parseCanvas(text, feed, range);

  const { calendarName, events } = parseIcs(text, { calendarId: sourceKey, ...range });
  const calendar: CalendarInfo = {
    id: sourceKey,
    sourceKey,
    kind: 'ics',
    name: feed.name.trim() || calendarName || 'Calendar',
    color: feed.color,
    visible: true,
  };
  return { calendars: [calendar], events };
}

function cursorWindow(cursor: Date): Span {
  return { start: cursor.getTime() - 90 * DAY, end: cursor.getTime() + 90 * DAY };
}

function covers(windows: Span[] | undefined, at: Date): boolean {
  const t = at.getTime();
  return !!windows?.some((w) => t - VIEW_PADDING_MS >= w.start && t + VIEW_PADDING_MS <= w.end);
}

/** Full Google sync: the default window, plus one around the cursor if it is outside it. */
async function fetchGoogleWindows(accountId: string): Promise<{ calendars: CalendarInfo[]; events: CalEvent[] }> {
  const windows: Span[] = [{ start: daysFromToday(-60).getTime(), end: daysFromToday(180).getTime() }];
  const cursor = new Date(useStore.getState().cursor);
  if (!covers(windows, cursor)) windows.push(cursorWindow(cursor));

  const results = await Promise.all(
    windows.map((w) => fetchGoogleSource(accountId, new Date(w.start), new Date(w.end))),
  );
  googleWindows.set(accountId, windows);
  return { calendars: results[0].calendars, events: mergeById(results.map((r) => r.events)) };
}

function mergeById(lists: CalEvent[][]): CalEvent[] {
  const byId = new Map<string, CalEvent>();
  for (const list of lists) for (const e of list) byId.set(e.id, e);
  return [...byId.values()];
}

/** Fetch Google events around the cursor for accounts whose fetched windows don't cover it. */
function extendGoogleToCursor(): void {
  const { accounts, cursor } = useStore.getState();
  const at = new Date(cursor);
  for (const account of accounts) {
    if (account.needsReconnect) continue;
    const key = sourceKeyFor.google(account.id);
    const windows = googleWindows.get(account.id);
    // No window yet means a full sync is pending/running and will consider the cursor itself.
    if (!windows || inflight.has(key) || extending.has(key) || covers(windows, at)) continue;

    const w = cursorWindow(at);
    extending.add(key);
    void (async () => {
      try {
        const { events } = await fetchGoogleSource(account.id, new Date(w.start), new Date(w.end));
        const now = useStore.getState();
        if (!sourceExists(now, key)) return;
        const merged = mergeById([now.eventsBySource[key] ?? [], events]);
        now.setEventsForSource(key, merged);
        googleWindows.set(account.id, [...(googleWindows.get(account.id) ?? []), w]);
        await saveSourceEvents(key, merged).catch(() => undefined);
      } catch {
        // Errors surface on the next full sync; navigation shouldn't flash error states.
      }
    })().finally(() => extending.delete(key));
  }
}

/** Sync every Google account and feed now. Safe to call repeatedly (deduped). */
export function syncAll(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve();
  syncAllPromise ??= (async () => {
    const { accounts, feeds } = useStore.getState();
    const keys = [
      ...accounts.filter((a) => !a.needsReconnect).map((a) => sourceKeyFor.google(a.id)),
      ...feeds.map((f) => sourceKeyFor.feed(f)),
    ];
    await Promise.allSettled(keys.map(syncSource));
    lastFullSync = Date.now();
  })().finally(() => {
    syncAllPromise = null;
  });
  return syncAllPromise;
}

let hydrated: Promise<void> | null = null;

/** Loads cached events once per page load, dropping cache entries for removed sources. */
function hydrateFromCache(): Promise<void> {
  hydrated ??= loadAllSourceEvents()
    .then((cached) => {
      const keys = activeSourceKeys(useStore.getState());
      const keep: Record<string, CalEvent[]> = {};
      for (const [key, events] of Object.entries(cached)) {
        if (keys.has(key)) keep[key] = events;
        else void deleteSourceEvents(key).catch(() => undefined);
      }
      useStore.getState().hydrateEvents(keep);
    })
    .catch(() => undefined);
  return hydrated;
}

/** Reacts to added/removed/changed sources and cursor moves. Returns an unsubscribe. */
function watchStore(): () => void {
  let cursorTimer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = useStore.subscribe((state, prev) => {
    if (state.accounts !== prev.accounts || state.feeds !== prev.feeds) {
      const before = activeSourceKeys(prev);
      const after = activeSourceKeys(state);
      for (const key of after) if (!before.has(key)) void syncSource(key);
      for (const key of before) {
        if (after.has(key)) continue;
        void deleteSourceEvents(key).catch(() => undefined);
        if (key.startsWith('google:')) googleWindows.delete(key.slice('google:'.length));
      }
      for (const feed of state.feeds) {
        const old = prev.feeds.find((f) => f.id === feed.id && f.kind === feed.kind);
        if (old && old.url !== feed.url) void syncSource(sourceKeyFor.feed(feed));
      }
    }
    if (state.cursor !== prev.cursor) {
      clearTimeout(cursorTimer);
      cursorTimer = setTimeout(extendGoogleToCursor, 400);
    }
  });
  return () => {
    clearTimeout(cursorTimer);
    unsubscribe();
  };
}

/**
 * Mount once in <App/>: hydrates cached events from IndexedDB, syncs on open,
 * every SYNC_INTERVAL_MS, and when the tab regains focus / comes back online.
 */
export function useSync(): void {
  useEffect(() => {
    let disposed = false;
    void hydrateFromCache().then(() => {
      if (!disposed) void syncAll();
    });
    // Preload GIS so the consent popup opens within the click's user-activation window.
    const preload = GOOGLE_CLIENT_ID ? setTimeout(() => void loadGoogleIdentity().catch(() => undefined), 1500) : undefined;

    const interval = setInterval(() => void syncAll(), SYNC_INTERVAL_MS);
    const syncIfStale = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFullSync > STALE_AFTER_MS) void syncAll();
    };
    window.addEventListener('focus', syncIfStale);
    window.addEventListener('online', syncIfStale);
    document.addEventListener('visibilitychange', syncIfStale);
    const unwatch = watchStore();

    return () => {
      disposed = true;
      clearTimeout(preload);
      clearInterval(interval);
      window.removeEventListener('focus', syncIfStale);
      window.removeEventListener('online', syncIfStale);
      document.removeEventListener('visibilitychange', syncIfStale);
      unwatch();
    };
  }, []);
}
