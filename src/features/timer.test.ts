import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { useStore } from '../store';
import type { TaskView } from '../types';
import { lastTimedRef, logTime, startTimer, stopOrResume, stopTimer, taskLabel, toggleTimer } from './timer';

const live = () => Object.values(useStore.getState().timeEntries).filter((e) => !e.deleted);
const local = (d: number, h: number, m = 0, s = 0) => new Date(2026, 9, d, h, m, s);

beforeEach(() => {
  vi.useFakeTimers();
  useStore.setState({ timeEntries: {}, runningTimer: null });
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe('timer', () => {
  it('logs an entry when stopped', () => {
    vi.setSystemTime(local(26, 9));
    startTimer('t:a');
    expect(useStore.getState().runningTimer?.taskRef).toBe('t:a');
    vi.setSystemTime(local(26, 9, 30));
    stopTimer();
    expect(useStore.getState().runningTimer).toBeNull();
    const [e] = live();
    expect(e.taskRef).toBe('t:a');
    expect(Date.parse(e.end) - Date.parse(e.start)).toBe(30 * 60_000);
  });

  it('drops entries shorter than 5 seconds', () => {
    vi.setSystemTime(local(26, 9));
    startTimer('t:a');
    vi.setSystemTime(local(26, 9, 0, 4));
    stopTimer();
    expect(live()).toHaveLength(0);
  });

  it('starting another task stops and logs the current one', () => {
    vi.setSystemTime(local(26, 9));
    startTimer('t:a');
    vi.setSystemTime(local(26, 9, 10));
    startTimer('a:b');
    expect(useStore.getState().runningTimer?.taskRef).toBe('a:b');
    expect(live().map((e) => e.taskRef)).toEqual(['t:a']);
    vi.setSystemTime(local(26, 9, 20));
    toggleTimer('a:b');
    expect(useStore.getState().runningTimer).toBeNull();
    expect(live()).toHaveLength(2);
  });

  it('splits a timer that crosses local midnight into per-day entries', () => {
    vi.setSystemTime(local(26, 23, 30));
    startTimer('t:a');
    vi.setSystemTime(local(27, 1, 15));
    stopTimer();
    const entries = live().sort((a, b) => a.start.localeCompare(b.start));
    expect(entries).toHaveLength(2);
    expect(entries[0].end).toBe(local(27, 0).toISOString());
    expect(entries[1].start).toBe(local(27, 0).toISOString());
    expect(entries[1].end).toBe(local(27, 1, 15).toISOString());
  });

  it('logTime splits multi-day spans', () => {
    expect(logTime('t:a', local(25, 22).getTime(), local(27, 2).getTime())).toHaveLength(3);
  });

  it('Shift+Space helper stops, then resumes the last task', () => {
    vi.setSystemTime(local(26, 9));
    startTimer('t:a');
    expect(lastTimedRef()).toBe('t:a');
    vi.setSystemTime(local(26, 9, 5));
    stopOrResume();
    expect(useStore.getState().runningTimer).toBeNull();
    stopOrResume();
    expect(useStore.getState().runningTimer?.taskRef).toBe('t:a');
  });
});

describe('taskLabel', () => {
  const task = (p: Partial<TaskView>): TaskView => ({
    ref: 't:x', source: 'personal', list: 'personal', title: 'X', status: 'todo', priority: 'none',
    subtasks: [], timeTodayMs: 0, timeTotalMs: 0, ...p,
  });
  const classes = { c: { id: 'c', name: 'CSE 110', color: '#123456', aliases: [], order: 0, updatedAt: 1 } };

  it('resolves class, personal, quick and missing tasks', () => {
    const index = new Map([
      ['a:1', task({ ref: 'a:1', classId: 'c', title: 'Lab' })],
      ['t:2', task({ ref: 't:2', title: 'Laundry', list: 'quick' })],
      ['t:3', task({ ref: 't:3', title: 'Read' })],
    ] as const);
    expect(taskLabel('a:1', index, classes)).toMatchObject({ title: 'Lab', groupKey: 'c', groupName: 'CSE 110', color: '#123456' });
    expect(taskLabel('t:2', index, classes)).toMatchObject({ groupKey: 'quick', groupName: 'Quick' });
    expect(taskLabel('t:3', index, classes)).toMatchObject({ groupKey: 'personal', groupName: 'Personal' });
    expect(taskLabel('t:gone', index, classes)).toMatchObject({ title: 'Deleted task', deleted: true });
  });
});
