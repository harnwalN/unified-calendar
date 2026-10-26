// Cross-device sync of tasks/classes/time via one JSON file in the Drive app-data folder
// of the account picked in Settings (settings.syncAccountId; per device).
import { useEffect } from 'react';
import { create } from 'zustand';
import { useStore, type AppState } from '../store';
import type { Synced, SyncedData } from '../types';
import { getAccessToken } from './google';
import { errorMessage } from './text';

export const SYNC_FILE_NAME = 'unified-calendar.json';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const SLICES = ['classes', 'meta', 'tasks', 'timeEntries', 'imports'] as const;
type Slice = (typeof SLICES)[number];

const DAY = 86_400_000;
export const TOMBSTONE_TTL_MS = 60 * DAY;
const PUSH_DEBOUNCE_MS = 3000;
const INTERVAL_MS = 5 * 60_000;
const FOCUS_STALE_MS = 60_000;

interface SyncFile {
  schema: 1;
  data: SyncedData;
}

// ---- pure merge ----

export const emptySynced = (): SyncedData => ({ classes: {}, meta: {}, tasks: {}, timeEntries: {}, imports: {} });

export function pickSynced(s: SyncedData): SyncedData {
  return { classes: s.classes, meta: s.meta, tasks: s.tasks, timeEntries: s.timeEntries, imports: s.imports };
}

/** Last-write-wins on `updatedAt`; a tombstone wins a tie, otherwise local does. */
function newer<T extends Synced>(local: T | undefined, remote: T | undefined): T | undefined {
  if (!local) return remote;
  if (!remote) return local;
  if (remote.updatedAt !== local.updatedAt) return remote.updatedAt > local.updatedAt ? remote : local;
  return remote.deleted && !local.deleted ? remote : local;
}

/**
 * Merge two copies of the synced data per record, dropping tombstones older than
 * `TOMBSTONE_TTL_MS`. Records that win keep their object identity.
 */
export function mergeSynced(local: SyncedData, remote: SyncedData, now = Date.now()): SyncedData {
  const out = emptySynced();
  for (const slice of SLICES) {
    const l = local[slice] as Record<string, Synced>;
    const r = remote[slice] as Record<string, Synced>;
    const merged: Record<string, Synced> = {};
    for (const key of new Set([...Object.keys(l), ...Object.keys(r)])) {
      const rec = newer(l[key], r[key]);
      if (rec && !(rec.deleted && now - rec.updatedAt > TOMBSTONE_TTL_MS)) merged[key] = rec;
    }
    (out as unknown as Record<Slice, Record<string, Synced>>)[slice] = merged;
  }
  return out;
}

/** Equal for sync purposes: same records with the same `updatedAt` / tombstone state. */
export function sameSynced(a: SyncedData, b: SyncedData): boolean {
  return SLICES.every((slice) => {
    const x = a[slice] as Record<string, Synced>;
    const y = b[slice] as Record<string, Synced>;
    const keys = Object.keys(x);
    if (keys.length !== Object.keys(y).length) return false;
    return keys.every((k) => {
      const p = x[k];
      const q = y[k];
      return p === q || (!!q && p.updatedAt === q.updatedAt && !!p.deleted === !!q.deleted);
    });
  });
}

const ID_FIELD: Record<Slice, string> = { classes: 'id', meta: 'uid', tasks: 'id', timeEntries: 'id', imports: 'id' };

/** Validates a downloaded file; malformed records are dropped rather than failing the sync. */
export function parseSyncFile(raw: unknown): SyncedData {
  const out = emptySynced();
  const data = (raw as Partial<SyncFile> | null)?.data;
  if (!raw || typeof raw !== 'object' || (raw as SyncFile).schema !== 1 || !data || typeof data !== 'object') return out;
  for (const slice of SLICES) {
    const src = (data as unknown as Record<string, unknown>)[slice];
    if (!src || typeof src !== 'object') continue;
    const dst: Record<string, unknown> = {};
    for (const [key, rec] of Object.entries(src as Record<string, unknown>)) {
      if (!rec || typeof rec !== 'object') continue;
      const r = rec as Record<string, unknown>;
      if (typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) && r[ID_FIELD[slice]] === key) dst[key] = rec;
    }
    (out as unknown as Record<Slice, Record<string, unknown>>)[slice] = dst;
  }
  return out;
}

// ---- status (for Settings) ----

export interface DriveSyncStatus {
  state: 'off' | 'idle' | 'syncing' | 'error';
  /** Epoch ms of the last successful sync. */
  lastSynced?: number;
  error?: string;
  /** Drive permission is missing/revoked; the user must grant it again. */
  needsConsent?: boolean;
}

export const useDriveSyncStatus = create<DriveSyncStatus>(() => ({ state: 'off' }));
const setStatus = (patch: Partial<DriveSyncStatus>) => useDriveSyncStatus.setState(patch);

// ---- Drive REST ----

class DriveError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly needsConsent = false,
  ) {
    super(message);
  }
}

interface DriveFile {
  id: string;
  version?: string;
  modifiedTime?: string;
}

async function driveFetch(accountId: string, url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const token = await getAccessToken(accountId, attempt > 0);
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
    } catch {
      throw new Error("Couldn't reach Google Drive. Check your internet connection.");
    }
    if (res.status === 401 && attempt === 0) continue;
    if (res.ok) return res;
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string; errors?: { reason?: string }[] };
    } | null;
    const reasons = body?.error?.errors?.map((e) => e.reason) ?? [];
    const scopeMissing =
      res.status === 401 ||
      (res.status === 403 && (reasons.includes('insufficientPermissions') || /scope/i.test(body?.error?.message ?? '')));
    if (scopeMissing) throw new DriveError(res.status, 'Google Drive access is missing. Grant it again to keep syncing.', true);
    throw new DriveError(res.status, body?.error?.message || `Google Drive error ${res.status}`);
  }
}

