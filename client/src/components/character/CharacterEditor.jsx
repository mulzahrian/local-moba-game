import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ANIMATION_SLOTS,
  ATTACK_SLOTS,
  ATTACK_TYPES,
  DEFAULT_ATTACK_TYPE,
  DEFAULT_GENDER,
  DEFAULT_ROLE,
  EFFECT_IDS,
  EFFECT_GROUPS,
  GENDERS,
  ROLES,
  SKILL_SLOTS,
  getActionDef,
  getRoleConfig
} from '../../../../shared/characterConfig.js';
import { characterApi } from '../../character/characterApi.js';
import { CharacterPreviewScene } from '../../character/CharacterPreviewScene.js';
import { guessAnimations, invalidateCharacter, loadGltf } from '../../character/characterAssets.js';
import { effectLabel } from '../../character/effects.js';
import { useT } from '../../i18n/index.js';
import { useSettingsStore } from '../../store/settingsStore.js';
import { RoleSkills } from './RoleSkills.jsx';
import { CharacterAvatar } from './CharacterAvatar.jsx';
import '../../styles/MapEditor.css';
import '../../styles/Character.css';

const SLOT_KEYS = {
  attack1: 'LMB',
  attack2: 'LMB',
  skill1: 'Z',
  skill2: 'X',
  skill3: 'C',
  emote: 'Q',
  jump: 'Space'
};

const defaultEffects = (role) =>
  Object.fromEntries(SKILL_SLOTS.map((slot) => [slot, getRoleConfig(role).skills[slot].effect]));

const emptyAnimations = () => Object.fromEntries(ANIMATION_SLOTS.map((slot) => [slot, null]));

const defaultAttackTypes = () => Object.fromEntries(ATTACK_SLOTS.map((slot) => [slot, DEFAULT_ATTACK_TYPE]));

/**
 * Two-step character creator: (1) name, role, GLB model and profile image; (2) pick which clip of the
 * GLB plays for every action and which effect each skill uses, previewed live on the 3D character.
 */
