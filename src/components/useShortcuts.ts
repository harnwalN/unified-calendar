import { useEffect } from 'react';
import { useStore } from '../store';
import { stepCursor } from '../lib/time';
import type { ViewMode } from '../types';

const VIEW_KEYS: Record<string, ViewMode> = { d: 'day', w: 'week', m: 'month', a: 'agenda' };

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Global shortcuts: `c` calendar, `n` quick add, `/` search; the rest act on the expanded calendar. */
export function useShortcuts(focusSearch: () => void, narrowDays: number | undefined) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const s = useStore.getState();
      // Dialogs (settings, onboarding) own the keyboard while open.
      if (s.settingsOpen || document.querySelector('[aria-modal="true"]:not(.event-popover)')) return;

      // The event popover handles its own keys (including Esc).
      if (s.selectedEventId) return;
      if (e.key === 'Escape') {
        if (s.search) s.setSearch('');
        return;
      }

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const cursor = new Date(s.cursor);
      if (key === 'c') s.setCalendarOpen(!s.calendarOpen);
      else if (key === 'n') document.getElementById('quick-add-input')?.focus();
      else if (VIEW_KEYS[key]) s.setView(VIEW_KEYS[key]);
      else if (key === 't') s.setCursor(new Date());
      else if (key === 'j' || key === 'ArrowRight') s.setCursor(stepCursor(s.view, cursor, 1, narrowDays));
      else if (key === 'k' || key === 'p' || key === 'ArrowLeft') s.setCursor(stepCursor(s.view, cursor, -1, narrowDays));
      else if (key === '/') focusSearch();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusSearch, narrowDays]);
}
