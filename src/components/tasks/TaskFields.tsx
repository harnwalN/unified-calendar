// Task field editors shared by the details drawer and the expanded quick-add form.
// Each one is controlled: the caller decides whether a change saves right away or edits a draft.
import { useState, type CSSProperties, type ReactNode } from 'react';
import { addDays, format } from 'date-fns';
import { newId } from '../../store';
import { createClass, dayKey, useClasses } from '../../store/tasks';
import type { Priority, Subtask } from '../../types';
import Icon from '../Icon';
import { doDateLabel, formatEstimate } from './format';
import { perDaySubtasks } from './subtasks';
import { PRIORITY_LABEL } from './TaskRow';
import './TaskFields.css';

const PRIORITIES: Priority[] = ['none', 'low', 'medium', 'high'];
const ESTIMATES = [10, 30, 60, 120];
const NEW_CLASS = '__new__';

export function Field({ label, htmlFor, children }: { label: ReactNode; htmlFor?: string; children: ReactNode }) {
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

export function Segmented<T extends string>({
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
          type="button"
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

export function PriorityField({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <Field label="Priority">
      <Segmented
        name="Priority"
        value={value}
        options={PRIORITIES.map((p) => ({ value: p, label: p === 'none' ? 'None' : PRIORITY_LABEL[p], className: p }))}
        onChange={onChange}
      />
    </Field>
  );
}

/** Due date and time; `value` is ISO. */
export function DueInput({ id, value, onChange }: { id: string; value?: string; onChange: (iso: string | undefined) => void }) {
  return (
    <div className="td-inline">
      <input
        id={id}
        type="datetime-local"
        className="td-input"
        value={value ? format(new Date(value), "yyyy-MM-dd'T'HH:mm") : ''}
        onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : undefined)}
      />
      {value && (
        <button type="button" className="icon-btn small" onClick={() => onChange(undefined)} aria-label="Clear due date">
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}

/** "Plan to work on": a day picker plus Today / Tomorrow shortcuts. */
export function DoDateField({ id, value, onChange }: { id: string; value?: string; onChange: (day: string | undefined) => void }) {
  const now = new Date();
  return (
    <Field label="Plan to work on" htmlFor={id}>
      <div className="td-inline td-wrap">
        <input id={id} type="date" className="td-input" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />
        {[
          ['Today', dayKey(now)],
          ['Tomorrow', dayKey(addDays(now, 1))],
        ].map(([label, key]) => (
          <button
            key={label}
            type="button"
            className={`td-chip${value === key ? ' active' : ''}`}
            aria-pressed={value === key}
            onClick={() => onChange(value === key ? undefined : key)}
          >
            {label}
          </button>
        ))}
        {value && (
          <button type="button" className="icon-btn small" onClick={() => onChange(undefined)} aria-label="Clear plan date">
            <Icon name="close" />
          </button>
        )}
      </div>
    </Field>
  );
}

/** Estimated effort for the whole task (subtasks don't carry their own). */
export function EstimateField({ id, value, onChange }: { id: string; value?: number; onChange: (min: number | undefined) => void }) {
  return (
    <Field label="Estimate (whole task)" htmlFor={id}>
      <div className="td-inline td-wrap">
        <label className="td-est-input">
          <input
            id={id}
            type="number"
            min={0}
            step={5}
            inputMode="numeric"
            className="td-input"
            value={value ?? ''}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              onChange(Number.isFinite(v) && v > 0 ? v : undefined);
            }}
          />
          <span>min</span>
        </label>
        {ESTIMATES.map((m) => (
          <button
            key={m}
            type="button"
            className={`td-chip${value === m ? ' active' : ''}`}
            aria-pressed={value === m}
            onClick={() => onChange(value === m ? undefined : m)}
          >
            {formatEstimate(m)}
          </button>
        ))}
      </div>
    </Field>
  );
}

type ListKind = 'class' | 'personal' | 'quick';
export type ListPatch = { list: 'personal' | 'quick'; classId: string | undefined };

/** Which list a personal task lives in (Class / Personal / Quick) and, for Class, which class. */
export function ListField({
  id,
  list,
  classId,
  onChange,
}: {
  id: string;
  list: 'personal' | 'quick';
  classId?: string;
  onChange: (patch: ListPatch) => void;
}) {
  const classes = useClasses();
  const [creating, setCreating] = useState(false);
  const [wantClass, setWantClass] = useState(false);
  const kind: ListKind = list === 'quick' ? 'quick' : classId || wantClass ? 'class' : 'personal';

  const pickKind = (k: ListKind) => {
    setWantClass(k === 'class');
    setCreating(false);
    if (k === 'class') {
      if (!classes.length) setCreating(true);
      if (list === 'quick') onChange({ list: 'personal', classId });
    } else onChange({ list: k, classId: undefined });
  };

  return (
    <>
      <Field label="List">
        <Segmented
          name="List"
          value={kind}
          options={[
            { value: 'class', label: 'Class' },
            { value: 'personal', label: 'Personal' },
            { value: 'quick', label: 'Quick item' },
          ]}
          onChange={pickKind}
        />
      </Field>
      {kind === 'class' && (
        <Field label="Class" htmlFor={id}>
          {creating ? (
            <NewClassInput
              id={id}
              onDone={(created) => {
                setCreating(false);
                if (created) onChange({ list: 'personal', classId: created });
                else if (!classId) setWantClass(false);
              }}
            />
          ) : (
            <div className="td-inline">
              <select
                id={id}
                className="td-input"
                value={classId ?? ''}
                onChange={(e) => {
                  if (e.target.value === NEW_CLASS) setCreating(true);
                  else onChange({ list: 'personal', classId: e.target.value || undefined });
                }}
              >
                {!classId && <option value="">Pick a class</option>}
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value={NEW_CLASS}>＋ New class…</option>
              </select>
            </div>
          )}
        </Field>
      )}
    </>
  );
}

/** Inline "new class" name box; reports the created (or matching existing) class id, or null when cancelled. */
function NewClassInput({ id, onDone }: { id: string; onDone: (classId: string | null) => void }) {
  const [name, setName] = useState('');
  const save = () => onDone(name.trim() ? createClass(name) : null);
  return (
    <div className="td-inline">
      <input
        id={id}
        className="td-input td-grow"
        autoFocus
        placeholder="Class name, e.g. CSE 110"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onDone(null);
          }
        }}
      />
      <button type="button" className="text-btn" onClick={save} disabled={!name.trim()}>
        Add
      </button>
      <button type="button" className="icon-btn small" onClick={() => onDone(null)} aria-label="Cancel new class">
        <Icon name="close" />
      </button>
    </div>
  );
}

