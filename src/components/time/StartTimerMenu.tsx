// "▶ Start timer" button for the top bar: pick (or create) a task and start its stopwatch.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useStore } from '../../store';
import { dayKey, useTasks } from '../../store/tasks';
import { startTimer } from '../../features/timer';
import type { TaskRef, TaskView } from '../../types';
import Icon from '../Icon';
import './StartTimerMenu.css';

const MAX_ROWS = 8;

/** Recently timed first, then planned/due today, then everything else open by due date. */
export function rankTimerChoices(tasks: TaskView[], recent: TaskRef[], today: string, query: string): TaskView[] {
  const q = query.trim().toLowerCase();
  const open = tasks.filter((t) => t.status !== 'done' && (!q || t.title.toLowerCase().includes(q) || t.course?.toLowerCase().includes(q)));
  const score = (t: TaskView) => {
    const r = recent.indexOf(t.ref);
    if (r >= 0) return r;
    if (t.doDate === today || (t.due && dayKey(t.due) <= today)) return 100;
    return 200;
  };
  return open.sort((a, b) => score(a) - score(b) || (a.due ?? '￿').localeCompare(b.due ?? '￿')).slice(0, MAX_ROWS);
}

/** The last three distinct tasks that had time logged, most recent first. */
export function useRecentTimedRefs(): TaskRef[] {
  const entries = useStore((s) => s.timeEntries);
  return useMemo(() => {
    const seen: TaskRef[] = [];
    for (const e of Object.values(entries).filter((e) => !e.deleted).sort((a, b) => b.end.localeCompare(a.end))) {
      if (!seen.includes(e.taskRef)) seen.push(e.taskRef);
      if (seen.length === 3) break;
    }
    return seen;
  }, [entries]);
}

export default function StartTimerMenu() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const tasks = useTasks();
  const classes = useStore((s) => s.classes);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const recent = useRecentTimedRefs();
  const choices = useMemo(
    () => (open ? rankTimerChoices(tasks, recent, dayKey(new Date()), query) : []),
    [open, tasks, recent, query],
  );

  const start = (ref: TaskRef) => {
    startTimer(ref);
    setOpen(false);
    setQuery('');
  };
  const createAndStart = () => {
    const id = useStore.getState().addTask({ title: query.trim() });
    start(`t:${id}`);
  };

  return (
    <div className="start-timer" ref={ref}>
      <button className="start-timer-btn" onClick={() => setOpen(!open)} aria-haspopup="dialog" aria-expanded={open} title="Start a stopwatch on a task">
        <Icon name="play_arrow" />
        <span className="start-timer-label">Start timer</span>
      </button>
      {open && (
        <div className="start-timer-pop" role="dialog" aria-label="Start timer">
          <input
            className="start-timer-search"
            autoFocus
            placeholder="What are you working on?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              if (choices[0]) start(choices[0].ref);
              else if (query.trim()) createAndStart();
            }}
          />
          <ul className="start-timer-list">
            {choices.map((t) => {
              const cls = t.classId ? classes[t.classId] : undefined;
              return (
                <li key={t.ref}>
                  <button onClick={() => start(t.ref)} style={{ '--task-color': cls?.color ?? 'var(--text-3)' } as CSSProperties}>
                    <span className="start-timer-dot" aria-hidden="true" />
                    <span className="start-timer-title">{t.title}</span>
                    {recent.includes(t.ref) && <span className="start-timer-tag">Recent</span>}
                    <Icon name="play_arrow" className="start-timer-go" />
                  </button>
                </li>
              );
            })}
            {query.trim() && (
              <li>
                <button onClick={createAndStart}>
                  <Icon name="add" />
                  <span className="start-timer-title">
                    New task “{query.trim()}” and start
                  </span>
                </button>
              </li>
            )}
            {!choices.length && !query.trim() && <li className="start-timer-empty">No open tasks yet — type to create one.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
