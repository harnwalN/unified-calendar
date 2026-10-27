import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import Icon from '../Icon';
import ScenePicker from './ScenePicker';
import './Scenery.css';

/** Top-bar "Background" button: quick scene picker, like Gmail's theme menu. */
export default function SceneMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="scene-menu" ref={ref}>
      <button
        className="icon-btn"
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Background"
        title="Background"
      >
        <Icon name="landscape" />
      </button>
      {open && (
        <div className="scene-menu-pop" role="dialog" aria-labelledby="scene-menu-title">
          <h2 id="scene-menu-title">Background</h2>
          <p>The sun follows the real time of day where you are.</p>
          <ScenePicker labelId="scene-menu-title" />
          <button
            className="text-btn scene-menu-more"
            onClick={() => {
              setOpen(false);
              useStore.getState().setSettingsOpen(true);
            }}
          >
            Sunrise &amp; location settings
          </button>
        </div>
      )}
    </div>
  );
}
