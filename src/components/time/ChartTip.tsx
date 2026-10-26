// Hover/focus tooltip shared by the Time page charts.
import { useCallback, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from 'react';

export interface TipContent {
  color: string;
  title: string;
  detail: string;
}

interface Tip extends TipContent {
  x: number;
  y: number;
}

/**
 * `const { containerRef, bind, tip } = useChartTip()`: put `containerRef` on a
 * `position: relative` wrapper, spread `bind(content)` on each mark, render `tip`.
 */
export function useChartTip() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<Tip | null>(null);

  const place = useCallback((content: TipContent, clientX: number, clientY: number) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    setState({ ...content, x: clientX - box.left, y: clientY - box.top });
  }, []);

  const bind = (content: TipContent) => ({
    onPointerEnter: (e: PointerEvent) => place(content, e.clientX, e.clientY),
    onPointerMove: (e: PointerEvent) => place(content, e.clientX, e.clientY),
    onPointerLeave: () => setState(null),
    onFocus: (e: FocusEvent) => {
      const r = e.currentTarget.getBoundingClientRect();
      place(content, r.left + r.width / 2, r.top);
    },
    onBlur: () => setState(null),
  });

  const width = containerRef.current?.clientWidth ?? 0;
  const tip: ReactNode = state && (
    <div
      className="chart-tip"
      role="presentation"
      style={{
        left: Math.min(Math.max(state.x, 90), Math.max(90, width - 90)),
        top: state.y,
      }}
    >
      <span className="chart-tip-key" style={{ background: state.color }} />
      <span className="chart-tip-title">{state.title}</span>
      <span className="chart-tip-detail">{state.detail}</span>
    </div>
  );
  return { containerRef, bind, tip };
}
