import { useMemo } from 'react';
import { useStore } from '../../store';
import { visibleDays } from '../../lib/time';
import { useNarrowDays } from '../hooks';
import TimeGrid from './TimeGrid';

export default function WeekView() {
  const cursor = useStore((s) => s.cursor);
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const narrowDays = useNarrowDays();
  const days = useMemo(
    () => visibleDays('week', new Date(cursor), weekStartsOn, narrowDays),
    [cursor, weekStartsOn, narrowDays],
  );
  return <TimeGrid days={days} />;
}
