import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BASIC_POWERS,
  COMMON_PARAMS,
  DEFAULT_POWER,
  MAX_UNITS,
  POWER_PARAMS,
  SKILL_EFFECTS,
  SKILL_ENUMS,
  SUMMON_POWERS,
  createUnit,
  defaultSkill,
  isSummonPower,
  sanitizeSkillFields,
  toActionDef
} from '../../../../shared/skillConfig.js';
import { useT } from '../../i18n/index.js';
import { useSettingsStore } from '../../store/settingsStore.js';
import { useSkillStore } from '../../store/skillStore.js';
import { skillApi } from '../../skill/skillApi.js';
import { SkillPreviewScene } from '../../skill/SkillPreviewScene.js';
import { refreshSkillLibrary } from '../../skill/skillLibrary.js';
import { skillEffectLabel } from '../../skill/skillEffects.js';
import { SkillIcon } from '../SkillIcon.jsx';
import { UnitEditor } from './UnitEditor.jsx';
import '../../styles/ObjectLibrary.css';
import '../../styles/Skills.css';

const NEW_SKILL = 'new';
const TABS = ['basic', ...SUMMON_POWERS]; // the generators: basic powers, then one per summon power

const draftOf = (skill) => ({
  name: skill.name,
  power: skill.power,
  effect: skill.effect,
  mana: skill.mana,
  cooldown: skill.cooldown,
  price: skill.price,
  params: { ...skill.params },
  ...(skill.units
    ? { units: skill.units.map((unit) => ({ ...unit, animations: { ...unit.animations }, params: { ...unit.params } })) }
    : {})
});

const tabOfPower = (power) => (isSummonPower(power) ? power : 'basic');

// Settings of a power that matter for its current mode / shape (e.g. a stun has a duration, a line has a width).
function visibleParams(power, params) {
  const keys = Object.keys(POWER_PARAMS[power]);
  return keys.filter((key) => {
    if (power === 'control') {
      return key === 'range' || key === 'damage' || (key === 'duration' && ['stun', 'dominate'].includes(params.mode)) || (key === 'distance' && params.mode === 'knockback');
    }
    if (power === 'fire') return key === 'range' || key === 'damage' || (key === 'width' && params.shape === 'line') || (key === 'arc' && params.shape === 'cone');
    return true;
  });
}