async function listSyncFiles(accountId: string): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name='${SYNC_FILE_NAME}' and trashed=false`,
    fields: 'files(id,version,modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: '10',
  });
  const res = await driveFetch(accountId, `${DRIVE_API}/files?${params}`);
  return ((await res.json()) as { files?: DriveFile[] }).files ?? [];
}

async function fileVersion(accountId: string, id: string): Promise<string | undefined> {
  const res = await driveFetch(accountId, `${DRIVE_API}/files/${id}?fields=version`);
  return ((await res.json()) as DriveFile).version;
}

async function download(accountId: string, id: string): Promise<SyncedData> {
  const res = await driveFetch(accountId, `${DRIVE_API}/files/${id}?alt=media`);
  return parseSyncFile(await res.json().catch(() => null));
}

async function upload(accountId: string, data: SyncedData, fileId?: string): Promise<DriveFile> {
  const content = JSON.stringify({ schema: 1, data } satisfies SyncFile);
  if (fileId) {
    const res = await driveFetch(accountId, `${DRIVE_UPLOAD}/files/${fileId}?uploadType=media&fields=id,version`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: content,
    });
    return (await res.json()) as DriveFile;
  }
  const boundary = `uc-${crypto.randomUUID()}`;
  const metadata = { name: SYNC_FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
  const res = await driveFetch(accountId, `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,version`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return (await res.json()) as DriveFile;
}

// ---- sync loop ----

let running: Promise<void> | null = null;
let rerun = false;
/** True while we apply a merge, so our own store write doesn't schedule a push. */
let applying = false;

const syncAccountId = () => useStore.getState().settings.syncAccountId;

/** Pull, merge, apply locally and push if Drive is behind. Single-flight; a call during a run queues one more. */
export function syncDriveNow(): Promise<void> {
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    do {
      rerun = false;
      await syncOnce();
    } while (rerun && syncAccountId());
  })().finally(() => {
    running = null;
  });
  return running;
}

async function syncOnce(): Promise<void> {
  const accountId = syncAccountId();
  if (!accountId) return setStatus({ state: 'off', error: undefined, needsConsent: false });
  const account = useStore.getState().accounts.find((a) => a.id === accountId);
  if (!account) return setStatus({ state: 'error', error: 'The sync account is no longer connected.' });
  if (account.needsReconnect) {
    return setStatus({ state: 'error', error: `Reconnect ${account.email} to keep syncing.`, needsConsent: false });
  }
  setStatus({ state: 'syncing' });
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const files = await listSyncFiles(accountId);
      // Normally one file; if two devices raced to create it, fold the extras in.
      const remotes = await Promise.all(files.map((f) => download(accountId, f.id)));
      if (syncAccountId() !== accountId) return;

      // Synchronous from here to replaceSynced, so no local edit can slip in between.
      const remote = remotes.reduce((acc, r) => mergeSynced(acc, r), emptySynced());
      const local = pickSynced(useStore.getState());
      const merged = mergeSynced(local, remote);
      if (!sameSynced(merged, local)) {
        applying = true;
        try {
          useStore.getState().replaceSynced(merged);
        } finally {
          applying = false;
        }
      }

      const target = files[0];
      if (target && files.length === 1 && sameSynced(merged, remotes[0])) break;
      // Someone else wrote since we listed: start over with their version (once).
      if (target && attempt === 0 && (await fileVersion(accountId, target.id)) !== target.version) continue;
      await upload(accountId, merged, target?.id);
      for (const extra of files.slice(1)) {
        void driveFetch(accountId, `${DRIVE_API}/files/${extra.id}`, { method: 'DELETE' }).catch(() => undefined);
      }
      break;
    }
    if (syncAccountId() === accountId) setStatus({ state: 'idle', lastSynced: Date.now(), error: undefined, needsConsent: false });
  } catch (err) {
    if (syncAccountId() !== accountId) return;
    setStatus({ state: 'error', error: errorMessage(err), needsConsent: err instanceof DriveError && err.needsConsent });
  }
}

const slicesChanged = (a: AppState, b: AppState) => SLICES.some((s) => a[s] !== b[s]);

/** Mount once in <App/>: syncs SyncedData with the Drive app-data file of settings.syncAccountId. */
export function useDriveSync(): void {
  const accountId = useStore((s) => s.settings.syncAccountId);
  const accountKnown = useStore((s) => !!accountId && s.accounts.some((a) => a.id === accountId));

  useEffect(() => {
    // Never push dev mock data into a real Drive.
    const mock = import.meta.env.DEV && new URLSearchParams(location.search).has('mock');
    if (!accountId || !accountKnown || mock) {
      setStatus({ state: 'off', error: undefined, needsConsent: false, lastSynced: undefined });
      return;
    }
    let pushTimer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      clearTimeout(pushTimer);
      pushTimer = undefined;
      if (navigator.onLine !== false) void syncDriveNow();
    };
    sync();

    const interval = setInterval(sync, INTERVAL_MS);
    const onFocus = () => {
      const last = useDriveSyncStatus.getState().lastSynced ?? 0;
      if (document.visibilityState === 'visible' && Date.now() - last > FOCUS_STALE_MS) sync();
    };
    // Flush a pending push before the tab is hidden (it may be closed next).
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && pushTimer) sync();
      else onFocus();
    };
    const unsubscribe = useStore.subscribe((state, prev) => {
      if (applying || !slicesChanged(state, prev)) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(sync, PUSH_DEBOUNCE_MS);
    });
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(pushTimer);
      clearInterval(interval);
      unsubscribe();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [accountId, accountKnown]);
}

