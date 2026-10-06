import React, { useEffect, useRef, useState } from 'react';
import { CharacterPreviewScene } from '../../character/CharacterPreviewScene.js';
import { loadGltf } from '../../character/characterAssets.js';
import { useT } from '../../i18n/index.js';
import '../../styles/Character.css';

// 3D model of a character standing in its idle animation; slowly turns and can be dragged to rotate.
export function CharacterIdlePreview({ character }) {
  const t = useT();
  const containerRef = useRef(null);
  const previewRef = useRef(null);
  const [state, setState] = useState('empty'); // empty | loading | ready | error

  useEffect(() => {
    const preview = new CharacterPreviewScene(containerRef.current);
    preview.controls.autoRotate = true;
    preview.controls.autoRotateSpeed = 2;
    preview.controls.enableZoom = false; // the wheel scrolls the page / list instead
    preview.controls.enablePan = false;
    previewRef.current = preview;
    return () => {
      preview.dispose();
      previewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return undefined;
    if (!character?.modelUrl) {
      preview.clearCharacter();
      setState(character ? 'error' : 'empty');
      return undefined;
    }

    let cancelled = false;
    setState('loading');
    loadGltf(character.modelUrl)
      .then((gltf) => {
        if (cancelled) return;
        preview.setCharacter(gltf, character);
        setState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        preview.clearCharacter();
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [character]);

  return (
    <div className="char-idle">
      <div className="char-idle-canvas" ref={containerRef} />
      {state !== 'ready' && (
        <div className="char-idle-note">
          {state === 'empty' && t('pick.selectHint')}
          {state === 'loading' && t('char.loadingModel')}
          {state === 'error' && t('char.modelError')}
        </div>
      )}
    </div>
  );
}
