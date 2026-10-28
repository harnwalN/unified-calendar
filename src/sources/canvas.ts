// Canvas LMS "Calendar Feed" (.ics) adapter: assignments become point deadlines and the
// feed is split into one toggleable calendar per course.
import { PALETTE } from '../config';
import type { CalendarInfo, CalEvent, IcsFeed } from '../types';
import { parseIcsOccurrences, plainDescription, type IcsOccurrence } from './ics';
import { hashString, slugify } from './text';

const TITLE_RE = /^(.*?)\s*\[([^\]]+)\]\s*$/;

export function splitCanvasTitle(summary: string): { title: string; course?: string } {
  const m = TITLE_RE.exec(summary.trim());
  if (!m || !m[1]) return { title: summary.trim() };
  return { title: m[1].trim(), course: m[2].trim() };
}

/**
 * Canvas UIDs are `event-<class>-<id>`: assignments (incl. `event-assignment-override-…` for
 * section/student due dates) and discussion checkpoints (`event-sub-assignment-…`) are deadlines.
 */
export function isAssignmentUid(uid: string): boolean {
  return uid.startsWith('event-assignment-') || uid.startsWith('event-sub-assignment-');
}

export function courseColor(course: string): string {
  return PALETTE[hashString(course) % PALETTE.length];
}

export function parseCanvas(
  text: string,
  feed: Pick<IcsFeed, 'id' | 'name' | 'color'>,
  range: { rangeStart: Date; rangeEnd: Date },
): { calendars: CalendarInfo[]; events: CalEvent[] } {
  const sourceKey = `canvas:${feed.id}`;
  const { occurrences } = parseIcsOccurrences(text, range);
  const courses = new Map<string, CalendarInfo>();
  let hasUncoursed = false;

  const events = occurrences.map((o): CalEvent => {
    const { title, course } = splitCanvasTitle(o.summary);
    let calendarId = sourceKey;
    if (course) {
      calendarId = `${sourceKey}:${slugify(course)}`;
      if (!courses.has(calendarId)) {
        courses.set(calendarId, {
          id: calendarId,
          sourceKey,
          kind: 'canvas',
          name: course,
          color: courseColor(course),
          visible: true,
        });
      }
    } else {
      hasUncoursed = true;
    }

    const assignment = isAssignmentUid(o.rawUid);
    const { start, end, allDay } = assignment ? dueTime(o) : o;
    const uid = o.recurrenceKey ? `${o.rawUid}:${o.recurrenceKey}` : o.rawUid;
    return {
      id: `${sourceKey}|${uid}|${start.toISOString()}`,
      uid,
      calendarId,
      title,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay,
      location: o.location,
      description: plainDescription(o),
      url: o.url,
      kind: assignment ? 'assignment' : 'event',
      course,
    };
  });

  const calendars = [...courses.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (hasUncoursed || calendars.length === 0) {
    calendars.unshift({
      id: sourceKey,
      sourceKey,
      kind: 'canvas',
      name: feed.name.trim() || 'Canvas',
      color: feed.color,
      visible: true,
    });
  }
  return { calendars, events };
}

/** Assignments are point deadlines; Canvas emits DATE-only values for "due that day". */
function dueTime(o: IcsOccurrence): { start: Date; end: Date; allDay: false } {
  const due = o.allDay
    ? new Date(o.start.getFullYear(), o.start.getMonth(), o.start.getDate(), 23, 59)
    : o.start;
  return { start: due, end: due, allDay: false };
}
