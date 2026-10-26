import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { addDays, format } from 'date-fns';
import { newId, taskRef, useStore } from '../../store';
import { dayKey, useClasses, useTasks } from '../../store/tasks';
import { toggleTimer, useRunningElapsed } from '../../features/timer';
import type { Priority, TaskStatus, TaskView } from '../../types';
import Icon from '../Icon';
import { safeHref } from '../eventText';
import TaskTimeEntries from '../time/TaskTimeEntries';
import { dueLabel, formatDuration, formatEstimate, openLinkLabel, relativeDue } from './format';
import { PRIORITY_LABEL, STATUS_LABEL, StatusCheck, useTaskColor } from './TaskRow';
import './TaskDetail.css';

const STATUSES: TaskStatus[] = ['todo', 'doing', 'done'];
const PRIORITIES: Priority[] = ['none', 'low', 'medium', 'high'];
const ESTIMATES = [10, 30, 60, 120];

/** Drawer for `selectedTaskRef`: right panel on desktop, bottom sheet on phones. */
export default function TaskDetail() {
  const ref = useStore((s) => s.selectedTaskRef);
  const tasks = useTasks();
  const task = ref ? tasks.find((t) => t.ref === ref) : undefined;
  const [undo, setUndo] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);

  return (
    <>
      {task && <Drawer key={task.ref} task={task} onDeleted={(id, title) => setUndo({ id, title })} />}
      {undo && (
        <div className="td-toast" role="status">
          <span>Deleted “{undo.title}”</span>
          <button
            className="text-btn"
            onClick={() => {
              useStore.getState().updateTask(undo.id, { deleted: false });
              setUndo(null);
            }}
          >
            Undo
          </button>
        </div>
      )}
    </>
  );
}

