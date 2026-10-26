// Google Calendar via Google Identity Services (popup code flow) + the Worker token proxy.
import { GOOGLE_CLIENT_ID, WORKER_URL } from '../config';
import { deleteSourceEvents } from '../lib/db';
import { sourceKeyFor, useStore } from '../store';
import type { CalendarInfo, CalEvent, GoogleAccount } from '../types';
import { syncSource } from './sync';
import { htmlToText, localDate } from './text';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const SCOPES = `openid email profile ${CALENDAR_SCOPE}`;
const API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_MIN_LIFETIME_MS = 60_000;

// ---- minimal Google Identity Services typings ----
interface CodeResponse {
  code?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}
interface GisError {
  type: 'popup_closed' | 'popup_failed_to_open' | 'unknown' | string;
  message?: string;
}
interface CodeClientConfig {
  client_id: string;
  scope: string;
  ux_mode: 'popup' | 'redirect';
  callback: (resp: CodeResponse) => void;
  error_callback?: (err: GisError) => void;
  select_account?: boolean;
  prompt?: string;
  hint?: string;
  login_hint?: string;
}
interface CodeClient {
  requestCode(): void;
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: { initCodeClient(config: CodeClientConfig): CodeClient } } };
  }
}

let gisPromise: Promise<void> | null = null;

/** Loads the GIS script once. Called early (on app start) so the popup opens within the click's activation window. */
export function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisPromise = null;
      script.remove();
      reject(new Error("Couldn't load Google sign-in. Check your connection or ad blocker."));
    };
    document.head.appendChild(script);
  });
  return gisPromise;
}

function requireConfig(): void {
  if (!GOOGLE_CLIENT_ID) throw new Error('Google sign-in is not configured (VITE_GOOGLE_CLIENT_ID is empty).');
  if (!WORKER_URL) throw new Error('The calendar proxy is not configured (VITE_WORKER_URL is empty).');
}

async function workerPost<T>(path: string, body: unknown): Promise<{ status: number; data: T & { error?: string } }> {
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the calendar proxy. Check your internet connection.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  return { status: res.status, data };
}

function requestCode(loginHint?: string): Promise<CodeResponse> {
  return new Promise((resolve, reject) => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) return reject(new Error('Google sign-in failed to initialise.'));
    const client = oauth2.initCodeClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      ux_mode: 'popup',
      // consent guarantees Google issues a refresh token even if the app was authorised before
      prompt: 'consent select_account',
      select_account: true,
      hint: loginHint,
      login_hint: loginHint,
      callback: (resp) => {
        if (resp.error || !resp.code) reject(new Error(resp.error_description || resp.error || 'Google sign-in failed.'));
        else resolve(resp);
      },
      error_callback: (err) => {
        if (err.type === 'popup_closed') reject(new Error('Sign-in was cancelled.'));
        else if (err.type === 'popup_failed_to_open') reject(new Error('The sign-in popup was blocked. Allow popups and try again.'));
        else reject(new Error(err.message || 'Google sign-in failed.'));
      },
    });
    client.requestCode();
  });
}

interface ExchangeResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  profile: { sub: string; email?: string; name?: string; picture?: string };
}

export async function connectGoogleAccount(loginHint?: string): Promise<GoogleAccount> {
  requireConfig();
  await loadGoogleIdentity();
  const resp = await requestCode(loginHint);
  if (resp.scope && !resp.scope.split(' ').includes(CALENDAR_SCOPE)) {
    throw new Error('Calendar access was not granted. Please tick the calendar permission and try again.');
  }
  const { status, data } = await workerPost<ExchangeResponse>('/google/exchange', { code: resp.code });
  if (status !== 200 || !data.refresh_token) throw new Error(data.error || `Sign-in failed (${status}).`);

  const account: GoogleAccount = {
    id: data.profile.sub,
    email: data.profile.email ?? '',
    name: data.profile.name,
    picture: data.profile.picture,
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    accessTokenExpiry: Date.now() + data.expires_in * 1000,
    needsReconnect: false,
  };
  useStore.getState().upsertAccount(account);
  await syncSource(sourceKeyFor.google(account.id));
  return account;
}

export async function disconnectGoogleAccount(accountId: string): Promise<void> {
  const account = useStore.getState().accounts.find((a) => a.id === accountId);
  if (account && WORKER_URL) {
    // Revoking the refresh token also invalidates its access tokens.
    await workerPost('/google/revoke', { token: account.refreshToken }).catch(() => undefined);
  }
  useStore.getState().removeAccount(accountId);
  await deleteSourceEvents(sourceKeyFor.google(accountId)).catch(() => undefined);
}

// ---- access tokens ----

const refreshing = new Map<string, Promise<string>>();

