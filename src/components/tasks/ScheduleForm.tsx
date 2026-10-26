// Schedule work time on a task: pick one or more days, a start time and a length.
import { useMemo, useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { useStore } from '../../store';
import { dayKey } from '../../store/tasks';
import type { TaskView } from '../../types';
import Icon from '../Icon';
import { formatEstimate } from './format';
import { buildBlocks, dayKeys, defaultStartTime, DURATIONS, formatBlock, mergeBlocks, totalScheduledMin } from './schedule';
import './ScheduleForm.css';

const DAYS_SHOWN = 7;

export default function ScheduleForm({ task, showList = true, onScheduled }: {
  task: TaskView;
  /** Show (and allow removing) the task's existing blocks. */
  showList?: boolean;
  onScheduled?: () => void;
}) {
  const now = new Date();
  const [weekOffset, setWeekOffset] = useState(0);
  const firstDay = addDays(now, weekOffset * DAYS_SHOWN);
  const days = useMemo(() => dayKeys(firstDay, DAYS_SHOWN), [dayKey(firstDay)]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selected, setSelected] = useState<string[]>(() => [task.doDate && task.doDate >= dayKey(now) ? task.doDate : dayKey(now)]);
  const [time, setTime] = useState(() => defaultStartTime(now));
  const [duration, setDuration] = useState(() =>
    task.estimateMin && task.estimateMin <= 180 ? Math.max(15, Math.round(task.estimateMin / 15) * 15) : 60,
  );
  const dueKey = task.due ? dayKey(task.due) : undefined;

  const toggle = (day: string) =>
    setSelected((sel) => (sel.includes(day) ? sel.filter((d) => d !== day) : [...sel, day]));

  const schedule = () => {
    if (!selected.length || !time || duration <= 0) return;
    const blocks = mergeBlocks(task.blocks, buildBlocks(selected, time, duration));
    useStore.getState().updateTaskFields(task.ref, { blocks });
    setSelected([]);
    onScheduled?.();
  };
  const remove = (id: string) =>
    useStore.getState().updateTaskFields(task.ref, { blocks: (task.blocks ?? []).filter((b) => b.id !== id) });

  const scheduled = totalScheduledMin(task.blocks);
  const upcoming = (task.blocks ?? []).filter((b) => Date.parse(b.start) + b.durationMin * 60_000 > now.getTime());
  const past = (task.blocks?.length ?? 0) - upcoming.length;

  return (
    <div className="sched">
      <div className="sched-days" role="group" aria-label="Days to work on it">
        <button className="icon-btn small" onClick={() => setWeekOffset((w) => w - 1)} disabled={weekOffset === 0} aria-label="Earlier days">
          <Icon name="chevron_left" />
        </button>
        {days.map((d) => {
          const date = parseISO(d);
          const on = selected.includes(d);
          return (
            <button
              key={d}
              className={`sched-day${on ? ' on' : ''}${d === dueKey ? ' due' : ''}`}
              aria-pressed={on}
              onClick={() => toggle(d)}
              title={d === dueKey ? 'Due this day' : undefined}
            >
              <span className="sched-wd">{d === dayKey(now) ? 'Today' : format(date, 'EEE')}</span>
              <span className="sched-num">{format(date, 'd')}</span>
            </button>
          );
        })}
        <button className="icon-btn small" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Later days">
          <Icon name="chevron_right" />
        </button>
      </div>

      <div className="sched-row">
        <label className="sched-time">
          <span>At</span>
          <input type="time" value={time} step={900} onChange={(e) => setTime(e.target.value)} />
        </label>
        <div className="sched-durs" role="group" aria-label="Length">
          {DURATIONS.map((m) => (
            <button key={m} className={`sched-chip${duration === m ? ' on' : ''}`} aria-pressed={duration === m} onClick={() => setDuration(m)}>
              {formatEstimate(m)}
            </button>
          ))}
          <label className="sched-custom">
            <input
              type="number"
              min={5}
              step={5}
              value={DURATIONS.includes(duration) ? '' : duration}
              placeholder="min"
              aria-label="Custom length in minutes"
              onChange={(e) => setDuration(Number(e.target.value) || 0)}
            />
          </label>
        </div>
      </div>

      <button className="filled-btn sched-go" onClick={schedule} disabled={!selected.length || !time || duration <= 0}>
        <Icon name="event_available" />
        {selected.length > 1 ? `Schedule ${selected.length} sessions` : 'Schedule'}
        {selected.length > 0 && ` · ${formatEstimate(duration * selected.length)}`}
      </button>

      {showList && (task.blocks?.length ?? 0) > 0 && (
        <div className="sched-list">
          <p className="sched-summary">
            Scheduled {formatEstimate(scheduled)}
            {task.estimateMin ? ` of ~${formatEstimate(task.estimateMin)} estimated` : ''}
            {past > 0 ? ` · ${past} past` : ''}
          </p>
          <ul>
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
        </div>
      )}
    </div>
  );
}
