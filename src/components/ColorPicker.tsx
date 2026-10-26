import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PALETTE } from '../config';
import Icon from './Icon';
import './ColorPicker.css';

/** Floating palette anchored to `anchor`; portalled so drawer transforms/overflow can't clip it. */
export default function ColorPicker({
  anchor,
  value,
  onPick,
  onClose,
}: {
  anchor: HTMLElement;
  value: string;
  onPick: (color: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect();
    const el = ref.current;
    const w = el?.offsetWidth ?? 200;
    const h = el?.offsetHeight ?? 120;
    const left = Math.min(Math.max(8, a.right - w), window.innerWidth - w - 8);
    const below = a.bottom + 4;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, a.top - h - 4) : below;
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchor.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onClose);
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      className="color-picker"
      role="listbox"
      aria-label="Calendar color"
      style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
    >
      {PALETTE.map((c) => (
        <button
          key={c}
          role="option"
          aria-selected={c.toLowerCase() === value.toLowerCase()}
          aria-label={c}
          className="color-swatch"
          style={{ background: c }}
          onClick={() => {
            onPick(c);
            onClose();
          }}
        >
          {c.toLowerCase() === value.toLowerCase() && <Icon name="check" size={16} />}
        </button>
      ))}
    </div>,
    document.body,
  );
}
