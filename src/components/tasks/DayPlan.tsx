// "Plan my day": put the day's tasks and subtasks into time slots (WorkBlocks), let the app fit
// them into free time around events, add your own blocks ("Gym", "Lunch"…), and say which of the
// day's classes you're attending. Free stretches also show on the day bar; clicking one fills it.
import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { format } from 'date-fns';
import { newId, taskRef, useStore } from '../../store';
import { dayKey, useTasks } from '../../store/tasks';
import type { TaskRef, TaskView, WorkBlock } from '../../types';
import { setMeetingSkipped, useClassMatcher } from '../../features/classMeetings';
import ClassSelect from '../ClassSelect';
import Icon from '../Icon';
import { formatDuration } from './format';
import { useTaskColor } from './TaskRow';
import type { DayData, EventSpan } from './usePlannerData';
import {
  autoPlan, blocksOnDay, freeIntervals, nextFreeStart, PLAN_DURATIONS, planCandidates, SLOT_MIN, type Interval, type PlanItem,
} from './planning';
import './DayPlan.css';

const MIN = 60_000;

/** The part of the day suggestions and "Fit into free time" use; editable, remembered per device. */
interface PlanWindow {
  from: string;
  until: string;
}
const WINDOW_KEY = 'day-plan:window';
const DEFAULT_WINDOW: PlanWindow = { from: '08:00', until: '22:00' };
const isHhmm = (v: unknown): v is string => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);

function usePlanWindow(): [PlanWindow, (patch: Partial<PlanWindow>) => void] {
  const [win, setWin] = useState<PlanWindow>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(WINDOW_KEY) ?? 'null') as Partial<PlanWindow> | null;
      if (saved && isHhmm(saved.from) && isHhmm(saved.until)) return { from: saved.from, until: saved.until };
    } catch {
      // Unreadable or blocked storage: use the default.
    }
    return DEFAULT_WINDOW;
  });
  const update = useCallback((patch: Partial<PlanWindow>) => {
    setWin((w) => {
      const next = { ...w, ...patch };
      try {
        localStorage.setItem(WINDOW_KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable: keep it for this session only.
      }
      return next;
    });
  }, []);
  return [win, update];
}

