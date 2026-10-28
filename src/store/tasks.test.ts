import { beforeEach, describe, expect, it, vi } from 'vitest';

// Some Node versions ship a stub global localStorage that shadows jsdom's; use an in-memory one.
vi.hoisted(() => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
});
import { PALETTE } from '../config';
import type { CalEvent, ClassInfo, PersonalTask, TimeEntry } from '../types';
import { migrateState, useStore } from './index';
import { setMeetingSkipped } from '../features/classMeetings';
import {
  buildTaskViews, courseCode, createClass, findClassByName, findClassForCourse, isDeletedCourse, nextClassColor, timeTotals,
} from './tasks';

const cls = (id: string, aliases: string[], extra: Partial<ClassInfo> = {}): ClassInfo => ({
  id, name: id, color: '#000', aliases, order: 0, updatedAt: 1, ...extra,
});

describe('courseCode', () => {
  it('extracts subject + number from many spellings', () => {
    expect(courseCode('CSE 110 - Lecture A00 (FA26)')).toBe('CSE 110');
    expect(courseCode('cse110')).toBe('CSE 110');
    expect(courseCode('MATH 18')).toBe('MATH 18');
    expect(courseCode('COGS 108A')).toBe('COGS 108A');
    expect(courseCode('MCWP040_FA26_017')).toBe('MCWP 40');
    expect(courseCode('CSE_100_A00')).toBe('CSE 100');
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
    expect(findClassForCourse(classes, 'CSE 110')?.id).toBe('a'); // e.g. another source's spelling
  });
  it('ignores deleted classes', () => {
    expect(findClassForCourse(classes, 'MATH 18')).toBeUndefined();
  });
  it('remembers deleted courses so they are not auto-created again', () => {
    expect(isDeletedCourse(classes, 'math 18')).toBe(true);
    expect(isDeletedCourse(classes, 'CSE 110')).toBe(false);
  });
});

describe('manual classes', () => {
  beforeEach(() => useStore.setState({ classes: {} }));

  it('match a course by name until a course links to them', () => {
    const classes = { m: cls('m', [], { name: 'CSE 110', manual: true }), w: cls('w', [], { name: 'Writing', manual: true }) };
    expect(findClassForCourse(classes, 'CSE 110 - Lecture A00 (FA26)')?.id).toBe('m');
    expect(findClassForCourse(classes, 'CSE 120')).toBeUndefined();
    // Once a class has aliases, its name no longer matches courses.
    expect(findClassForCourse({ a: cls('a', ['MATH 18'], { name: 'CSE 120' }) }, 'CSE 120')).toBeUndefined();
  });

  it('finds classes by name ignoring case and spacing', () => {
    const classes = { a: cls('a', [], { name: 'Piano  lessons' }), b: cls('b', [], { name: 'Old', deleted: true }) };
    expect(findClassByName(classes, ' piano lessons ')?.id).toBe('a');
    expect(findClassByName(classes, 'old')).toBeUndefined();
  });

  it('picks the first unused palette color, then cycles', () => {
    expect(nextClassColor({})).toBe(PALETTE[0]);
    expect(nextClassColor({ a: cls('a', [], { color: PALETTE[0].toUpperCase() }), b: cls('b', [], { color: PALETTE[2] }) })).toBe(PALETTE[1]);
    const full = Object.fromEntries(PALETTE.map((c, i) => [`c${i}`, cls(`c${i}`, [], { color: c })]));
    expect(nextClassColor({ ...full, x: cls('x', [], { color: PALETTE[0] }) })).toBe(PALETTE[(PALETTE.length + 1) % PALETTE.length]);
  });

  it('creates a class once per name and returns its id', () => {
    const id = createClass('  Piano   lessons ');
    const c = useStore.getState().classes[id];
    expect(c).toMatchObject({ name: 'Piano lessons', aliases: [], manual: true, color: PALETTE[0], order: 0 });
    expect(createClass('PIANO LESSONS')).toBe(id);
    expect(createClass('Chem 6A', '#123456')).not.toBe(id);
    expect(Object.keys(useStore.getState().classes)).toHaveLength(2);
    expect(createClass('   ')).toBe('');
  });

  it('makes a new class when the same-named one was deleted', () => {
    const id = createClass('Lab');
    useStore.getState().deleteClass(id);
    expect(createClass('Lab')).not.toBe(id);
  });
});

describe('setMeetingSkipped', () => {
  it('toggles one occurrence, prunes old skips, and survives a merge', () => {
    const now = Date.parse('2026-10-28T12:00:00Z');
    const lecture = { id: 'g:lec_1', uid: 'g:lec_1', calendarId: 'g', title: 'CSE 110 Lecture', start: '2026-10-28T16:00:00.000Z', end: '2026-10-28T17:20:00.000Z', allDay: false, kind: 'event' } as CalEvent;
    useStore.setState({
      classes: {
        a: cls('a', ['CSE 110'], { skipped: { 'g:old': '2026-01-05T16:00:00.000Z' } }),
        b: cls('b', ['CSE 110 LAB'], { skipped: { 'g:lab': '2026-10-27T16:00:00.000Z' } }),
      },
    });
    setMeetingSkipped('a', lecture, true, now);
    expect(useStore.getState().classes.a.skipped).toEqual({ 'g:lec_1': lecture.start });
    setMeetingSkipped('a', lecture, false, now);
    expect(useStore.getState().classes.a.skipped).toEqual({});
    setMeetingSkipped('a', lecture, true, now);
    useStore.getState().mergeClasses('b', 'a');
    expect(useStore.getState().classes.a.skipped).toEqual({ 'g:lec_1': lecture.start, 'g:lab': '2026-10-27T16:00:00.000Z' });
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

describe('updateSubtask', () => {
  it('patches one subtask on personal tasks and assignments', () => {
    const subtasks = [
      { id: 's1', title: 'one', done: false },
      { id: 's2', title: 'two', done: false, doDate: '2026-10-27' },
    ];
    useStore.setState({ tasks: {}, meta: { hw: { uid: 'hw', status: 'todo', priority: 'none', subtasks, updatedAt: 1 } } });
    const id = useStore.getState().addTask({ title: 'Test', subtasks });
    useStore.getState().updateSubtask(`t:${id}`, 's2', { done: true });
    useStore.getState().updateSubtask('a:hw', 's1', { doDate: '2026-10-28' });
    const s = useStore.getState();
    expect(s.tasks[id].subtasks.map((x) => x.done)).toEqual([false, true]);
    expect(s.tasks[id].subtasks[1].doDate).toBe('2026-10-27');
    expect(s.meta.hw.subtasks[0]).toEqual({ id: 's1', title: 'one', done: false, doDate: '2026-10-28' });
    // Unknown ids are a no-op.
    const before = s.meta.hw.updatedAt;
    useStore.getState().updateSubtask('a:hw', 'nope', { done: true });
    expect(useStore.getState().meta.hw.updatedAt).toBe(before);
  });
});
