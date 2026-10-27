import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns';
import { dayKey } from '../../store/tasks';
import { formatDuration, sortedDesc } from '../../features/timeStats';
import { GroupBars, Legend, WeekChart } from './charts';
import TaskRows from './TaskRows';
import { EmptyTime } from './TodayTab';
import { useTimeStats } from './useTimeStats';

export default function WeekTab({ weekStart, includeClasses }: { weekStart: Date; includeClasses: boolean }) {
  const from = weekStart.getTime();
  const to = addDays(weekStart, 7).getTime();
  const stats = useTimeStats(from, to, includeClasses);
  const { classTime } = stats;
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  if (!stats.totalMs && !classTime.totalMs) return <EmptyTime text="No time tracked this week." />;
  const grand = stats.totalMs + classTime.totalMs;
  const byGroupAll = new Map(stats.byGroup);
  for (const [k, ms] of classTime.byGroup) byGroupAll.set(k, (byGroupAll.get(k) ?? 0) + ms);

  // Average over the days that have happened so far (all 7 for past weeks).
  const elapsedDays = Math.min(7, Math.max(1, differenceInCalendarDays(startOfDay(stats.now), weekStart) + 1));
  const top = sortedDesc(byGroupAll)[0];
  const topGroup = stats.groups.find((g) => g.key === top?.[0]);

  return (
    <div className="time-grid">
      <section className="time-card time-span-2 time-tiles">
        <div>
          <h3>Tracked</h3>
          <p className="time-tile-value">{formatDuration(stats.totalMs)}</p>
        </div>
        {classTime.totalMs > 0 && (
          <div>
            <h3>In class</h3>
            <p className="time-tile-value">{formatDuration(classTime.totalMs)}</p>
          </div>
        )}
        <div>
          <h3>Daily average</h3>
          <p className="time-tile-value">{formatDuration(grand / elapsedDays)}</p>
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
        <Legend groups={stats.groups} classTime={classTime.totalMs > 0} />
        <WeekChart
          days={days}
          byDay={stats.byDay}
          byDayGroup={stats.byDayGroup}
          groups={stats.groups}
          today={dayKey(stats.now)}
          classByDay={classTime.byDay}
          classByDayGroup={classTime.byDayGroup}
        />
        <table className="sr-only">
          <caption>Time per day</caption>
          <thead>
            <tr>
              <th>Day</th>
              {stats.groups.map((g) => <th key={g.key}>{g.name}</th>)}
              <th>In class</th>
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
                  <td>{formatDuration(classTime.byDay.get(k) ?? 0)}</td>
                  <td>{formatDuration((stats.byDay.get(k) ?? 0) + (classTime.byDay.get(k) ?? 0))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="time-card">
        <h3>By class</h3>
        <GroupBars groups={stats.groups} totals={stats.byGroup} classTotals={classTime.byGroup} />
      </section>

      <section className="time-card">
        <h3>Top tasks</h3>
        <TaskRows rows={sortedDesc(stats.byTask).slice(0, 5)} label={stats.label} />
      </section>
    </div>
  );
}
