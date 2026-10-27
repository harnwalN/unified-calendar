import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  CalendarInfo,
  CalEvent,
  ClassInfo,
  GoogleAccount,
  IcsFeed,
  ImportedSource,
  PersonalTask,
  RunningTimer,
  Settings,
  SyncedData,
  SyncStatus,
  TaskFields,
  TaskMeta,
  TaskRef,
  TaskStatus,
  TimeEntry,
  ViewMode,
} from '../types';

/**
 * Source keys group calendars/events by who syncs them:
 *   `google:<accountId>`, `canvas:<feedId>`, `ics:<feedId>`, `pl:<courseInstanceId>`.
 */
export const sourceKeyFor = {
  google: (accountId: string) => `google:${accountId}`,
  feed: (feed: Pick<IcsFeed, 'kind' | 'id'>) => `${feed.kind}:${feed.id}`,
};

export const taskRef = {
  assignment: (uid: string): TaskRef => `a:${uid}`,
  personal: (id: string): TaskRef => `t:${id}`,
  parse: (ref: TaskRef): { kind: 'assignment' | 'personal'; id: string } => ({
    kind: ref.startsWith('a:') ? 'assignment' : 'personal',
    id: ref.slice(2),
  }),
};

export const newId = () => crypto.randomUUID();

const defaultTaskFields = (): TaskFields => ({ status: 'todo', priority: 'none', subtasks: [] });

export interface AppState extends SyncedData {
  // ---- persisted (localStorage); SyncedData fields also sync via Drive ----
  settings: Settings;
  accounts: GoogleAccount[];
  feeds: IcsFeed[];
  /** Keyed by CalendarInfo.id. Colors/visibility the user picked survive re-syncs. */
  calendars: Record<string, CalendarInfo>;
  runningTimer: RunningTimer | null;
  view: ViewMode;
  /** Full day/week/month/agenda calendar expanded below the week strip. */
  calendarOpen: boolean;
  onboarded: boolean;

  // ---- runtime only (events are cached in IndexedDB by lib/db.ts) ----
  eventsBySource: Record<string, CalEvent[]>;
  syncStatus: Record<string, SyncStatus>;
  /** ISO date the calendar views are centred on. */
  cursor: string;
  search: string;
  selectedEventId: string | null;
  /** Task open in the TaskDetail drawer. */
  selectedTaskRef: TaskRef | null;
  settingsOpen: boolean;
  timePageOpen: boolean;
  sidebarOpen: boolean;

  // ---- UI actions ----
  setView: (view: ViewMode) => void;
  setCalendarOpen: (open: boolean) => void;
  setCursor: (date: Date) => void;
  setSearch: (q: string) => void;
  selectEvent: (id: string | null) => void;
  selectTask: (ref: TaskRef | null) => void;
  setSettingsOpen: (open: boolean) => void;
  setTimePageOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setOnboarded: (v: boolean) => void;
  updateSettings: (patch: Partial<Settings>) => void;

  // ---- sources ----
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

  // ---- tasks ----
  /** Patch the planning overlay of an assignment (creates it on first use). */
  updateMeta: (uid: string, patch: Partial<TaskFields>) => void;
  /** Mark an assignment done / not done (kept for calendar views). */
  toggleDone: (uid: string) => void;
  /** Set status on either kind of task. */
  setTaskStatus: (ref: TaskRef, status: TaskStatus) => void;
  /** Patch planning fields on either kind of task. */
  updateTaskFields: (ref: TaskRef, patch: Partial<TaskFields>) => void;
  /** Create a personal/quick task; returns its id. */
  addTask: (task: Partial<Omit<PersonalTask, 'id' | 'createdAt' | 'updatedAt'>> & { title: string }) => string;
  updateTask: (id: string, patch: Partial<Omit<PersonalTask, 'id' | 'createdAt'>>) => void;
  deleteTask: (id: string) => void;

  // ---- classes ----
  addClass: (cls: Omit<ClassInfo, 'id' | 'updatedAt' | 'order'> & { order?: number }) => string;
  updateClass: (id: string, patch: Partial<Omit<ClassInfo, 'id'>>) => void;
  deleteClass: (id: string) => void;
  /** Move `fromId`'s aliases and personal tasks into `intoId`, then tombstone `fromId`. */
  mergeClasses: (fromId: string, intoId: string) => void;