const toTime = (ms: number) => format(ms, 'HH:mm');
const clock = (ms: number) => format(ms, 'h:mm a');
function atTime(day: number, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

/** Blocks as they are in the store right now (views can be a render behind during batch edits). */
function storedBlocks(ref: TaskRef): WorkBlock[] {
  const { kind, id } = taskRef.parse(ref);
  const s = useStore.getState();
  return (kind === 'assignment' ? s.meta[id]?.blocks : s.tasks[id]?.blocks) ?? [];
}
function setBlocks(ref: TaskRef, blocks: WorkBlock[]) {
  useStore.getState().updateTaskFields(ref, { blocks: [...blocks].sort((a, b) => a.start.localeCompare(b.start)) });
}
const addBlock = (ref: TaskRef, b: Omit<WorkBlock, 'id'>) => setBlocks(ref, [...storedBlocks(ref), { id: newId(), ...b }]);
const patchBlock = (ref: TaskRef, id: string, patch: Partial<WorkBlock>) =>
  setBlocks(ref, storedBlocks(ref).map((b) => (b.id === id ? { ...b, ...patch } : b)));
const removeBlock = (ref: TaskRef, id: string) => setBlocks(ref, storedBlocks(ref).filter((b) => b.id !== id));
const scheduleItem = (item: PlanItem, start: number, minutes = item.minutes) =>
  addBlock(item.task.ref, { start: new Date(start).toISOString(), durationMin: minutes, ...(item.subtaskId && { subtaskId: item.subtaskId }) });

/** A personal task that is just a time block ("Gym", "Lunch"), planned for the day. */
function addStandaloneBlock(title: string, classId: string, day: string, start: number, minutes: number) {
  useStore.getState().addTask({
    title,
    list: 'personal',
    classId: classId || undefined,
    doDate: day,
    blocks: [{ id: newId(), start: new Date(start).toISOString(), durationMin: minutes }],
  });
}

export interface PlanFrame {
  /** Planning window, clamped so suggestions never land in the past. */
  from: number;
  until: number;
  /** Events you're attending plus sessions already planned. */
  busy: Interval[];
  free: Interval[];
  win: PlanWindow;
  setWin: (patch: Partial<PlanWindow>) => void;
}

/** Window, busy time and free slots for planning `data`'s day; shared by the panel and the day bar. */
export function usePlanFrame(data: DayData, now: number): PlanFrame {
  const [win, setWin] = usePlanWindow();
  const isToday = now >= data.day && now < data.end;
  // An end at or before the start means "until midnight".
  const winUntil = win.until > win.from ? atTime(data.day, win.until) : data.end;
  const from = Math.max(atTime(data.day, win.from), isToday ? now : 0);
  const until = Math.max(from, winUntil);
  const busy = useMemo(() => data.spans.filter((s) => !s.skipped).map((s) => ({ start: s.start, end: s.end })), [data.spans]);
  const free = useMemo(() => freeIntervals(busy, from, until), [busy, from, until]);
  return { from, until, busy, free, win, setWin };
}

/** Open, not-yet-scheduled tasks and subtasks for the day (for the panel and the button's count). */
export function useToPlan(day: string, now: number, extra: string[] = NO_EXTRA): { toPlan: PlanItem[]; others: TaskView[] } {
  const tasks = useTasks();
  return useMemo(() => {
    const candidates = planCandidates(tasks, day, new Date(now));
    const keys = new Set(candidates.map((c) => c.key));
    for (const ref of extra) {
      const t = tasks.find((x) => x.ref === ref);
      if (t && !keys.has(ref) && t.status !== 'done') candidates.push({ key: ref, task: t, title: t.title, minutes: 30 });
    }
    const scheduled = (c: PlanItem) => blocksOnDay(c.task, day, c.subtaskId).some((b) => c.subtaskId || !b.subtaskId);
    const shown = new Set(candidates.map((c) => c.key));
    return {
      toPlan: candidates.filter((c) => !scheduled(c)),
      others: tasks.filter((t) => t.status !== 'done' && !shown.has(t.ref)).sort((a, b) => a.title.localeCompare(b.title)),
    };
  }, [tasks, day, now, extra]);
}
const NO_EXTRA: string[] = [];

/** First free slot long enough; else the first free moment at all; else the start of the window. */
const suggestedStart = (f: PlanFrame, minutes: number) =>
  nextFreeStart(f.busy, f.from, f.until, minutes) ?? nextFreeStart(f.busy, f.from, f.until, SLOT_MIN) ?? f.from;

export default function DayPlan({
  data,
  now,
  frame,
  slot,
  onSlot,
  onClose,
}: {
  data: DayData;
  now: number;
  frame: PlanFrame;
  /** A free slot picked on the day bar, to fill. */
  slot: Interval | null;
  onSlot: (slot: Interval | null) => void;
  onClose: () => void;
}) {
  const tasks = useTasks();
  const day = dayKey(data.day);
  const isToday = now >= data.day && now < data.end;
  const [extra, setExtra] = useState<string[]>([]);
  const [fitMsg, setFitMsg] = useState('');
  const [editWindow, setEditWindow] = useState(false);
  const match = useClassMatcher();
  const { toPlan, others } = useToPlan(day, now, extra);

  // Work sessions and the day's class meetings, in time order.
  const agenda = useMemo(() => {
    const items: ({ kind: 'session'; at: number; task: TaskView; block: WorkBlock } | { kind: 'class'; at: number; span: EventSpan })[] = [];
    for (const t of tasks) for (const b of blocksOnDay(t, day)) items.push({ kind: 'session', at: Date.parse(b.start), task: t, block: b });
    for (const s of data.spans) if (!s.planned && s.className) items.push({ kind: 'class', at: Date.parse(s.event.start), span: s });
    return items.sort((a, b) => a.at - b.at);
  }, [tasks, day, data.spans]);

  const freeMin = frame.free.reduce((sum, i) => sum + (i.end - i.start) / MIN, 0);
  const fit = () => {
    const placed = autoPlan(toPlan, frame.busy, frame.from, frame.until);
    for (const { item, start } of placed) scheduleItem(item, start);
    const left = toPlan.length - placed.length;
    setFitMsg(placed.length ? `Scheduled ${placed.length}${left ? ` · ${left} didn’t fit` : ''}.` : 'Nothing fits in the free time left.');
  };

  const label = isToday ? 'today' : format(data.day, 'EEE, MMM d');
  const untilMidnight = frame.win.until <= frame.win.from;
  const windowLabel =
    untilMidnight && frame.win.from === '00:00'
      ? 'All day'
      : `${format(atTime(data.day, frame.win.from), 'h:mm a')} – ${untilMidnight ? 'midnight' : format(atTime(data.day, frame.win.until), 'h:mm a')}`;
  return (
    <section className="dp" aria-label={`Plan ${label}`}>
      <header className="dp-head">
        <h3>Plan {label}</h3>
        <button className="dp-chip" onClick={() => setEditWindow(!editWindow)} aria-expanded={editWindow} title="Which hours to plan">
          <Icon name="schedule" size={15} />
          {windowLabel}
        </button>
        <span className="dp-free">{freeMin > 0 ? `${formatDuration(freeMin * MIN)} free` : 'No free time left'}</span>
        <button className="dp-fit" onClick={fit} disabled={!toPlan.length || freeMin <= 0} title="Put each unscheduled item into the next free slot">
          <Icon name="auto_awesome" size={16} /> Fit into free time
        </button>
        <button className="icon-btn small" onClick={onClose} aria-label="Close day plan">
          <Icon name="close" />
        </button>
      </header>

      {editWindow && (
        <div className="dp-window">
          <label>
            From <input type="time" className="dp-input" value={frame.win.from} onChange={(e) => e.target.value && frame.setWin({ from: e.target.value })} />
          </label>
          <label>
            to <input type="time" className="dp-input" value={frame.win.until} onChange={(e) => e.target.value && frame.setWin({ until: e.target.value })} />
          </label>
          <button className="dp-link" onClick={() => frame.setWin({ from: '00:00', until: '00:00' })}>
            All day
          </button>
          <button className="dp-link" onClick={() => frame.setWin(DEFAULT_WINDOW)}>
            8 AM – 10 PM
          </button>
        </div>
      )}
      {fitMsg && (
        <p className="dp-msg" role="status">
          {fitMsg}
        </p>
      )}

      {slot ? (
        <SlotFiller key={slot.start} slot={slot} items={toPlan} day={day} onDone={() => onSlot(null)} />
      ) : (
        frame.free.length > 0 && (
          <p className="dp-hint">
            <Icon name="touch_app" size={16} /> Click a <span className="dp-hint-slot">＋</span> free slot on the bar above to fill it.
          </p>
        )
      )}

      <div className="dp-cols">
        <div className="dp-col">
          <h4>
            To schedule <span className="dp-count">{toPlan.length}</span>
          </h4>
          {toPlan.length ? (
            <ul className="dp-list">
              {toPlan.map((item) => (
                <PlanRow key={item.key} item={item} frame={frame} day={data.day} />
              ))}
            </ul>
          ) : (
            <p className="dp-none">Everything for {label} has a time.</p>
          )}
          {others.length > 0 && (
            <select className="dp-more" value="" aria-label="Schedule another task" onChange={(e) => e.target.value && setExtra((x) => [...x, e.target.value])}>
              <option value="">＋ Another task…</option>
              {others.map((t) => (
                <option key={t.ref} value={t.ref}>
                  {t.title}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="dp-col">
          <h4>Your day</h4>
          {agenda.length ? (
            <ul className="dp-list">
              {agenda.map((a) =>
                a.kind === 'session' ? (
                  <SessionRow key={a.block.id} task={a.task} block={a.block} day={data.day} spans={data.spans} />
                ) : (
                  <ClassMeetingRow key={a.span.id} span={a.span} classId={match(a.span.event)?.cls.id} />
                ),
              )}
            </ul>
          ) : (
            <p className="dp-none">Nothing planned yet.</p>
          )}
          <AddBlock day={data.day} dayKeyStr={day} frame={frame} />
        </div>
      </div>
    </section>
  );
}

/** Length as plain text that opens a picker on click (a borderless <select>). */
function LengthPick({ value, onChange, label }: { value: number; onChange: (min: number) => void; label: string }) {
  const options = PLAN_DURATIONS.includes(value) ? PLAN_DURATIONS : [...PLAN_DURATIONS, value].sort((a, b) => a - b);
  return (
    <select className="dp-len" value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))}>
      {options.map((m) => (
        <option key={m} value={m}>
          {formatDuration(m * MIN)}
        </option>
      ))}
    </select>
  );
}

/** Start time as plain text; click to edit. */
function TimePick({ value, onChange, label, className = '' }: { value: number; onChange: (ms: string) => void; label: string; className?: string }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        type="time"
        className={`dp-input ${className}`}
        autoFocus
        value={toTime(value)}
        aria-label={label}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && setEditing(false)}
      />
    );
  }
  return (
    <button className={`dp-at ${className}`} onClick={() => setEditing(true)} title="Change the start time" aria-label={`${label}: ${clock(value)}`}>
      {clock(value)}
    </button>
  );
}

