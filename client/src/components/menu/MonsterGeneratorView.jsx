import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MONSTER_ANIMATION_SLOTS,
  MONSTER_PARAMS,
  defaultMonster,
  sanitizeMonsterFields
} from '../../../../shared/monsterConfig.js';
import { useT } from '../../i18n/index.js';
import { invalidateObjectLibrary } from '../../map/mapAssets.js';
import { invalidateMonster } from '../../monster/monsterAssets.js';
import { monsterApi } from '../../monster/monsterApi.js';
import { skillApi } from '../../skill/skillApi.js';
import { ActorSetup } from './ActorSetup.jsx';
import { MapTabs } from './MapTabs.jsx';
import '../../styles/ObjectLibrary.css';
import '../../styles/Skills.css';

const NEW_MONSTER = 'new';
const STAT_KEYS = ['health', 'damage', 'speed', 'attackRange', 'attackCooldown', 'gold'];

const draftOf = (monster) => ({
  name: monster.name,
  movement: monster.movement,
  animations: { ...monster.animations },
  params: { ...monster.params },
  rewardSkillId: monster.rewardSkillId || null
});

/** Map Generator > Monsters: upload a monster GLB, pick its animations, stats and the skill it rewards. */
export function MonsterGeneratorView({ onBack, onNavigate }) {
  const t = useT();
  const [monsters, setMonsters] = useState([]);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(() => defaultMonster());
  const [modelFile, setModelFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const selected = monsters.find((monster) => monster.id === selectedId) || null;
  const editing = selectedId !== null;
  const clean = useMemo(() => sanitizeMonsterFields(draft), [draft]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [monsterList, skillList] = await Promise.all([monsterApi.list(), skillApi.list()]);
      setMonsters(monsterList);
      setSkills(skillList);
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

  const open = (id) => {
    const monster = monsters.find((m) => m.id === id);
    setSelectedId(id);
    setDraft(monster ? draftOf(monster) : defaultMonster());
    setModelFile(null);
    setSaved(false);
    setError('');
  };

  const update = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
    setSaved(false);
  };

  const updateParam = (key, value) => update({ params: { ...draft.params, [key]: value } });

  const save = async () => {
    if (!draft.name.trim()) return setError(t('monsters.needName'));
    if (!modelFile && !selected?.hasModel) return setError(t('monsters.needModel'));
    setBusy(true);
    try {
      let result = selected ? await monsterApi.update(selected.id, clean) : await monsterApi.create(clean);
      if (modelFile) result = await monsterApi.uploadModel(result.id, modelFile);
      invalidateMonster(result.id);
      invalidateObjectLibrary(); // the map editor lists monsters too
      setMonsters((list) => (list.some((m) => m.id === result.id) ? list.map((m) => (m.id === result.id ? result : m)) : [...list, result]));
      setSelectedId(result.id);
      setDraft(draftOf(result));
      setModelFile(null);
      setSaved(true);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selected || !window.confirm(t('monsters.confirmDelete', { name: selected.name }))) return;
    try {
      await monsterApi.remove(selected.id);
      invalidateMonster(selected.id);
      invalidateObjectLibrary();
      setMonsters((list) => list.filter((m) => m.id !== selected.id));
      setSelectedId(null);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="menu-panel wide">
      <h2 className="panel-title">{t('maps.title')}</h2>
      <MapTabs active="map-monsters" onNavigate={onNavigate} />
      {error && <p className="hint error">{error}</p>}

      <div className="ol-layout">
        <div className="ol-groups">
          <button className={`fantasy-btn ol-new ${selectedId === NEW_MONSTER ? 'primary' : ''}`} onClick={() => open(NEW_MONSTER)}>
            {t('monsters.new')}
          </button>
          {loading && <p className="hint">{t('common.loading')}</p>}
          {!loading && !error && monsters.length === 0 && <p className="hint">{t('monsters.empty')}</p>}
          {monsters.map((monster) => (
            <div
              key={monster.id}
              className={`map-card row ol-group ${selectedId === monster.id ? 'selected' : ''}`}
              onClick={() => open(monster.id)}
            >
              <span className="skill-icon skill-icon-glyph" style={{ width: 40, height: 40, fontSize: 22 }}>👹</span>
              <div className="map-card-info">
                <span className="map-card-name">{monster.name}</span>
                <span className="map-card-meta">
                  {t(`actor.movement.${monster.movement}`)} • {t('monsters.stat.health')} {monster.params.health}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="ol-detail">
          {!editing && <p className="hint">{t('monsters.select')}</p>}

          {editing && (
            <>
              <label className="field-label" htmlFor="mon-name">{t('monsters.name')}</label>
              <input
                id="mon-name"
                className="fantasy-input"
                type="text"
                maxLength={40}
                placeholder={t('monsters.namePlaceholder')}
                value={draft.name}
                onChange={(e) => update({ name: e.target.value })}
              />

              <ActorSetup
                key={selectedId}
                slots={MONSTER_ANIMATION_SLOTS}
                scaleSpec={MONSTER_PARAMS.scale}
                value={{ movement: draft.movement, scale: draft.params.scale, animations: draft.animations }}
                file={modelFile}
                modelUrl={selected?.modelUrl || null}
                onFile={(file) => {
                  setModelFile(file);
                  setSaved(false);
                }}
                onChange={(patch) => {
                  const { scale, ...rest } = patch;
                  setDraft((current) => ({
                    ...current,
                    ...rest,
                    params: scale === undefined ? current.params : { ...current.params, scale }
                  }));
                  setSaved(false);
                }}
              />

              <div className="sk-grid">
                {STAT_KEYS.map((key) => (
                  <label className="ol-field" key={key}>
                    <span>{t(`monsters.stat.${key}`)}</span>
                    <input
                      className="fantasy-input"
                      type="number"
                      min={MONSTER_PARAMS[key].min}
                      max={MONSTER_PARAMS[key].max}
                      step={MONSTER_PARAMS[key].step}
                      value={draft.params[key]}
                      onChange={(e) => updateParam(key, e.target.value)}
                    />
                  </label>
                ))}
                <label className="ol-field">
                  <span>{t('monsters.rewardSkill')}</span>
                  <select
                    className="fantasy-input"
                    value={draft.rewardSkillId || ''}
                    onChange={(e) => update({ rewardSkillId: e.target.value || null })}
                  >
                    <option value="">{t('monsters.noReward')}</option>
                    {skills.map((skill) => (
                      <option key={skill.id} value={skill.id}>{skill.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="ol-note">{t('monsters.hint')}</p>

              <div className="ol-form-row sk-actions">
                <button className="mini-btn ol-primary" disabled={busy} onClick={save}>
                  {saved ? `✓ ${t('skills.saved')}` : selected ? t('skills.save') : t('skills.create')}
                </button>
                {selected && <button className="mini-btn danger" onClick={remove}>{t('common.delete')}</button>}
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
