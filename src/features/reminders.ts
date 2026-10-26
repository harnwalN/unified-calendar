import { useEffect, useMemo, useState } from 'react';
import { doneMap, useStore } from '../store';
import { useAllEvents } from '../store/selectors';
import type { CalEvent } from '../types';

export const FIRED_KEY = 'unified-calendar-fired';
const HOUR_MS = 60 * 60 * 1000;
const HORIZON_MS = 24 * HOUR_MS;
/** A reminder that should have fired while the app was closed still fires if it's at most this late. */
const GRACE_MS = 5 * 60 * 1000;
/** Fired keys are kept a bit longer than the largest offset (1 week) so reloads never repeat them. */
const FIRED_TTL_MS = 8 * 24 * HOUR_MS;

/** Offsets offered in Settings, in minutes. */
export const REMINDER_OFFSETS = [
  { min: 10080, label: '1 week' },
  { min: 1440, label: '1 day' },
  { min: 180, label: '3 hours' },
  { min: 60, label: '1 hour' },
  { min: 15, label: '15 min' },
] as const;

export interface PlannedReminder {
  /** `${uid}:${offset}` – also the notification tag. */
  key: string;
  event: CalEvent;
  offsetMin: number;
  /** Epoch ms. */
  fireAt: number;
}

/** "1 week", "2 days", "3 hours", "1 hour", "15 minutes". */
export function describeOffset(min: number): string {
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (min % 10080 === 0) return unit(min / 10080, 'week');
  if (min % 1440 === 0) return unit(min / 1440, 'day');
  if (min % 60 === 0) return unit(min / 60, 'hour');
  return unit(min, 'minute');
}

export function reminderBody(event: CalEvent, offsetMin: number): string {
  const due = `due in ${describeOffset(offsetMin)}`;
  return event.course ? `${event.course} · ${due}` : due.charAt(0).toUpperCase() + due.slice(1);
}

/**
 * Pure planner: every (not-done assignment × offset) whose fire time is within the
 * horizon, or at most `GRACE_MS` in the past, and that hasn't fired yet. Soonest first.
 */
export function planReminders(
  events: CalEvent[],
  done: Record<string, number>,
  offsetsMin: number[],
  now: number,
  fired: Record<string, number>,
  horizonMs = HORIZON_MS,
): PlannedReminder[] {
  const plan: PlannedReminder[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    if (event.kind !== 'assignment' || done[event.uid]) continue;
    const due = Date.parse(event.start);
    if (Number.isNaN(due) || due < now) continue;
    for (const offsetMin of offsetsMin) {
      const key = `${event.uid}:${offsetMin}`;
      const fireAt = due - offsetMin * 60000;
      if (seen.has(key) || fired[key] || fireAt < now - GRACE_MS || fireAt > now + horizonMs) continue;
      seen.add(key);
      plan.push({ key, event, offsetMin, fireAt });
    }
  }
  return plan.sort((a, b) => a.fireAt - b.fireAt);
}

export function readFired(now = Date.now()): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(FIRED_KEY) ?? '{}') as Record<string, number>;
    return Object.fromEntries(Object.entries(raw).filter(([, t]) => now - t < FIRED_TTL_MS));
  } catch {
    return {};
  }
}

/** Returns false if this key was already fired (e.g. by another tab or a StrictMode double-run). */
function markFired(key: string): boolean {
  const fired = readFired();
  if (fired[key]) return false;
  fired[key] = Date.now();
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(fired));
  } catch {
    // Storage full/blocked: worst case the reminder may repeat after a reload.
  }
  return true;
}

function notify({ key, event, offsetMin }: PlannedReminder) {
  const options: NotificationOptions = {
    body: reminderBody(event, offsetMin),
    tag: key,
    icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
    badge: `${import.meta.env.BASE_URL}icons/icon-192.png`,
    data: { eventId: event.id, url: event.url },
  };
  const fallback = () => {
    const n = new Notification(event.title, options);
    n.onclick = () => {
      window.focus();
      useStore.getState().selectEvent(event.id);
      useStore.getState().setCursor(new Date(event.start));
    };
  };
  // Service-worker notifications also work for installed PWAs on mobile, where `new Notification` throws.
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((r) => r.showNotification(event.title, options)).catch(fallback);
  } else {
    try {
      fallback();
    } catch {
      // Notifications unavailable in this context.
    }
  }
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Mount once in <App/>: schedules browser notifications for upcoming assignments. */
export function useReminders(): void {
  const events = useAllEvents();
  const meta = useStore((s) => s.meta);
  const done = useMemo(() => doneMap(meta), [meta]);
  const enabled = useStore((s) => s.settings.remindersEnabled);
  const offsets = useStore((s) => s.settings.reminderOffsetsMin);
  // Bumped hourly so reminders beyond the 24h horizon eventually get scheduled.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), HOUR_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!enabled || !notificationsSupported() || Notification.permission !== 'granted') return;
    const now = Date.now();
    const fired = readFired(now);
    try {
      localStorage.setItem(FIRED_KEY, JSON.stringify(fired)); // prune
    } catch {
      // ignore
    }
    const timers = planReminders(events, done, offsets, now, fired).map((r) =>
      setTimeout(() => {
        if (markFired(r.key)) notify(r);
      }, Math.max(0, r.fireAt - now)),
    );
    return () => timers.forEach(clearTimeout);
  }, [events, done, enabled, offsets, tick]);
}
