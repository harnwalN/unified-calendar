import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  CalendarInfo,
  CalEvent,
  GoogleAccount,
  IcsFeed,
  Settings,
  SyncStatus,
  ViewMode,
} from '../types';

/**
 * Source keys group calendars/events by who syncs them:
 *   `google:<accountId>`, `canvas:<feedId>`, `ics:<feedId>`.
 */
export const sourceKeyFor = {
  google: (accountId: string) => `google:${accountId}`,
  feed: (feed: Pick<IcsFeed, 'kind' | 'id'>) => `${feed.kind}:${feed.id}`,
};

export interface AppState {
  // ---- persisted (localStorage) ----
  settings: Settings;
  accounts: GoogleAccount[];
  feeds: IcsFeed[];
  /** Keyed by CalendarInfo.id. Colors/visibility the user picked survive re-syncs. */
  calendars: Record<string, CalendarInfo>;
  /** Checklist: assignment uid -> epoch ms it was checked off. */
  done: Record<string, number>;
  view: ViewMode;
  onboarded: boolean;

  // ---- runtime only (events are cached in IndexedDB by lib/db.ts) ----
  eventsBySource: Record<string, CalEvent[]>;
  syncStatus: Record<string, SyncStatus>;
  /** ISO date the views are centred on. */
  cursor: string;
  search: string;
  selectedEventId: string | null;
  settingsOpen: boolean;
  sidebarOpen: boolean;

  // ---- actions ----
  setView: (view: ViewMode) => void;
  setCursor: (date: Date) => void;
  setSearch: (q: string) => void;
  selectEvent: (id: string | null) => void;
  setSettingsOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setOnboarded: (v: boolean) => void;
  updateSettings: (patch: Partial<Settings>) => void;

  upsertAccount: (account: GoogleAccount) => void;
  updateAccount: (id: string, patch: Partial<GoogleAccount>) => void;
  removeAccount: (id: string) => void;

  addFeed: (feed: IcsFeed) => void;
  updateFeed: (id: string, patch: Partial<IcsFeed>) => void;
  removeFeed: (id: string) => void;

  /**
   * Replace the calendar list for one source. Existing user-chosen color/visibility
   * are kept for ids that already exist; calendars no longer reported are dropped.
   */
  setCalendarsForSource: (sourceKey: string, cals: CalendarInfo[]) => void;
  updateCalendar: (id: string, patch: Partial<Pick<CalendarInfo, 'color' | 'visible' | 'name'>>) => void;

  setEventsForSource: (sourceKey: string, events: CalEvent[]) => void;
  /** Hydrate all sources at once (from the IndexedDB cache on startup). */
  hydrateEvents: (eventsBySource: Record<string, CalEvent[]>) => void;
  setSyncStatus: (sourceKey: string, status: SyncStatus) => void;

  toggleDone: (uid: string) => void;
}

const defaultSettings: Settings = {
  theme: 'system',
  weekStartsOn: 0,
  remindersEnabled: false,
  reminderOffsetsMin: [1440, 60],
  hideCompleted: false,
};

/** Remove everything belonging to one source key. */
function dropSource(
  s: Pick<AppState, 'calendars' | 'eventsBySource' | 'syncStatus'>,
  sourceKey: string,
) {
  const calendars = Object.fromEntries(
    Object.entries(s.calendars).filter(([, c]) => c.sourceKey !== sourceKey),
  );
  const { [sourceKey]: _e, ...eventsBySource } = s.eventsBySource;
  const { [sourceKey]: _s, ...syncStatus } = s.syncStatus;
  return { calendars, eventsBySource, syncStatus };
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      accounts: [],
      feeds: [],
      calendars: {},
      done: {},
      view: 'week',
      onboarded: false,

      eventsBySource: {},
      syncStatus: {},
      cursor: new Date().toISOString(),
      search: '',
      selectedEventId: null,
      settingsOpen: false,
      sidebarOpen: true,

      setView: (view) => set({ view }),
      setCursor: (date) => set({ cursor: date.toISOString() }),
      setSearch: (search) => set({ search }),
      selectEvent: (selectedEventId) => set({ selectedEventId }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setOnboarded: (onboarded) => set({ onboarded }),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      upsertAccount: (account) =>
        set((s) => ({
          accounts: s.accounts.some((a) => a.id === account.id)
            ? s.accounts.map((a) => (a.id === account.id ? { ...a, ...account } : a))
            : [...s.accounts, account],
        })),
      updateAccount: (id, patch) =>
        set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
      removeAccount: (id) =>
        set((s) => ({
          accounts: s.accounts.filter((a) => a.id !== id),
          ...dropSource(s, sourceKeyFor.google(id)),
        })),

      addFeed: (feed) => set((s) => ({ feeds: [...s.feeds, feed] })),
      updateFeed: (id, patch) =>
        set((s) => ({ feeds: s.feeds.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      removeFeed: (id) =>
        set((s) => {
          const feed = s.feeds.find((f) => f.id === id);
          return {
            feeds: s.feeds.filter((f) => f.id !== id),
            ...(feed ? dropSource(s, sourceKeyFor.feed(feed)) : {}),
          };
        }),

      setCalendarsForSource: (sourceKey, cals) =>
        set((s) => {
          const kept = Object.fromEntries(
            Object.entries(s.calendars).filter(([, c]) => c.sourceKey !== sourceKey),
          );
          for (const c of cals) {
            const prev = s.calendars[c.id];
            kept[c.id] = prev ? { ...c, color: prev.color, visible: prev.visible } : c;
          }
          return { calendars: kept };
        }),
      updateCalendar: (id, patch) =>
        set((s) =>
          s.calendars[id] ? { calendars: { ...s.calendars, [id]: { ...s.calendars[id], ...patch } } } : {},
        ),

      setEventsForSource: (sourceKey, events) =>
        set((s) => ({ eventsBySource: { ...s.eventsBySource, [sourceKey]: events } })),
      hydrateEvents: (eventsBySource) =>
        set((s) => ({ eventsBySource: { ...eventsBySource, ...s.eventsBySource } })),
      setSyncStatus: (sourceKey, status) =>
        set((s) => ({ syncStatus: { ...s.syncStatus, [sourceKey]: status } })),

      toggleDone: (uid) =>
        set((s) => {
          const done = { ...s.done };
          if (done[uid]) delete done[uid];
          else done[uid] = Date.now();
          return { done };
        }),
    }),
    {
      name: 'unified-calendar',
      version: 1,
      partialize: (s) => ({
        settings: s.settings,
        accounts: s.accounts,
        feeds: s.feeds,
        calendars: s.calendars,
        done: s.done,
        view: s.view,
        onboarded: s.onboarded,
      }),
    },
  ),
);
