import { useCallback, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { useClasses, useTasks } from '../../store/tasks';
import { useNow } from '../hooks';
import { groupTasks, matchesSearch, type HomeSections } from './grouping';

/**
 * Home-screen sections for the current minute (shared by TasksHome, the sidebar cards and the mini
 * window). With `search`, only matching tasks are grouped and classes without a match are left out.
 */
export function useHomeSections(search = ''): { sections: HomeSections; now: Date; matches: number } {
  const tasks = useTasks();
  const classes = useClasses();
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const now = useNow(60_000);
  return useMemo(() => {
    if (!search.trim()) return { sections: groupTasks(tasks, classes, now, weekStartsOn), now, matches: tasks.length };
    const names = new Map(classes.map((c) => [c.id, c.name]));
    const found = tasks.filter((t) => matchesSearch(t, search, t.classId ? names.get(t.classId) : undefined));
    const sections = groupTasks(found, classes, now, weekStartsOn);
    sections.classes = sections.classes.filter((c) => c.open.length + c.done.length + c.stale.length + c.inToday > 0);
    return { sections, now, matches: found.length };
  }, [tasks, classes, now, weekStartsOn, search]);
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
