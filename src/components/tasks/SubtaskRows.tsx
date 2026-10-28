// Subtasks in the home lists: a nested bullet list under the parent's row, and a dated
// subtask as its own row in Today ("↳ Parent title").
import type { CSSProperties, MouseEvent } from 'react';
import { useStore } from '../../store';
import { dayKey } from '../../store/tasks';
import { toggleTimer } from '../../features/timer';
import type { Subtask, TaskView } from '../../types';
import Icon from '../Icon';
import { doDateLabel, dueLabel } from './format';
import type { SubtaskItem } from './grouping';
import { useTaskColor } from './TaskRow';
import './SubtaskRows.css';

function toggle(parent: TaskView, sub: Subtask) {
  useStore.getState().updateSubtask(parent.ref, sub.id, { done: !sub.done });
}

/** Small round check in the parent's color. */
function SubCheck({ parent, sub }: { parent: TaskView; sub: Subtask }) {
  return (
    <button
      className={`sub-check${sub.done ? ' done' : ''}`}
      role="checkbox"
      aria-checked={sub.done}
      aria-label={`Mark "${sub.title}" ${sub.done ? 'not done' : 'done'}`}
      onClick={() => toggle(parent, sub)}
    >
      {sub.done && <Icon name="check" />}
    </button>
  );
}

/** A task's subtasks as an indented bullet list; sits right after the parent's `<TaskRow>` in a `.task-list`. */
export function SubtaskList({ task, now }: { task: TaskView; now: Date }) {
  const color = useTaskColor(task);
  if (!task.subtasks.length || task.status === 'done') return null;
  const today = dayKey(now);
  const open = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('button')) useStore.getState().selectTask(task.ref);
  };
  return (
    <li className="task-subs" style={{ '--task-color': color } as CSSProperties}>
      <ul aria-label={`Subtasks of ${task.title}`}>
        {task.subtasks.map((s) => {
          const missed = !!s.doDate && !s.done && s.doDate < today;
          return (
            <li key={s.id} className={`sub-item${s.done ? ' done' : ''}`} onClick={open}>
              <SubCheck parent={task} sub={s} />
              <span className="sub-title">{s.title}</span>
              {s.doDate && (
                <span className={`sub-date${s.doDate === today ? ' today' : ''}${missed ? ' missed' : ''}`}>
                  {doDateLabel(s.doDate, now)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

/** A dated subtask as its own Today row; checking it checks the subtask, the timer tracks the parent. */
export function SubtaskTodayRow({ item: { parent, sub }, now }: { item: SubtaskItem; now: Date }) {
  const className = useStore((s) => (parent.classId ? s.classes[parent.classId]?.name : undefined));
  const running = useStore((s) => s.runningTimer?.taskRef === parent.ref);
  const color = useTaskColor(parent);
  const due = parent.due ? dueLabel(parent.due, now) : undefined;
  const missed = sub.doDate < dayKey(now);
  const select = () => useStore.getState().selectTask(parent.ref);
  return (
    <li
      className={`task-row sub-row${sub.done ? ' done' : ''}${running ? ' running' : ''}`}
      style={{ '--task-color': color } as CSSProperties}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button')) select();
      }}
    >
      <span className="sub-row-check">
        <SubCheck parent={parent} sub={sub} />
      </span>
      <div className="task-main">
        <button className="task-title" onClick={select} title={sub.title}>
          {sub.title}
        </button>
        <div className="task-meta">
          <span className="sub-parent" title={`Subtask of ${parent.title}`}>
            <span aria-hidden="true">↳</span>
            <span className="sr-only">Subtask of</span> {parent.title}
          </span>
          {className && (
            <span className="task-chip">
              <span className="task-dot" aria-hidden="true" />
              {className}
            </span>
          )}
          {missed && <span className="task-plan sub-missed">Planned {doDateLabel(sub.doDate, now)}</span>}
          {due && (
            <span className={`task-due${due.overdue ? ' overdue' : ''}`}>
              <Icon name={due.overdue ? 'error' : 'schedule'} size={15} />
              Due {due.text}
            </span>
          )}
        </div>
      </div>
      <div className="task-actions">
        <button
          className={`icon-btn small task-timer${running ? ' on' : ''}`}
          onClick={() => toggleTimer(parent.ref)}
          aria-label={running ? `Stop timer for ${parent.title}` : `Start timer for ${parent.title}`}
          aria-pressed={running}
          title={running ? 'Stop timer' : `Start timer (tracks ${parent.title})`}
        >
          <Icon name={running ? 'stop' : 'play_arrow'} />
        </button>
      </div>
    </li>
  );
}
