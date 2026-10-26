// Shared data contracts. Every module (UI, sources, features) speaks these types.

export type SourceKind = 'google' | 'canvas' | 'ics';

export type ViewMode = 'day' | 'week' | 'month' | 'agenda';

export type Theme = 'system' | 'light' | 'dark';

/** One toggleable calendar row in the sidebar. */
export interface CalendarInfo {
  /** Globally unique, e.g. `google:<accountId>:<googleCalendarId>`, `canvas:<feedId>`, `ics:<feedId>`. */
  id: string;
  /** Which sync source owns this calendar (see `sourceKey` below). */
  sourceKey: string;
  kind: SourceKind;
  name: string;
  /** CSS color, e.g. "#1a73e8". */
  color: string;
  visible: boolean;
}

/** A single (already expanded, non-recurring) occurrence shown on the grid. */
export interface CalEvent {
  /** Unique across all sources; for recurring events include the occurrence start. */
  id: string;
  /** Stable identity used for the checklist and reminders (same across syncs). */
  uid: string;
  calendarId: string;
  title: string;
  /** ISO 8601 from `Date#toISOString()` (UTC, so strings sort chronologically). All-day: local midnight of the first day. */
  start: string;
  /** ISO 8601, exclusive. For all-day events: local midnight after the last day. */
  end: string;
  allDay: boolean;
  location?: string;
  description?: string;
  /** Link to open the event/assignment in its home app. */
  url?: string;
  /** "assignment" items get a checkbox and appear in Due Soon. */
  kind: 'event' | 'assignment';
  /** Canvas course label, e.g. "CSE 110". */
  course?: string;
}

export interface GoogleAccount {
  /** Google account `sub`. */
  id: string;
  email: string;
  name?: string;
  picture?: string;
  /** Long-lived token issued via the Worker's /google/exchange. */
  refreshToken: string;
  accessToken?: string;
  /** Epoch ms. */
  accessTokenExpiry?: number;
  /** Set when refresh fails (e.g. revoked / expired in testing mode); UI shows "Reconnect". */
  needsReconnect?: boolean;
}

/** A Canvas calendar feed or any other subscribed .ics link. */
export interface IcsFeed {
  id: string;
  kind: 'canvas' | 'ics';
  url: string;
  name: string;
  color: string;
}

export interface Settings {
  theme: Theme;
  weekStartsOn: 0 | 1;
  remindersEnabled: boolean;
  /** Minutes before an assignment's due time to notify, e.g. [1440, 60]. */
  reminderOffsetsMin: number[];
  /** Hide checked-off assignments from the grid (they always stay in the checklist). */
  hideCompleted: boolean;
  /** Google account whose Drive app-data folder syncs tasks/time across devices (per device). */
  syncAccountId?: string;
  /** Landscape art behind the home header; the sun follows the real time of day. */
  scene: SceneId | 'off';
  /** Optional location for accurate sunrise/sunset; otherwise estimated from the time zone. */
  sunLocation?: { lat: number; lon: number };
}

export type SceneId = 'mountains' | 'hills' | 'dunes' | 'coast' | 'city' | 'forest';

export interface SyncStatus {
  state: 'idle' | 'loading' | 'error';
  error?: string;
  /** Epoch ms of last successful sync. */
  lastSync?: number;
}

// ---------------------------------------------------------------------------
// Tasks, classes and time tracking (tasks-first redesign).
// Every record that syncs across devices (Drive app-data file) carries
// `updatedAt` (epoch ms) and an optional `deleted` tombstone so sync can merge
// per record with last-write-wins. Never hard-delete synced records.
// ---------------------------------------------------------------------------

export interface Synced {
  /** Epoch ms of the last local change. */
  updatedAt: number;
  /** Tombstone: hidden everywhere, kept so the deletion syncs. */
  deleted?: boolean;
}

export type TaskStatus = 'todo' | 'doing' | 'done';
export type Priority = 'none' | 'low' | 'medium' | 'high';

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

/** A scheduled work session for a task ("work on PA 3 Wed 2–3:30 PM"). */
export interface WorkBlock {
  id: string;
  /** ISO start. */
  start: string;
  durationMin: number;
}

/** Planning fields shared by Canvas/PrairieLearn assignments and personal tasks. */
export interface TaskFields {
  status: TaskStatus;
  priority: Priority;
  /** Local calendar day you plan to work on it, `yyyy-MM-dd`. */
  doDate?: string;
  notes?: string;
  subtasks: Subtask[];
  /** Estimated effort in minutes. */
  estimateMin?: number;
  /** Scheduled work sessions, possibly on several days. Shown on the calendar. */
  blocks?: WorkBlock[];
}

/** User overlay on an assignment that comes from a feed. Keyed by `CalEvent.uid`. */
export interface TaskMeta extends TaskFields, Synced {
  uid: string;
}

/** A to-do the user created in the app. */
export interface PersonalTask extends TaskFields, Synced {
  id: string;
  title: string;
  /** 'quick' = small unplannable items for short gaps. */
  list: 'personal' | 'quick';
  classId?: string;
  /** ISO from `Date#toISOString()`; optional deadline. */
  due?: string;
  createdAt: number;
}

/** A class/course. Course strings from every source map to one class via `aliases`. */
export interface ClassInfo extends Synced {
  id: string;
  name: string;
  color: string;
  /** Normalized course strings (see `normalizeCourse`) that belong to this class. */
  aliases: string[];
  order: number;
  hidden?: boolean;
}

/** Identifies a task: `a:<CalEvent.uid>` for assignments, `t:<PersonalTask.id>` for personal tasks. */
export type TaskRef = `a:${string}` | `t:${string}`;

export interface TimeEntry extends Synced {
  id: string;
  taskRef: TaskRef;
  /** ISO. */
  start: string;
  /** ISO. */
  end: string;
}

export interface RunningTimer {
  taskRef: TaskRef;
  /** ISO. Elapsed time is always derived from this, so it survives reloads/sleep. */
  start: string;
}

/**
 * Assignments pushed in from a site without a feed (PrairieLearn bookmarklet).
 * Stored and synced as data (not re-fetched); id doubles as the source key, e.g. `pl:<courseInstanceId>`.
 */
export interface ImportedSource extends Synced {
  id: string;
  kind: 'prairielearn';
  /** Course name shown in the UI. */
  name: string;
  /** Page the import came from. */
  url?: string;
  importedAt: number;
  events: CalEvent[];
}

/** Everything that syncs across devices, keyed by record id. */
export interface SyncedData {
  classes: Record<string, ClassInfo>;
  meta: Record<string, TaskMeta>;
  tasks: Record<string, PersonalTask>;
  timeEntries: Record<string, TimeEntry>;
  imports: Record<string, ImportedSource>;
}

/** Unified, read-only view of a task (assignment or personal) for the UI. Built by `useTasks()`. */
export interface TaskView extends TaskFields {
  ref: TaskRef;
  source: 'assignment' | 'personal';
  /** Which home-screen section it belongs to (before the Today override). */
  list: 'class' | 'personal' | 'quick';
  title: string;
  classId?: string;
  /** ISO due time (assignments: start === due). */
  due?: string;
  url?: string;
  /** Raw course string from the feed, if any. */
  course?: string;
  /** Calendar the assignment came from (for color/visibility). */
  calendarId?: string;
  /** Sum of finished time entries (ms); add live elapsed for a running timer in the UI. */
  timeTodayMs: number;
  timeTotalMs: number;
}
