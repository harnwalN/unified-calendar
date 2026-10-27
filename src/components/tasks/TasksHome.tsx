import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { format } from 'date-fns';
import { useStore } from '../../store';
import { useTasks } from '../../store/tasks';
import { useVisibleEvents } from '../../store/selectors';
import type { TaskView } from '../../types';
import Icon from '../Icon';
import SceneryBanner from '../scenery/SceneryBanner';
import { usePageScene } from '../scenery/SceneBackdrop';
import { useNow } from '../hooks';
import { fitsGap, freeMinutes, type ClassSection, type TaskGroup } from './grouping';
import { formatEstimate, greeting } from './format';
import { useCollapsedSections, useHomeSections } from './useHomeData';
import TaskRow from './TaskRow';
import QuickAdd from './QuickAdd';
import Planner from './Planner';
import './TasksHome.css';

export default function TasksHome() {
  const { sections, now } = useHomeSections();
  const tasks = useTasks();
  const hasSources = useStore((s) => Object.keys(s.calendars).length > 0 || s.feeds.length > 0 || s.accounts.length > 0);
  const [collapsed, toggle] = useCollapsedSections();
  const { today, classes, personal, quick, openCount, dueTodayCount, overdueCount } = sections;
  const pageScene = usePageScene();

  const summary = [
    dueTodayCount ? `${dueTodayCount} due today` : 'Nothing due today',
    overdueCount ? `${overdueCount} overdue` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="tasks-home">
      <div className="th-inner">
        {pageScene ? (
          // Over the full-page scene: just the date and time, so the landscape stays the hero.
          <SceneryBanner className="home-banner home-banner--compact">
            <HeroClock />
          </SceneryBanner>
        ) : (
          <SceneryBanner className="home-banner">
            <div className="home-greeting">
              <h1>
                {greeting(now)}
                <span className="home-date">
                  <span className="home-sep"> · </span>
                  {format(now, 'EEE, MMM d')}
                </span>
              </h1>
              <p>{tasks.length ? summary : 'Welcome! Add a task or connect your calendars to get started.'}</p>
            </div>
          </SceneryBanner>
        )}

        <Planner />

        <QuickAdd />

        {!hasSources && !tasks.length ? (
          <div className="empty-state th-empty">
            <Icon name="school" />
            <p>Connect Canvas, Google Calendar or any .ics feed to see your assignments here.</p>
            <button className="filled-btn" onClick={() => useStore.getState().setSettingsOpen(true)}>
              <Icon name="add_link" />
              Connect calendars
            </button>
          </div>
        ) : (
          <div className="th-columns">
            <div className="th-col-main">
            {openCount === 0 && tasks.length > 0 && (
              <div className="th-celebrate" role="status">
                <Icon name="celebration" />
                <div>
                  <strong>All caught up!</strong>
                  <p>Every task is done. Enjoy the free time — or plan something new above.</p>
                </div>
              </div>
            )}

            <Section id="today" title="Today" icon="today" count={today.length} collapsed={collapsed.today} onToggle={toggle}>
              {today.length ? (
                <TaskList tasks={today} now={now} />
              ) : (
                <p className="th-none">Nothing due or planned for today.</p>
              )}
            </Section>

            {classes.length > 0 && (
              <div className="th-class-grid">
                {classes.map((c) => (
                  <ClassBlock key={c.id} section={c} now={now} collapsed={collapsed} onToggle={toggle} />
                ))}
              </div>
            )}
            </div>

            <aside className="th-col-side" aria-label="Personal and quick tasks">
              <Section
                id="personal"
                title="Personal"
                icon="person"
                count={personal.open.length}
                collapsed={collapsed.personal}
                onToggle={toggle}
              >
                <GroupBody
                  group={personal}
                  now={now}
                  sectionId="personal"
                  collapsed={collapsed}
                  onToggle={toggle}
                  empty={<p className="th-none">Your own to-dos. Add one above and pick “Personal”.</p>}
                />
              </Section>

              <QuickSection group={quick} now={now} collapsed={collapsed} onToggle={toggle} />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function HeroClock() {
  const now = useNow(10_000);
  return (
    <div className="home-clock">
      <time className="home-clock-time" dateTime={now.toISOString()}>
        {format(now, 'h:mm')}
        <span className="home-clock-ampm">{format(now, 'a')}</span>
      </time>
      <span className="home-clock-date">{format(now, 'EEEE, MMMM d')}</span>
    </div>
  );
}

function TaskList({ tasks, now, showClass = true, fits }: { tasks: TaskView[]; now: Date; showClass?: boolean; fits?: (t: TaskView) => boolean }) {
  return (
    <ul className="task-list">
      {tasks.map((t) => (
        <TaskRow key={t.ref} task={t} now={now} showClass={showClass} highlight={fits?.(t)} />
      ))}
    </ul>
  );
}

interface SectionProps {
  id: string;
  title: ReactNode;
  icon?: string;
  /** Class color dot instead of an icon. */
  color?: string;
  count?: number;
  extra?: ReactNode;
  collapsed?: boolean;
  onToggle: (id: string) => void;
  /** When set, the title can be renamed inline (pencil button or double-click). */
  onRename?: (name: string) => void;
  children: ReactNode;
}

function Section({ id, title, icon, color, count, extra, collapsed, onToggle, onRename, children }: SectionProps) {
  const bodyId = `section-body-${id}`;
  const [editing, setEditing] = useState(false);
  return (
    <section
      id={id.startsWith('class-') ? id : `section-${id}`}
      className={`th-section${collapsed ? ' collapsed' : ''}`}
      style={color ? ({ '--task-color': color } as CSSProperties) : undefined}
    >
      <header className="th-section-head">
        {editing && onRename && typeof title === 'string' ? (
          <RenameField
            initial={title}
            onDone={(name) => {
              setEditing(false);
              if (name && name !== title) onRename(name);
            }}
          />
        ) : (
          <button
            className="th-toggle"
            onClick={() => onToggle(id)}
            onDoubleClick={onRename ? () => setEditing(true) : undefined}
            aria-expanded={!collapsed}
            aria-controls={bodyId}
          >
            <Icon name="expand_more" className="th-chevron" />
            {color ? <span className="th-dot" aria-hidden="true" /> : icon && <Icon name={icon} className="th-icon" />}
            <h2>{title}</h2>
            {count !== undefined && count > 0 && <span className="th-count">{count}</span>}
          </button>
        )}
        {onRename && !editing && (
          <button className="icon-btn small th-rename" onClick={() => setEditing(true)} aria-label={`Rename ${title}`} title="Rename">
            <Icon name="edit" />
          </button>
        )}
        {extra}
      </header>
      {!collapsed && (
        <div className="th-section-body" id={bodyId}>
          {children}
        </div>
      )}
    </section>
  );
}

function RenameField({ initial, onDone }: { initial: string; onDone: (name: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <input
      className="th-rename-input"
      value={value}
      autoFocus
      aria-label="Class name"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.stopPropagation();
          onDone(initial);
        }
      }}
    />
  );
}

/** Open tasks, then collapsible "Older" and "Completed" groups. */
function GroupBody({
  group,
  now,
  sectionId,
  stale = [],
  showClass,
  fits,
  collapsed,
  onToggle,
  empty,
}: {
  group: TaskGroup;
  now: Date;
  sectionId: string;
  stale?: TaskView[];
  showClass?: boolean;
  fits?: (t: TaskView) => boolean;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
  empty?: ReactNode;
}) {
  // Sub-groups start collapsed; a stored `true` means the user opened them.
  const doneKey = `${sectionId}:done`;
  const staleKey = `${sectionId}:stale`;
  const doneOpen = collapsed[doneKey] === true;
  const staleOpen = collapsed[staleKey] === true;
  return (
    <>
      {group.open.length > 0 ? <TaskList tasks={group.open} now={now} showClass={showClass} fits={fits} /> : empty}
      {stale.length > 0 && (
        <SubGroup label={`Older, not done (${stale.length})`} open={staleOpen} onToggle={() => onToggle(staleKey)}>
          <TaskList tasks={stale} now={now} showClass={showClass} />
        </SubGroup>
      )}
      {group.done.length > 0 && (
        <SubGroup label={`Completed (${group.done.length})`} open={doneOpen} onToggle={() => onToggle(doneKey)}>
          <TaskList tasks={group.done} now={now} showClass={showClass} />
        </SubGroup>
      )}
    </>
  );
}

function SubGroup({ label, open, onToggle, children }: { label: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="th-sub">
      <button className="th-sub-toggle" onClick={onToggle} aria-expanded={open}>
        <Icon name={open ? 'expand_less' : 'expand_more'} />
        {label}
      </button>
      {open && children}
    </div>
  );
}

function ClassBlock({
  section: c,
  now,
  collapsed,
  onToggle,
}: {
  section: ClassSection;
  now: Date;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const id = `class-${c.id}`;
  // Only real classes can be renamed (not the synthetic "Other" group).
  const isClass = useStore((s) => !!s.classes[c.id] && !s.classes[c.id].deleted);
  const pct = c.weekTotal ? Math.round((c.weekDone / c.weekTotal) * 100) : 0;
  const extra = (
    <div className="th-class-stats">
      {c.inToday > 0 && (
        <button className="th-in-today" onClick={() => document.getElementById('section-today')?.scrollIntoView({ behavior: 'smooth' })}>
          +{c.inToday} in Today
        </button>
      )}
      {c.weekTotal > 0 && (
        <div className="th-progress" title={`${c.weekDone} of ${c.weekTotal} due this week done`}>
          <span className="th-progress-label">
            {c.weekDone}/{c.weekTotal} <span className="th-progress-unit">this week</span>
          </span>
          <span
            className="th-progress-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={c.weekTotal}
            aria-valuenow={c.weekDone}
            aria-label={`${c.name}: ${c.weekDone} of ${c.weekTotal} done this week`}
          >
            <span style={{ width: `${pct}%` }} />
          </span>
        </div>
      )}
    </div>
  );
  return (
    <Section
      id={id}
      title={c.name}
      icon={c.color ? undefined : 'folder'}
      color={c.color}
      count={c.open.length}
      extra={extra}
      collapsed={collapsed[id]}
      onToggle={onToggle}
      onRename={isClass ? (name) => useStore.getState().updateClass(c.id, { name }) : undefined}
    >
      <GroupBody
        group={c}
        stale={c.stale}
        now={now}
        sectionId={id}
        showClass={false}
        collapsed={collapsed}
        onToggle={onToggle}
        empty={<p className="th-none">{c.inToday ? 'Everything else is in Today.' : 'Nothing open. Nice!'}</p>}
      />
    </Section>
  );
}

function QuickSection({
  group,
  now,
  collapsed,
  onToggle,
}: {
  group: TaskGroup;
  now: Date;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const events = useVisibleEvents();
  const gap = useMemo(() => freeMinutes(events, now), [events, now]);
  const [hintDismissed, setHintDismissed] = useState(false);
  const fits = (t: TaskView) => gap > 0 && fitsGap(t, gap);
  const fitting = group.open.filter(fits).length;

  return (
    <Section
      id="quick"
      title={
        <>
          Quick items <span aria-hidden="true">⚡</span>
        </>
      }
      icon="bolt"
      count={group.open.length}
      collapsed={collapsed.quick}
      onToggle={onToggle}
    >
      {group.open.length > 0 && gap >= 5 && !hintDismissed && (
        <div className="th-gap" role="note">
          <Icon name="hourglass_top" />
          <span>
            <strong>Got {gap < 60 ? `${gap} min` : formatEstimate(gap)}?</strong>{' '}
            {fitting
              ? `${fitting} quick item${fitting === 1 ? '' : 's'} fit${fitting === 1 ? 's' : ''} before your next event.`
              : 'Nothing here fits before your next event.'}
          </span>
          <button className="icon-btn small" onClick={() => setHintDismissed(true)} aria-label="Dismiss hint">
            <Icon name="close" />
          </button>
        </div>
      )}
      <GroupBody
        group={group}
        now={now}
        sectionId="quick"
        fits={fits}
        collapsed={collapsed}
        onToggle={onToggle}
        empty={
          <p className="th-none">
            Small things for short gaps. Start a quick-add with <kbd>q</kbd> or an estimate like <kbd>~10m</kbd>.
          </p>
        }
      />
    </Section>
  );
}
