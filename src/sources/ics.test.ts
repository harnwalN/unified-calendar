import { describe, expect, it } from 'vitest';
import { parseIcs } from './ics';
import { htmlToText } from './text';

const ics = (...lines: string[]) => lines.join('\r\n');

const VTIMEZONE_LA = [
  'BEGIN:VTIMEZONE',
  'TZID:America/Los_Angeles',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0800',
  'TZOFFSETTO:-0700',
  'TZNAME:PDT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0700',
  'TZOFFSETTO:-0800',
  'TZNAME:PST',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

const FEED = ics(
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//test//EN',
  'X-WR-CALNAME:Test Calendar',
  ...VTIMEZONE_LA,
  // Weekly Monday 10:00 PT, 5 occurrences, Oct 26 2026 is a Monday (PDT ends Nov 1).
  'BEGIN:VEVENT',
  'UID:weekly-1',
  'SUMMARY:Lecture',
  'DTSTART;TZID=America/Los_Angeles:20261026T100000',
  'DTEND;TZID=America/Los_Angeles:20261026T112000',
  'RRULE:FREQ=WEEKLY;COUNT=5',
  'EXDATE;TZID=America/Los_Angeles:20261109T100000',
  'LOCATION:Center Hall 101',
  'URL:https://example.edu/lecture',
  'END:VEVENT',
  // Override: Nov 16 occurrence moved to 14:00 with a new title.
  'BEGIN:VEVENT',
  'UID:weekly-1',
  'RECURRENCE-ID;TZID=America/Los_Angeles:20261116T100000',
  'SUMMARY:Lecture (moved)',
  'DTSTART;TZID=America/Los_Angeles:20261116T140000',
  'DTEND;TZID=America/Los_Angeles:20261116T152000',
  'END:VEVENT',
  // Override cancelling the Nov 23 occurrence.
  'BEGIN:VEVENT',
  'UID:weekly-1',
  'RECURRENCE-ID;TZID=America/Los_Angeles:20261123T100000',
  'STATUS:CANCELLED',
  'DTSTART;TZID=America/Los_Angeles:20261123T100000',
  'DTEND;TZID=America/Los_Angeles:20261123T112000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:allday-1',
  'SUMMARY:Thanksgiving break',
  'DTSTART;VALUE=DATE:20261126',
  'DTEND;VALUE=DATE:20261128',
  'DESCRIPTION:No classes\\, enjoy.',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:cancelled-1',
  'SUMMARY:Cancelled meeting',
  'STATUS:CANCELLED',
  'DTSTART:20261028T170000Z',
  'DTEND:20261028T180000Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:utc-1',
  'SUMMARY:Out of range',
  'DTSTART:20300101T170000Z',
  'DTEND:20300101T180000Z',
  'END:VEVENT',
  'END:VCALENDAR',
);

const opts = {
  calendarId: 'ics:f1',
  rangeStart: new Date('2026-09-01T00:00:00Z'),
  rangeEnd: new Date('2027-01-01T00:00:00Z'),
};

describe('parseIcs', () => {
  const { calendarName, events } = parseIcs(FEED, opts);
  const lectures = events.filter((e) => e.uid.startsWith('weekly-1'));

  it('reads the calendar name', () => {
    expect(calendarName).toBe('Test Calendar');
  });

  it('expands RRULE with TZID, EXDATE, overrides and cancelled overrides', () => {
    expect(lectures.map((e) => [e.title, e.start])).toEqual([
      ['Lecture', '2026-10-26T17:00:00.000Z'], // PDT
      ['Lecture', '2026-11-02T18:00:00.000Z'], // PST
      ['Lecture (moved)', '2026-11-16T22:00:00.000Z'],
    ]);
    expect(lectures[0].end).toBe('2026-10-26T18:20:00.000Z');
    expect(lectures[0]).toMatchObject({
      calendarId: 'ics:f1',
      allDay: false,
      kind: 'event',
      location: 'Center Hall 101',
      url: 'https://example.edu/lecture',
    });
  });

  it('gives each occurrence a stable per-occurrence uid keyed by RECURRENCE-ID', () => {
    expect(lectures[2].uid).toBe('weekly-1:2026-11-16T18:00:00.000Z');
    expect(new Set(lectures.map((e) => e.uid)).size).toBe(3);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });

  it('maps all-day events to local midnights (exclusive end)', () => {
    const ev = events.find((e) => e.uid === 'allday-1');
    expect(ev).toMatchObject({ allDay: true, description: 'No classes, enjoy.' });
    expect(ev?.start).toBe(new Date(2026, 10, 26).toISOString());
    expect(ev?.end).toBe(new Date(2026, 10, 28).toISOString());
  });

  it('skips cancelled and out-of-range events', () => {
    expect(events.find((e) => e.uid === 'cancelled-1')).toBeUndefined();
    expect(events.find((e) => e.uid === 'utc-1')).toBeUndefined();
    expect(events).toHaveLength(4);
  });

  it('resolves an IANA TZID even without a VTIMEZONE', () => {
    const { events: [ev] } = parseIcs(
      ics(
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:x',
        'SUMMARY:Tokyo',
        'DTSTART;TZID=Asia/Tokyo:20261201T090000',
        'DURATION:PT1H',
        'END:VEVENT',
        'END:VCALENDAR',
      ),
      opts,
    );
    expect(ev.start).toBe('2026-12-01T00:00:00.000Z');
    expect(ev.end).toBe('2026-12-01T01:00:00.000Z');
  });

  it('caps unbounded rules at the range end', () => {
    const { events: daily } = parseIcs(
      ics(
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:daily',
        'SUMMARY:Standup',
        'DTSTART:20200101T160000Z',
        'RRULE:FREQ=DAILY',
        'END:VEVENT',
        'END:VCALENDAR',
      ),
      opts,
    );
    expect(daily).toHaveLength(122); // Sep 1 .. Dec 31
  });

  it('keeps distinct events that reuse a UID and drops exact duplicates', () => {
    const vevent = (start: string) => ['BEGIN:VEVENT', 'UID:dup', 'SUMMARY:Section', `DTSTART:${start}`, 'DURATION:PT1H', 'END:VEVENT'];
    const { events: dups } = parseIcs(
      ics(
        'BEGIN:VCALENDAR',
        ...vevent('20261102T170000Z'),
        ...vevent('20261104T170000Z'),
        ...vevent('20261104T170000Z'),
        'END:VCALENDAR',
      ),
      opts,
    );
    expect(dups.map((e) => e.start)).toEqual(['2026-11-02T17:00:00.000Z', '2026-11-04T17:00:00.000Z']);
    expect(new Set(dups.map((e) => e.id)).size).toBe(2);
  });

  it('rejects non-calendar text', () => {
    expect(() => parseIcs('<html></html>', opts)).toThrow(/not valid iCalendar/);
  });
});

describe('htmlToText', () => {
  it('strips tags and decodes entities', () => {
    expect(htmlToText('<p>Read <b>ch. 3</b>&nbsp;&amp; 4</p><ul><li>a</li><li>b</li></ul><script>x()</script>')).toBe(
      'Read ch. 3 & 4\n\n• a\n• b',
    );
  });
});
