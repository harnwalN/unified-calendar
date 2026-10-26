import { describe, expect, it } from 'vitest';
import { PALETTE } from '../config';
import { courseColor, parseCanvas, splitCanvasTitle } from './canvas';

const FEED = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Instructure//Canvas//EN',
  'X-WR-CALNAME:Jane Doe Calendar (Canvas)',
  'BEGIN:VEVENT',
  'UID:event-assignment-101',
  'SUMMARY:Homework 3 [CSE 110 - FA26]',
  'DTSTART:20261030T065900Z',
  'DTEND:20261030T065900Z',
  'DESCRIPTION:<p>Submit <strong>PDF</strong>&nbsp;on Gradescope.</p>',
  'URL;VALUE=URI:https://canvas.ucsd.edu/courses/1/assignments/101',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:event-assignment-102',
  'SUMMARY:Reading quiz [MATH 20C]',
  'DTSTART;VALUE=DATE:20261102',
  'DTEND;VALUE=DATE:20261102',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:event-calendar-event-55',
  'SUMMARY:Midterm review [CSE 110 - FA26]',
  'DTSTART:20261029T230000Z',
  'DTEND:20261030T003000Z',
  'LOCATION:WLH 2005',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:event-calendar-event-56',
  'SUMMARY:Office hours',
  'DTSTART:20261031T180000Z',
  'DTEND:20261031T190000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const feed = { id: 'f1', name: 'Canvas', color: '#ef6c00' };
const range = { rangeStart: new Date('2026-10-01T00:00:00Z'), rangeEnd: new Date('2026-12-01T00:00:00Z') };

describe('splitCanvasTitle', () => {
  it('splits trailing course brackets', () => {
    expect(splitCanvasTitle('Lab 1 [Part A] [CSE 12]')).toEqual({ title: 'Lab 1 [Part A]', course: 'CSE 12' });
    expect(splitCanvasTitle('No course')).toEqual({ title: 'No course' });
  });
});

describe('parseCanvas', () => {
  const { calendars, events } = parseCanvas(FEED, feed, range);
  const byUid = Object.fromEntries(events.map((e) => [e.uid, e]));

  it('creates one calendar per course plus a fallback', () => {
    expect(calendars.map((c) => [c.id, c.name])).toEqual([
      ['canvas:f1', 'Canvas'],
      ['canvas:f1:cse-110-fa26', 'CSE 110 - FA26'],
      ['canvas:f1:math-20c', 'MATH 20C'],
    ]);
    expect(calendars.every((c) => c.sourceKey === 'canvas:f1' && c.kind === 'canvas')).toBe(true);
    expect(calendars[0].color).toBe('#ef6c00');
    expect(calendars[1].color).toBe(courseColor('CSE 110 - FA26'));
    expect(PALETTE).toContain(calendars[2].color);
  });

  it('maps assignments to point deadlines with plain-text descriptions', () => {
    expect(byUid['event-assignment-101']).toMatchObject({
      kind: 'assignment',
      title: 'Homework 3',
      course: 'CSE 110 - FA26',
      calendarId: 'canvas:f1:cse-110-fa26',
      start: '2026-10-30T06:59:00.000Z',
      end: '2026-10-30T06:59:00.000Z',
      allDay: false,
      description: 'Submit PDF on Gradescope.',
      url: 'https://canvas.ucsd.edu/courses/1/assignments/101',
    });
  });

  it('treats DATE-only assignments as due 23:59 local', () => {
    const due = new Date(2026, 10, 2, 23, 59).toISOString();
    expect(byUid['event-assignment-102']).toMatchObject({ kind: 'assignment', start: due, end: due, allDay: false });
  });

  it('keeps calendar events as events; uncoursed ones go to the fallback calendar', () => {
    expect(byUid['event-calendar-event-55']).toMatchObject({
      kind: 'event',
      title: 'Midterm review',
      location: 'WLH 2005',
      start: '2026-10-29T23:00:00.000Z',
      end: '2026-10-30T00:30:00.000Z',
    });
    expect(byUid['event-calendar-event-56']).toMatchObject({ calendarId: 'canvas:f1', course: undefined });
  });
});
