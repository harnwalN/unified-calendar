// Class meetings: calendar events (lectures, discussions, labs…) that belong to a class, found
// from course codes in the title ("CSE 110 Lecture") or assigned by hand per event title.
import { useMemo } from 'react';
import { useStore } from '../store';
import { courseCode, normalizeCourse } from '../store/tasks';
import { PLANNED_CALENDAR_ID } from '../store/selectors';
import type { CalEvent, ClassInfo } from '../types';

/** Stable key for "the same event" across occurrences: trimmed, collapsed, lower-case title. */
export const eventTitleKey = (title: string) => title.trim().replace(/\s+/g, ' ').toLowerCase();

const CODE_RE = /\b([A-Z]{2,5})[\s_-]*0*(\d{1,4}[A-Z]{0,2})\b/g;

/** Course codes mentioned anywhere in a title: "Lecture: CSE 110 / MATH183" → ["CSE 110", "MATH 183"]. */
export function codesInTitle(title: string): string[] {
  const out: string[] = [];
  for (const m of normalizeCourse(title).matchAll(CODE_RE)) out.push(`${m[1]} ${m[2]}`);
  return out;
}

const MEETING_WORDS = /\b(lectures?|lec|discussions?|disc|dis|labs?|laboratory|sections?|sect|seminar|recitation|tutorial|studio|workshop|office hours?|class|meeting)\b/gi;

/**
 * A name to pre-fill when making a class from an event title: its first course code
 * ("CSE 110 Lecture" → "CSE 110"), else the title without meeting words ("Writing Workshop" → "Writing").
 */
export function suggestClassName(title: string): string {
  const code = codesInTitle(title)[0];
  if (code) return code;
  const clean = title.trim().replace(/\s+/g, ' ');
  const stripped = clean
    .replace(MEETING_WORDS, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:|/,·)]+|[\s\-–—:|/,·(]+$/g, '');
  return stripped || clean;
}

/** Events that could be a class meeting: timed, not a deadline, not a scheduled work block. */
export const isMeetingCandidate = (e: CalEvent) => !e.allDay && e.kind !== 'assignment' && e.calendarId !== PLANNED_CALENDAR_ID;

export interface ClassMatch {
  cls: ClassInfo;
  /** 'manual' when the user picked it, 'auto' when found from a course code. */
  source: 'manual' | 'auto';
  /** The user marked this occurrence as not attending. */
  skipped: boolean;
}

export type ClassMatcher = (e: CalEvent) => ClassMatch | null;

/** Build a matcher for live classes; `notClass` holds title keys the user excluded. */
export function makeClassMatcher(classes: ClassInfo[], notClass: string[] = []): ClassMatcher {
  const live = classes.filter((c) => !c.deleted);
  const excluded = new Set(notClass);
  const manual = new Map<string, ClassInfo>();
  for (const c of live) for (const t of c.meetingTitles ?? []) manual.set(t, c);
  const byCode = new Map<string, ClassInfo>();
  for (const c of live) {
    for (const a of [c.name, ...c.aliases]) {
      const code = courseCode(a);
      if (!byCode.has(code)) byCode.set(code, c);
    }
  }
  return (e) => {
    if (!isMeetingCandidate(e)) return null;
    const key = eventTitleKey(e.title);
    const picked = manual.get(key);
    if (picked) return { cls: picked, source: 'manual', skipped: !!picked.skipped?.[e.id] };
    if (excluded.has(key)) return null;
    for (const code of codesInTitle(e.title)) {
      const cls = byCode.get(code);
      if (cls) return { cls, source: 'auto', skipped: !!cls.skipped?.[e.id] };
    }
    return null;
  };
}

/** True for a class meeting the user isn't attending; such events don't block time or count as class. */
export const isSkippedMeeting = (match: ClassMatcher, e: CalEvent) => !!match(e)?.skipped;

/** Skipped meetings older than this are forgotten so the per-class list stays small. */
const SKIP_KEEP_MS = 120 * 86_400_000;

/** Mark one occurrence of a class meeting as not attending (or attending again). */
export function setMeetingSkipped(classId: string, e: CalEvent, skipped: boolean, now = Date.now()) {
  const { classes, updateClass } = useStore.getState();
  const cls = classes[classId];
  if (!cls) return;
  const next: Record<string, string> = {};
  for (const [id, start] of Object.entries(cls.skipped ?? {})) {
    if (id !== e.id && now - Date.parse(start) < SKIP_KEEP_MS) next[id] = start;
  }
  if (skipped) next[e.id] = e.start;
  updateClass(classId, { skipped: next });
}

export interface MeetingSpan {
  classId: string;
  title: string;
  start: number;
  end: number;
}

/** Class meetings inside [from, min(to, now)) — only time that has actually happened counts. */
export function meetingSpans(events: CalEvent[], match: ClassMatcher, from: number, to: number, now: number): MeetingSpan[] {
  const until = Math.min(to, now);
  const out: MeetingSpan[] = [];
  for (const e of events) {
    const m = match(e);
    if (!m || m.skipped) continue;
    const start = Math.max(Date.parse(e.start), from);
    const end = Math.min(Date.parse(e.end), until);
    if (end > start) out.push({ classId: m.cls.id, title: e.title, start, end });
  }
  return out.sort((a, b) => a.start - b.start);
}

export interface Unclassified {
  key: string;
  title: string;
  count: number;
}

/**
 * Repeating events (2+ occurrences) that no class claims and the user hasn't dismissed — the
 * ones worth asking about. Most frequent first.
 */
export function unclassifiedRecurring(events: CalEvent[], match: ClassMatcher, notClass: string[] = [], limit = 8): Unclassified[] {
  const excluded = new Set(notClass);
  const seen = new Map<string, Unclassified>();
  for (const e of events) {
    if (!isMeetingCandidate(e) || match(e)) continue;
    const key = eventTitleKey(e.title);
    if (excluded.has(key)) continue;
    const u = seen.get(key);
    if (u) u.count++;
    else seen.set(key, { key, title: e.title.trim(), count: 1 });
  }
  return [...seen.values()]
    .filter((u) => u.count >= 2)
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/** The matcher for the current classes and exclusions. */
export function useClassMatcher(): ClassMatcher {
  const classes = useStore((s) => s.classes);
  const notClass = useStore((s) => s.settings.notClassTitles);
  return useMemo(() => makeClassMatcher(Object.values(classes), notClass), [classes, notClass]);
}

/**
 * Say which class an event title belongs to: a class id, 'none' (not a class), or 'auto'
 * (forget any manual choice and go back to course-code matching).
 */
export function assignEventTitle(title: string, choice: string | 'none' | 'auto') {
  const key = eventTitleKey(title);
  const s = useStore.getState();
  for (const c of Object.values(s.classes)) {
    if (c.meetingTitles?.includes(key) && c.id !== choice) {
      s.updateClass(c.id, { meetingTitles: c.meetingTitles.filter((t) => t !== key) });
    }
  }
  const notClass = (s.settings.notClassTitles ?? []).filter((t) => t !== key);
  s.updateSettings({ notClassTitles: choice === 'none' ? [...notClass, key] : notClass });
  if (choice !== 'none' && choice !== 'auto') {
    const cls = useStore.getState().classes[choice];
    if (cls && !cls.meetingTitles?.includes(key)) s.updateClass(choice, { meetingTitles: [...(cls.meetingTitles ?? []), key] });
  }
}
