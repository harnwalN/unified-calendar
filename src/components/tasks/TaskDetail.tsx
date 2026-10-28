import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { format } from 'date-fns';
import { taskRef, useStore } from '../../store';
import { useClasses, useTasks } from '../../store/tasks';
import { toggleTimer, useRunningElapsed } from '../../features/timer';
import type { TaskStatus, TaskView } from '../../types';
import Icon from '../Icon';
import { safeHref } from '../eventText';
import TaskTimeEntries from '../time/TaskTimeEntries';
import { dueLabel, formatDuration, openLinkLabel, relativeDue } from './format';
import { formatBlock } from './schedule';
import { DoDateField, DueInput, EstimateField, Field, ListField, NotesField, PriorityField, Segmented, SubtaskEditor } from './TaskFields';
import { STATUS_LABEL, StatusCheck, useTaskColor } from './TaskRow';
import './TaskDetail.css';

const STATUSES: TaskStatus[] = ['todo', 'doing', 'done'];

type Deleted = { id: string; title: string };
const deletedListeners = new Set<(d: Deleted) => void>();

/** Delete a personal task from anywhere and offer the shared "Undo" toast. */
export function deleteTaskWithUndo(id: string, title: string) {
  useStore.getState().deleteTask(id);
  deletedListeners.forEach((l) => l({ id, title }));
}

/** Drawer for `selectedTaskRef`: right panel on desktop, bottom sheet on phones. */
export default function TaskDetail() {
  const ref = useStore((s) => s.selectedTaskRef);
  const tasks = useTasks();
  const task = ref ? tasks.find((t) => t.ref === ref) : undefined;
  const [undo, setUndo] = useState<Deleted | null>(null);

  useEffect(() => {
    deletedListeners.add(setUndo);
    return () => void deletedListeners.delete(setUndo);
  }, []);
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

          <PriorityField value={task.priority} onChange={(priority) => patch({ priority })} />

          <Field label="Due" htmlFor={personal ? 'td-due' : undefined}>
            {personal ? (
              <DueInput id="td-due" value={task.due} onChange={(due) => updateTask(id, { due })} />
            ) : task.due ? (
              <p className={`td-static${dueLabel(task.due, now).overdue && task.status !== 'done' ? ' overdue' : ''}`}>
                {format(new Date(task.due), 'EEEE, MMM d · h:mm a')}
                <span className="td-sub"> ({relativeDue(task.due, now)})</span>
              </p>
            ) : (
              <p className="td-static">No due date</p>
            )}
          </Field>

          <DoDateField id="td-do" value={task.doDate} onChange={(doDate) => patch({ doDate })} />

          <EstimateField id="td-est" value={task.estimateMin} onChange={(estimateMin) => patch({ estimateMin })} />

          {personal && (
            <ListField
              id="td-class"
              list={task.list === 'quick' ? 'quick' : 'personal'}
              classId={task.classId}
              onChange={(p) => updateTask(id, p)}
            />
          )}

          <SubtaskEditor subtasks={task.subtasks} due={task.due} onChange={(subtasks) => patch({ subtasks })} />

          <NotesField id="td-notes" value={task.notes} onChange={(notes) => patch({ notes })} />

          <LegacyBlocks task={task} now={now} />

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

/** Work sessions scheduled before subtasks replaced them: still shown (and removable), no longer created here. */
function LegacyBlocks({ task, now }: { task: TaskView; now: Date }) {
  const upcoming = (task.blocks ?? []).filter((b) => Date.parse(b.start) + b.durationMin * 60_000 > now.getTime());
  if (!upcoming.length) return null;
  const remove = (blockId: string) =>
    useStore.getState().updateTaskFields(task.ref, { blocks: (task.blocks ?? []).filter((b) => b.id !== blockId) });
  return (
    <Field label="Scheduled work sessions">
      <ul className="td-blocks">
        {upcoming.map((b) => (
          <li key={b.id}>
            <Icon name="schedule" size={18} />
            <span>{formatBlock(b)}</span>
            <button className="icon-btn small" onClick={() => remove(b.id)} aria-label={`Remove ${formatBlock(b)}`}>
              <Icon name="close" />
            </button>
          </li>
        ))}
      </ul>
    </Field>
  );
}
