import { useEffect, useState, useSyncExternalStore } from 'react';

/** Current time, refreshed every `intervalMs` (aligned to the interval boundary). */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      timer = setTimeout(tick, intervalMs - (Date.now() % intervalMs));
    };
    timer = setTimeout(tick, intervalMs - (Date.now() % intervalMs));
    return () => clearTimeout(timer);
  }, [intervalMs]);
  return now;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Phones: week view collapses to a few days. */
export const NARROW_QUERY = '(max-width: 599px)';
export const NARROW_DAYS = 3;
/** Below this width the sidebar becomes an overlay drawer. */
export const DRAWER_QUERY = '(max-width: 899px)';

/** Day count the week view uses at the current width (undefined = full week). */
export function useNarrowDays(): number | undefined {
  return useMediaQuery(NARROW_QUERY) ? NARROW_DAYS : undefined;
}
