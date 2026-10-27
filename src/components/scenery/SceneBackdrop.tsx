import { useMemo } from 'react';
import { useStore } from '../../store';
import SceneArt from './SceneArt';
import { skyState, useSceneClock, useSceneId, useSunLocation } from './sky';
import './Scenery.css';

/** True when the scene should fill the whole window (Gmail-style background). */
export function usePageScene(): boolean {
  const scene = useSceneId();
  const mode = useStore((s) => s.settings.sceneMode);
  return scene !== 'off' && mode !== 'header';
}

/**
 * Whole-window background: a crisp landscape across the top of the page that fades into a
 * soft, blurred wash of the same scene behind everything else. Fixed, so content scrolls over it.
 */
export default function SceneBackdrop() {
  const scene = useSceneId();
  const now = useSceneClock();
  const { loc } = useSunLocation();
  const sky = useMemo(() => skyState(now, loc), [now, loc]);
  if (scene === 'off') return null;
  return (
    <div className={`scene-backdrop ${sky.palette.lightSky ? 'scenery--light-sky' : 'scenery--dark-sky'}`} aria-hidden="true">
      <div className="scene-backdrop__wash">
        <SceneArt scene={scene} sky={sky} />
      </div>
      <div className="scene-backdrop__art">
        <SceneArt scene={scene} sky={sky} />
      </div>
    </div>
  );
}
