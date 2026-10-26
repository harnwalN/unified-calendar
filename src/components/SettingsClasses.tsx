import { useEffect, useRef, useState } from 'react';
import { PALETTE } from '../config';
import { useStore } from '../store';
import { useClasses } from '../store/tasks';
import type { ClassInfo } from '../types';
import Icon from './Icon';
import './Settings.css';
import './SettingsClasses.css';

type Panel = 'color' | 'merge' | null;

function ClassMenu({ cls, onClose, onRename, onMerge, canMerge }: {
  cls: ClassInfo;
  onClose: () => void;
  onRename: () => void;
  onMerge: () => void;
  canMerge: boolean;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const updateClass = useStore((s) => s.updateClass);
  const deleteClass = useStore((s) => s.deleteClass);

  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  const item = (icon: string, label: string, run: () => void, danger = false) => (
    <li>
      <button type="button" role="menuitem" className={danger ? 'cls-menu__danger' : undefined} onClick={() => { onClose(); run(); }}>
        <span><Icon name={icon} /> {label}</span>
      </button>
    </li>
  );

  return (
    <ul ref={ref} className="menu cls-menu" role="menu" aria-label={`${cls.name} options`}>
      {item('edit', 'Rename', onRename)}
      {item(cls.hidden ? 'visibility' : 'visibility_off', cls.hidden ? 'Show on home' : 'Hide from home', () =>
        updateClass(cls.id, { hidden: !cls.hidden }),
      )}
      {canMerge && item('call_merge', 'Merge into…', onMerge)}
      {item('delete', 'Delete', () => {
        const msg = cls.aliases.length
          ? `Delete “${cls.name}”? Its assignments will move to “Other” and the class won’t be re-created. To keep its tasks grouped but out of the way, use “Hide” instead.`
          : `Delete “${cls.name}”? Personal tasks in it will move to “Personal”.`;
        if (confirm(msg)) deleteClass(cls.id);
      }, true)}
    </ul>
  );
}

function ClassRow({ cls, index, all, move }: {
  cls: ClassInfo;
  index: number;
  all: ClassInfo[];
  move: (from: number, to: number) => void;
}) {
  const updateClass = useStore((s) => s.updateClass);
  const mergeClasses = useStore((s) => s.mergeClasses);
  const [menu, setMenu] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cls.name);
  const others = all.filter((c) => c.id !== cls.id);
  const [target, setTarget] = useState('');
  const menuBtn = useRef<HTMLButtonElement>(null);

  const saveName = () => {
    const next = name.trim();
    setEditing(false);
    if (!next || next === cls.name) return setName(cls.name);
    updateClass(cls.id, { name: next });
  };

  return (
    <li className={`s-item cls-row${cls.hidden ? ' cls-row--hidden' : ''}`}>
      <div className="cls-row__line">
        <button
          type="button"
          className="cls-row__swatch"
          style={{ background: cls.color }}
          aria-label={`Change color of ${cls.name}`}
          aria-expanded={panel === 'color'}
          onClick={() => setPanel(panel === 'color' ? null : 'color')}
        />
        <div className="s-item__main">
          {editing ? (
            <input
              className="s-input s-item__rename"
              value={name}
              autoFocus
              aria-label="Class name"
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setName(cls.name);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <div className="s-item__title">
              {cls.name}
              {cls.hidden && <span className="cls-row__badge">Hidden</span>}
            </div>
          )}
          <div className="s-item__sub" title={cls.aliases.join(', ')}>
            {cls.aliases.length ? cls.aliases.join(' · ') : 'No linked courses'}
          </div>
        </div>
        <div className="s-item__actions">
          <button type="button" className="s-icon-btn s-icon-btn--small" aria-label={`Move ${cls.name} up`} disabled={index === 0} onClick={() => move(index, index - 1)}>
            <Icon name="arrow_upward" />
          </button>
          <button type="button" className="s-icon-btn s-icon-btn--small" aria-label={`Move ${cls.name} down`} disabled={index === all.length - 1} onClick={() => move(index, index + 1)}>
            <Icon name="arrow_downward" />
          </button>
          <div className="cls-row__menu-anchor">
            <button
              ref={menuBtn}
              type="button"
              className="s-icon-btn s-icon-btn--small"
              aria-label={`More options for ${cls.name}`}
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu((m) => !m)}
            >
              <Icon name="more_vert" />
            </button>
            {menu && (
              <ClassMenu
                cls={cls}
                canMerge={others.length > 0}
                onClose={() => {
                  setMenu(false);
                  menuBtn.current?.focus();
                }}
                onRename={() => setEditing(true)}
                onMerge={() => setPanel('merge')}
              />
            )}
          </div>
        </div>
      </div>

      {panel === 'color' && (
        <div className="cls-row__panel s-swatches" role="group" aria-label={`Color for ${cls.name}`}>
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className="s-swatch"
              style={{ background: c }}
              aria-label={c}
              aria-pressed={c.toLowerCase() === cls.color.toLowerCase()}
              onClick={() => {
                updateClass(cls.id, { color: c });
                setPanel(null);
              }}
            >
              {c.toLowerCase() === cls.color.toLowerCase() && <Icon name="check" />}
            </button>
          ))}
        </div>
      )}

      {panel === 'merge' && (
        <form
          className="cls-row__panel cls-merge"
          onSubmit={(e) => {
            e.preventDefault();
            if (target) mergeClasses(cls.id, target);
          }}
        >
          <label className="s-field">
            <span>Merge “{cls.name}” into</span>
            <select className="s-input" value={target} autoFocus onChange={(e) => setTarget(e.target.value)}>
              <option value="" disabled>Choose a class…</option>
              {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <div className="cls-merge__actions">
            <button type="button" className="s-btn s-btn--small" onClick={() => setPanel(null)}>Cancel</button>
            <button type="submit" className="s-btn s-btn--filled s-btn--small" disabled={!target}>
              <Icon name="call_merge" /> Merge
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

/** Settings → Classes: color, rename, order, hide, delete and merge the classes tasks are grouped by. */
export default function SettingsClasses() {
  const classes = useClasses();
  const updateClass = useStore((s) => s.updateClass);

  // Rewrite `order` as 0..n-1 after the move so duplicates from other devices can't get stuck.
  const move = (from: number, to: number) => {
    const next = [...classes];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    next.forEach((c, i) => c.order !== i && updateClass(c.id, { order: i }));
  };

  if (!classes.length) {
    return (
      <p className="s-msg">
        <Icon name="info" /> Classes appear automatically from your Canvas, Gradescope and PrairieLearn assignments.
      </p>
    );
  }
  return (
    <div className="s-stack">
      <ul className="s-list cls-list">
        {classes.map((c, i) => <ClassRow key={c.id} cls={c} index={i} all={classes} move={move} />)}
      </ul>
      <p className="s-msg">
        <Icon name="info" />
        <span>
          The same course can show up under different names (for example “CSE 110 - FA26” on Canvas and “CSE 110” on
          Gradescope). Use <b>Merge</b> in a class’s menu to combine them into one class.
        </span>
      </p>
    </div>
  );
}
