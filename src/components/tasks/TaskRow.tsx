import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { useStore } from '../../store';
import { dayKey, useClasses } from '../../store/tasks';
import { toggleTimer, useRunningElapsed } from '../../features/timer';
import type { Priority, TaskStatus, TaskView } from '../../types';
import Icon from '../Icon';
import { doDateLabel, dueLabel, formatDuration, formatEstimate } from './format';
import { deleteTaskWithUndo } from './TaskDetail';
import { progressVars } from './progress';
import { format } from 'date-fns';
import './TaskRow.css';

const LONG_PRESS_MS = 500;

export const PRIORITY_LABEL: Record<Priority, string> = { none: 'No priority', low: 'Low', medium: 'Medium', high: 'High' };
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'Not started', doing: 'In progress', done: 'Done' };

/** Class color, else the calendar color, else the theme primary. */
export function useTaskColor(task: Pick<TaskView, 'classId' | 'calendarId'>): string {
  return useStore(
    (s) =>
      (task.classId && s.classes[task.classId]?.color) ||
      (task.calendarId && s.calendars[task.calendarId]?.color) ||
      'var(--primary)',
  );
}

interface Props {
  task: TaskView;
  now: Date;
  /** Show the class chip (off inside the class's own section). */
  showClass?: boolean;
  /** Emphasise (e.g. a quick item that fits the current free gap). */
  highlight?: boolean;
}

export default function TaskRow({ task, now, showClass = true, highlight }: Props) {
  const selectTask = useStore((s) => s.selectTask);
  const className = useStore((s) => (task.classId ? s.classes[task.classId]?.name : undefined));
  const running = useStore((s) => s.runningTimer?.taskRef === task.ref);
  const live = useRunningElapsed(task.ref);
  const color = useTaskColor(task);
  const done = task.status === 'done';
  const due = task.due ? dueLabel(task.due, now) : undefined;
  const tracked = task.timeTodayMs + live;
  const subDone = task.subtasks.filter((s) => s.done).length;
  const plannedToday = task.doDate === dayKey(now);
  const nextBlock = task.blocks?.find((b) => Date.parse(b.start) + b.durationMin * 60_000 > now.getTime());

  // Anywhere on the row opens details, except its own controls.
  const open = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('button, a, input, [role="menu"]')) selectTask(task.ref);
  };

  return (
    <li
      className={`task-row${done ? ' done' : ''}${task.status === 'doing' ? ' doing' : ''}${highlight ? ' highlight' : ''}${running ? ' running' : ''}`}
      style={{ '--task-color': color, ...progressVars(task, live) } as CSSProperties}
      onClick={open}
    >
      <StatusCheck task={task} />
      <div className="task-main">
        <button className="task-title" onClick={() => selectTask(task.ref)} title={task.title}>
          {task.title || '(Untitled)'}
        </button>
        <div className="task-meta">
          {task.priority !== 'none' && (
            <span className={`task-flag ${task.priority}`} title={`${PRIORITY_LABEL[task.priority]} priority`}>
              <Icon name="flag" size={16} />
              <span className="sr-only">{PRIORITY_LABEL[task.priority]} priority</span>
            </span>
          )}
          {showClass && className && (
            <span className="task-chip">
              <span className="task-dot" aria-hidden="true" />
              {className}
            </span>
          )}
          {due && (
            <span className={`task-due${due.overdue && !done ? ' overdue' : ''}`}>
              <Icon name={due.overdue && !done ? 'error' : 'schedule'} size={15} />
              {due.text}
            </span>
          )}
          {task.doDate && !done && (
            <span className={`task-plan${plannedToday ? ' today' : ''}`}>Plan: {doDateLabel(task.doDate, now)}</span>
          )}
          {nextBlock && !done && (
            <span className="task-plan scheduled" title="Next scheduled work session">
              <Icon name="event_available" size={15} />
              {nextBlockLabel(nextBlock.start, now)}
            </span>
          )}
          {task.subtasks.length > 0 && (
            <span className="task-sub" title={`${subDone} of ${task.subtasks.length} subtasks done`}>
              <Icon name="checklist" size={15} />
              {subDone}/{task.subtasks.length}
            </span>
          )}
          {task.estimateMin !== undefined && !done && (
            <span className="task-est" title="Estimate">
              ~{formatEstimate(task.estimateMin)}
            </span>
          )}
        </div>
      </div>
      {tracked > 0 && (
        <span className="task-tracked" title="Tracked today">
          {formatDuration(tracked)}
        </span>
      )}
      <div className="task-actions">
        <button
          className={`icon-btn small task-timer${running ? ' on' : ''}`}
          onClick={() => toggleTimer(task.ref)}
          aria-label={running ? `Stop timer for ${task.title}` : `Start timer for ${task.title}`}
          aria-pressed={running}
          title={running ? 'Stop timer' : 'Start timer'}
        >
          <Icon name={running ? 'stop' : 'play_arrow'} />
        </button>
        <RowMenu task={task} />
      </div>
    </li>
  );
}

