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
}

export interface SyncStatus {
  state: 'idle' | 'loading' | 'error';
  error?: string;
  /** Epoch ms of last successful sync. */
  lastSync?: number;
}