function Drawer({ task, onDeleted }: { task: TaskView; onDeleted: (id: string, title: string) => void }) {
  const selectTask = useStore((s) => s.selectTask);
  const updateTaskFields = useStore((s) => s.updateTaskFields);
  const updateTask = useStore((s) => s.updateTask);
  const running = useStore((s) => s.runningTimer?.taskRef === task.ref);
  const live = useRunningElapsed(task.ref);
  const classes = useClasses();
  const color = useTaskColor(task);
  const panelRef = useRef<HTMLDivElement>(null);
  const personal = task.source === 'personal';
  const id = taskRef.parse(task.ref).id;
  const close = () => selectTask(null);
  const now = new Date();
  const href = safeHref(task.url);
  const cls = task.classId ? classes.find((c) => c.id === task.classId) : undefined;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('.td-close')?.focus();
    // Keys from inside the panel are handled by its own onKeyDown (so nested editors can stop them).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || panelRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
      useStore.getState().selectTask(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  const patch = (p: Parameters<typeof updateTaskFields>[1]) => updateTaskFields(task.ref, p);

  return (
    <>
      <div className="scrim td-scrim" onClick={close} />
      <aside
        ref={panelRef}
        className="task-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="td-title"
        style={{ '--task-color': color } as CSSProperties}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !e.defaultPrevented) {
            e.preventDefault();
            close();
          }
        }}
      >
        <div className="td-bar">
          <span className="td-handle" aria-hidden="true" />
          <span className="td-kind">
            <Icon name={personal ? (task.list === 'quick' ? 'bolt' : 'task_alt') : 'assignment'} size={18} />
            {personal ? (task.list === 'quick' ? 'Quick item' : 'Personal task') : 'Assignment'}
          </span>
          <button
            className={`icon-btn td-timer${running ? ' on' : ''}`}
            onClick={() => toggleTimer(task.ref)}
            aria-pressed={running}
            aria-label={running ? 'Stop timer' : 'Start timer'}
            title={running ? 'Stop timer' : 'Start timer'}
          >
            <Icon name={running ? 'stop_circle' : 'play_circle'} />
          </button>
          {personal && (
            <button
              className="icon-btn"
              onClick={() => {
                useStore.getState().deleteTask(id);
                onDeleted(id, task.title);
                close();
              }}
              aria-label="Delete task"
              title="Delete task"
            >
              <Icon name="delete" />
            </button>
          )}
          <button className="icon-btn td-close" onClick={close} aria-label="Close" title="Close (Esc)">
            <Icon name="close" />
          </button>
        </div>

        <div className="td-body">
          <div className="td-title-row">
            <StatusCheck task={task} />
            {personal ? (
              <TitleInput id={id} title={task.title} />
            ) : (
              <h2 id="td-title" className="td-title">
                {task.title}
              </h2>
            )}
          </div>
          {(cls || task.course) && !personal && (
            <p className="td-course">
              <span className="task-dot" aria-hidden="true" />
              {cls?.name ?? task.course}
            </p>
          )}
          {(task.timeTotalMs > 0 || live > 0) && (
            <p className="td-tracked">
              <Icon name="timer" size={16} />
              {task.timeTodayMs + live > 0 && `${formatDuration(task.timeTodayMs + live)} today · `}
              {formatDuration(task.timeTotalMs + live)} total
            </p>
          )}

          <Field label="Status">
            <Segmented
              name="Status"
              value={task.status}
              options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
              onChange={(status) => patch({ status })}
            />
          </Field>

          <Field label="Priority">
            <Segmented
              name="Priority"
              value={task.priority}
              options={PRIORITIES.map((p) => ({ value: p, label: p === 'none' ? 'None' : PRIORITY_LABEL[p], className: p }))}
              onChange={(priority) => patch({ priority })}
            />
          </Field>

          <Field label="Due" htmlFor={personal ? 'td-due' : undefined}>
            {personal ? (
              <div className="td-inline">
                <input
                  id="td-due"
                  type="datetime-local"
                  className="td-input"
                  value={task.due ? format(new Date(task.due), "yyyy-MM-dd'T'HH:mm") : ''}
                  onChange={(e) =>
                    updateTask(id, { due: e.target.value ? new Date(e.target.value).toISOString() : undefined })
                  }
                />
                {task.due && (
                  <button className="icon-btn small" onClick={() => updateTask(id, { due: undefined })} aria-label="Clear due date">
                    <Icon name="close" />
                  </button>
                )}
              </div>
            ) : task.due ? (
              <p className={`td-static${dueLabel(task.due, now).overdue && task.status !== 'done' ? ' overdue' : ''}`}>
                {format(new Date(task.due), 'EEEE, MMM d · h:mm a')}
                <span className="td-sub"> ({relativeDue(task.due, now)})</span>
              </p>
            ) : (
              <p className="td-static">No due date</p>
            )}
          </Field>

          <Field label="Plan to work on" htmlFor="td-do">
            <div className="td-inline td-wrap">
              <input
                id="td-do"
                type="date"
                className="td-input"
                value={task.doDate ?? ''}
                onChange={(e) => patch({ doDate: e.target.value || undefined })}
              />
              {[
                ['Today', dayKey(now)],
                ['Tomorrow', dayKey(addDays(now, 1))],
              ].map(([label, key]) => (
                <button
                  key={label}
                  className={`td-chip${task.doDate === key ? ' active' : ''}`}
                  aria-pressed={task.doDate === key}
                  onClick={() => patch({ doDate: task.doDate === key ? undefined : key })}
                >
                  {label}
                </button>
              ))}
              {task.doDate && (
                <button className="icon-btn small" onClick={() => patch({ doDate: undefined })} aria-label="Clear plan date">
                  <Icon name="close" />
                </button>
              )}
            </div>
          </Field>

          <Field label="Estimate" htmlFor="td-est">
            <div className="td-inline td-wrap">
              <label className="td-est-input">
                <input
                  id="td-est"
                  type="number"
                  min={0}
                  step={5}
                  inputMode="numeric"
                  className="td-input"
                  value={task.estimateMin ?? ''}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    patch({ estimateMin: Number.isFinite(v) && v > 0 ? v : undefined });
                  }}
                />
                <span>min</span>
              </label>
              {ESTIMATES.map((m) => (
                <button
                  key={m}
                  className={`td-chip${task.estimateMin === m ? ' active' : ''}`}
                  aria-pressed={task.estimateMin === m}
                  onClick={() => patch({ estimateMin: task.estimateMin === m ? undefined : m })}
                >
                  {formatEstimate(m)}
                </button>
              ))}
            </div>
          </Field>

          {personal && (
            <Field label="Class" htmlFor="td-class">
              <div className="td-inline td-wrap">
                <select
                  id="td-class"
                  className="td-input"
                  value={task.classId ?? ''}
                  onChange={(e) => updateTask(id, { classId: e.target.value || undefined })}
                >
                  <option value="">No class</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <label className="td-switch">
                  <input
                    type="checkbox"
                    checked={task.list === 'quick'}
                    onChange={(e) => updateTask(id, { list: e.target.checked ? 'quick' : 'personal' })}
                  />
                  Quick item
                </label>
              </div>
            </Field>
          )}

          <Field label="Notes" htmlFor="td-notes">
            <textarea
              id="td-notes"
              className="td-input td-notes"
              rows={3}
              placeholder="Add notes"
              value={task.notes ?? ''}
              onChange={(e) => patch({ notes: e.target.value || undefined })}
            />
          </Field>

          <Subtasks task={task} />

          {href && (
            <a className="filled-btn td-link" href={href} target="_blank" rel="noopener noreferrer">
              <Icon name="open_in_new" size={18} />
              {openLinkLabel(href)}
            </a>
          )}

          <TaskTimeEntries taskRef={task.ref} />
        </div>
      </aside>
    </>
  );
}

