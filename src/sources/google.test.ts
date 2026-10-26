import { describe, expect, it } from 'vitest';
import { mapGoogleEvent, splitGradescopeTitle, type GEvent } from './google';

const timed = (patch: Partial<GEvent> = {}): GEvent => ({
  id: 'e1',
  summary: 'HW 3',
  start: { dateTime: '2026-10-30T22:00:00-07:00' },
  end: { dateTime: '2026-10-30T23:59:00-07:00' },
  htmlLink: 'https://calendar.google.com/event?eid=1',
  ...patch,
});

describe('splitGradescopeTitle', () => {
  it.each([
    ['[CSE 110] HW 3', 'HW 3', 'CSE 110'],
    ['CSE 110: HW 3', 'HW 3', 'CSE 110'],
    ['HW 3 (CSE 110)', 'HW 3', 'CSE 110'],
    ['HW 3 - CSE 110', 'HW 3', 'CSE 110'],
    ['CSE 110 - HW 3', 'HW 3', 'CSE 110'],
    ['Project 2 — MATH 20C', 'Project 2', 'MATH 20C'],
  ])('%s', (summary, title, course) => {
    expect(splitGradescopeTitle(summary)).toEqual({ title, course });
  });

  it('does not mistake assignment labels for courses', () => {
    expect(splitGradescopeTitle('HW 3: Recursion')).toEqual({ title: 'HW 3: Recursion' });
    expect(splitGradescopeTitle('Midterm review')).toEqual({ title: 'Midterm review' });
  });
});

describe('mapGoogleEvent', () => {
  it('leaves ordinary events alone', () => {
    const e = mapGoogleEvent(timed({ summary: 'Lunch' }), 'google:a:cal', 'cal', 'Personal')!;
    expect(e.kind).toBe('event');
    expect(e.course).toBeUndefined();
  });

  it('marks events in a Gradescope calendar as point deadlines at the event end', () => {
    const e = mapGoogleEvent(timed({ summary: '[CSE 110] HW 3' }), 'google:a:gs', 'gs', 'Gradescope')!;
    expect(e).toMatchObject({ kind: 'assignment', title: 'HW 3', course: 'CSE 110', allDay: false });
    expect(e.start).toBe('2026-10-31T06:59:00.000Z');
    expect(e.end).toBe(e.start);
  });

  it('detects a gradescope.com link in the description and uses it as the url', () => {
    const e = mapGoogleEvent(
      timed({ description: '<a href="https://www.gradescope.com/courses/123/assignments/456">Submit</a>' }),
      'google:a:cal', 'cal', 'School',
    )!;
    expect(e.kind).toBe('assignment');
    expect(e.url).toBe('https://www.gradescope.com/courses/123/assignments/456');
  });

  it('falls back to the calendar name for the course', () => {
    const e = mapGoogleEvent(timed(), 'google:a:gs', 'gs', 'Gradescope - MATH 20C')!;
    expect(e.course).toBe('MATH 20C');
    expect(mapGoogleEvent(timed(), 'google:a:gs', 'gs', 'Gradescope')!.course).toBeUndefined();
  });

  it('uses 23:59 local on the day for all-day deadlines', () => {
    const e = mapGoogleEvent(
      { id: 'e2', summary: 'HW 4 (CSE 110)', start: { date: '2026-11-02' }, end: { date: '2026-11-03' } },
      'google:a:gs', 'gs', 'Gradescope',
    )!;
    expect(e.start).toBe(new Date(2026, 10, 2, 23, 59).toISOString());
    expect(e.allDay).toBe(false);
  });
});
