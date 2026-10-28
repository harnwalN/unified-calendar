import { describe, expect, it } from 'vitest';
import { progressVars, taskProgress } from './progress';
import type { TaskView } from '../../types';

const MIN = 60_000;

function task(p: Partial<TaskView>): TaskView {
  return {
    ref: 't:x',
    source: 'personal',
    list: 'personal',
    title: 'x',
    status: 'todo',
    priority: 'none',
    subtasks: [],
    timeTodayMs: 0,
    timeTotalMs: 0,
    ...p,
  };
}

const sub = (done: boolean, i = 0) => ({ id: `s${i}`, title: `s${i}`, done });

describe('taskProgress', () => {
  it('is 0 with nothing to go on', () => {
    expect(taskProgress(task({}))).toBe(0);
    expect(taskProgress(task({ status: 'doing', timeTotalMs: 30 * MIN }))).toBe(0);
  });

  it('is 1 when done, whatever else is set', () => {
    expect(taskProgress(task({ status: 'done' }))).toBe(1);
    expect(taskProgress(task({ status: 'done', subtasks: [sub(false)], estimateMin: 60 }))).toBe(1);
  });

  it('uses the share of subtasks done, ahead of the estimate', () => {
    expect(taskProgress(task({ subtasks: [sub(true, 1), sub(false, 2), sub(false, 3), sub(true, 4)] }))).toBe(0.5);
    expect(taskProgress(task({ subtasks: [sub(false)], estimateMin: 10, timeTotalMs: 9 * MIN }))).toBe(0);
    expect(taskProgress(task({ status: 'doing', subtasks: [sub(true), sub(true, 1)] }))).toBe(1);
  });

  it('uses tracked + live time against the estimate, capped below done', () => {
    expect(taskProgress(task({ estimateMin: 60, timeTotalMs: 15 * MIN }))).toBe(0.25);
    expect(taskProgress(task({ estimateMin: 60, timeTotalMs: 15 * MIN }), 15 * MIN)).toBe(0.5);
    expect(taskProgress(task({ estimateMin: 60, timeTotalMs: 90 * MIN }))).toBe(0.99);
  });

  it('ignores a zero estimate', () => {
    expect(taskProgress(task({ estimateMin: 0, timeTotalMs: 5 * MIN }))).toBe(0);
  });
});

describe('progressVars', () => {
  it('sets the done share and the priority tint', () => {
    expect(progressVars(task({ priority: 'high', estimateMin: 30, timeTotalMs: 10 * MIN }))).toEqual({
      '--progress': '33.3%',
      '--progress-edge': 'var(--progress-edge-color)',
      '--prio-tint': 'var(--prio-high-tint)',
    });
  });

  it('leaves the tint unset for no priority', () => {
    expect(progressVars(task({ status: 'done' }))).toEqual({ '--progress': '100%' });
  });

  it('only moves with whole minutes of live time', () => {
    const t = task({ estimateMin: 100 });
    expect(progressVars(t, 59_999)).toEqual({ '--progress': '0%' });
    expect(progressVars(t, 2 * MIN + 30_000)).toEqual({ '--progress': '2%', '--progress-edge': 'var(--progress-edge-color)' });
  });
});