function PlanRow({ item, frame, day }: { item: PlanItem; frame: PlanFrame; day: number }) {
  const color = useTaskColor(item.task);
  const [minutes, setMinutes] = useState(item.minutes);
  const [time, setTime] = useState<string | null>(null);
  const start = time ? atTime(day, time) : suggestedStart(frame, minutes);
  return (
    <li className="dp-row" style={{ '--task-color': color } as CSSProperties}>
      <span className="dp-dot" aria-hidden="true" />
      <span className="dp-title">
        <span>{item.title}</span>
        {item.subtaskId && <small>↳ {item.task.title}</small>}
      </span>
      <LengthPick value={minutes} onChange={setMinutes} label={`Length of ${item.title}`} />
      <span className="dp-sep" aria-hidden="true">at</span>
      <TimePick value={start} onChange={setTime} label={`Start time for ${item.title}`} />
      <button className="dp-add" onClick={() => scheduleItem(item, start, minutes)} aria-label={`Schedule ${item.title} at ${clock(start)}`} title="Schedule">
        <Icon name="add" size={18} />
      </button>
    </li>
  );
}

function SessionRow({ task, block, day, spans }: { task: TaskView; block: WorkBlock; day: number; spans: EventSpan[] }) {
  const color = useTaskColor(task);
  const sub = block.subtaskId ? task.subtasks.find((s) => s.id === block.subtaskId) : undefined;
  const title = sub?.title ?? task.title;
  const start = Date.parse(block.start);
  const end = start + block.durationMin * MIN;
  const self = `plan:${task.ref}:${block.id}`;
  const clash = spans.find((s) => !s.skipped && s.id !== self && s.start < end && s.end > start);
  return (
    <li className="dp-row dp-session" style={{ '--task-color': color } as CSSProperties}>
      <TimePick
        className="dp-when"
        value={start}
        label={`Start time for ${title}`}
        onChange={(v) => patchBlock(task.ref, block.id, { start: new Date(atTime(day, v)).toISOString() })}
      />
      <span className="dp-bar" aria-hidden="true" />
      <span className="dp-title">
        <button className="dp-open" onClick={() => useStore.getState().selectTask(task.ref)} title={`Open “${task.title}”`}>
          {title}
        </button>
        {(sub || clash) && (
          <small>
            {sub && `↳ ${task.title}`}
            {sub && clash && ' · '}
            {clash && <span className="dp-clash">overlaps {clash.event.title.replace(/^✓ /, '')}</span>}
          </small>
        )}
      </span>
      <LengthPick value={block.durationMin} onChange={(m) => patchBlock(task.ref, block.id, { durationMin: m })} label={`Length of ${title}`} />
      <button className="icon-btn small dp-remove" onClick={() => removeBlock(task.ref, block.id)} aria-label={`Unschedule ${title}`} title="Unschedule">
        <Icon name="close" />
      </button>
    </li>
  );
}

