// Floating mini window: running timer + today's tasks, visible while you work in other tabs.
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { format, startOfDay } from 'date-fns';
import { useStore } from '../../store';
import { dayKey, useClasses, useTasks } from '../../store/tasks';
import { parseQuickAdd } from '../../lib/quickAdd';
import SceneArt from '../scenery/SceneArt';
import { skyState, useSceneClock, useSceneId, useSunLocation } from '../scenery/sky';
import { useVisibleEvents } from '../../store/selectors';
import { closeFloating, FLOATING_ROOT_ID, syncTheme, useFloatingWindow } from '../../features/floating';
import { startTimer, stopTimer, toggleTimer, useTaskLabeler } from '../../features/timer';
import { formatClock } from '../../features/timeStats';
import type { TaskView } from '../../types';
import Icon from '../Icon';
import { dueLabel, formatDuration } from '../tasks/format';
import { useHomeSections } from '../tasks/useHomeData';
import { rankTimerChoices, useRecentTimedRefs } from '../time/StartTimerMenu';
import './FloatingPanel.css';

const MAX_TASKS = 6;
const DAY = 86_400_000;

export default function FloatingPanel() {
  const win = useFloatingWindow();
  const root = win?.document.getElementById(FLOATING_ROOT_ID);
  if (!win || !root) return null;
  return createPortal(<MiniPanel win={win} />, root);
}

/** Re-render every `ms` using the mini window's own timers (they keep running while the main tab is hidden). */
function useWinNow(win: Window, ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = win.setInterval(() => setNow(Date.now()), ms);
    return () => win.clearInterval(id);
  }, [win, ms]);
  return now;
}

function useThemeSync(win: Window) {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => syncTheme(win), [win, theme]);
}

function MiniPanel({ win }: { win: Window }) {
  const timer = useStore((s) => s.runningTimer);
  const nowMs = useWinNow(win, timer ? 1000 : 30_000);
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  useThemeSync(win);

  return (
    <div className="mini">
      <MiniBackground win={win} />
      <header className="mini-head">
        <span className="mini-time">{format(now, 'h:mm a')}</span>
        <span className="mini-date">{format(now, 'EEE, MMM d')}</span>
        <button className="icon-btn small" onClick={() => window.focus()} title="Back to the calendar tab" aria-label="Back to the calendar tab">
          <Icon name="open_in_new" />
        </button>
        <button className="icon-btn small" onClick={closeFloating} title="Close mini window" aria-label="Close mini window">
          <Icon name="close" />
        </button>
      </header>
      <TimerCard now={now} />
      <NextEvent now={now} />
      <TodayList now={now} />
    </div>
  );
}

/** The same time-of-day landscape as the app, sized to the mini window. */
function MiniBackground({ win }: { win: Window }) {
  const scene = useSceneId();
  const clock = useSceneClock();
  const { loc } = useSunLocation();
  const sky = useMemo(() => skyState(clock, loc), [clock, loc]);
  const [size, setSize] = useState<[number, number]>(() => [win.innerWidth, win.innerHeight]);
  useEffect(() => {
    const onResize = () => setSize([win.innerWidth, win.innerHeight]);
    win.addEventListener('resize', onResize);
    return () => win.removeEventListener('resize', onResize);
  }, [win]);
  if (scene === 'off') return null;
  return (
    <div className={`mini-bg ${sky.palette.lightSky ? 'light-sky' : 'dark-sky'}`} aria-hidden="true">
      <SceneArt scene={scene} sky={sky} fit="page" size={size} />
    </div>
  );
}

/** Quick add from the mini window; without a date it's planned for today so it shows up below. */
function MiniAdd() {
  const [text, setText] = useState('');
  const classes = useClasses();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const now = new Date();
    const p = parseQuickAdd(text, now, classes);
    if (!p.title) return;
    const doDate = p.doDate ?? (p.due ? undefined : dayKey(now));
    useStore.getState().addTask({
      title: p.title,
      due: p.due,
      doDate,
      classId: p.list === 'quick' ? undefined : p.classId,
      priority: p.priority,
      estimateMin: p.estimateMin,
      list: p.list,
    });
    setText('');
  };
  return (
    <form className="mini-add" onSubmit={submit}>
      <Icon name="add" size={18} />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a task for today…"
        aria-label="Add a task"
        title="Same shortcuts as the app: fri 5pm, #CSE110, !high, ~30m"
      />
      {text.trim() && (
        <button type="submit" className="mini-add-go" aria-label="Add task">
          <Icon name="arrow_upward" size={18} />
        </button>
      )}
    </form>
  );
}

