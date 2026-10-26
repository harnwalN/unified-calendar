import { useMemo, useState, type CSSProperties } from 'react';
import { format } from 'date-fns';
import { useStore } from '../../store';
import { useClasses } from '../../store/tasks';
import { parseQuickAdd } from '../../lib/quickAdd';
import Icon from '../Icon';
import { doDateLabel, formatEstimate } from './format';
import { PRIORITY_LABEL } from './TaskRow';
import './QuickAdd.css';

export const QUICK_ADD_ID = 'quick-add-input';

/** Where a new task goes unless the text says otherwise (#class or a leading "q"). */
type Target = 'personal' | 'quick' | `class:${string}`;

export default function QuickAdd() {
  const [text, setText] = useState('');
  const [target, setTarget] = useState<Target>('personal');
  const classes = useClasses();
  const addTask = useStore((s) => s.addTask);
  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text, new Date(), classes) : null), [text, classes]);
  // Text wins over the picker: "#CSE110" picks a class, a leading "q"/short estimate makes it quick.
  const pickedClassId = target.startsWith('class:') ? target.slice(6) : undefined;
  const classId = parsed?.classId ?? pickedClassId;
  const list = parsed?.list === 'quick' || (!parsed?.classId && target === 'quick') ? 'quick' : 'personal';
  const cls = classId ? classes.find((c) => c.id === classId) : undefined;

  const submit = () => {
    if (!parsed?.title) return;
    const { title, due, doDate, priority, estimateMin } = parsed;
    addTask({ title, due, doDate, classId: list === 'quick' ? undefined : classId, priority, estimateMin, list });
    setText('');
  };

  const now = new Date();
  return (
    <div className="quick-add">
      <div className="quick-add-field">
        <Icon name="add_task" className="quick-add-icon" />
        <input
          id={QUICK_ADD_ID}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') {
              setText('');
              e.currentTarget.blur();
            }
          }}
          placeholder="Add a task… e.g. PA 3 fri 11:59pm #CSE110 !high ~2h @wed"
          aria-label="Add a task"
          aria-describedby="quick-add-help"
          autoComplete="off"
          enterKeyHint="done"
        />
        <label className="quick-add-target" title="Where the task goes">
          <span className="sr-only">Add to</span>
          <select value={target} onChange={(e) => setTarget(e.target.value as Target)}>
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
        {text && (
          <button className="icon-btn small" onClick={submit} disabled={!parsed?.title} aria-label="Add task" title="Add (Enter)">
            <Icon name="arrow_upward" />
          </button>
        )}
      </div>
      <p id="quick-add-help" className="sr-only">
        Type a date or weekday, a time, #class, !high, ~30m estimate, @day to plan, or start with q for a quick item. Enter adds.
      </p>
      {parsed && (
        <ul className="quick-add-preview" aria-label="Parsed task" aria-live="polite">
          <li className="qa-chip qa-title">{parsed.title || 'Add a title'}</li>
          {parsed.due && (
            <li className="qa-chip">
              <Icon name="schedule" size={16} />
              Due {format(new Date(parsed.due), 'EEE, MMM d · h:mm a')}
            </li>
          )}
          {cls && (
            <li className="qa-chip" style={{ '--task-color': cls.color } as CSSProperties}>
              <span className="task-dot" aria-hidden="true" />
              {cls.name}
            </li>
          )}
          {parsed.priority !== 'none' && (
            <li className={`qa-chip qa-flag ${parsed.priority}`}>
              <Icon name="flag" size={16} />
              {PRIORITY_LABEL[parsed.priority]}
            </li>
          )}
          {parsed.estimateMin !== undefined && (
            <li className="qa-chip">
              <Icon name="timer" size={16} />~{formatEstimate(parsed.estimateMin)}
            </li>
          )}
          {parsed.doDate && (
            <li className="qa-chip">
              <Icon name="event_available" size={16} />
              Plan: {doDateLabel(parsed.doDate, now)}
            </li>
          )}
          {list === 'quick' && (
            <li className="qa-chip">
              <Icon name="bolt" size={16} />
              Quick item
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
