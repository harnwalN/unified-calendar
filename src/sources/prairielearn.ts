// PrairieLearn has no calendar feed: a bookmarklet scrapes the student assessments page and
// hands the deadlines to this app via `#import=<base64url(JSON)>`; they're stored as an ImportedSource.
import { useEffect } from 'react';
import { useStore } from '../store';
import type { CalendarInfo, CalEvent, ImportedSource } from '../types';
import { courseColor } from './canvas';
import { errorMessage } from './text';

const MAX_HASH_CHARS = 300_000;
const MAX_ITEMS = 500;

/** What the bookmarklet sends. */
export interface PlPayload {
  v: 1;
  /** Course instance id from `/pl/course_instance/<id>/…`. */
  ciid: string;
  course: string;
  /** `document.title`, a fallback for the course name. */
  pageTitle?: string;
  url?: string;
  items: PlItem[];
}

export interface PlItem {
  /** Badge such as "HW3". */
  label: string;
  title: string;
  href: string;
  /** Raw deadline text from the row, e.g. "100% until 23:59, Fri, Oct 30 (PDT)". */
  due: string;
}

// ---- bookmarklet ----

// Plain ES5 kept as a string so the build never rewrites it. Runs on PrairieLearn, not in this app.
const EXTRACTOR = `
var m = location.pathname.match(/\\/course_instance\\/(\\d+)/);
var links = document.querySelectorAll('a[href*="/assessment/"]');
if (!m || !links.length) {
  alert('Open the Assessments page of a PrairieLearn course (…/course_instance/…/assessments), then click “Send to Calendar” again.');
  return;
}
function t(el) { return el ? (el.textContent || '').replace(/\\s+/g, ' ').trim() : ''; }
var course = '';
var sels = ['[data-testid="course-title"]', '#main-nav .navbar-brand + * a.dropdown-toggle', '.navbar .nav-item .dropdown-toggle', '.navbar-text', 'h1'];
for (var i = 0; i < sels.length && !course; i++) {
  var c = t(document.querySelector(sels[i]));
  if (c && !/^(prairielearn|assessments)$/i.test(c)) course = c;
}
var rows = [], items = [];
for (var j = 0; j < links.length; j++) {
  var a = links[j];
  var row = a.closest('tr') || a.closest('li') || a.parentElement;
  if (!row || rows.indexOf(row) >= 0) continue;
  rows.push(row);
  var due = '';
  var cells = row.querySelectorAll('td, .col, div, span');
  for (var k = 0; k < cells.length && !due; k++) {
    var x = t(cells[k]);
    if (/until|due|\\d{1,2}:\\d{2}/i.test(x) && x.length < 300) due = x;
  }
  items.push({ label: t(row.querySelector('.badge')), title: t(a), href: a.href, due: due });
}
var p = { v: 1, ciid: m[1], course: course, pageTitle: document.title, url: location.href, items: items };
var b = btoa(unescape(encodeURIComponent(JSON.stringify(p)))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
var dest = APP + '#import=' + b;
if (!window.open(dest, '_blank')) location.href = dest;
`;

/** `javascript:` URL for the "Send to Calendar" bookmarklet; `appUrl` is where this app is hosted. */
export function bookmarkletSource(appUrl: string): string {
  const app = appUrl.split('#')[0];
  const body = EXTRACTOR.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
  return `javascript:${encodeURIComponent(`(function(){var APP=${JSON.stringify(app)};\n${body}\n})();`)}`;
}

// ---- due-date parsing ----

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const TZ_OFFSET_H: Record<string, number> = {
  UTC: 0, GMT: 0, Z: 0, HST: -10, AKST: -9, AKDT: -8, PST: -8, PDT: -7, MST: -7, MDT: -6,
  CST: -6, CDT: -5, EST: -5, EDT: -4, AST: -4, ADT: -3, BST: 1, CET: 1, CEST: 2, IST: 5.5,
};

/**
 * Deadline from PrairieLearn's credit text, e.g. "100% until 23:59, Fri, Oct 30 (PDT)" → ISO.
 * Uses the first deadline when several are listed; infers the year closest to `now`.
 */
export function parsePrairieLearnDue(text: string, now = new Date()): string | undefined {
  const parts = text.split(/\buntil\b/i);
  const s = parts.length > 1 ? parts[1] : text;

  const time = /\b(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?/i.exec(s);
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s);
  const named = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4}))?/i.exec(s);
  if (!time || (!iso && !named)) return undefined;

  let hour = Number(time[1]);
  const minute = Number(time[2]);
  const ampm = time[3]?.[0].toLowerCase();
  if (ampm === 'p' && hour < 12) hour += 12;
  if (ampm === 'a' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return undefined;

  const month = iso ? Number(iso[2]) - 1 : MONTHS.indexOf(named![1].toLowerCase());
  const day = Number(iso ? iso[3] : named![2]);
  if (day < 1 || day > 31) return undefined;
  const explicitYear = iso ? Number(iso[1]) : named![3] ? Number(named![3]) : undefined;

  const tz = s.slice(time.index).match(/\b[A-Z]{1,5}\b/g)?.find((w) => w in TZ_OFFSET_H);
  const offset = tz ? TZ_OFFSET_H[tz] : undefined;
  const build = (year: number) =>
    offset === undefined
      ? new Date(year, month, day, hour, minute)
      : new Date(Date.UTC(year, month, day, hour, minute) - offset * 3_600_000);

  if (explicitYear) return build(explicitYear).toISOString();
  const y = now.getFullYear();
  const best = [y - 1, y, y + 1]
    .map(build)
    .reduce((a, b) => (Math.abs(b.getTime() - now.getTime()) < Math.abs(a.getTime() - now.getTime()) ? b : a));
  return best.toISOString();
}

