import { describe, expect, it } from 'vitest';
import type { CalEvent, ClassInfo, PersonalTask, TimeEntry } from '../types';
import { migrateState } from './index';
import { buildTaskViews, courseCode, findClassForCourse, isDeletedCourse, timeTotals } from './tasks';

const cls = (id: string, aliases: string[], extra: Partial<ClassInfo> = {}): ClassInfo => ({
  id, name: id, color: '#000', aliases, order: 0, updatedAt: 1, ...extra,
});

describe('courseCode', () => {
  it('extracts subject + number from many spellings', () => {
    expect(courseCode('CSE 110 - Lecture A00 (FA26)')).toBe('CSE 110');
    expect(courseCode('cse110')).toBe('CSE 110');
    expect(courseCode('MATH 18')).toBe('MATH 18');
    expect(courseCode('COGS 108A')).toBe('COGS 108A');
  });
  it('falls back to the normalized string', () => {
    expect(courseCode('  Intro to  Writing ')).toBe('INTRO TO WRITING');
  });
});

describe('findClassForCourse', () => {
  const classes = {
    a: cls('a', ['CSE 110 - LECTURE A00']),
    b: cls('b', ['MATH 18'], { deleted: true }),
  };
  it('matches exact aliases and course codes across sources', () => {
    expect(findClassForCourse(classes, 'cse 110 - lecture a00')?.id).toBe('a');
    expect(findClassForCourse(classes, 'CSE 110')?.id).toBe('a'); // e.g. Gradescope spelling
  });
  it('ignores deleted classes', () => {
    expect(findClassForCourse(classes, 'MATH 18')).toBeUndefined();
  });
  it('remembers deleted courses so they are not auto-created again', () => {
    expect(isDeletedCourse(classes, 'math 18')).toBe(true);
    expect(isDeletedCourse(classes, 'CSE 110')).toBe(false);
  });
});

describe('migrateState v1 → v2', () => {
  it('turns the done checklist into task meta', () => {
    const out = migrateState({ done: { 'event-assignment-1': 123 }, feeds: [] }, 1);
    expect(out.done).toBeUndefined();
    expect(out.meta).toEqual({
      'event-assignment-1': { uid: 'event-assignment-1', status: 'done', priority: 'none', subtasks: [], updatedAt: 123 },
    });
    expect(out.tasks).toEqual({});
    expect(out.imports).toEqual({});
    expect(out.feeds).toEqual([]);
  });
});

describe('timeTotals', () => {
  it('sums finished entries overall and for today only', () => {
    const now = new Date(2026, 9, 26, 12);
    const entries: Record<string, TimeEntry> = {
      e1: { id: 'e1', taskRef: 't:x', start: new Date(2026, 9, 26, 9).toISOString(), end: new Date(2026, 9, 26, 10).toISOString(), updatedAt: 1 },
      // crosses midnight: only the part after midnight counts for today
      e2: { id: 'e2', taskRef: 't:x', start: new Date(2026, 9, 25, 23).toISOString(), end: new Date(2026, 9, 26, 0, 30).toISOString(), updatedAt: 1 },
      e3: { id: 'e3', taskRef: 't:x', start: new Date(2026, 9, 26, 8).toISOString(), end: new Date(2026, 9, 26, 9).toISOString(), updatedAt: 1, deleted: true },
    };
    const { total, today } = timeTotals(entries, now);
    expect(total.get('t:x')).toBe(2.5 * 3600_000);
    expect(today.get('t:x')).toBe(1.5 * 3600_000);
  });
});

describe('buildTaskViews', () => {
  const ev = (uid: string, course?: string): CalEvent => ({
    id: uid, uid, calendarId: 'c', title: uid, start: '2026-10-30T06:59:00.000Z', end: '2026-10-30T06:59:00.000Z',
    allDay: false, kind: 'assignment', course,
  });
  const task = (id: string, extra: Partial<PersonalTask> = {}): PersonalTask => ({
    id, title: id, list: 'personal', status: 'todo', priority: 'none', subtasks: [], createdAt: 1, updatedAt: 1, ...extra,
  });

  it('merges assignments (deduped by uid) with personal tasks and resolves classes', () => {
    const classes = { a: cls('a', ['CSE 110']) };
    const views = buildTaskViews(
      [ev('hw1', 'CSE 110'), ev('hw1', 'CSE 110'), ev('hw2')],
      { hw1: { uid: 'hw1', status: 'doing', priority: 'high', subtasks: [], updatedAt: 1 } },
      { p: task('p'), q: task('q', { list: 'quick' }), c: task('c', { classId: 'a' }), d: task('d', { deleted: true }) },
      classes,
      {},
    );
    const byRef = Object.fromEntries(views.map((v) => [v.ref, v]));
    expect(views).toHaveLength(5);
    expect(byRef['a:hw1']).toMatchObject({ classId: 'a', status: 'doing', priority: 'high', list: 'class', due: '2026-10-30T06:59:00.000Z' });
    expect(byRef['a:hw2'].classId).toBeUndefined();
    expect(byRef['t:p'].list).toBe('personal');
    expect(byRef['t:q'].list).toBe('quick');
    expect(byRef['t:c']).toMatchObject({ list: 'class', classId: 'a' });
  });
});