function NumberField({ label, spec, value, onChange }) {
  return (
    <label className="ol-field">
      <span>{label}</span>
      <input
        className="fantasy-input"
        type="number"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function SkillGeneratorView({ onBack }) {
  const t = useT();
  const language = useSettingsStore((s) => s.language);
  const addSkill = useSkillStore((s) => s.addSkill);
  const owned = useSkillStore((s) => s.owned);

  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('basic');
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(() => defaultSkill());
  const [iconFile, setIconFile] = useState(null);
  const [iconPreview, setIconPreview] = useState(null);
  const [unitIndex, setUnitIndex] = useState(0);
  const [unitFiles, setUnitFiles] = useState({}); // unit id -> GLB picked but not saved yet
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const viewportRef = useRef(null);
  const previewRef = useRef(null);

  const selected = skills.find((s) => s.id === selectedId) || null;
  const visibleSkills = skills.filter((skill) => tabOfPower(skill.power) === tab);
  const summoning = isSummonPower(draft.power);
  const clean = useMemo(() => sanitizeSkillFields(draft), [draft]);
  const action = useMemo(() => toActionDef({ id: 'preview', ...clean }), [clean]);
  const unit = summoning ? draft.units[Math.min(unitIndex, draft.units.length - 1)] : null;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSkills(await skillApi.list());
      setError('');
    } catch {
      setError(t('maps.loadError'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 3D preview: alive while a skill is open.
  const editing = selectedId !== null;
  useEffect(() => {
    if (!editing || !viewportRef.current) return undefined;
    const preview = new SkillPreviewScene(viewportRef.current);
    previewRef.current = preview;
    return () => {
      preview.dispose();
      previewRef.current = null;
    };
  }, [editing]);

  useEffect(() => {
    if (!iconFile) {
      setIconPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(iconFile);
    setIconPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [iconFile]);

  const open = (id) => {
    const skill = skills.find((s) => s.id === id);
    setSelectedId(id);
    setDraft(skill ? draftOf(skill) : defaultSkill(tab === 'basic' ? DEFAULT_POWER : tab));
    setUnitIndex(0);
    setUnitFiles({});
    setIconFile(null);
    setSaved(false);
    setError('');
  };

  const changeTab = (next) => {
    setTab(next);
    setSelectedId(null);
    setError('');
  };

  const update = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
    setSaved(false);
  };

  const updateParam = (key, value) => update({ params: { ...draft.params, [key]: value } });

  const updateUnit = (unitId, patch) => {
    setDraft((current) => ({
      ...current,
      units: current.units.map((candidate) => (candidate.id === unitId ? { ...candidate, ...patch } : candidate))
    }));
    setSaved(false);
  };

  const addUnit = () => {
    const fresh = createUnit();
    setDraft((current) => ({ ...current, units: [...current.units, fresh] }));
    setUnitIndex(draft.units.length);
    setSaved(false);
  };

  const removeUnit = (unitId) => {
    setUnitFiles(({ [unitId]: _removed, ...rest }) => rest);
    setDraft((current) => ({ ...current, units: current.units.filter((candidate) => candidate.id !== unitId) }));
    setUnitIndex(0);
    setSaved(false);
  };

  const changePower = (power) => {
    const fresh = defaultSkill(power);
    setDraft((current) => ({ ...fresh, name: current.name, mana: current.mana, cooldown: current.cooldown, price: current.price }));
    setSaved(false);
  };

  const chooseIcon = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError(t('skills.imageOnly'));
    setIconFile(file);
  };

  const applySaved = (skill) => {
    setSkills((list) => (list.some((s) => s.id === skill.id) ? list.map((s) => (s.id === skill.id ? skill : s)) : [...list, skill]));
    refreshSkillLibrary();
  };

  const save = async () => {
    if (!draft.name.trim()) return setError(t('skills.needName'));
    if (summoning) {
      const missing = draft.units.find((candidate) => !unitFiles[candidate.id] && !candidate.hasModel);
      if (missing) return setError(t('units.needModel', { name: missing.name || t('units.unnamed') }));
    }
    setBusy(true);
    try {
      let result = selected ? await skillApi.update(selected.id, clean) : await skillApi.create(clean);
      if (iconFile) result = await skillApi.uploadIcon(result.id, iconFile);
      for (const [unitId, file] of Object.entries(unitFiles)) {
        if (result.units?.some((candidate) => candidate.id === unitId)) result = await skillApi.uploadUnitModel(result.id, unitId, file);
      }
      applySaved(result);
      setSelectedId(result.id);
      setDraft(draftOf(result));
      setUnitFiles({});
      setIconFile(null);
      setSaved(true);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selected || !window.confirm(t('skills.confirmDelete', { name: selected.name }))) return;
    try {
      await skillApi.remove(selected.id);
      setSkills((list) => list.filter((s) => s.id !== selected.id));
      refreshSkillLibrary();
      setSelectedId(null);
    } catch (e) {
      setError(e.message);
    }
  };

  const play = () => previewRef.current?.play(action);

  // Replay when the effect / shape / power changes so the new look is seen right away.
  useEffect(() => {
    if (!editing) return undefined;
    const timer = setTimeout(() => previewRef.current?.play(action), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, clean.effect, clean.power, clean.params.shape, clean.params.mode]);

  return (
    <div className="menu-panel wide">
      <h2 className="panel-title">{t('skills.title')}</h2>
      <div className="toggle-group sk-tabs">
        {TABS.map((id) => (
          <button key={id} className={`toggle-btn ${tab === id ? 'active' : ''}`} onClick={() => changeTab(id)}>
            {t(`skills.tab.${id}`)}
          </button>
        ))}
      </div>
      {error && <p className="hint error">{error}</p>}

      <div className="ol-layout">
        <div className="ol-groups">
          <button className={`fantasy-btn ol-new ${selectedId === NEW_SKILL ? 'primary' : ''}`} onClick={() => open(NEW_SKILL)}>
            {t('skills.new')}
          </button>
          {loading && <p className="hint">{t('common.loading')}</p>}
          {!loading && !error && visibleSkills.length === 0 && <p className="hint">{t(`skills.empty.${tab}`)}</p>}
          {visibleSkills.map((skill) => (
            <div
              key={skill.id}
              className={`map-card row ol-group ${selectedId === skill.id ? 'selected' : ''}`}
              onClick={() => open(skill.id)}
            >
              <SkillIcon skill={skill} size={40} />
              <div className="map-card-info">
                <span className="map-card-name">{skill.name}</span>
                <span className="map-card-meta">{t(`skills.power.${skill.power}`)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="ol-detail">
          {!editing && <p className="hint">{t('skills.select')}</p>}

          {editing && (
            <>
              <div className="ol-form">
                <SkillIcon skill={{ ...selected, iconUrl: iconPreview || selected?.iconUrl, power: clean.power }} size={72} />
                <div className="ol-form-fields">
                  <label className="field-label" htmlFor="sk-name">{t('skills.name')}</label>
                  <input
                    id="sk-name"
                    className="fantasy-input"
                    type="text"
                    maxLength={40}
                    placeholder={t('skills.namePlaceholder')}
                    value={draft.name}
                    onChange={(e) => update({ name: e.target.value })}
                  />
                  <div className="ol-form-row">
                    <label className="mini-btn ol-file-btn">
                      {t('skills.chooseIcon')}
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={chooseIcon} />
                    </label>
                    {iconFile && <span className="ol-file-name">{iconFile.name}</span>}
                  </div>
                </div>
              </div>

              <div className="sk-grid">
                {tab === 'basic' && (
                  <label className="ol-field">
                    <span>{t('skills.power')}</span>
                    <select className="fantasy-input" value={draft.power} onChange={(e) => changePower(e.target.value)}>
                      {BASIC_POWERS.map((power) => (
                        <option key={power} value={power}>{t(`skills.power.${power}`)}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="ol-field">
                  <span>{t('skills.effect')}</span>
                  <select className="fantasy-input" value={draft.effect} onChange={(e) => update({ effect: e.target.value })}>
                    {SKILL_EFFECTS[draft.power].map((effect) => (
                      <option key={effect} value={effect}>{skillEffectLabel(effect, language)}</option>
                    ))}
                  </select>
                </label>
                <NumberField label={t('skills.mana')} spec={COMMON_PARAMS.mana} value={draft.mana} onChange={(v) => update({ mana: v })} />
                <NumberField label={t('skills.cooldown')} spec={COMMON_PARAMS.cooldown} value={draft.cooldown} onChange={(v) => update({ cooldown: v })} />
                <NumberField label={t('skills.price')} spec={COMMON_PARAMS.price} value={draft.price} onChange={(v) => update({ price: v })} />

                {Object.entries(SKILL_ENUMS[draft.power] || {}).map(([key, values]) => (
                  <label className="ol-field" key={key}>
                    <span>{t(`skills.param.${key}`)}</span>
                    <select className="fantasy-input" value={draft.params[key]} onChange={(e) => updateParam(key, e.target.value)}>
                      {values.map((value) => (
                        <option key={value} value={value}>{t(`skills.${key}.${value}`)}</option>
                      ))}
                    </select>
                  </label>
                ))}

                {visibleParams(draft.power, draft.params).map((key) => (
                  <NumberField
                    key={key}
                    label={t(`skills.param.${key}`)}
                    spec={POWER_PARAMS[draft.power][key]}
                    value={draft.params[key]}
                    onChange={(v) => updateParam(key, v)}
                  />
                ))}
              </div>
              <p className="ol-note">{t(`skills.hint.${draft.power}`)}</p>

              {summoning && (
                <>
                  <h4 className="field-label">{t(`units.title.${draft.power}`)}</h4>
                  <div className="unit-list">
                    {draft.units.map((candidate, index) => (
                      <button
                        key={candidate.id}
                        className={`unit-chip ${candidate === unit ? 'active' : ''}`}
                        onClick={() => setUnitIndex(index)}
                      >
                        {candidate.name || t('units.unnamed')} {index + 1}
                      </button>
                    ))}
                    {draft.units.length < MAX_UNITS[draft.power] && (
                      <button className="unit-chip" onClick={addUnit}>+ {t('units.add')}</button>
                    )}
                  </div>
                  <UnitEditor
                    key={unit.id}
                    unit={unit}
                    file={unitFiles[unit.id] || null}
                    onFile={(file) => {
                      setUnitFiles((files) => ({ ...files, [unit.id]: file }));
                      setSaved(false);
                    }}
                    onChange={(patch) => updateUnit(unit.id, patch)}
                    onRemove={draft.units.length > 1 ? () => removeUnit(unit.id) : null}
                  />
                </>
              )}

              <div className="sk-preview">
                <div className="sk-viewport" ref={viewportRef} />
                <button className="mini-btn ol-primary sk-play" onClick={play}>▶ {t('skills.play')}</button>
              </div>

              <div className="ol-form-row sk-actions">
                <button className="mini-btn ol-primary" disabled={busy} onClick={save}>
                  {saved ? `✓ ${t('skills.saved')}` : selected ? t('skills.save') : t('skills.create')}
                </button>
                {selected && (
                  <>
                    <button
                      className="mini-btn"
                      disabled={owned.includes(selected.id)}
                      title={t('skills.addToMineHint')}
                      onClick={() => addSkill(selected.id)}
                    >
                      {owned.includes(selected.id) ? `✓ ${t('skills.inMine')}` : t('skills.addToMine')}
                    </button>
                    <button className="mini-btn danger" onClick={remove}>{t('common.delete')}</button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="menu-buttons">
        <button className="fantasy-btn ghost" onClick={onBack}>{t('common.back')}</button>
      </div>
    </div>
  );
}
