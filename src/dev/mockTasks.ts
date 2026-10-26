// Dev-only fixture for ?mock: personal/quick tasks and planning meta on mock assignments.
// Runs after loadMockData(); only fills what is missing so edits survive reloads.
import { addDays, setHours, setMinutes, startOfDay } from 'date-fns';
import { PALETTE } from '../config';
import { useStore } from '../store';
import { dayKey, findClassForCourse } from '../store/tasks';
import type { TaskFields } from '../types';

const MARKER = 'Email TA about regrade';

export function loadMockTasks(): void {
  const s = useStore.getState();
  const today = startOfDay(new Date());
  const at = (offset: number, h: number, m = 0) => setMinutes(setHours(addDays(today, offset), h), m).toISOString();

  // Classes are normally created by useAutoClasses() after render; make the one we link to now.
  const cse =
    findClassForCourse(s.classes, 'CSE 110')?.id ??
    s.addClass({ name: 'CSE 110', color: PALETTE[0], aliases: ['CSE 110'] });

  if (!Object.values(useStore.getState().tasks).some((t) => t.title === MARKER)) {
    s.addTask({ title: MARKER, list: 'quick', estimateMin: 5 });
    s.addTask({ title: 'Reply to club Slack', list: 'quick', estimateMin: 10 });
    s.addTask({ title: 'Return library books', list: 'quick' });
    s.addTask({ title: 'Book flights for Thanksgiving', list: 'quick', estimateMin: 45, priority: 'medium' });
    s.addTask({ title: 'Pay rent', due: at(3, 17), priority: 'high' });
    s.addTask({ title: 'Grocery run', doDate: dayKey(today), estimateMin: 40 });
    s.addTask({
      title: 'Update résumé for career fair',
      due: at(9, 23, 59),
      estimateMin: 90,
      notes: 'Add CSE 110 project and the hackathon.',
      subtasks: [
        { id: 'r1', title: 'Rewrite summary', done: true },
        { id: 'r2', title: 'Add projects', done: false },
        { id: 'r3', title: 'Ask a friend to review', done: false },
      ],
    });
    s.addTask({ title: 'Call dentist', due: at(-1, 12), priority: 'low' });
    s.addTask({ title: 'Study group: review lecture 8 notes', classId: cse, doDate: dayKey(addDays(today, 1)), estimateMin: 60 });
    s.addTask({ title: 'Ask about project team roles', classId: cse, status: 'done' });
  }

  // Planning meta on assignments, keyed by title (only when the user hasn't touched them yet).
  const metaByTitle: Record<string, Partial<TaskFields>> = {
    'Homework 4': { status: 'doing', priority: 'high', estimateMin: 120, doDate: dayKey(today) },
    'Project milestone 2': {
      priority: 'high',
      estimateMin: 240,
      subtasks: [
        { id: 'm1', title: 'Write user stories', done: true },
        { id: 'm2', title: 'Wireframes', done: true },
        { id: 'm3', title: 'Set up CI', done: false },
        { id: 'm4', title: 'Sprint review slides', done: false },
        { id: 'm5', title: 'Team retro notes', done: false },
      ],
    },
    'Reading quiz 6': { estimateMin: 20, priority: 'low', doDate: dayKey(today) },
    'Problem set 5': { priority: 'medium', doDate: dayKey(addDays(today, 2)) },
    'Discussion post': { estimateMin: 15, notes: 'Respond to two classmates too.' },
  };
  const state = useStore.getState();
  for (const e of Object.values(state.eventsBySource).flat()) {
    const patch = e.kind === 'assignment' ? metaByTitle[e.title] : undefined;
    if (patch && !state.meta[e.uid]) state.updateMeta(e.uid, patch);
  }
}