function TimerCard({ now }: { now: Date }) {
  const timer = useStore((s) => s.runningTimer);
  const entries = useStore((s) => s.timeEntries);
  const label = useTaskLabeler();
  const tasks = useTasks();
  const recent = useRecentTimedRefs();
  const choices = useMemo(() => (timer ? [] : rankTimerChoices(tasks, recent, dayKey(now), '').slice(0, 3)), [timer, tasks, recent, now]);

  const day = startOfDay(now).getTime();
  const elapsed = timer ? Math.max(0, now.getTime() - Date.parse(timer.start)) : 0;
  let todayMs = timer ? now.getTime() - Math.max(day, Date.parse(timer.start)) : 0;
  for (const e of Object.values(entries)) {
    if (e.deleted) continue;
    const s = Math.max(day, Date.parse(e.start));
    const end = Math.min(day + DAY, Date.parse(e.end));
    if (end > s) todayMs += end - s;
  }

  if (timer) {
    const l = label(timer.taskRef);
    return (
      <section className="mini-timer running" style={{ '--task-color': l.color } as CSSProperties} aria-label="Running timer">
        <div className="mini-timer-task">
          <span className="mini-dot" aria-hidden="true" />
          <span className="mini-timer-title" title={l.title}>{l.title}</span>
        </div>
        <div className="mini-timer-row">
          <span className="mini-clock" role="timer">{formatClock(elapsed)}</span>
          <button className="mini-stop" onClick={stopTimer} aria-label="Stop timer">
            <Icon name="stop" />
            Stop
          </button>
        </div>
        <p className="mini-sub">
          {l.groupName} · {formatDuration(todayMs)} tracked today
        </p>
      </section>
    );
  }
  return (
    <section className="mini-timer" aria-label="Start a timer">
      <p className="mini-sub">
        <Icon name="timer" size={16} /> No timer running{todayMs > 0 ? ` · ${formatDuration(todayMs)} tracked today` : ''}
      </p>
      {choices.length > 0 && (
        <ul className="mini-choices">
          {choices.map((t) => (
            <li key={t.ref}>
              <button onClick={() => startTimer(t.ref)} style={{ '--task-color': label(t.ref).color } as CSSProperties}>
                <Icon name="play_arrow" />
                <span>{t.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NextEvent({ now }: { now: Date }) {
  const events = useVisibleEvents();
  const t = now.getTime();
  const end = startOfDay(now).getTime() + DAY;
  const upcoming = events.filter((e) => !e.allDay && e.kind !== 'assignment' && Date.parse(e.end) > t && Date.parse(e.start) < end);
  const cur = upcoming.find((e) => Date.parse(e.start) <= t);
  const next = upcoming.find((e) => Date.parse(e.start) > t);
  const ev = cur ?? next;
  if (!ev) return null;
  const mins = Math.round((Date.parse(ev.start) - t) / 60_000);
  return (
    <p className="mini-next">
      <Icon name="event" size={16} />
      <span>
        {cur ? 'Now' : mins < 60 ? `In ${mins} min` : format(new Date(ev.start), 'h:mm a')}: <strong>{ev.title}</strong>
      </span>
    </p>
  );
}

function TodayList({ now }: { now: Date }) {
  const { sections } = useHomeSections();
  const timer = useStore((s) => s.runningTimer);
  const label = useTaskLabeler();
  const today = sections.today;
  const shown = today.slice(0, MAX_TASKS);

  return (
    <section className="mini-today" aria-label="Today's tasks">
      <h2>
        Today <span className="mini-count">{today.length}</span>
      </h2>
      <MiniAdd />
      {shown.length === 0 ? (
        <p className="mini-none">Nothing due or planned for today.</p>
      ) : (
        <ul>
          {shown.map((t) => (
            <MiniRow key={t.ref} task={t} now={now} color={label(t.ref).color} timing={timer?.taskRef === t.ref} />
          ))}
        </ul>
      )}
      {today.length > shown.length && <p className="mini-none">+{today.length - shown.length} more in the app</p>}
    </section>
  );
}

function MiniRow({ task: t, now, color, timing }: { task: TaskView; now: Date; color: string; timing: boolean }) {
  const due = t.due ? dueLabel(t.due, now) : null;
  const done = t.status === 'done';
  return (
    <li className={`mini-row${timing ? ' timing' : ''}`} style={{ '--task-color': color } as CSSProperties}>
      <button
        className="mini-check"
        role="checkbox"
        aria-checked={done}
        aria-label={`Mark ${t.title} ${done ? 'not done' : 'done'}`}
        onClick={() => useStore.getState().setTaskStatus(t.ref, done ? 'todo' : 'done')}
      >
        <Icon name={done ? 'check_circle' : 'radio_button_unchecked'} />
      </button>
      <span className="mini-row-text">
        <span className="mini-row-title">{t.title}</span>
        {due && <span className={`mini-row-due${due.overdue ? ' overdue' : ''}`}>{due.text}</span>}
      </span>
      <button
        className="icon-btn small mini-play"
        onClick={() => toggleTimer(t.ref)}
        aria-label={timing ? `Stop timing ${t.title}` : `Start timer for ${t.title}`}
        title={timing ? 'Stop timer' : 'Start timer'}
      >
        <Icon name={timing ? 'stop' : 'play_arrow'} />
      </button>
    </li>
  );
}
