// Ranked list of tasks with their tracked time (opens the task on click).
import { formatDuration } from '../../features/timeStats';
import type { TaskLabel } from '../../features/timer';
import type { TaskRef } from '../../types';
import Icon from '../Icon';
import { useStore } from '../../store';

export default function TaskRows({
  rows,
  label,
}: {
  rows: [string, number][];
  label: (ref: TaskRef) => TaskLabel;
}) {
  const runningRef = useStore((s) => s.runningTimer?.taskRef);
  return (
    <ul className="task-rows">
      {rows.map(([ref, ms]) => {
        const l = label(ref as TaskRef);
        return (
          <li key={ref}>
            <button
              onClick={() => {
                const s = useStore.getState();
                s.setTimePageOpen(false);
                s.selectTask(ref as TaskRef);
              }}
              disabled={l.deleted}
            >
              <span className="chart-swatch" style={{ background: l.color }} aria-hidden="true" />
              <span className="task-rows-text">
                <span className="ellipsis">{l.title}</span>
                <span className="task-rows-sub">{l.groupName}</span>
              </span>
              {runningRef === ref && (
                <span className="task-rows-live" title="Timer running">
                  <Icon name="timer" />
                  <span className="sr-only">Timer running</span>
                </span>
              )}
              <span className="task-rows-value">{formatDuration(ms)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