/** Edits locally and saves on every change; an emptied title falls back on blur. */
function TitleInput({ id, title }: { id: string; title: string }) {
  const updateTask = useStore((s) => s.updateTask);
  return (
    <textarea
      id="td-title"
      className="td-title td-title-input"
      aria-label="Title"
      rows={1}
      value={title}
      onChange={(e) => updateTask(id, { title: e.target.value.replace(/\n/g, ' ') })}
      onBlur={(e) => {
        if (!e.target.value.trim()) updateTask(id, { title: 'Untitled task' });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="td-field">
      {htmlFor ? (
        <label className="td-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="td-label">{label}</span>
      )}
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: { value: T; label: string; className?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="td-seg" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={`${o.className ?? ''}${value === o.value ? ' active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {value === o.value && <Icon name="check" size={16} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Subtasks({ task }: { task: TaskView }) {
  const updateTaskFields = useStore((s) => s.updateTaskFields);
  const [draft, setDraft] = useState('');
  const set = (subtasks: TaskView['subtasks']) => updateTaskFields(task.ref, { subtasks });
  const done = task.subtasks.filter((s) => s.done).length;

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    set([...task.subtasks, { id: newId(), title, done: false }]);
    setDraft('');
  };
  const move = (i: number, dir: -1 | 1) => {
    const next = [...task.subtasks];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    set(next);
  };

  return (
    <div className="td-field">
      <span className="td-label">
        Subtasks{task.subtasks.length > 0 && ` · ${done}/${task.subtasks.length}`}
      </span>
      {task.subtasks.length > 0 && (
        <ul className="td-subtasks">
          {task.subtasks.map((s, i) => (
            <li key={s.id} className={s.done ? 'done' : undefined}>
              <label className="td-sub-check">
                <input
                  type="checkbox"
                  checked={s.done}
                  onChange={() => set(task.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))}
                />
                <span>{s.title}</span>
              </label>
              <span className="td-sub-actions">
                <button className="icon-btn small" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move "${s.title}" up`}>
                  <Icon name="arrow_upward" />
                </button>
                <button
                  className="icon-btn small"
                  disabled={i === task.subtasks.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={`Move "${s.title}" down`}
                >
                  <Icon name="arrow_downward" />
                </button>
                <button
                  className="icon-btn small"
                  onClick={() => set(task.subtasks.filter((x) => x.id !== s.id))}
                  aria-label={`Delete subtask "${s.title}"`}
                >
                  <Icon name="close" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="td-sub-add">
        <Icon name="add" />
        <input
          type="text"
          placeholder="Add a subtask"
          aria-label="Add a subtask"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
        />
      </div>
    </div>
  );
}