// ---- payload → events ----

/** Decodes and validates `#import=` data. Throws a user-facing message on bad input. */
export function decodePayload(encoded: string): PlPayload {
  if (encoded.length > MAX_HASH_CHARS) throw new Error('That import is too large.');
  let raw: unknown;
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('That import link is damaged. Run the bookmarklet again.');
  }
  const p = raw as Partial<PlPayload> | null;
  const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');
  if (!p || p.v !== 1 || typeof p.ciid !== 'string' || !/^\d{1,12}$/.test(p.ciid) || !Array.isArray(p.items)) {
    throw new Error('That doesn’t look like a PrairieLearn import.');
  }
  return {
    v: 1,
    ciid: p.ciid,
    course: str(p.course, 200),
    pageTitle: str(p.pageTitle, 200),
    url: safeUrl(p.url),
    items: p.items.slice(0, MAX_ITEMS).flatMap((it: Partial<PlItem>) =>
      it && typeof it === 'object'
        ? [{ label: str(it.label, 50), title: str(it.title, 300), href: safeUrl(it.href) ?? '', due: str(it.due) }]
        : [],
    ),
  };
}

function safeUrl(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** "Assessments | CSE 110: Software Eng | PrairieLearn" → "CSE 110: Software Eng". */
function courseName(p: PlPayload): string {
  if (p.course.trim()) return p.course.trim();
  const parts = (p.pageTitle ?? '').split(/\s[|—–-]\s/).map((s) => s.trim());
  return parts.find((s) => s && !/^(assessments|prairielearn)$/i.test(s)) ?? `PrairieLearn ${p.ciid}`;
}

export const plSourceKey = (ciid: string) => `pl:${ciid}`;

/** Builds the stored source; items without a readable deadline are skipped. */
export function payloadToImport(
  p: PlPayload,
  now = new Date(),
): { source: Omit<ImportedSource, 'updatedAt'>; skipped: number } {
  const id = plSourceKey(p.ciid);
  const course = courseName(p);
  const events: CalEvent[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const it of p.items) {
    const key = it.label || /\/assessment\/(\d+)/.exec(it.href)?.[1] || it.title;
    const due = parsePrairieLearnDue(it.due, now);
    if (!key || !due || seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    const title = it.label && !it.title.startsWith(it.label) ? `${it.label}: ${it.title}` : it.title || it.label;
    events.push({
      id: `${id}|${key}`,
      uid: `${id}:${key}`,
      calendarId: id,
      title,
      start: due,
      end: due,
      allDay: false,
      description: it.due || undefined,
      url: it.href || undefined,
      kind: 'assignment',
      course,
    });
  }
  return { source: { id, kind: 'prairielearn', name: course, url: p.url, importedAt: now.getTime(), events }, skipped };
}

export function importCalendar(source: Pick<ImportedSource, 'id' | 'name'>): CalendarInfo {
  // SourceKind has no PrairieLearn kind; 'ics' is the closest read-only feed.
  return { id: source.id, sourceKey: source.id, kind: 'ics', name: source.name, color: courseColor(source.name), visible: true };
}

// ---- toast ----

function showToast(message: string, error = false): void {
  const el = document.createElement('div');
  el.setAttribute('role', error ? 'alert' : 'status');
  el.textContent = message;
  el.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:24px', 'transform:translateX(-50%)', 'z-index:1000',
    'max-width:min(560px,calc(100vw - 32px))', 'padding:14px 20px', 'border-radius:var(--radius-m)',
    'background:var(--text)', 'color:var(--surface)', 'box-shadow:var(--shadow-2)',
    'font:14px/1.4 var(--font-body)', 'transition:opacity .3s',
  ].join(';');
  document.body.appendChild(el);
  setTimeout(() => (el.style.opacity = '0'), 5000);
  setTimeout(() => el.remove(), 5400);
}

function importFromHash(): void {
  const m = /^#import=([A-Za-z0-9_-]*)$/.exec(location.hash);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const { source, skipped } = payloadToImport(decodePayload(m[1]));
    if (!source.events.length) throw new Error(`No deadlines found for ${source.name}. Make sure you’re on its Assessments page.`);
    const store = useStore.getState();
    store.upsertImport(source);
    store.setCalendarsForSource(source.id, [importCalendar(source)]);
    const n = source.events.length;
    showToast(
      `Imported ${n} PrairieLearn ${n === 1 ? 'assessment' : 'assessments'} from ${source.name}` +
        (skipped ? ` (${skipped} without a deadline skipped).` : '.'),
    );
  } catch (err) {
    showToast(errorMessage(err), true);
  }
}

/** Keeps one sidebar calendar per live import (imports also arrive from other devices via Drive). */
function useImportCalendars(): void {
  const imports = useStore((s) => s.imports);
  useEffect(() => {
    const { calendars, setCalendarsForSource } = useStore.getState();
    for (const src of Object.values(imports)) {
      const cal = calendars[src.id];
      if (src.deleted) {
        if (cal) setCalendarsForSource(src.id, []);
      } else if (!cal || cal.name !== src.name) {
        setCalendarsForSource(src.id, [importCalendar(src)]);
      }
    }
  }, [imports]);
}

/** Mount once in <App/>: imports PrairieLearn assessments passed via `#import=` from the bookmarklet. */
export function useHashImport(): void {
  useEffect(() => {
    importFromHash();
    window.addEventListener('hashchange', importFromHash);
    return () => window.removeEventListener('hashchange', importFromHash);
  }, []);
  useImportCalendars();
}

