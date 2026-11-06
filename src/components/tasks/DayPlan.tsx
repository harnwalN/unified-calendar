// "Plan my day": put the day's tasks and subtasks into time slots (WorkBlocks), let the app fit
// them into free time around events, and add your own blocks ("Gym", "Lunch"…).
import { useMemo, useState, type CSSProperties } from 'react';
import { format } from 'date-fns';
import { newId, taskRef, useStore } from '../../store';
import { dayKey, useTasks } from '../../store/tasks';
import type { TaskRef, TaskView, WorkBlock } from '../../types';
import ClassSelect from '../ClassSelect';
import Icon from '../Icon';
import { formatDuration } from './format';
import { useTaskColor } from './TaskRow';
import type { DayData } from './usePlannerData';
import { autoPlan, blocksOnDay, freeMinutesIn, nextFreeStart, PLAN_DURATIONS, planCandidates, SLOT_MIN, type Interval, type PlanItem } from './planning';
import type { EventSpan } from './usePlannerData';
import './DayPlan.css';

const H = 3_600_000;
/** The part of the day "Fit into free time" fills. */
const DAY_FROM_H = 8;
const DAY_UNTIL_H = 22;

const toTime = (ms: number) => format(ms, 'HH:mm');
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

export default function DayPlan({ data, now, onClose }: { data: DayData; now: number; onClose: () => void }) {
  const tasks = useTasks();
  const day = dayKey(data.day);
  const isToday = now >= data.day && now < data.end;
  const [extra, setExtra] = useState<string[]>([]);
  const [fitMsg, setFitMsg] = useState('');

  const from = Math.max(data.day + DAY_FROM_H * H, isToday ? now : 0);
  const until = Math.max(from, data.day + DAY_UNTIL_H * H);
  // Events you're attending and sessions already planned take up time.
  const busy: Interval[] = useMemo(() => data.spans.filter((s) => !s.skipped).map((s) => ({ start: s.start, end: s.end })), [data.spans]);

  const { toPlan, others } = useMemo(() => {
    const candidates = planCandidates(tasks, day, new Date(now));
    const keys = new Set(candidates.map((c) => c.key));
    for (const ref of extra) {
      const t = tasks.find((x) => x.ref === ref);
      if (t && !keys.has(ref) && t.status !== 'done') candidates.push({ key: ref, task: t, title: t.title, minutes: 30 });
    }
    const scheduled = (c: PlanItem) => blocksOnDay(c.task, day, c.subtaskId).some((b) => c.subtaskId || !b.subtaskId);
    const shownKeys = new Set(candidates.map((c) => c.key));
    return {
      toPlan: candidates.filter((c) => !scheduled(c)),
      others: tasks.filter((t) => t.status !== 'done' && !shownKeys.has(t.ref)).sort((a, b) => a.title.localeCompare(b.title)),
    };
  }, [tasks, day, now, extra]);

  const sessions = useMemo(
    () =>
      tasks
        .flatMap((t) => blocksOnDay(t, day).map((b) => ({ task: t, block: b })))
        .sort((a, b) => a.block.start.localeCompare(b.block.start)),
    [tasks, day],
  );

  const free = freeMinutesIn(busy, from, until);
  const fit = () => {
    const placed = autoPlan(toPlan, busy, from, until);
    for (const { item, start } of placed) {
      addBlock(item.task.ref, { start: new Date(start).toISOString(), durationMin: item.minutes, ...(item.subtaskId && { subtaskId: item.subtaskId }) });
    }
    const left = toPlan.length - placed.length;
    setFitMsg(
      placed.length
        ? `Scheduled ${placed.length}${left ? ` · ${left} didn’t fit` : ''}.`
        : 'Nothing fits in the free time left. Shorten something or pick times by hand.',
    );
  };

  const label = isToday ? 'today' : format(data.day, 'EEE, MMM d');
  return (
    <section className="dp" aria-label={`Plan ${label}`}>
      <header className="dp-head">
        <h3>
          <Icon name="event_note" size={18} /> Plan {label}
        </h3>
        <span className="dp-free">
          {free > 0 ? `${formatDuration(free * 60_000)} free` : 'No free time left'} until {format(until, 'h a')}
        </span>
        <button className="dp-fit" onClick={fit} disabled={!toPlan.length || free <= 0} title="Put each unscheduled item into the next free slot">
          <Icon name="auto_awesome" size={16} /> Fit into free time
        </button>
        <button className="icon-btn small" onClick={onClose} aria-label="Close day plan">
          <Icon name="close" />
        </button>
      </header>
      {fitMsg && (
        <p className="dp-msg" role="status">
          {fitMsg}
        </p>
      )}

      <div className="dp-cols">
        <div className="dp-col">
          <h4>To schedule</h4>
          {toPlan.length ? (
            <ul className="dp-list">
              {toPlan.map((item) => (
                <PlanRow key={item.key} item={item} day={data.day} busy={busy} from={from} until={until} />
              ))}
            </ul>
          ) : (
            <p className="dp-none">Everything for {label} has a time.</p>
          )}
          {others.length > 0 && (
            <select
              className="dp-more"
              value=""
              aria-label="Schedule another task"
              onChange={(e) => e.target.value && setExtra((x) => [...x, e.target.value])}
            >
              <option value="">＋ Schedule another task…</option>
              {others.map((t) => (
                <option key={t.ref} value={t.ref}>
                  {t.title}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="dp-col">
          <h4>Scheduled</h4>
          {sessions.length ? (
            <ul className="dp-list">
              {sessions.map(({ task, block }) => (
                <SessionRow key={block.id} task={task} block={block} day={data.day} spans={data.spans} />
              ))}
            </ul>
          ) : (
            <p className="dp-none">Nothing yet. Pick times on the left, or let the app fit them in.</p>
          )}
          <AddBlock day={data.day} dayKeyStr={day} busy={busy} from={from} until={until} />
        </div>
      </div>
    </section>
  );
}

function DurationSelect({ value, onChange, label }: { value: number; onChange: (min: number) => void; label: string }) {
  const options = PLAN_DURATIONS.includes(value) ? PLAN_DURATIONS : [...PLAN_DURATIONS, value].sort((a, b) => a - b);
  return (
    <select className="dp-dur" value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))}>
      {options.map((m) => (
        <option key={m} value={m}>
          {formatDuration(m * 60_000)}
        </option>
      ))}
    </select>
  );
}

/** First free slot long enough; else the first free moment at all; else the start of the window. */
const suggestedStart = (busy: Interval[], from: number, until: number, minutes: number) =>
  nextFreeStart(busy, from, until, minutes) ?? nextFreeStart(busy, from, until, SLOT_MIN) ?? from;

function PlanRow({ item, day, busy, from, until }: { item: PlanItem; day: number; busy: Interval[]; from: number; until: number }) {
  const color = useTaskColor(item.task);
  const [minutes, setMinutes] = useState(item.minutes);
  const [time, setTime] = useState<string | null>(null);
  const value = time ?? toTime(suggestedStart(busy, from, until, minutes));
  const schedule = () =>
    addBlock(item.task.ref, { start: new Date(atTime(day, value)).toISOString(), durationMin: minutes, ...(item.subtaskId && { subtaskId: item.subtaskId }) });
  return (
    <li className="dp-row" style={{ '--task-color': color } as CSSProperties}>
      <span className="dp-dot" aria-hidden="true" />
      <span className="dp-title">
        <span>{item.title}</span>
        {item.subtaskId && <small>↳ {item.task.title}</small>}
      </span>
      <input type="time" className="dp-time" step={900} value={value} aria-label={`Start time for ${item.title}`} onChange={(e) => setTime(e.target.value || null)} />
      <DurationSelect value={minutes} onChange={setMinutes} label={`Length of ${item.title}`} />
      <button className="dp-add" onClick={schedule} aria-label={`Schedule ${item.title}`} title="Schedule">
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
  const end = start + block.durationMin * 60_000;
  const self = `plan:${task.ref}:${block.id}`;
  const clash = spans.find((s) => !s.skipped && s.id !== self && s.start < end && s.end > start);
  return (
    <li className="dp-row" style={{ '--task-color': color } as CSSProperties}>
      <span className="dp-dot" aria-hidden="true" />
      <span className="dp-title">
        <button className="dp-open" onClick={() => useStore.getState().selectTask(task.ref)} title={`Open “${task.title}”`}>
          {title}
        </button>
        <small>
          {sub ? `↳ ${task.title} · ` : ''}until {format(end, 'h:mm a')}
          {clash && <span className="dp-clash"> · overlaps {clash.event.title.replace(/^✓ /, '')}</span>}
        </small>
      </span>
      <input
        type="time"
        className="dp-time"
        step={900}
        value={toTime(Date.parse(block.start))}
        aria-label={`Start time for ${title}`}
        onChange={(e) => e.target.value && patchBlock(task.ref, block.id, { start: new Date(atTime(day, e.target.value)).toISOString() })}
      />
      <DurationSelect value={block.durationMin} onChange={(m) => patchBlock(task.ref, block.id, { durationMin: m })} label={`Length of ${title}`} />
      <button className="icon-btn small" onClick={() => removeBlock(task.ref, block.id)} aria-label={`Unschedule ${title}`} title="Unschedule">
        <Icon name="close" />
      </button>
    </li>
  );
}

/** A block that isn't an existing task ("Gym", "Lunch with Sam"): saved as a personal task planned for the day. */
function AddBlock({ day, dayKeyStr, busy, from, until }: { day: number; dayKeyStr: string; busy: Interval[]; from: number; until: number }) {
  const [title, setTitle] = useState('');
  const [classId, setClassId] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [time, setTime] = useState<string | null>(null);
  const value = time ?? toTime(suggestedStart(busy, from, until, minutes));
  const add = () => {
    const t = title.trim();
    if (!t) return;
    useStore.getState().addTask({
      title: t,
      list: 'personal',
      classId: classId || undefined,
      doDate: dayKeyStr,
      blocks: [{ id: newId(), start: new Date(atTime(day, value)).toISOString(), durationMin: minutes }],
    });
    setTitle('');
    setTime(null);
  };
  return (
    <form
      className="dp-block"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <input className="dp-block-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a block, e.g. Gym, Lunch, Reading" aria-label="New block title" maxLength={80} />
      <div className="dp-block-line">
        <ClassSelect className="dp-block-class" label="Class or topic for the block" value={classId} onChange={setClassId} allowNone noneLabel="No class/topic" />
        <input type="time" className="dp-time" step={900} value={value} aria-label="Start time for the new block" onChange={(e) => setTime(e.target.value || null)} />
        <DurationSelect value={minutes} onChange={setMinutes} label="Length of the new block" />
        <button type="submit" className="dp-add" disabled={!title.trim()} aria-label="Add block" title="Add block">
          <Icon name="add" size={18} />
        </button>
      </div>
    </form>
  );
}