export async function getAccessToken(accountId: string, forceRefresh = false): Promise<string> {
  const account = useStore.getState().accounts.find((a) => a.id === accountId);
  if (!account) throw new Error('Google account not found.');
  if (
    !forceRefresh &&
    account.accessToken &&
    (account.accessTokenExpiry ?? 0) - Date.now() > TOKEN_MIN_LIFETIME_MS
  ) {
    return account.accessToken;
  }
  let p = refreshing.get(accountId);
  if (!p) {
    p = refreshAccessToken(account).finally(() => refreshing.delete(accountId));
    refreshing.set(accountId, p);
  }
  return p;
}

async function refreshAccessToken(account: GoogleAccount): Promise<string> {
  requireConfig();
  const { status, data } = await workerPost<{ access_token: string; expires_in: number }>('/google/refresh', {
    refresh_token: account.refreshToken,
  });
  const { updateAccount } = useStore.getState();
  if (status === 401) {
    updateAccount(account.id, { needsReconnect: true, accessToken: undefined, accessTokenExpiry: undefined });
    throw new Error(`Google access for ${account.email || 'this account'} expired. Reconnect to keep syncing.`);
  }
  if (status !== 200 || !data.access_token) throw new Error(data.error || `Couldn't refresh Google access (${status}).`);
  updateAccount(account.id, {
    accessToken: data.access_token,
    accessTokenExpiry: Date.now() + data.expires_in * 1000,
    needsReconnect: false,
  });
  return data.access_token;
}

class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** GET a Calendar API URL, forcing one token refresh + retry on 401. */
async function apiGet<T>(accountId: string, url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const token = await getAccessToken(accountId, attempt > 0);
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      throw new Error("Couldn't reach Google Calendar. Check your internet connection.");
    }
    if (res.status === 401 && attempt === 0) continue;
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new GoogleApiError(res.status, body?.error?.message || `Google Calendar error ${res.status}`);
    }
    return (await res.json()) as T;
  }
}

// ---- Calendar API ----

interface CalendarListEntry {
  id: string;
  summary?: string;
  summaryOverride?: string;
  backgroundColor?: string;
  selected?: boolean;
}
interface GEventTime {
  date?: string;
  dateTime?: string;
}
interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: GEventTime;
  end?: GEventTime;
}
interface Page<T> {
  items?: T[];
  nextPageToken?: string;
}

async function listAll<T>(accountId: string, baseUrl: string): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(baseUrl);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await apiGet<Page<T>>(accountId, url.toString());
    out.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

function parseGoogleTime(t: GEventTime | undefined): Date | null {
  if (t?.dateTime) return new Date(t.dateTime);
  if (t?.date) return localDate(t.date);
  return null;
}

export function mapGoogleEvent(ev: GEvent, calendarId: string, googleCalId: string): CalEvent | null {
  if (ev.status === 'cancelled') return null;
  const start = parseGoogleTime(ev.start);
  if (!start) return null;
  const allDay = !ev.start?.dateTime;
  let end = parseGoogleTime(ev.end) ?? start;
  if (allDay && end <= start) end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  const uid = `${googleCalId}:${ev.id}`;
  return {
    // uid is stable per Google calendar; id is also unique when two accounts share a calendar.
    id: `${calendarId}:${ev.id}`,
    uid,
    calendarId,
    title: ev.summary?.trim() || '(No title)',
    start: start.toISOString(),
    end: end.toISOString(),
    allDay,
    location: ev.location?.trim() || undefined,
    description: ev.description ? htmlToText(ev.description) || undefined : undefined,
    url: ev.htmlLink,
    kind: 'event',
  };
}

export async function fetchGoogleSource(
  accountId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<{ calendars: CalendarInfo[]; events: CalEvent[] }> {
  const sourceKey = sourceKeyFor.google(accountId);
  const list = await listAll<CalendarListEntry>(
    accountId,
    `${API}/users/me/calendarList?minAccessRole=reader&maxResults=250`,
  );
  const calendars: CalendarInfo[] = list.map((c) => ({
    id: `${sourceKey}:${c.id}`,
    sourceKey,
    kind: 'google',
    name: c.summaryOverride || c.summary || c.id,
    color: c.backgroundColor || '#1a73e8',
    visible: c.selected !== false,
  }));

  const perCalendar = await Promise.all(
    list.map(async (c, i) => {
      const params = new URLSearchParams({
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '2500',
        timeMin: rangeStart.toISOString(),
        timeMax: rangeEnd.toISOString(),
        fields: 'nextPageToken,items(id,status,summary,description,location,htmlLink,start,end)',
      });
      try {
        const items = await listAll<GEvent>(
          accountId,
          `${API}/calendars/${encodeURIComponent(c.id)}/events?${params}`,
        );
        return items.flatMap((ev) => mapGoogleEvent(ev, calendars[i].id, c.id) ?? []);
      } catch (err) {
        // One inaccessible calendar (e.g. unshared since listing) shouldn't fail the account.
        if (err instanceof GoogleApiError && (err.status === 403 || err.status === 404)) return [];
        throw err;
      }
    }),
  );
  return { calendars, events: perCalendar.flat() };
}
