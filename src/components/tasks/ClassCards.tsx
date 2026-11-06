import { useState, type CSSProperties } from 'react';
import { createClass } from '../../store/tasks';
import Icon from '../Icon';
import { useHomeSections } from './useHomeData';
import './ClassCards.css';

/** Sidebar cards with each class's / topic's weekly progress; clicking scrolls to its home section. */
export default function ClassCards({ onPick }: { onPick?: () => void }) {
  const { sections } = useHomeSections();
  const classes = sections.classes.filter((c) => c.id !== 'other');
  const [adding, setAdding] = useState(false);

  return (
    <section className="sidebar-section class-cards" aria-label="Classes and topics">
      <div className="cc-head">
        <h2 className="sidebar-heading">Classes & topics</h2>
        <button
          className="icon-btn small"
          onClick={() => setAdding(!adding)}
          aria-expanded={adding}
          aria-label="Add a class or topic"
          title="Add a class or topic"
        >
          <Icon name={adding ? 'close' : 'add'} />
        </button>
      </div>
      {adding && <AddInline onDone={() => setAdding(false)} />}
      {!classes.length && !adding && <p className="cc-empty">Group tasks by class, or by topics like Research or Gym.</p>}
      <ul>
        {classes.map((c) => {
          const pct = c.weekTotal ? (c.weekDone / c.weekTotal) * 100 : 0;
          return (
            <li key={c.id}>
              <button
                className="class-card"
                style={{ '--task-color': c.color } as CSSProperties}
                onClick={() => {
                  document.getElementById(`class-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  onPick?.();
                }}
                aria-label={`${c.name}: ${c.weekDone} of ${c.weekTotal} done this week${c.overdue ? `, ${c.overdue} overdue` : ''}`}
              >
                <span className="cc-top">
                  <span className="cc-dot" aria-hidden="true" />
                  <span className="cc-name">{c.name}</span>
                  {c.overdue > 0 && <span className="cc-overdue">{c.overdue} overdue</span>}
                </span>
                <span className="cc-bar" aria-hidden="true">
                  <span style={{ width: `${pct}%` }} />
                </span>
                <span className="cc-stat">
                  {c.weekTotal ? `${c.weekDone}/${c.weekTotal} done this week` : 'Nothing due this week'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Name + Class/Topic toggle; Enter adds, Escape cancels. */
function AddInline({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'class' | 'topic'>('class');
  const add = () => {
    if (createClass(name, undefined, kind)) onDone();
  };
  return (
    <div className="cc-add" role="group" aria-label="New class or topic">
      <div className="cc-add-kind" role="radiogroup" aria-label="Kind">
        {(['class', 'topic'] as const).map((k) => (
          <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'on' : undefined} onClick={() => setKind(k)}>
            {k === 'class' ? 'Class' : 'Topic'}
          </button>
        ))}
      </div>
      <div className="cc-add-line">
        <input
          autoFocus
          value={name}
          maxLength={60}
          placeholder={kind === 'topic' ? 'e.g. Research, Gym' : 'e.g. CHEM 6A'}
          aria-label={`New ${kind} name`}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
            if (e.key === 'Escape') onDone();
          }}
        />
        <button className="cc-add-go" onClick={add} disabled={!name.trim()} aria-label={`Add ${kind}`}>
          <Icon name="check" size={18} />
        </button>
      </div>
    </div>
  );
}
