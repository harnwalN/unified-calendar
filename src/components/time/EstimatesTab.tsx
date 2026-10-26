import { useMemo } from 'react';
import { useStore } from '../../store';
import { useTaskIndex, useTaskLabeler, useRunningElapsed } from '../../features/timer';
import { estimateRows, formatDuration } from '../../features/timeStats';
import Icon from '../Icon';
import { EmptyTime } from './TodayTab';

export default function EstimatesTab() {
  const index = useTaskIndex();
  const label = useTaskLabeler();
  const timer = useStore((s) => s.runningTimer);
  const elapsed = useRunningElapsed();

  const rows = useMemo(() => {
    const tasks = [...index.values()];
    const totals = new Map<string, number>(tasks.map((t) => [t.ref, t.timeTotalMs]));
    if (timer) totals.set(timer.taskRef, (totals.get(timer.taskRef) ?? 0) + elapsed);
    return estimateRows(tasks, totals);
  }, [index, timer, elapsed]);

  if (!rows.length) return <EmptyTime text="No tasks have an estimate yet. Add one in a task’s details to compare it with the time you spend." />;

  return (
    <section className="time-card estimates" aria-label="Estimate vs actual">
      <p className="estimates-help">Actual time vs your estimate, most over first.</p>
      <ul className="estimates-list">
        {rows.map((r) => {
          const l = label(r.ref);
          const scale = Math.max(1, r.ratio);
          const level = r.ratio > 1.5 ? 'over-far' : r.ratio > 1 ? 'over' : 'ok';
          const pct = Math.round(r.ratio * 100);
          const diff = r.actualMs - r.estimateMs;
          return (
            <li key={r.ref} className={`estimate ${level}`}>
              <button
                className="estimate-title"
                onClick={() => {
                  const s = useStore.getState();
                  s.setTimePageOpen(false);
                  s.selectTask(r.ref);
                }}
              >
                <span className="chart-swatch" style={{ background: l.color }} aria-hidden="true" />
                <span className="ellipsis">{l.title}</span>
                {l.task?.status === 'done' && <span className="estimate-done">Done</span>}
              </button>
              <span className="estimate-nums">
                {formatDuration(r.actualMs)} <span>of {formatDuration(r.estimateMs)}</span>
              </span>
              <div
                className="estimate-meter"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={Math.max(100, pct)}
                aria-valuenow={pct}
                aria-label={`${l.title}: ${pct}% of estimate`}
              >
                <span className="estimate-fill" style={{ width: `${(r.ratio / scale) * 100}%` }} />
                {scale > 1 && <span className="estimate-mark" style={{ left: `${(1 / scale) * 100}%` }} />}
              </div>
              <span className="estimate-status">
                {level !== 'ok' && <Icon name="warning" size={16} />}
                {diff > 0 ? `${formatDuration(diff)} over · ${pct}%` : `${pct}%`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
