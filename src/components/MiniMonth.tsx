import { useEffect, useState } from 'react';
import { addMonths, format, isSameDay, isSameMonth, isToday, startOfMonth } from 'date-fns';
import { useStore } from '../store';
import { monthGridDays, visibleDays, weekdayLabels } from '../lib/time';
import Icon from './Icon';
import { useNarrowDays } from './hooks';
import './MiniMonth.css';

/** Small navigable month used in the sidebar to jump to a date. */
export default function MiniMonth({ onPick }: { onPick?: () => void }) {
  const cursorIso = useStore((s) => s.cursor);
  const view = useStore((s) => s.view);
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const setCursor = useStore((s) => s.setCursor);
  const narrowDays = useNarrowDays();
  const cursor = new Date(cursorIso);

  const [month, setMonth] = useState(() => startOfMonth(cursor));
  const cursorMonth = startOfMonth(cursor).getTime();
  // Follow the main view when it moves to another month.
  useEffect(() => setMonth(new Date(cursorMonth)), [cursorMonth]);

  const selected =
    view === 'day' || view === 'week' ? visibleDays(view, cursor, weekStartsOn, narrowDays) : [cursor];
  const isSelected = (d: Date) => selected.some((s) => isSameDay(s, d));

  return (
    <div className="mini-month">
      <div className="mini-month-head">
        <span className="mini-month-title">{format(month, 'MMMM yyyy')}</span>
        <button className="icon-btn small" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
          <Icon name="chevron_left" />
        </button>
        <button className="icon-btn small" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
          <Icon name="chevron_right" />
        </button>
      </div>
      <div className="mini-month-grid" role="grid" aria-label={format(month, 'MMMM yyyy')}>
        {weekdayLabels(weekStartsOn, 'EEEEE').map((d, i) => (
          <span key={i} className="mini-month-wd" aria-hidden="true">
            {d}
          </span>
        ))}
        {monthGridDays(month, weekStartsOn).map((d) => {
          const cls = [
            'mini-month-day',
            !isSameMonth(d, month) && 'outside',
            isToday(d) && 'today',
            isSelected(d) && 'selected',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={d.getTime()}
              className={cls}
              onClick={() => {
                setCursor(d);
                onPick?.();
              }}
              aria-label={format(d, 'EEEE, MMMM d, yyyy')}
              aria-current={isToday(d) ? 'date' : undefined}
            >
              {format(d, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}
