// Fetching (through the Worker proxy) and parsing of iCalendar feeds.
import ICAL from 'ical.js';
import { WORKER_URL } from '../config';
import type { CalEvent } from '../types';
import { htmlToText } from './text';

type Component = InstanceType<typeof ICAL.Component>;
type Time = InstanceType<typeof ICAL.Time>;
type IcalEvent = InstanceType<typeof ICAL.Event>;

/** Hard cap on RRULE iterations per event so pathological rules can't hang the tab. */
const MAX_ITERATIONS = 20_000;

export async function fetchIcsText(url: string): Promise<string> {
  if (!WORKER_URL) throw new Error('The calendar proxy is not configured (VITE_WORKER_URL is empty).');
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}/ics?url=${encodeURIComponent(url.trim())}`);
  } catch {
    throw new Error("Couldn't reach the calendar proxy. Check your internet connection.");
  }
  if (res.ok) return res.text();

  let detail = '';
  try {
    const body: unknown = await res.json();
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') detail = body.error;
  } catch {
    // non-JSON error body
  }
  if (res.status === 404) throw new Error(detail || 'Feed not found. The link may have been reset or removed.');
  if (res.status === 422) throw new Error(detail || 'That link is not an .ics calendar feed.');
  if (res.status === 403) throw new Error('This site is not allowed to use the calendar proxy.');
  if (res.status >= 400 && res.status < 500) throw new Error(detail || `The feed link was rejected (${res.status}).`);
  throw new Error(detail || `The calendar proxy failed (${res.status}). Try again later.`);
}

export interface ParseOptions {
  calendarId: string;
  rangeStart: Date;
  rangeEnd: Date;
}

/** One expanded occurrence with the raw feed data adapters (e.g. Canvas) need. */
export interface IcsOccurrence {
  /** UID property as it appears in the feed. */
  rawUid: string;
  /** ISO of the original occurrence start (RECURRENCE-ID) for recurring events. */
  recurrenceKey?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  summary: string;
  description?: string;
  /** X-ALT-DESC;FMTTYPE=text/html, when present. */
  htmlDescription?: string;
  location?: string;
  url?: string;
}

export function parseIcs(text: string, opts: ParseOptions): { calendarName?: string; events: CalEvent[] } {
  const { calendarName, occurrences } = parseIcsOccurrences(text, opts);
  const events = occurrences.map((o): CalEvent => {
    const uid = o.recurrenceKey ? `${o.rawUid}:${o.recurrenceKey}` : o.rawUid;
    return {
      id: `${opts.calendarId}|${uid}|${o.start.toISOString()}`,
      uid,
      calendarId: opts.calendarId,
      title: o.summary,
      start: o.start.toISOString(),
      end: o.end.toISOString(),
      allDay: o.allDay,
      location: o.location,
      description: plainDescription(o),
      url: o.url,
      kind: 'event',
    };
  });
  return { calendarName, events };
}

/** DESCRIPTION is plain text per RFC 5545, but many feeds stuff HTML into it anyway. */
export function plainDescription(o: Pick<IcsOccurrence, 'description' | 'htmlDescription'>): string | undefined {
  const raw = o.description ?? o.htmlDescription;
  if (!raw) return undefined;
  return (/<\/?[a-z][^>]*>|&[a-z#0-9]+;/i.test(raw) ? htmlToText(raw) : raw.trim()) || undefined;
}

export function parseIcsOccurrences(
  text: string,
  { rangeStart, rangeEnd }: Pick<ParseOptions, 'rangeStart' | 'rangeEnd'>,
): { calendarName?: string; occurrences: IcsOccurrence[] } {
  const vcal = parseCalendar(text);
  for (const tz of vcal.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      // Malformed VTIMEZONE: times fall back to IANA lookup / floating.
    }
  }
  const calendarName = stringProp(vcal, 'x-wr-calname');

  const masters = new Map<string, Component>();
  const exceptions: Component[] = [];
  const singles: Component[] = [];
  for (const ve of vcal.getAllSubcomponents('vevent')) {
    const uid = stringProp(ve, 'uid');
    if (!uid) singles.push(ve);
    else if (ve.hasProperty('recurrence-id')) exceptions.push(ve);
    else if (!masters.has(uid)) masters.set(uid, ve);
  }

  const events = new Map<string, IcalEvent>();
  for (const [uid, comp] of masters) events.set(uid, new ICAL.Event(comp));
  for (const exc of exceptions) {
    const master = events.get(stringProp(exc, 'uid') ?? '');
    if (master?.isRecurring()) master.relateException(exc);
    else singles.push(exc); // orphaned override: show it as a standalone event
  }

  const occurrences: IcsOccurrence[] = [];
  const push = (item: IcalEvent, startT: Time, endT: Time, recurrenceKey?: string) => {
    if (isCancelled(item.component)) return;
    const allDay = startT.isDate;
    const start = toDate(startT, tzidOf(item.component, 'dtstart'));
    let end = toDate(endT, tzidOf(item.component, 'dtend') ?? tzidOf(item.component, 'dtstart'));
    if (end < start) end = start;
    if (allDay && end.getTime() === start.getTime()) end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    // Point events (start === end) count when they fall inside the range.
    const inRange = end.getTime() === start.getTime() ? start >= rangeStart && start < rangeEnd : end > rangeStart && start < rangeEnd;
    if (!inRange) return;
    occurrences.push({
      rawUid: item.uid || stringProp(item.component, 'uid') || `${item.summary}@${start.toISOString()}`,
      recurrenceKey,
      start,
      end,
      allDay,
      summary: (item.summary ?? '').trim() || '(No title)',
      description: stringProp(item.component, 'description')?.trim() || undefined,
      htmlDescription: altHtmlDescription(item.component),
      location: item.location?.trim() || undefined,
      url: stringProp(item.component, 'url')?.trim() || undefined,
    });
  };

  for (const comp of singles) {
    try {
      const ev = new ICAL.Event(comp);
      if (ev.startDate) push(ev, ev.startDate, ev.endDate);
    } catch {
      // skip unparseable event
    }
  }

  for (const ev of events.values()) {
    try {
      if (!ev.startDate) continue;
      if (!ev.isRecurring()) {
        push(ev, ev.startDate, ev.endDate);
        continue;
      }
      const tzid = tzidOf(ev.component, 'dtstart');
      const it = ev.iterator();
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const next = it.next();
        if (!next) break;
        if (toDate(next, tzid) >= rangeEnd) break;
        const d = ev.getOccurrenceDetails(next);
        push(d.item, d.startDate, d.endDate, toDate(d.recurrenceId, tzid).toISOString());
      }
    } catch {
      // skip events with broken recurrence data instead of failing the whole feed
    }
  }

  occurrences.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { calendarName, occurrences };
}

function parseCalendar(text: string): Component {
  let jcal: unknown;
  try {
    jcal = ICAL.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new Error('This feed is not valid iCalendar data.');
  }
  // ICAL.parse returns an array of components when the text holds several.
  const first = Array.isArray(jcal) && Array.isArray(jcal[0]) ? jcal[0] : jcal;
  const comp = new ICAL.Component(first as unknown[]);
  if (comp.name !== 'vcalendar') throw new Error('This feed is not valid iCalendar data.');
  return comp;
}

function stringProp(comp: Component, name: string): string | undefined {
  const v = comp.getFirstPropertyValue(name);
  return typeof v === 'string' ? v : v != null ? String(v) : undefined;
}

function isCancelled(comp: Component): boolean {
  return stringProp(comp, 'status')?.toUpperCase() === 'CANCELLED';
}

function altHtmlDescription(comp: Component): string | undefined {
  for (const prop of comp.getAllProperties('x-alt-desc')) {
    const fmt = prop.getParameter('fmttype');
    if (typeof fmt === 'string' && fmt.toLowerCase() === 'text/html') {
      const v = prop.getFirstValue();
      if (typeof v === 'string' && v.trim()) return v;
    }
  }
  return undefined;
}

function tzidOf(comp: Component, propName: string): string | undefined {
  const tz = comp.getFirstProperty(propName)?.getParameter('tzid');
  return typeof tz === 'string' ? tz : undefined;
}

/**
 * ICAL.Time -> Date. All-day dates become local midnight. A TZID that has no VTIMEZONE in the
 * feed leaves ical.js with a "floating" time; resolve it via Intl when it names an IANA zone.
 */
export function toDate(t: Time, tzid?: string): Date {
  if (t.isDate) return new Date(t.year, t.month - 1, t.day);
  if (tzid && t.zone?.tzid === 'floating' && isIanaZone(tzid)) {
    return zonedWallTimeToDate(t.year, t.month, t.day, t.hour, t.minute, t.second, tzid);
  }
  return t.toJSDate();
}

const ianaCache = new Map<string, boolean>();
function isIanaZone(tz: string): boolean {
  let ok = ianaCache.get(tz);
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      ok = true;
    } catch {
      ok = false;
    }
    ianaCache.set(tz, ok);
  }
  return ok;
}

function zonedWallTimeToDate(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  // Two passes handle offsets that differ across a DST boundary.
  let utc = wallAsUtc - offsetMs(wallAsUtc, tz);
  utc = wallAsUtc - offsetMs(utc, tz);
  return new Date(utc);
}

function offsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}
