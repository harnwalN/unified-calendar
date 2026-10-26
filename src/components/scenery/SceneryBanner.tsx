// STUB – owned by the scenery agent. Time-of-day landscape art; children render on top of it.
import type { ReactNode } from 'react';

export default function SceneryBanner({ children, className }: { children?: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}
