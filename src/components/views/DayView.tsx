import { useMemo } from 'react';
import { useStore } from '../../store';
import { visibleDays } from '../../lib/time';
import TimeGrid from './TimeGrid';

export default function DayView() {
  const cursor = useStore((s) => s.cursor);
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const days = useMemo(() => visibleDays('day', new Date(cursor), weekStartsOn), [cursor, weekStartsOn]);
  return <TimeGrid days={days} />;
}
