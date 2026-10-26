import { addDays } from 'date-fns';
import { formatDuration, sortedDesc } from '../../features/timeStats';
import { DayTimeline, GroupBars } from './charts';
import TaskRows from './TaskRows';
import { useTimeStats } from './useTimeStats';

export default function TodayTab({ day }: { day: Date }) {
  const from = day.getTime();
  const to = addDays(day, 1).getTime();
  const stats = useTimeStats(from, to);

  if (!stats.totalMs) return <EmptyTime text="No time tracked this day." />;
  const tasks = sortedDesc(stats.byTask);

  return (
    <div className="time-grid">
      <section className="time-card time-hero">
        <h3>Total tracked</h3>
        <p className="time-hero-value">{formatDuration(stats.totalMs)}</p>
        <p className="time-hero-sub">
          {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
          {stats.running && stats.now < to && stats.now >= from ? ' · timer running' : ''}
        </p>
      </section>

      <section className="time-card">
        <h3>By class</h3>
        <GroupBars groups={stats.groups} totals={stats.byGroup} />
      </section>

      <section className="time-card time-span-2">
        <h3>Timeline</h3>
        <DayTimeline spans={stats.spans} dayStart={from} now={stats.now} label={stats.label} />
      </section>

      <section className="time-card time-span-2">
        <h3>Tasks</h3>
        <TaskRows rows={tasks} label={stats.label} />
      </section>
    </div>
  );
}

export function EmptyTime({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <span className="material-symbols-outlined" aria-hidden="true">timer</span>
      <p>{text}</p>
      <p className="time-empty-hint">Start a timer from any task, or press Shift+Space to resume the last one.</p>
    </div>
  );
}