export function CharacterEditor({ characterId, onExit }) {
  const t = useT();
  const language = useSettingsStore((s) => s.language);

  const [step, setStep] = useState('setup'); // setup | animate
  const [savedId, setSavedId] = useState(characterId);
  const [name, setName] = useState('');
  const [role, setRole] = useState(DEFAULT_ROLE);
  const [gender, setGender] = useState(DEFAULT_GENDER);
  const [attackTypes, setAttackTypes] = useState(defaultAttackTypes);
  const [scale, setScale] = useState(1);
  const [animations, setAnimations] = useState(emptyAnimations);
  const [effects, setEffects] = useState(() => defaultEffects(DEFAULT_ROLE));
  const [modelFile, setModelFile] = useState(null);
  const [modelName, setModelName] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [gltf, setGltf] = useState(null);
  const [modelState, setModelState] = useState(characterId ? 'loading' : 'empty'); // empty | loading | ready | error
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'ok' | 'error', text }

  const viewportRef = useRef(null);
  const previewRef = useRef(null);
  const appliedScaleRef = useRef(1);
  const objectUrlsRef = useRef([]);

  const clipNames = useMemo(() => (gltf ? gltf.animations.map((clip) => clip.name) : []), [gltf]);

  const makeObjectUrl = (file) => {
    const url = URL.createObjectURL(file);
    objectUrlsRef.current.push(url);
    return url;
  };

  useEffect(
    () => () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    },
    []
  );

  // Editing an existing character: load its saved settings and model.
  useEffect(() => {
    if (!characterId) return undefined;
    let cancelled = false;
    characterApi
      .get(characterId)
      .then(async (character) => {
        if (cancelled) return;
        setName(character.name);
        setRole(character.role);
        setGender(character.gender || DEFAULT_GENDER);
        setAttackTypes({ ...defaultAttackTypes(), ...character.attackTypes });
        setScale(character.scale || 1);
        setAnimations({ ...emptyAnimations(), ...character.animations });
        setEffects({ ...defaultEffects(character.role), ...character.effects });
        setImageUrl(character.imageUrl);
        setModelName(character.hasModel ? 'model.glb' : '');
        if (!character.modelUrl) {
          setModelState('empty');
          return;
        }
        const loaded = await loadGltf(character.modelUrl);
        if (cancelled) return;
        setGltf(loaded);
        setModelState('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        setModelState('error');
        setStatus({ type: 'error', text: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  useEffect(() => {
    if (!status) return undefined;
    const timer = setTimeout(() => setStatus(null), 3500);
    return () => clearTimeout(timer);
  }, [status]);

  // 3D preview, only alive while the animation step is open.
  useEffect(() => {
    if (step !== 'animate' || !gltf || !viewportRef.current) return undefined;
    const preview = new CharacterPreviewScene(viewportRef.current);
    preview.setCharacter(gltf, { animations, scale });
    preview.setProfile({ gender, attackTypes });
    appliedScaleRef.current = scale;
    previewRef.current = preview;
    return () => {
      preview.dispose();
      previewRef.current = null;
    };
    // animations / scale are applied live through the handlers below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, gltf]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview || appliedScaleRef.current === scale) return;
    appliedScaleRef.current = scale;
    preview.setCharacter(gltf, { animations, scale });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  const touch = () => setDirty(true);

  const changeGender = (next) => {
    setGender(next);
    touch();
    previewRef.current?.setProfile({ gender: next, attackTypes });
    previewRef.current?.playSlot('hit');
  };

  const changeAttackType = (slot, type) => {
    const next = { ...attackTypes, [slot]: type };
    setAttackTypes(next);
    touch();
    previewRef.current?.setProfile({ gender, attackTypes: next });
    previewRef.current?.playSlot(slot);
  };

  const pickModel = async (file) => {
    if (!file) return;
    setModelState('loading');
    try {
      const loaded = await loadGltf(makeObjectUrl(file));
      setGltf(loaded);
      setModelFile(file);
      setModelName(file.name);
      setAnimations(guessAnimations(loaded.animations.map((clip) => clip.name)));
      setModelState('ready');
      touch();
    } catch {
      setModelState(gltf ? 'ready' : 'error');
      setStatus({ type: 'error', text: t('char.modelError') });
    }
  };

  const pickImage = (file) => {
    if (!file) return;
    setImageFile(file);
    setImageUrl(makeObjectUrl(file));
    touch();
  };

  const changeRole = (next) => {
    setRole(next);
    setEffects(defaultEffects(next));
    touch();
  };

  const changeAnimation = (slot, value) => {
    const next = { ...animations, [slot]: value || null };
    setAnimations(next);
    touch();
    previewRef.current?.setAnimations(next);
    previewRef.current?.playSlot(slot);
  };

  const previewSkill = (slot, effectId = effects[slot]) => {
    previewRef.current?.playSlot(slot);
    previewRef.current?.playEffect(effectId, getActionDef(role, slot));
  };

  const changeEffect = (slot, effectId) => {
    setEffects((prev) => ({ ...prev, [slot]: effectId }));
    touch();
    previewSkill(slot, effectId);
  };

  const canContinue = name.trim().length > 0 && modelState === 'ready';

  const save = async () => {
    setSaving(true);
    try {
      const payload = { name: name.trim(), role, gender, attackTypes, scale, animations, effects };
      let saved = savedId ? await characterApi.update(savedId, payload) : await characterApi.create(payload);
      setSavedId(saved.id); // a retry after a failed upload updates instead of creating a duplicate
      if (modelFile) {
        saved = await characterApi.uploadModel(saved.id, modelFile);
        setModelFile(null);
      }
      if (imageFile) {
        saved = await characterApi.uploadImage(saved.id, imageFile);
        setImageFile(null);
      }
      invalidateCharacter(saved.id);
      setName(saved.name);
      setDirty(false);
      setStatus({ type: 'ok', text: t('char.saved') });
    } catch (e) {
      setStatus({ type: 'error', text: t('char.saveError', { message: e.message }) });
    } finally {
      setSaving(false);
    }
  };

  const exit = () => {
    if (dirty && !window.confirm(t('char.confirmLeave'))) return;
    onExit();
  };

  const fileField = (label, accept, fileName, onPick) => (
    <div className="ce-field">
      <span className="ce-label">{label}</span>
      <label className="ed-btn ce-file-btn">
        {t('char.chooseFile')}
        <input type="file" accept={accept} hidden onChange={(e) => onPick(e.target.files?.[0])} />
      </label>
      {fileName && <span className="ce-file-name">{fileName}</span>}
    </div>
  );

  const topbar = (
    <header className="editor-topbar">
      <button className="ed-btn" onClick={step === 'animate' ? () => setStep('setup') : exit}>
        ← {step === 'animate' ? t('char.backToSetup') : t('common.back')}
      </button>
      <span className="ce-title">{name.trim() || t('char.setup.title')}</span>
      {dirty && <span className="ed-dirty">● {t('char.unsaved')}</span>}
      {status && <span className={`ed-status ${status.type}`}>{status.text}</span>}
      <div className="ed-spacer" />
      {step === 'animate' && (
        <>
          <button className="ed-btn" onClick={exit}>{t('common.back')}</button>
          <button className="ed-btn primary" disabled={saving} onClick={save}>
            💾 {t('char.save')}
          </button>
        </>
      )}
    </header>
  );

  if (step === 'setup') {
    return (
      <div className="editor-root character-art-bg">
        {topbar}
        <div className="ce-setup-wrap">
          <div className="ce-setup">
            <h2 className="ce-heading">{t('char.setup.title')}</h2>

            <div className="ce-field">
              <span className="ce-label">{t('char.name')}</span>
              <input
                className="ed-name ce-name"
                type="text"
                maxLength={40}
                placeholder={t('char.namePlaceholder')}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  touch();
                }}
              />
            </div>

            <div className="ce-field">
              <span className="ce-label">{t('char.role')}</span>
              <div className="ce-roles">
                {ROLES.map((r) => (
                  <button key={r} className={`ce-role ${role === r ? 'active' : ''}`} onClick={() => changeRole(r)}>
                    {t(`role.${r}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="ce-field">
              <span className="ce-label">{t('char.gender')}</span>
              <div className="ce-roles">
                {GENDERS.map((g) => (
                  <button key={g} className={`ce-role ${gender === g ? 'active' : ''}`} onClick={() => changeGender(g)}>
                    {t(`gender.${g}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="ce-field">
              <span className="ce-label">{t('char.roleSkills')}</span>
              <RoleSkills role={role} />
            </div>

            <div className="ce-files">
              {fileField(t('char.modelFile'), '.glb,model/gltf-binary', modelName, pickModel)}
              {fileField(t('char.imageFile'), 'image/png,image/jpeg,image/webp,image/gif', imageFile?.name, pickImage)}
              {imageUrl && <CharacterAvatar character={{ name, imageUrl }} size={72} />}
            </div>

            {modelState === 'loading' && <p className="ed-hint">{t('char.loadingModel')}</p>}
            {modelState === 'ready' && clipNames.length === 0 && <p className="ed-hint">{t('char.noClips')}</p>}
            {modelState === 'empty' && <p className="ed-hint">{t('char.modelRequired')}</p>}
            {modelState === 'error' && <p className="ed-hint ce-error">{t('char.modelError')}</p>}

            <button className="ed-btn primary ce-ok" disabled={!canContinue} onClick={() => setStep('animate')}>
              {t('char.ok')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const config = getRoleConfig(role);

  return (
    <div className="editor-root character-art-bg">
      {topbar}
      <div className="editor-body">
        <aside className="editor-panel left ce-anim-panel">
          <h3>{t('char.anim.title')}</h3>
          <p className="ed-hint">{t('char.anim.hint')}</p>

          {ANIMATION_SLOTS.map((slot) => {
            const isSkill = SKILL_SLOTS.includes(slot);
            return (
              <div className="ce-slot" key={slot}>
                <div className="ce-slot-head">
                  <span className="ce-slot-name">
                    {t(`anim.${slot}`)}
                    {SLOT_KEYS[slot] && <em className="ce-slot-key">{SLOT_KEYS[slot]}</em>}
                  </span>
                  <button
                    className="mini-btn"
                    title={t('char.preview')}
                    onClick={() => (isSkill ? previewSkill(slot) : previewRef.current?.playSlot(slot))}
                  >
                    ▶
                  </button>
                </div>
                <select value={animations[slot] || ''} onChange={(e) => changeAnimation(slot, e.target.value)}>
                  <option value="">{t('char.noAnimation')}</option>
                  {clipNames.map((clip) => (
                    <option key={clip} value={clip}>{clip}</option>
                  ))}
                </select>
                {ATTACK_SLOTS.includes(slot) && (
                  <div className="ce-effect-row">
                    <span className="ce-skill-name">{t('char.attackType')}</span>
                    <select value={attackTypes[slot]} onChange={(e) => changeAttackType(slot, e.target.value)}>
                      {ATTACK_TYPES.map((type) => (
                        <option key={type} value={type}>{t(`attackType.${type}`)}</option>
                      ))}
                    </select>
                  </div>
                )}
                {isSkill && (
                  <div className="ce-effect-row">
                    <span className="ce-skill-name">
                      {config.skills[slot].name[language] || config.skills[slot].name.en} • {t('char.effect')}
                    </span>
                    <select value={effects[slot]} onChange={(e) => changeEffect(slot, e.target.value)}>
                      {EFFECT_GROUPS.map((group) => (
                        <optgroup key={group.id} label={group.label[language] || group.label.en}>
                          {group.ids.map((id) => (
                            <option key={id} value={id}>{effectLabel(id, language)}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </aside>

        <div className="editor-viewport-wrap">
          <div className="editor-viewport" ref={viewportRef} />
          <div className="ce-viewport-hint">{t('char.previewHelp')}</div>
        </div>

        <aside className="editor-panel right">
          <h3>{t('char.effect')}</h3>
          <div className="ce-gallery">
            {EFFECT_GROUPS.map((group) => (
              <div key={group.id} className="ce-effect-group">
                <div className="ce-effect-group-title">{group.label[language] || group.label.en}</div>
                {group.ids.filter((id) => id !== 'none').map((id) => (
                  <button
                    key={id}
                    className="ed-item"
                    onClick={() => previewRef.current?.playEffect(id, { range: 9, shape: 'circle' })}
                  >
                    ✦ {effectLabel(id, language)}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <h3>{t('char.size')}</h3>
          <div className="ed-slider-row">
            <input
              type="range"
              min={0.3}
              max={3}
              step={0.05}
              value={scale}
              onChange={(e) => {
                setScale(parseFloat(e.target.value));
                touch();
              }}
            />
            <span className="ce-scale-value">{scale.toFixed(2)}×</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
