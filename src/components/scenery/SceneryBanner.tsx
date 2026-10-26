import { useMemo, type ReactNode } from 'react';
import SceneArt from './SceneArt';
import { skyState, useSceneClock, useSceneId, useSunLocation } from './sky';
import './Scenery.css';

/** Home header: time-of-day landscape (settings.scene) with `children` overlaid. */
export default function SceneryBanner({ children, className }: { children?: ReactNode; className?: string }) {
  const scene = useSceneId();
  const now = useSceneClock();
  const { loc } = useSunLocation();
  const sky = useMemo(() => skyState(now, loc), [now, loc]);
  const cls = `scenery${className ? ` ${className}` : ''}`;

  if (scene === 'off') {
    return (
      <div className={`${cls} scenery--off`}>
        <div className="scenery__content">{children}</div>
      </div>
    );
  }
  return (
    <div className={`${cls} ${sky.palette.lightSky ? 'scenery--light-sky' : 'scenery--dark-sky'}`} data-phase={sky.palette.phase}>
      <SceneArt scene={scene} sky={sky} />
      <div className="scenery__scrim" aria-hidden="true" />
      <div className="scenery__content">{children}</div>
    </div>
  );
}
