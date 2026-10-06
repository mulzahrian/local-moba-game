import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { CharacterPreviewScene } from '../../character/CharacterPreviewScene.js';
import { guessActorAnimations, loadGltf } from '../../character/characterAssets.js';
import { useT } from '../../i18n/index.js';
import '../../styles/ObjectLibrary.css';
import '../../styles/Skills.css';

const MOVEMENTS = ['run', 'flight'];

/**
 * Shared by the Monster Generator and the unit editors of the summon skills: upload a GLB, choose the clip
 * of every animation slot (the "run" slot is a flight clip for flying characters), the size, and preview it live.
 *
 * `value` = { movement, scale, animations }; `onChange(patch)` receives the changed parts. The model comes from a
 * freshly picked `file`, or from the already saved `modelUrl`.
 */
export const ActorSetup = forwardRef(function ActorSetup({ slots, value, scaleSpec, file, modelUrl, onFile, onChange }, ref) {
  const t = useT();
  const [gltf, setGltf] = useState(null);
  const [state, setState] = useState('empty'); // empty | loading | ready | error
  const viewportRef = useRef(null);
  const previewRef = useRef(null);
  const valueRef = useRef(value);
  const scaleRef = useRef(value.scale);
  valueRef.current = value;

  const clipNames = useMemo(() => (gltf ? gltf.animations.map((clip) => clip.name) : []), [gltf]);

  useImperativeHandle(ref, () => ({
    playEffect: (id, def) => previewRef.current?.playEffect(id, def),
    playSlot: (slot) => previewRef.current?.playSlot(slot)
  }));

  // Loads the model of the picked file (or the saved one).
  useEffect(() => {
    const objectUrl = file ? URL.createObjectURL(file) : null;
    const url = objectUrl || modelUrl;
    if (!url) {
      setGltf(null);
      setState('empty');
      return undefined;
    }
    let cancelled = false;
    setState('loading');
    loadGltf(url)
      .then((loaded) => {
        if (cancelled) return;
        setGltf(loaded);
        setState('ready');
        if (file) onChange({ animations: guessActorAnimations(loaded.animations.map((clip) => clip.name), slots) });
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, modelUrl]);

  // 3D preview, alive while a model is loaded.
  useEffect(() => {
    if (!gltf || !viewportRef.current) return undefined;
    const preview = new CharacterPreviewScene(viewportRef.current);
    preview.setCharacter(gltf, { animations: valueRef.current.animations, scale: valueRef.current.scale });
    scaleRef.current = valueRef.current.scale;
    previewRef.current = preview;
    return () => {
      preview.dispose();
      previewRef.current = null;
    };
  }, [gltf]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview || scaleRef.current === value.scale) return;
    scaleRef.current = value.scale;
    preview.setCharacter(gltf, { animations: value.animations, scale: value.scale });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.scale]);

  const changeAnimation = (slot, clip) => {
    const animations = { ...value.animations, [slot]: clip || null };
    onChange({ animations });
    previewRef.current?.setAnimations(animations);
    previewRef.current?.playSlot(slot);
  };

  const slotLabel = (slot) => (slot === 'run' && value.movement === 'flight' ? t('actor.slot.flight') : t(`actor.slot.${slot}`));

  const chooseFile = (event) => {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (picked) onFile(picked);
  };

  return (
    <div className="actor-setup">
      <div className="ol-form-row">
        <label className="mini-btn ol-file-btn">
          {t('actor.chooseModel')}
          <input type="file" accept=".glb,model/gltf-binary" hidden onChange={chooseFile} />
        </label>
        <span className="ol-file-name">{file?.name || (modelUrl ? 'model.glb' : t('actor.noModel'))}</span>
      </div>
      {state === 'loading' && <p className="hint">{t('actor.loading')}</p>}
      {state === 'error' && <p className="hint error">{t('actor.modelError')}</p>}
      {state === 'ready' && clipNames.length === 0 && <p className="hint">{t('actor.noClips')}</p>}

      <div className="sk-grid">
        <label className="ol-field">
          <span>{t('actor.movement')}</span>
          <select className="fantasy-input" value={value.movement} onChange={(e) => onChange({ movement: e.target.value })}>
            {MOVEMENTS.map((movement) => (
              <option key={movement} value={movement}>{t(`actor.movement.${movement}`)}</option>
            ))}
          </select>
        </label>
        <label className="ol-field">
          <span>{t('actor.scale')}</span>
          <input
            className="fantasy-input"
            type="number"
            min={scaleSpec.min}
            max={scaleSpec.max}
            step={scaleSpec.step}
            value={value.scale}
            onChange={(e) => onChange({ scale: e.target.value })}
          />
        </label>
      </div>

      <div className="actor-slots">
        {slots.map((slot) => (
          <div className="actor-slot" key={slot}>
            <label className="ol-field">
              <span>{slotLabel(slot)}</span>
              <select
                className="fantasy-input"
                value={value.animations[slot] || ''}
                disabled={!gltf}
                onChange={(e) => changeAnimation(slot, e.target.value)}
              >
                <option value="">{t('actor.noAnimation')}</option>
                {clipNames.map((clip) => (
                  <option key={clip} value={clip}>{clip}</option>
                ))}
              </select>
            </label>
            <button className="mini-btn" disabled={!gltf} title={t('actor.preview')} onClick={() => previewRef.current?.playSlot(slot)}>
              ▶
            </button>
          </div>
        ))}
      </div>

      {gltf && <div className="actor-viewport" ref={viewportRef} />}
    </div>
  );
});