export function NotesField({ id, value, onChange }: { id: string; value?: string; onChange: (notes: string | undefined) => void }) {
  return (
    <Field label="Notes" htmlFor={id}>
      <textarea
        id={id}
        className="td-input td-notes"
        rows={3}
        placeholder="Add notes"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </Field>
  );
}

/**
 * Subtasks with an optional day each. Dated subtasks show up on their own in Today and the
 * planner; "One per day until due" fills the days before the deadline (study sessions before a test).
 */
export function SubtaskEditor({
  subtasks,
  onChange,
  due,
  color,
}: {
  subtasks: Subtask[];
  onChange: (subtasks: Subtask[]) => void;
  /** Parent deadline (ISO), for the per-day helper. */
  due?: string;
  /** Accent for the checkboxes (class color). */
  color?: string;
}) {
  const [draft, setDraft] = useState('');
  const now = new Date();
  const done = subtasks.filter((s) => s.done).length;
  const patch = (id: string, p: Partial<Subtask>) => onChange(subtasks.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const daily = due ? perDaySubtasks(subtasks, draft.trim() || 'Work session', due, now) : [];

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    onChange([...subtasks, { id: newId(), title, done: false }]);
    setDraft('');
  };
  const move = (i: number, dir: -1 | 1) => {
    const next = [...subtasks];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
  };

  return (
    <div className="td-field" style={color ? ({ '--task-color': color } as CSSProperties) : undefined}>
      <span className="td-label">
        Subtasks{subtasks.length > 0 && ` · ${done}/${subtasks.length}`}
      </span>
      {subtasks.length > 0 && (
        <ul className="td-subtasks">
          {subtasks.map((s, i) => (
            <li key={s.id} className={s.done ? 'done' : undefined}>
              <input
                type="checkbox"
                className="td-sub-box"
                checked={s.done}
                onChange={() => patch(s.id, { done: !s.done })}
                aria-label={`${s.title} done`}
              />
              <input
                className="td-sub-title"
                value={s.title}
                aria-label="Subtask title"
                onChange={(e) => patch(s.id, { title: e.target.value })}
                onBlur={(e) => {
                  if (!e.target.value.trim()) patch(s.id, { title: 'Untitled subtask' });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
              />
              <SubtaskDay subtask={s} now={now} onChange={(doDate) => patch(s.id, { doDate })} />
              <span className="td-sub-actions">
                <button type="button" className="icon-btn small" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move "${s.title}" up`}>
                  <Icon name="arrow_upward" />
                </button>
                <button
                  type="button"
                  className="icon-btn small"
                  disabled={i === subtasks.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={`Move "${s.title}" down`}
                >
                  <Icon name="arrow_downward" />
                </button>
                <button
                  type="button"
                  className="icon-btn small"
                  onClick={() => onChange(subtasks.filter((x) => x.id !== s.id))}
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
        />
      </div>
      {daily.length > 0 && (
        <button
          type="button"
          className="td-chip td-daily"
          onClick={() => {
            onChange([...subtasks, ...daily]);
            setDraft('');
          }}
          title={`Adds “${daily[0].title}” for ${daily.map((s) => doDateLabel(s.doDate!, now)).join(', ')}`}
        >
          <Icon name="date_range" size={18} />
          {daily.length === 1 ? `Add “${daily[0].title}” for ${doDateLabel(daily[0].doDate!, now)}` : `Add “${daily[0].title}” each day until due (${daily.length})`}
        </button>
      )}
    </div>
  );
}

/** Compact day chip for a subtask; the native date picker sits invisibly on top of it. */
function SubtaskDay({ subtask: s, now, onChange }: { subtask: Subtask; now: Date; onChange: (day: string | undefined) => void }) {
  const missed = !!s.doDate && !s.done && s.doDate < dayKey(now);
  return (
    <span className="td-sub-day-wrap">
      <label className={`td-sub-day${s.doDate ? ' set' : ''}${missed ? ' missed' : ''}`} title={s.doDate ? format(new Date(`${s.doDate}T00:00`), 'EEEE, MMM d') : 'Pick a day to work on it'}>
        <Icon name="event" size={16} />
        <span>{s.doDate ? doDateLabel(s.doDate, now) : 'Day'}</span>
        <input
          type="date"
          value={s.doDate ?? ''}
          aria-label={`Day for "${s.title}"`}
          onChange={(e) => onChange(e.target.value || undefined)}
          onClick={(e) => {
            try {
              e.currentTarget.showPicker();
            } catch {
              // Already open, or unsupported: the focused input still takes typed dates.
            }
          }}
        />
      </label>
      {s.doDate && (
        <button type="button" className="icon-btn small td-sub-day-clear" onClick={() => onChange(undefined)} aria-label={`Clear day for "${s.title}"`}>
          <Icon name="close" />
        </button>
      )}
    </span>
  );
}
