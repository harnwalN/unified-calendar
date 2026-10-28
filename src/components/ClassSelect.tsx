// Class picker: a <select> of live classes plus "New class…", which swaps in an inline name field.
import { useEffect, useRef, useState } from 'react';
import { createClass, useClasses } from '../store/tasks';
import Icon from './Icon';
import './ClassSelect.css';

const NEW = '__new__';

export interface ClassSelectProps {
  /** Selected class id, or '' for none. */
  value: string;
  /** Called with a class id (including one just created), '' for none, or an `extraOptions` value. */
  onChange: (value: string) => void;
  /** Adds a "No class" option (value ''). */
  allowNone?: boolean;
  noneLabel?: string;
  /** First option when `value` is '' and there's no "No class" option, e.g. "Which class?". */
  placeholder?: string;
  /** Options listed after the classes, e.g. `{ value: 'none', label: 'Not a class' }`. */
  extraOptions?: { value: string; label: string }[];
  /** Pre-fills the new class's name. */
  suggestedName?: string;
  /** Accessible name for the select. */
  label: string;
  className?: string;
  id?: string;
}

export default function ClassSelect({
  value, onChange, allowNone, noneLabel = 'No class', placeholder, extraOptions = [], suggestedName = '', label, className, id,
}: ClassSelectProps) {
  const classes = useClasses();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const select = useRef<HTMLSelectElement>(null);
  const refocus = useRef(false);

  useEffect(() => {
    if (!creating && refocus.current) {
      refocus.current = false;
      select.current?.focus();
    }
  }, [creating]);

  const close = () => {
    refocus.current = true;
    setCreating(false);
  };
  const save = () => {
    const created = createClass(name);
    if (!created) return;
    close();
    onChange(created);
  };

  if (creating) {
    // Not a <form>: this can sit inside another form (task editors).
    return (
      <div className={`class-new${className ? ` ${className}` : ''}`} role="group" aria-label="New class">
        <input
          value={name}
          autoFocus
          placeholder="Class name"
          aria-label="New class name"
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            }
          }}
        />
        <button type="button" className="class-new__btn class-new__btn--ok" aria-label="Add class" disabled={!name.trim()} onClick={save}>
          <Icon name="check" />
        </button>
        <button type="button" className="class-new__btn" aria-label="Cancel" onClick={close}>
          <Icon name="close" />
        </button>
      </div>
    );
  }

  const known = value === '' || classes.some((c) => c.id === value) || extraOptions.some((o) => o.value === value);
  return (
    <select
      ref={select}
      id={id}
      className={className}
      aria-label={label}
      value={known ? value : ''}
      onChange={(e) => {
        if (e.target.value !== NEW) return onChange(e.target.value);
        setName(suggestedName.trim());
        setCreating(true);
      }}
    >
      {allowNone ? <option value="">{noneLabel}</option> : (value === '' || !known) && <option value="">{placeholder ?? 'Choose a class…'}</option>}
      {classes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      <option value={NEW}>＋ New class…</option>
      {extraOptions.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
