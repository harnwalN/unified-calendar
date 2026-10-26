import type { CSSProperties } from 'react';
import { useHomeSections } from './useHomeData';
import './ClassCards.css';

/** Sidebar cards with each class's weekly progress; clicking scrolls to its home section. */
export default function ClassCards({ onPick }: { onPick?: () => void }) {
  const { sections } = useHomeSections();
  const classes = sections.classes.filter((c) => c.id !== 'other');
  if (!classes.length) return null;

  return (
    <section className="sidebar-section class-cards" aria-label="Classes">
      <h2 className="sidebar-heading">Classes</h2>
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
