export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

/** Base URL of the Cloudflare Worker (no trailing slash). */
export const WORKER_URL: string = (import.meta.env.VITE_WORKER_URL ?? '').replace(/\/$/, '');

export const SYNC_INTERVAL_MS = 10 * 60 * 1000;

/** Default palette (Google Calendar colors) for new feeds. */
export const PALETTE = [
  '#7986cb', '#33b679', '#8e24aa', '#e67c73', '#f6bf26', '#f4511e',
  '#039be5', '#616161', '#3f51b5', '#0b8043', '#d50000', '#ef6c00',
];
