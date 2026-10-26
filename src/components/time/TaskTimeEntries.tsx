// Time entries for one task (totals, list, inline edit, manual add, start/stop); shown inside TaskDetail.
import { useMemo, useState, type FormEvent } from 'react';
import { format, isToday, isYesterday, startOfDay } from 'date-fns';
import { useStore } from '../../store';
import { dayKey } from '../../store/tasks';
import { logTime, toggleTimer, useRunningElapsed } from '../../features/timer';
import { formatClock, formatDuration, parseDuration } from '../../features/timeStats';
import type { TaskRef, TimeEntry } from '../../types';
import Icon from '../Icon';
import { fromLocalInput, toLocalInput, validateSpan } from './entryForm';
import './TaskTimeEntries.css';

const dayLabel = (ms: number) =>
  isToday(ms) ? 'Today' : isYesterday(ms) ? 'Yesterday' : format(ms, 'EEE, MMM d');
const timeLabel = (ms: number) => format(ms, 'h:mm a');

export default function TaskTimeEntries({ taskRef }: { taskRef: TaskRef }) {
  const timeEntries = useStore((s) => s.timeEntries);
  const running = useStore((s) => s.runningTimer?.taskRef === taskRef);
  const elapsed = useRunningElapsed(taskRef);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const entries = useMemo(
    () =>
      Object.values(timeEntries)
        .filter((e) => !e.deleted && e.taskRef === taskRef && Date.parse(e.end) > Date.parse(e.start))
        .sort((a, b) => b.start.localeCompare(a.start)),
    [timeEntries, taskRef],
  );
  const todayStart = startOfDay(new Date()).getTime();
  let totalMs = elapsed;
  let todayMs = elapsed;
  for (const e of entries) {
    const s = Date.parse(e.start);
    const end = Date.parse(e.end);
    totalMs += end - s;
    todayMs += Math.max(0, end - Math.max(s, todayStart));
  }

  return (
    <section className="tte" aria-label="Time tracked">
      <div className="tte-head">
        <div className="tte-totals">
          <div>
            <span className="tte-total-value">{formatDuration(totalMs)}</span>
            <span className="tte-total-label">total</span>
          </div>
          <div>
            <span className="tte-total-value">{formatDuration(todayMs)}</span>
            <span className="tte-total-label">today</span>
          </div>
        </div>
        <button
          className={`tte-toggle${running ? ' running' : ''}`}
          onClick={() => toggleTimer(taskRef)}
          aria-pressed={running}
        >
          <Icon name={running ? 'stop' : 'play_arrow'} />
          <span>{running ? formatClock(elapsed) : 'Start timer'}</span>
          {running && <span className="sr-only">, stop timer</span>}
        </button>
      </div>

      {entries.length > 0 && (
        <ul className="tte-list">
          {entries.map((e) =>
            editing === e.id ? (
              <li key={e.id}>
                <EditEntry entry={e} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={e.id} className="tte-row">
                <span className="tte-row-day">{dayLabel(Date.parse(e.start))}</span>
                <span className="tte-row-range">
                  {timeLabel(Date.parse(e.start))} – {timeLabel(Date.parse(e.end))}
                </span>
                <span className="tte-row-dur">{formatDuration(Date.parse(e.end) - Date.parse(e.start))}</span>
                <span className="tte-row-actions">
                  <button className="icon-btn small" onClick={() => setEditing(e.id)} aria-label="Edit entry" title="Edit">
                    <Icon name="edit" />
                  </button>
                  <button
                    className="icon-btn small"
                    onClick={() => useStore.getState().deleteTimeEntry(e.id)}
                    aria-label="Delete entry"
                    title="Delete"
                  >
                    <Icon name="delete" />
                  </button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}

      {adding ? (
        <AddEntry taskRef={taskRef} onDone={() => setAdding(false)} />
      ) : (
        <button className="text-btn tte-add" onClick={() => setAdding(true)}>
          <Icon name="add" />
          Add time
        </button>
      )}
    </section>
  );
}

function EditEntry({ entry, onDone }: { entry: TimeEntry; onDone: () => void }) {
  const [start, setStart] = useState(() => toLocalInput(Date.parse(entry.start)));
  const [end, setEnd] = useState(() => toLocalInput(Date.parse(entry.end)));
  const s = fromLocalInput(start);
  const e = fromLocalInput(end);
  const error = validateSpan(s, e);

  const save = (ev: FormEvent) => {
    ev.preventDefault();
    if (error) return;
    useStore.getState().updateTimeEntry(entry.id, { start: new Date(s).toISOString(), end: new Date(e).toISOString() });
    onDone();
  };

  return (
    <form className="tte-form" onSubmit={save} onKeyDown={(ev) => ev.key === 'Escape' && (ev.stopPropagation(), onDone())}>
      <label>
        <span>Start</span>
        <input type="datetime-local" value={start} onChange={(ev) => setStart(ev.target.value)} required autoFocus />
      </label>
      <label>
        <span>End</span>
        <input type="datetime-local" value={end} max={toLocalInput(Date.now())} onChange={(ev) => setEnd(ev.target.value)} required />
      </label>
      <FormFooter error={error} onCancel={onDone} />
    </form>
  );
}

function AddEntry({ taskRef, onDone }: { taskRef: TaskRef; onDone: () => void }) {
  const now = Date.now();
  const [date, setDate] = useState(() => dayKey(now));
  const [start, setStart] = useState(() => format(now - 30 * 60_000, 'HH:mm'));
  const [end, setEnd] = useState(() => format(now, 'HH:mm'));
  const [duration, setDuration] = useState('30m');

  const s = fromLocalInput(date, start);
  let e = fromLocalInput(date, end);
  // An end earlier than the start means it ran past midnight.
  if (e <= s) e = fromLocalInput(dayKey(s + 86_400_000), end);
  const error = validateSpan(s, e);

  // Duration and end stay in sync: editing one recomputes the other.
  const onDuration = (v: string) => {
    setDuration(v);
    const ms = parseDuration(v);
    if (ms && !Number.isNaN(s)) setEnd(format(s + ms, 'HH:mm'));
  };
  const syncDuration = (from: number, to: number) => {
    let ms = to - from;
    if (ms <= 0) ms += 86_400_000;
    if (!Number.isNaN(ms)) setDuration(formatDuration(ms));
  };

  const save = (ev: FormEvent) => {
    ev.preventDefault();
    if (error) return;
    logTime(taskRef, s, e);
    onDone();
  };

  return (
    <form className="tte-form" onSubmit={save} onKeyDown={(ev) => ev.key === 'Escape' && (ev.stopPropagation(), onDone())}>
      <label>
        <span>Date</span>
        <input type="date" value={date} max={dayKey(now)} onChange={(ev) => setDate(ev.target.value)} required autoFocus />
      </label>
      <label>
        <span>Start</span>
        <input
          type="time"
          value={start}
          onChange={(ev) => {
            setStart(ev.target.value);
            syncDuration(fromLocalInput(date, ev.target.value), fromLocalInput(date, end));
          }}
          required
        />
      </label>
      <label>
        <span>Duration</span>
        <input
          type="text"
          inputMode="text"
          value={duration}
          placeholder="1h 30m"
          onChange={(ev) => onDuration(ev.target.value)}
          aria-describedby="tte-dur-hint"
        />
      </label>
      <label>
        <span>End</span>
        <input
          type="time"
          value={end}
          onChange={(ev) => {
            setEnd(ev.target.value);
            syncDuration(s, fromLocalInput(date, ev.target.value));
          }}
          required
        />
      </label>
      <span id="tte-dur-hint" className="sr-only">For example 45m, 1h 30m or 1:30</span>
      <FormFooter error={error} onCancel={onDone} />
    </form>
  );
}

function FormFooter({ error, onCancel }: { error: string | null; onCancel: () => void }) {
  return (
    <div className="tte-form-foot">
      <span className="tte-error" role="alert">{error}</span>
      <button type="button" className="text-btn" onClick={onCancel}>Cancel</button>
      <button type="submit" className="filled-btn" disabled={!!error}>Save</button>
    </div>
  );
}
