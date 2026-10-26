import { useCallback, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { useClasses, useTasks } from '../../store/tasks';
import { useNow } from '../hooks';
import { groupTasks, type HomeSections } from './grouping';

/** Home-screen sections for the current minute (shared by TasksHome and the sidebar cards). */
export function useHomeSections(): { sections: HomeSections; now: Date } {
  const tasks = useTasks();
  const classes = useClasses();
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const now = useNow(60_000);
  const sections = useMemo(() => groupTasks(tasks, classes, now, weekStartsOn), [tasks, classes, now, weekStartsOn]);
  return { sections, now };
}

const COLLAPSED_KEY = 'tasks-home:collapsed';

function readCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** Which home sections are collapsed, remembered per device. */
export function useCollapsedSections(): [Record<string, boolean>, (id: string) => void] {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable (private mode): keep it for this session only.
      }
      return next;
    });
  }, []);
  return [collapsed, toggle];
}