  // ---- time tracking ----
  setRunningTimer: (timer: RunningTimer | null) => void;
  addTimeEntry: (entry: Omit<TimeEntry, 'id' | 'updatedAt'>) => string;
  updateTimeEntry: (id: string, patch: Partial<Pick<TimeEntry, 'start' | 'end' | 'taskRef'>>) => void;
  deleteTimeEntry: (id: string) => void;

  /** Add or replace an imported source (e.g. PrairieLearn course). */
  upsertImport: (source: Omit<ImportedSource, 'updatedAt'>) => void;
  deleteImport: (id: string) => void;

  /** Replace all synced records (used by Drive sync after a merge). */
  replaceSynced: (data: SyncedData) => void;
}

const defaultSettings: Settings = {
  theme: 'system',
  weekStartsOn: 0,
  remindersEnabled: false,
  reminderOffsetsMin: [1440, 60],
  hideCompleted: false,
  scene: 'mountains',
  sceneMode: 'page',
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

function patchMeta(meta: Record<string, TaskMeta>, uid: string, patch: Partial<TaskFields>) {
  const prev = meta[uid] ?? { uid, ...defaultTaskFields(), updatedAt: 0 };
  return { ...meta, [uid]: { ...prev, ...patch, uid, deleted: undefined, updatedAt: Date.now() } };
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      settings: defaultSettings,
      accounts: [],
      feeds: [],
      calendars: {},
      classes: {},
      meta: {},
      tasks: {},
      timeEntries: {},
      imports: {},
      runningTimer: null,
      view: 'week',
      calendarOpen: false,
      onboarded: false,

      eventsBySource: {},
      syncStatus: {},
      cursor: new Date().toISOString(),
      search: '',
      selectedEventId: null,
      selectedTaskRef: null,
      settingsOpen: false,
      timePageOpen: false,
      sidebarOpen: true,

      setView: (view) => set({ view }),
      setCalendarOpen: (calendarOpen) => set({ calendarOpen }),
      setCursor: (date) => set({ cursor: date.toISOString() }),
      setSearch: (search) => set({ search }),
      selectEvent: (selectedEventId) => set({ selectedEventId }),
      selectTask: (selectedTaskRef) => set({ selectedTaskRef }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setTimePageOpen: (timePageOpen) => set({ timePageOpen }),
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

      updateMeta: (uid, patch) => set((s) => ({ meta: patchMeta(s.meta, uid, patch) })),
      toggleDone: (uid) =>
        set((s) => ({
          meta: patchMeta(s.meta, uid, { status: s.meta[uid]?.status === 'done' ? 'todo' : 'done' }),
        })),
      setTaskStatus: (ref, status) => get().updateTaskFields(ref, { status }),
      updateTaskFields: (ref, patch) => {
        const { kind, id } = taskRef.parse(ref);
        if (kind === 'assignment') get().updateMeta(id, patch);
        else get().updateTask(id, patch);
      },
      addTask: (task) => {
        const id = newId();
        const now = Date.now();
        set((s) => ({
          tasks: {
            ...s.tasks,
            [id]: { ...defaultTaskFields(), list: 'personal', ...task, id, createdAt: now, updatedAt: now },
          },
        }));
        return id;
      },
      updateTask: (id, patch) =>
        set((s) =>
          s.tasks[id] ? { tasks: { ...s.tasks, [id]: { ...s.tasks[id], ...patch, updatedAt: Date.now() } } } : {},
        ),
      deleteTask: (id) => get().updateTask(id, { deleted: true }),

      addClass: (cls) => {
        const id = newId();
        set((s) => {
          const order = cls.order ?? Object.values(s.classes).filter((c) => !c.deleted).length;
          return { classes: { ...s.classes, [id]: { ...cls, id, order, updatedAt: Date.now() } } };
        });
        return id;
      },
      updateClass: (id, patch) =>
        set((s) =>
          s.classes[id]
            ? { classes: { ...s.classes, [id]: { ...s.classes[id], ...patch, updatedAt: Date.now() } } }
            : {},
        ),
      deleteClass: (id) => get().updateClass(id, { deleted: true }),
      mergeClasses: (fromId, intoId) =>
        set((s) => {
          const from = s.classes[fromId];
          const into = s.classes[intoId];
          if (!from || !into || fromId === intoId) return {};
          const now = Date.now();
          const tasks = { ...s.tasks };
          for (const t of Object.values(tasks)) {
            if (t.classId === fromId) tasks[t.id] = { ...t, classId: intoId, updatedAt: now };
          }
          return {
            tasks,
            classes: {
              ...s.classes,
              [intoId]: { ...into, aliases: [...new Set([...into.aliases, ...from.aliases])], updatedAt: now },
              [fromId]: { ...from, aliases: [], deleted: true, updatedAt: now },
            },
          };
        }),

      setRunningTimer: (runningTimer) => set({ runningTimer }),
      addTimeEntry: (entry) => {
        const id = newId();
        set((s) => ({ timeEntries: { ...s.timeEntries, [id]: { ...entry, id, updatedAt: Date.now() } } }));
        return id;
      },
      updateTimeEntry: (id, patch) =>
        set((s) =>
          s.timeEntries[id]
            ? { timeEntries: { ...s.timeEntries, [id]: { ...s.timeEntries[id], ...patch, updatedAt: Date.now() } } }
            : {},
        ),
      deleteTimeEntry: (id) =>
        set((s) =>
          s.timeEntries[id]
            ? { timeEntries: { ...s.timeEntries, [id]: { ...s.timeEntries[id], deleted: true, updatedAt: Date.now() } } }
            : {},
        ),

      upsertImport: (source) =>
        set((s) => ({ imports: { ...s.imports, [source.id]: { ...source, deleted: undefined, updatedAt: Date.now() } } })),
      deleteImport: (id) =>
        set((s) =>
          s.imports[id]
            ? { imports: { ...s.imports, [id]: { ...s.imports[id], events: [], deleted: true, updatedAt: Date.now() } } }
            : {},
        ),

      replaceSynced: ({ classes, meta, tasks, timeEntries, imports }) =>
        set({ classes, meta, tasks, timeEntries, imports }),
    }),
    {
      name: 'unified-calendar',
      version: 2,
      partialize: (s) => ({
        settings: s.settings,
        accounts: s.accounts,
        feeds: s.feeds,
        calendars: s.calendars,
        classes: s.classes,
        meta: s.meta,
        tasks: s.tasks,
        timeEntries: s.timeEntries,
        imports: s.imports,
        runningTimer: s.runningTimer,
        view: s.view,
        calendarOpen: s.calendarOpen,
        onboarded: s.onboarded,
      }),
      migrate: (persisted, version) => migrateState(persisted as Record<string, unknown>, version),
      // Deep-merge settings so fields added later get their defaults on old saves.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return { ...current, ...p, settings: { ...current.settings, ...p.settings } };
      },
    },
  ),
);

/** v1 → v2: the `done` checklist becomes `meta[uid].status = 'done'`. Exported for tests. */
export function migrateState(state: Record<string, unknown>, version: number): Record<string, unknown> {
  if (version < 2) {
    const done = (state.done ?? {}) as Record<string, number>;
    const meta: Record<string, TaskMeta> = {};
    for (const [uid, at] of Object.entries(done)) {
      meta[uid] = { uid, ...defaultTaskFields(), status: 'done', updatedAt: at };
    }
    const { done: _done, ...rest } = state;
    return { ...rest, meta, classes: {}, tasks: {}, timeEntries: {}, imports: {}, runningTimer: null, calendarOpen: false };
  }
  return state;
}

/** True when an assignment uid is checked off. */
export const isDone = (s: Pick<AppState, 'meta'>, uid: string) => s.meta[uid]?.status === 'done';

/** `uid → updatedAt` for checked-off assignments (shape the older checklist helpers expect). */
export function doneMap(meta: Record<string, TaskMeta>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of Object.values(meta)) if (m.status === 'done' && !m.deleted) out[m.uid] = m.updatedAt;
  return out;
}
