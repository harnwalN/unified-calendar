// The home planner: a timeline of the selected day, or a week of timelines, or a month grid,
// with date navigation and a one-click way back to today.
import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { format, isSameDay, isSameMonth, startOfDay, startOfWeek } from 'date-fns';
import { useStore } from '../../store';
import { monthGridDays, stepCursor, viewTitle, visibleDays, weekdayLabels } from '../../lib/time';
import type { ViewMode } from '../../types';
import Icon from '../Icon';
import { useNow } from '../hooks';
import DayTrack, { HourAxis, openPlannerEvent, TrackedStrip } from './DayTrack';
import { formatDuration } from './format';
import { hourRange, pct } from './timeline';
import { usePlannerData, type DayData } from './usePlannerData';
import './Planner.css';

type Mode = 'day' | 'week' | 'month';
const MODES: { id: Mode; label: string; key: string }[] = [
  { id: 'day', label: 'Day', key: 'D' },
  { id: 'week', label: 'Week', key: 'W' },
  { id: 'month', label: 'Month', key: 'M' },
];

export default function Planner() {
  const nowDate = useNow(30_000);
  const now = nowDate.getTime();
  const view = useStore((s) => s.view);
  const cursorIso = useStore((s) => s.cursor);
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const dayData = usePlannerData(now);
  const mode: Mode = view === 'week' || view === 'month' ? view : 'day';
  const cursor = new Date(cursorIso);

  const { setCursor, setView } = useStore.getState();
  const step = (dir: 1 | -1) => setCursor(stepCursor(mode as ViewMode, cursor, dir));
  const pickDay = (d: Date) => {
    setCursor(d);
    setView('day');
  };
  const showsToday =
    mode === 'day'
      ? isSameDay(cursor, nowDate)
      : mode === 'week'
        ? visibleDays('week', cursor, weekStartsOn).some((d) => isSameDay(d, nowDate))
        : isSameMonth(cursor, nowDate);
  const title =
    mode === 'day'
      ? isSameDay(cursor, nowDate)
        ? `Today · ${format(cursor, 'EEEE, MMM d')}`
        : format(cursor, 'EEEE, MMM d, yyyy')
      : mode === 'week'
        ? weekTitle(visibleDays('week', cursor, weekStartsOn))
        : viewTitle(mode, cursor, weekStartsOn);
  const unit = mode;

  // Direction-aware transition: slide when paging, zoom when switching Day/Week/Month.
  const periodKey =
    mode === 'month' ? format(cursor, 'yyyy-MM') : format(mode === 'week' ? startOfWeek(cursor, { weekStartsOn }) : cursor, 'yyyy-MM-dd');
  const last = useRef({ mode, periodKey, t: cursor.getTime() });
  const motion =
    last.current.mode !== mode ? 'pl-zoom' : last.current.periodKey !== periodKey ? (cursor.getTime() > last.current.t ? 'pl-next' : 'pl-prev') : '';
  useEffect(() => {
    last.current = { mode, periodKey, t: cursor.getTime() };
  });

  return (
    <section className="planner" aria-label="Planner">
      <header className="pl-head">
        <div className="pl-nav">
          <button
            className={`pl-today${showsToday ? '' : ' away'}`}
            onClick={() => setCursor(new Date())}
            title="Back to today (T)"
            aria-label="Back to today"
          >
            <Icon name="today" size={18} />
            Today
          </button>
          <button className="icon-btn small" onClick={() => step(-1)} aria-label={`Previous ${unit}`} title={`Previous ${unit} (K)`}>
            <Icon name="chevron_left" />
          </button>
          <button className="icon-btn small" onClick={() => step(1)} aria-label={`Next ${unit}`} title={`Next ${unit} (J)`}>
            <Icon name="chevron_right" />
          </button>
          <h2 className="pl-title" aria-live="polite">
            {title}
          </h2>
        </div>
        <div
          className="pl-modes"
          role="radiogroup"
          aria-label="Planner range"
          style={{ '--idx': MODES.findIndex((m) => m.id === mode) } as CSSProperties}
        >
          {MODES.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => setView(m.id)}
              title={`${m.label} (${m.key})`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </header>

      <div key={`${mode}:${periodKey}`} className={`pl-body ${motion}`}>
        {mode === 'day' && <DayMode data={dayData(cursor)} now={now} />}
        {mode === 'week' && <WeekMode cursor={cursor} now={now} weekStartsOn={weekStartsOn} dayData={dayData} onPick={pickDay} />}
        {mode === 'month' && <MonthMode cursor={cursor} now={nowDate} weekStartsOn={weekStartsOn} dayData={dayData} onPick={pickDay} />}
      </div>
      {mode === 'day' && <WeekChips cursor={cursor} now={nowDate} weekStartsOn={weekStartsOn} dayData={dayData} onPick={pickDay} />}
    </section>
  );
}

const trackedMs = (d: DayData) => d.tracked.reduce((sum, s) => sum + (s.end - s.start), 0);

function DayMode({ data, now }: { data: DayData; now: number }) {
  const isToday = now >= data.day && now < data.end;
  const range = hourRange(data.spans, data.day, now);
  const at = (t: number) => pct(t, data.day, range);
  const tracked = trackedMs(data);

  let status: ReactNode;
  if (isToday) {
    const current = data.spans.find((s) => s.start <= now && s.end > now);
    const next = data.spans.filter((s) => s.start > now).sort((a, b) => a.start - b.start)[0];
    status = current ? (
      <>
        Now: <strong>{current.event.title}</strong> until {format(current.end, 'h:mm a')}
      </>
    ) : next ? (
      <>
        Next: <strong>{next.event.title}</strong> {inLabel(next.start - now)}
      </>
    ) : (
      'Nothing else on the calendar today'
    );
  } else {
    const parts = [
      data.spans.length ? `${data.spans.length} event${data.spans.length === 1 ? '' : 's'}` : 'No events',
      data.due.length ? `${data.due.length} due` : '',
      tracked >= 60_000 ? `${formatDuration(tracked)} tracked` : '',
    ].filter(Boolean);
    status = parts.join(' · ');
  }
  const endOfRange = data.day + range[1] * 3_600_000;

  return (
    <div className="pl-day">
      <div className="tb-head">
        {isToday && (
          <span className="tb-now-label">
            <Icon name="schedule" size={18} />
            {format(now, 'h:mm a')}
          </span>
        )}
        <span className="tb-status">{status}</span>
        {isToday && (
          <span className="tb-left">
            {endOfRange > now ? `${formatDuration(endOfRange - now)} left until ${format(endOfRange, 'h a')}` : 'Day’s done'}
          </span>
        )}
      </div>
      {data.allDay.length > 0 && (
        <div className="pl-allday">
          {data.allDay.map((e) => (
            <button key={e.id} onClick={() => openPlannerEvent(e)} title={e.title}>
              {e.title}
            </button>
          ))}
        </div>
      )}
      <DayTrack data={data} range={range} now={now} />
      {data.tracked.length > 0 && <TrackedStrip data={data} at={at} />}
      <HourAxis day={data.day} range={range} />
    </div>
  );
}

interface RangeProps {
  cursor: Date;
  weekStartsOn: 0 | 1;
  dayData: (d: Date | number) => DayData;
  onPick: (d: Date) => void;
}

/** Day mode: the week around the selected day, for quick switching. */
function WeekChips({ cursor, now, weekStartsOn, dayData, onPick }: RangeProps & { now: Date }) {
  const days = visibleDays('week', cursor, weekStartsOn);
  return (
    <ol className="pl-chips" aria-label="Pick a day">
      {days.map((d) => {
        const data = dayData(d);
        const today = isSameDay(d, now);
        const selected = isSameDay(d, cursor);
        return (
          <li key={d.getTime()}>
            <button
              className={`pl-chip${today ? ' today' : ''}${selected ? ' selected' : ''}`}
              onClick={() => onPick(d)}
              aria-pressed={selected}
              aria-current={today ? 'date' : undefined}
              aria-label={`${format(d, 'EEEE, MMMM d')}: ${data.spans.length} events, ${data.due.length} due`}
            >
              <span className="pl-chip-wd">{format(d, 'EEE')}</span>
              <span className="pl-chip-num">{format(d, 'd')}</span>
              <Marks data={data} />
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Colored dots for events (up to 4) and a red count of deadlines. */
function Marks({ data }: { data: DayData }) {
  const colors = [...new Set(data.spans.map((s) => s.color))].slice(0, 4);
  return (
    <span className="pl-marks" aria-hidden="true">
      {colors.map((c) => (
        <span key={c} className="pl-dot" style={{ background: c }} />
      ))}
      {data.due.length > 0 && <span className="pl-due">{data.due.length}</span>}
    </span>
  );
}

function WeekMode({ cursor, now, weekStartsOn, dayData, onPick }: RangeProps & { now: number }) {
  const days = visibleDays('week', cursor, weekStartsOn);
  const rows = days.map((d) => dayData(d));
  // One shared hour range so the columns line up across days.
  const range = rows.reduce<[number, number]>(
    (r, data) => {
      const [a, b] = hourRange(data.spans, data.day, now);
      return [Math.min(r[0], a), Math.max(r[1], b)];
    },
    [24, 0],
  );
  const today = startOfDay(now).getTime();

  return (
    <div className="pl-week">
      <div className="pl-week-axis">
        <span />
        <HourAxis day={today} range={range} />
        <span />
      </div>
      {rows.map((data, i) => {
        const d = new Date(data.day);
        const isToday = data.day === today;
        return (
          <div key={data.day} className={`pl-week-row${isToday ? ' today' : ''}`} style={{ '--row': i } as CSSProperties}>
            <button className="pl-week-day" onClick={() => onPick(d)} title={`Open ${format(d, 'EEEE')}`}>
              <span className="pl-chip-wd">{format(d, 'EEE')}</span>
              <span className="pl-week-num">{format(d, 'd')}</span>
            </button>
            <DayTrack data={data} range={range} now={now} compact />
            <span className="pl-week-sum">{trackedMs(data) >= 60_000 ? formatDuration(trackedMs(data)) : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

function MonthMode({ cursor, now, weekStartsOn, dayData, onPick }: RangeProps & { now: Date }) {
  const days = useMemo(() => monthGridDays(cursor, weekStartsOn), [cursor.getFullYear(), cursor.getMonth(), weekStartsOn]); // eslint-disable-line react-hooks/exhaustive-deps
  const weeks = days.length / 7;
  return (
    <div className="pl-month" style={{ '--weeks': weeks } as CSSProperties}>
      {weekdayLabels(weekStartsOn, 'EEEEE').map((l, i) => (
        <span key={i} className="pl-month-wd" aria-hidden="true">
          {l}
        </span>
      ))}
      {days.map((d, i) => {
        const data = dayData(d);
        const out = !isSameMonth(d, cursor);
        const today = isSameDay(d, now);
        return (
          <button
            key={d.getTime()}
            className={`pl-month-day${out ? ' out' : ''}${today ? ' today' : ''}`}
            onClick={() => onPick(d)}
            aria-label={`${format(d, 'EEEE, MMMM d')}: ${data.spans.length} events, ${data.due.length} due`}
            aria-current={today ? 'date' : undefined}
            style={{ '--cell': i } as CSSProperties}
          >
            <span className="pl-month-num">{format(d, 'd')}</span>
            <Marks data={data} />
          </button>
        );
      })}
    </div>
  );
}

/** "Oct 25 – 31, 2026" or "Oct 29 – Nov 4, 2026". */
function weekTitle(days: Date[]): string {
  const [a, b] = [days[0], days[days.length - 1]];
  if (isSameMonth(a, b)) return `${format(a, 'MMM d')} – ${format(b, 'd, yyyy')}`;
  if (a.getFullYear() === b.getFullYear()) return `${format(a, 'MMM d')} – ${format(b, 'MMM d, yyyy')}`;
  return `${format(a, 'MMM d, yyyy')} – ${format(b, 'MMM d, yyyy')}`;
}

function inLabel(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'starting now';
  if (min < 60) return `in ${min} min`;
  return `in ${formatDuration(ms)}`;
}