/** A class meeting on the day; "Skip" marks just this one not attending (freeing its time). */
function ClassMeetingRow({ span, classId }: { span: EventSpan; classId?: string }) {
  const attending = !span.skipped;
  const { event } = span;
  return (
    <li className={`dp-row dp-class${attending ? '' : ' skipped'}`} style={{ '--task-color': span.color } as CSSProperties}>
      <span className="dp-when dp-when--static">{clock(Date.parse(event.start))}</span>
      <span className="dp-bar" aria-hidden="true" />
      <span className="dp-title">
        <span>
          <Icon name="school" size={14} className="dp-class-icon" /> {event.title}
        </span>
        <small>until {clock(Date.parse(event.end))}</small>
      </span>
      {classId && (
        <div className="dp-going" role="radiogroup" aria-label={`Going to ${event.title}?`}>
          <button role="radio" aria-checked={attending} className={attending ? 'on' : undefined} onClick={() => !attending && setMeetingSkipped(classId, event, false)}>
            Going
          </button>
          <button role="radio" aria-checked={!attending} className={!attending ? 'on' : undefined} onClick={() => attending && setMeetingSkipped(classId, event, true)}>
            Skip
          </button>
        </div>
      )}
    </li>
  );
}

/** Fill a free slot picked on the bar: one of the day's items, or something new. */
function SlotFiller({ slot, items, day, onDone }: { slot: Interval; items: PlanItem[]; day: string; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const slotMin = Math.round((slot.end - slot.start) / MIN);
  const fitMin = (m: number) => Math.min(m, slotMin);
  const addNew = () => {
    if (!title.trim()) return;
    addStandaloneBlock(title.trim(), '', day, slot.start, fitMin(60));
    onDone();
  };
  return (
    <div className="dp-slot" role="group" aria-label={`Fill ${clock(slot.start)} to ${clock(slot.end)}`}>
      <div className="dp-slot-head">
        <strong>
          {clock(slot.start)} – {clock(slot.end)}
        </strong>
        <span>{formatDuration(slotMin * MIN)} free · what goes here?</span>
        <button className="icon-btn small" onClick={onDone} aria-label="Cancel">
          <Icon name="close" />
        </button>
      </div>
      {items.length > 0 && (
        <div className="dp-slot-items">
          {items.map((item) => (
            <button
              key={item.key}
              className="dp-slot-item"
              onClick={() => {
                scheduleItem(item, slot.start, fitMin(item.minutes));
                onDone();
              }}
            >
              {item.title}
              <small>{formatDuration(fitMin(item.minutes) * MIN)}</small>
            </button>
          ))}
        </div>
      )}
      <form
        className="dp-slot-new"
        onSubmit={(e) => {
          e.preventDefault();
          addNew();
        }}
      >
        <input className="dp-input" autoFocus={!items.length} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Or something else, e.g. Gym" aria-label="New block title" maxLength={80} />
        <button type="submit" className="dp-add" disabled={!title.trim()} aria-label="Add block">
          <Icon name="add" size={18} />
        </button>
      </form>
    </div>
  );
}

/** "Add a block" (Gym, Lunch…): folded into one link until needed. */
function AddBlock({ day, dayKeyStr, frame }: { day: number; dayKeyStr: string; frame: PlanFrame }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [classId, setClassId] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [time, setTime] = useState<string | null>(null);
  if (!open) {
    return (
      <button className="dp-link dp-add-block" onClick={() => setOpen(true)}>
        <Icon name="add" size={16} /> Add a block (Gym, Lunch…)
      </button>
    );
  }
  const start = time ? atTime(day, time) : suggestedStart(frame, minutes);
  const add = () => {
    const t = title.trim();
    if (!t) return;
    addStandaloneBlock(t, classId, dayKeyStr, start, minutes);
    setTitle('');
    setTime(null);
    setOpen(false);
  };
  return (
    <form
      className="dp-block"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <div className="dp-block-line">
        <input className="dp-input dp-block-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What, e.g. Gym" aria-label="New block title" maxLength={80} />
        <LengthPick value={minutes} onChange={setMinutes} label="Length of the new block" />
        <span className="dp-sep" aria-hidden="true">at</span>
        <TimePick value={start} onChange={setTime} label="Start time for the new block" />
      </div>
      <div className="dp-block-line">
        <ClassSelect className="dp-input dp-block-class" label="Class or topic for the block" value={classId} onChange={setClassId} allowNone noneLabel="No class/topic" />
        <button type="submit" className="dp-fit dp-fit--small" disabled={!title.trim()}>
          Add
        </button>
        <button type="button" className="dp-link" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
