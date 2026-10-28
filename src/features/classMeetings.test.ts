import { describe, expect, it } from 'vitest';
import type { CalEvent, ClassInfo } from '../types';
import { codesInTitle, eventTitleKey, makeClassMatcher, meetingSpans, suggestClassName, unclassifiedRecurring } from './classMeetings';

const cls = (id: string, name: string, aliases: string[], meetingTitles?: string[]): ClassInfo => ({
  id, name, color: '#123456', aliases, order: 0, meetingTitles, updatedAt: 0,
});
const ev = (id: string, title: string, start: string, end: string, extra: Partial<CalEvent> = {}): CalEvent => ({
  id, uid: id, calendarId: 'g', title, start, end, allDay: false, kind: 'event', ...extra,
});

const classes = [cls('c1', 'CSE 110', ['CSE 110 - LECTURE A00 (FA26)']), cls('c2', 'Writing', ['MCWP040_FA26_017'], ['writing workshop'])];

describe('class meetings', () => {
  it('finds course codes anywhere in a title', () => {
    expect(codesInTitle('Lecture: CSE 110 / math183')).toEqual(['CSE 110', 'MATH 183']);
    expect(codesInTitle('Lunch with Sam')).toEqual([]);
  });

  it('matches by course code, by manual title, and respects exclusions', () => {
    const match = makeClassMatcher(classes, ['cse 110 office hours']);
    expect(match(ev('1', 'CSE110 Lecture', 'a', 'b'))?.cls.id).toBe('c1');
    expect(match(ev('1', 'CSE110 Lecture', 'a', 'b'))?.source).toBe('auto');
    expect(match(ev('2', '  Writing   Workshop ', 'a', 'b'))).toMatchObject({ source: 'manual' });
    expect(match(ev('3', 'CSE 110 Office Hours', 'a', 'b'))).toBeNull();
    expect(match(ev('4', 'CSE 110 PA1', 'a', 'b', { kind: 'assignment' }))).toBeNull();
    expect(match(ev('5', 'CSE 110 review', 'a', 'b', { allDay: true }))).toBeNull();
  });

  it('counts only meeting time that has happened', () => {
    const match = makeClassMatcher(classes);
    const day = new Date(2026, 9, 26).getTime();
    const at = (h: number) => new Date(day + h * 3_600_000).toISOString();
    const spans = meetingSpans(
      [ev('1', 'CSE 110 Lecture', at(9), at(10)), ev('2', 'CSE 110 Discussion', at(14), at(15)), ev('3', 'Gym', at(7), at(8))],
      match,
      day,
      day + 24 * 3_600_000,
      day + 14.5 * 3_600_000,
    );
    expect(spans.map((s) => (s.end - s.start) / 60_000)).toEqual([60, 30]);
  });

  it('flags skipped occurrences and leaves them out of meeting time', () => {
    const skipping = [{ ...classes[0], skipped: { '1': '2026-10-26T16:00:00.000Z' } }, classes[1]];
    const match = makeClassMatcher(skipping);
    const day = new Date(2026, 9, 26).getTime();
    const at = (h: number) => new Date(day + h * 3_600_000).toISOString();
    const lecture = ev('1', 'CSE 110 Lecture', at(9), at(10));
    const discussion = ev('2', 'CSE 110 Discussion', at(14), at(15));
    expect(match(lecture)).toMatchObject({ skipped: true });
    expect(match(discussion)).toMatchObject({ skipped: false });
    const spans = meetingSpans([lecture, discussion], match, day, day + 24 * 3_600_000, day + 16 * 3_600_000);
    expect(spans.map((s) => s.title)).toEqual(['CSE 110 Discussion']);
  });

  it('asks about repeating events no class claims', () => {
    const match = makeClassMatcher(classes);
    const evs = [
      ev('1', 'Bio Lab', 'a', 'b'), ev('2', 'Bio Lab', 'c', 'd'), ev('3', 'bio  lab', 'e', 'f'),
      ev('4', 'Dentist', 'a', 'b'),
      ev('5', 'CSE 110 Lecture', 'a', 'b'), ev('6', 'CSE 110 Lecture', 'c', 'd'),
      ev('7', 'Standup', 'a', 'b'), ev('8', 'Standup', 'c', 'd'),
    ];
    expect(unclassifiedRecurring(evs, match, [eventTitleKey('Standup')])).toEqual([{ key: 'bio lab', title: 'Bio Lab', count: 3 }]);
  });

  it('suggests a class name from an event title', () => {
    expect(suggestClassName('CSE 110 Lecture')).toBe('CSE 110');
    expect(suggestClassName('Lecture: math183 (Center 115)')).toBe('MATH 183');
    expect(suggestClassName('Writing Workshop')).toBe('Writing');
    expect(suggestClassName('Physics - Discussion')).toBe('Physics');
    expect(suggestClassName('Intro to Film (Lab)')).toBe('Intro to Film');
    expect(suggestClassName('  Lab  ')).toBe('Lab');
    expect(suggestClassName('Piano lessons')).toBe('Piano lessons');
  });
});
