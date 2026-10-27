import { useMemo } from 'react';
import { useStore } from '../../store';
import type { SceneId } from '../../types';
import Icon from '../Icon';
import '../Settings.css';
import SceneArt from './SceneArt';
import { SCENE_IDS, SCENES } from './scenes';
import { skyState, useSceneClock, useSunLocation } from './sky';
import './Scenery.css';

/** Scene thumbnails (live, at the current time of day) plus Off, and the page/header choice. */
export default function ScenePicker({ labelId }: { labelId: string }) {
  const scene = useStore((s) => s.settings.scene);
  const mode = useStore((s) => s.settings.sceneMode);
  const updateSettings = useStore((s) => s.updateSettings);
  const now = useSceneClock();
  const { loc } = useSunLocation();
  const sky = useMemo(() => skyState(now, loc), [now, loc]);

  return (
    <>
      <div className="sc-picker" role="radiogroup" aria-labelledby={labelId}>
        {SCENE_IDS.map((id: SceneId) => (
          <button key={id} type="button" role="radio" aria-checked={scene === id} className="sc-thumb" onClick={() => updateSettings({ scene: id })}>
            <span className="sc-thumb__art">
              <SceneArt scene={id} sky={sky} />
              {scene === id && <Icon name="check_circle" className="sc-thumb__check" />}
            </span>
            <span className="sc-thumb__label">{SCENES[id].label}</span>
          </button>
        ))}
        <button type="button" role="radio" aria-checked={scene === 'off'} className="sc-thumb" onClick={() => updateSettings({ scene: 'off' })}>
          <span className="sc-thumb__art sc-thumb__art--off">
            <Icon name="hide_image" />
            {scene === 'off' && <Icon name="check_circle" className="sc-thumb__check" />}
          </span>
          <span className="sc-thumb__label">Off</span>
        </button>
      </div>
      {scene !== 'off' && (
        <div className="s-segmented sc-mode" role="group" aria-label="Where the scene shows">
          <button type="button" aria-pressed={mode === 'page'} onClick={() => updateSettings({ sceneMode: 'page' })}>
            <Icon name="wallpaper" /> Whole page
          </button>
          <button type="button" aria-pressed={mode === 'header'} onClick={() => updateSettings({ sceneMode: 'header' })}>
            <Icon name="panorama" /> Header only
          </button>
        </div>
      )}
    </>
  );
}
