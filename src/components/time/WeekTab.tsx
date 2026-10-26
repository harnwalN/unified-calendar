import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns';
import { dayKey } from '../../store/tasks';
import { formatDuration, sortedDesc } from '../../features/timeStats';
import { GroupBars, Legend, WeekChart } from './charts';
import TaskRows from './TaskRows';
import { EmptyTime } from './TodayTab';
import { useTimeStats } from './useTimeStats';

export default function WeekTab({ weekStart }: { weekStart: Date }) {
  const from = weekStart.getTime();
  const to = addDays(weekStart, 7).getTime();
  const stats = useTimeStats(from, to);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  if (!stats.totalMs) return <EmptyTime text="No time tracked this week." />;

  // Average over the days that have happened so far (all 7 for past weeks).
  const elapsedDays = Math.min(7, Math.max(1, differenceInCalendarDays(startOfDay(stats.now), weekStart) + 1));
  const top = sortedDesc(stats.byGroup)[0];
  const topGroup = stats.groups.find((g) => g.key === top?.[0]);

  return (
    <div className="time-grid">
      <section className="time-card time-span-2 time-tiles">
        <div>
          <h3>Total</h3>
          <p className="time-tile-value">{formatDuration(stats.totalMs)}</p>
        </div>
        <div>
          <h3>Daily average</h3>
          <p className="time-tile-value">{formatDuration(stats.totalMs / elapsedDays)}</p>
        </div>
        {topGroup && (
          <div>
            <h3>Most time</h3>
            <p className="time-tile-value time-tile-name">
              <span className="chart-swatch" style={{ background: topGroup.color }} aria-hidden="true" />
              <span className="ellipsis">{topGroup.name}</span>
            </p>
          </div>
        )}
      </section>

      <section className="time-card time-span-2">
        <h3>Per day</h3>
        <Legend groups={stats.groups} />
        <WeekChart days={days} byDay={stats.byDay} byDayGroup={stats.byDayGroup} groups={stats.groups} today={dayKey(stats.now)} />
        <table className="sr-only">
          <caption>Time per day</caption>
          <thead>
            <tr>
              <th>Day</th>
              {stats.groups.map((g) => <th key={g.key}>{g.name}</th>)}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const k = dayKey(d);
              return (
                <tr key={k}>
                  <th>{d.toDateString()}</th>
                  {stats.groups.map((g) => <td key={g.key}>{formatDuration(stats.byDayGroup.get(k)?.get(g.key) ?? 0)}</td>)}
                  <td>{formatDuration(stats.byDay.get(k) ?? 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="time-card">
        <h3>By class</h3>
        <GroupBars groups={stats.groups} totals={stats.byGroup} />
      </section>

      <section className="time-card">
        <h3>Top tasks</h3>
        <TaskRows rows={sortedDesc(stats.byTask).slice(0, 5)} label={stats.label} />
      </section>
    </div>
  );
}