/** Click: todo/doing → done, done → todo. Long-press / right-click toggles "In progress". */
export function StatusCheck({ task, size = 'm' }: { task: TaskView; size?: 's' | 'm' }) {
  const setTaskStatus = useStore((s) => s.setTaskStatus);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const longPressed = useRef(false);
  const toggleDoing = () => setTaskStatus(task.ref, task.status === 'doing' ? 'todo' : 'doing');
  const cancel = () => clearTimeout(timer.current);
  useEffect(() => cancel, []);

  const label =
    task.status === 'done' ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`;
  return (
    <button
      className={`status-check ${task.status} ${size}`}
      role="checkbox"
      aria-checked={task.status === 'done' ? true : task.status === 'doing' ? 'mixed' : false}
      aria-label={label}
      title={`${STATUS_LABEL[task.status]} — click to ${task.status === 'done' ? 'reopen' : 'complete'}, long-press for In progress`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        longPressed.current = false;
        timer.current = setTimeout(() => {
          longPressed.current = true;
          toggleDoing();
          navigator.vibrate?.(15);
        }, LONG_PRESS_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => {
        e.preventDefault();
        cancel();
        if (!longPressed.current) toggleDoing();
      }}
      onClick={() => {
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        setTaskStatus(task.ref, task.status === 'done' ? 'todo' : 'done');
      }}
    >
      {task.status === 'done' && <Icon name="check" />}
    </button>
  );
}

/** "Today 2:00 PM" / "Wed 2:00 PM" / "Nov 3 2:00 PM" for the next work session. */
function nextBlockLabel(startIso: string, now: Date): string {
  const d = new Date(startIso);
  const day = dayKey(d) === dayKey(now) ? 'Today' : d.getTime() - now.getTime() < 6 * 86_400_000 ? format(d, 'EEE') : format(d, 'MMM d');
  return `${day} ${format(d, 'h:mm a')}`;
}

function RowMenu({ task }: { task: TaskView }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const s = useStore.getState;

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

  const act = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };
  const today = dayKey(new Date());
  const classes = useClasses();
  const personalId = task.source === 'personal' ? task.ref.slice(2) : null;
  const move = (patch: { list: 'personal' | 'quick'; classId?: string }) =>
    act(() => s().updateTask(personalId!, { ...patch, classId: patch.classId }));

  return (
    <div className="task-menu" ref={ref}>
      <button
        className="icon-btn small"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions for ${task.title}`}
        title="More"
      >
        <Icon name="more_vert" />
      </button>
      {open && (
        <ul className="menu" role="menu">
          {(['todo', 'doing', 'done'] as const).map((st) => (
            <li key={st} role="none">
              <button
                role="menuitemradio"
                aria-checked={task.status === st}
                className={task.status === st ? 'active' : undefined}
                onClick={act(() => s().setTaskStatus(task.ref, st))}
              >
                {STATUS_LABEL[st]}
              </button>
            </li>
          ))}
          <li role="none">
            <button
              role="menuitem"
              onClick={act(() => s().updateTaskFields(task.ref, { doDate: task.doDate === today ? undefined : today }))}
            >
              {task.doDate === today ? 'Remove from today’s plan' : 'Plan for today'}
            </button>
          </li>
          <li role="none">
            <button role="menuitem" onClick={act(() => s().selectTask(task.ref))}>
              Open details
            </button>
          </li>
          {personalId && (
            <>
              <li role="separator" className="menu-label">Move to</li>
              <li role="none">
                <button role="menuitemradio" aria-checked={task.list === 'personal'} className={task.list === 'personal' ? 'active' : undefined} onClick={move({ list: 'personal' })}>
                  Personal
                </button>
              </li>
              <li role="none">
                <button role="menuitemradio" aria-checked={task.list === 'quick'} className={task.list === 'quick' ? 'active' : undefined} onClick={move({ list: 'quick' })}>
                  Quick items
                </button>
              </li>
              {classes.map((c) => (
                <li key={c.id} role="none">
                  <button
                    role="menuitemradio"
                    aria-checked={task.classId === c.id}
                    className={task.classId === c.id ? 'active' : undefined}
                    onClick={move({ list: 'personal', classId: c.id })}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
              <li role="separator" className="menu-divider" />
              <li role="none">
                <button role="menuitem" className="menu-danger" onClick={act(() => deleteTaskWithUndo(personalId, task.title))}>
                  Delete
                  <Icon name="delete" />
                </button>
              </li>
            </>
          )}
        </ul>
      )}
    </div>
  );
}
