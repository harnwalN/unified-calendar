import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { format } from 'date-fns';
import { useStore } from '../../store';
import { useClasses } from '../../store/tasks';
import { buildDraft, parseQuickAdd, type AddTarget, type TaskDraft } from '../../lib/quickAdd';
import Icon from '../Icon';
import { doDateLabel, formatEstimate } from './format';
import { DoDateField, DueInput, EstimateField, Field, ListField, NotesField, PriorityField, SubtaskEditor } from './TaskFields';
import { PRIORITY_LABEL } from './TaskRow';
import './QuickAdd.css';

export const QUICK_ADD_ID = 'quick-add-input';
const FORM_ID = 'quick-add-form';
const OPEN_EVENT = 'quick-add:open';

/** Open the full add form in the main tab, pre-filled with typed text (used by the mini window). */
export function openQuickAdd(text = '') {
  useStore.getState().setTimePageOpen(false);
  window.focus();
  window.dispatchEvent(new CustomEvent<string>(OPEN_EVENT, { detail: text }));
}

export default function QuickAdd() {
  const [text, setText] = useState('');
  const [target, setTarget] = useState<AddTarget>('personal');
  // "More options": the same fields as the details drawer. Typed shortcuts pre-fill them;
  // anything changed in the form wins over the text.
  const [expanded, setExpanded] = useState(false);
  const [edits, setEdits] = useState<Partial<TaskDraft>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const classes = useClasses();
  const addTask = useStore((s) => s.addTask);
  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text, new Date(), classes) : null), [text, classes]);
  const draft = buildDraft(parsed, target, edits);
  const title = parsed?.title ?? '';
  const cls = draft.classId ? classes.find((c) => c.id === draft.classId) : undefined;
  const edit = (p: Partial<TaskDraft>) => setEdits((e) => ({ ...e, ...p }));

  useEffect(() => {
    const open = (e: Event) => {
      setText((e as CustomEvent<string>).detail);
      setEdits({});
      setExpanded(true);
      inputRef.current?.scrollIntoView({ block: 'center' });
      inputRef.current?.focus();
    };
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  const submit = () => {
    if (!title) {
      inputRef.current?.focus();
      return;
    }
    addTask({ title, ...draft });
    setText('');
    setEdits({});
    setExpanded(false);
  };
  const collapse = () => {
    setExpanded(false);
    inputRef.current?.focus();
  };

  const now = new Date();
  return (
    <div className={`quick-add${expanded ? ' expanded' : ''}`} style={{ '--task-color': cls?.color ?? 'var(--primary)' } as CSSProperties}>
      <div className="quick-add-field">
        <Icon name="add_task" className="quick-add-icon" />
        <input
          ref={inputRef}
          id={QUICK_ADD_ID}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') {
              if (expanded) setExpanded(false);
              else {
                setText('');
                setEdits({});
                e.currentTarget.blur();
              }
            }
          }}
          placeholder={expanded ? 'Task title (shortcuts like fri 5pm or #CSE110 still work)' : 'Add a task… e.g. PA 3 fri 11:59pm #CSE110 !high ~2h @wed'}
          aria-label={expanded ? 'Task title' : 'Add a task'}
          aria-describedby="quick-add-help"
          autoComplete="off"
          enterKeyHint="done"
        />
        {!expanded && (
          <label className="quick-add-target" title="Where the task goes">
            <span className="sr-only">Add to</span>
            <select
              value={target}
              onChange={(e) => {
                setTarget(e.target.value as AddTarget);
                // The picker is the latest choice: drop a list/class picked in the form.
                setEdits(({ list: _l, classId: _c, ...rest }) => rest);
              }}
            >
              <option value="personal">Personal</option>
              <option value="quick">Quick items</option>
              {classes.length > 0 && (
                <optgroup label="Classes">
                  {classes.map((c) => (
                    <option key={c.id} value={`class:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <Icon name="arrow_drop_down" />
          </label>
        )}
        <button
          className={`icon-btn small quick-add-more${expanded ? ' on' : ''}`}
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-controls={FORM_ID}
          aria-label="More options"
          title={expanded ? 'Fewer options' : 'More options: dates, class, subtasks…'}
        >
          <Icon name="tune" />
        </button>
        {(text || expanded) && (
          <button className="icon-btn small quick-add-go" onClick={submit} disabled={!title} aria-label="Add task" title="Add (Enter)">
            <Icon name="arrow_upward" />
          </button>
        )}
      </div>
      <p id="quick-add-help" className="sr-only">
        Type a date or weekday, a time, #class, !high, ~30m estimate, @day to plan, or start with q for a quick item. Enter adds.
        More options opens a form with every field.
      </p>

      {expanded ? (
        <div
          id={FORM_ID}
          className="qa-form"
          role="group"
          aria-label="New task details"
          onKeyDown={(e) => {
            if (e.defaultPrevented) return;
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              collapse();
            }
          }}
        >
          <div className="qa-grid">
            <ListField
              id="qa-class"
              list={draft.list}
              classId={draft.classId}
              onChange={(p) => {
                edit(p);
                setTarget(p.list === 'quick' ? 'quick' : p.classId ? `class:${p.classId}` : 'personal');
              }}
            />
            <Field label="Due" htmlFor="qa-due">
              <DueInput id="qa-due" value={draft.due} onChange={(due) => edit({ due })} />
            </Field>
            <DoDateField id="qa-do" value={draft.doDate} onChange={(doDate) => edit({ doDate })} />
            <PriorityField value={draft.priority} onChange={(priority) => edit({ priority })} />
            <EstimateField id="qa-est" value={draft.estimateMin} onChange={(estimateMin) => edit({ estimateMin })} />
          </div>
          <SubtaskEditor subtasks={draft.subtasks} due={draft.due} onChange={(subtasks) => edit({ subtasks })} />
          <NotesField id="qa-notes" value={draft.notes} onChange={(notes) => edit({ notes })} />
          <div className="qa-actions">
            <span className="qa-hint">{title ? 'Ctrl/⌘ + Enter adds' : 'Type a title above to add it'}</span>
            <button
              className="text-btn"
              onClick={() => {
                setText('');
                setEdits({});
                collapse();
              }}
            >
              Discard
            </button>
            <button className="filled-btn" onClick={submit} disabled={!title}>
              <Icon name="add_task" size={18} />
              Add task
            </button>
          </div>
        </div>
      ) : (
        (parsed || Object.keys(edits).length > 0) && (
          <ul className="quick-add-preview" aria-label="Parsed task" aria-live="polite">
            <li className="qa-chip qa-title">{title || 'Add a title'}</li>
            {draft.due && (
              <li className="qa-chip">
                <Icon name="schedule" size={16} />
                Due {format(new Date(draft.due), 'EEE, MMM d · h:mm a')}
              </li>
            )}
            {cls && (
              <li className="qa-chip">
                <span className="task-dot" aria-hidden="true" />
                {cls.name}
              </li>
            )}
            {draft.priority !== 'none' && (
              <li className={`qa-chip qa-flag ${draft.priority}`}>
                <Icon name="flag" size={16} />
                {PRIORITY_LABEL[draft.priority]}
              </li>
            )}
            {draft.estimateMin !== undefined && (
              <li className="qa-chip">
                <Icon name="timer" size={16} />~{formatEstimate(draft.estimateMin)}
              </li>
            )}
            {draft.doDate && (
              <li className="qa-chip">
                <Icon name="event_available" size={16} />
                Plan: {doDateLabel(draft.doDate, now)}
              </li>
            )}
            {draft.subtasks.length > 0 && (
              <li className="qa-chip">
                <Icon name="checklist" size={16} />
                {draft.subtasks.length} subtask{draft.subtasks.length === 1 ? '' : 's'}
              </li>
            )}
            {draft.list === 'quick' && (
              <li className="qa-chip">
                <Icon name="bolt" size={16} />
                Quick item
              </li>
            )}
          </ul>
        )
      )}
    </div>
  );
}
