import React, { useRef } from 'react';
import {
  UNIT_ANIMATION_SLOTS,
  UNIT_EFFECTS,
  UNIT_PARAMS,
  UNIT_POWERS,
  defaultUnit
} from '../../../../shared/skillConfig.js';
import { playPowerSound } from '../../character/characterSounds.js';
import { useT } from '../../i18n/index.js';
import { useSettingsStore } from '../../store/settingsStore.js';
import { skillEffectLabel } from '../../skill/skillEffects.js';
import { SUMMON_SOUND_EFFECT } from '../../skill/summonEffects.js';
import { ActorSetup } from './ActorSetup.jsx';

const STAT_KEYS = ['health', 'speed', 'range', 'cooldown', 'amount'];

/**
 * Editor of one unit summoned by a necromancer / summoner / support skill: its GLB and animations,
 * its power (what it does while it is out) and the effect of that power.
 */
export function UnitEditor({ unit, file, onFile, onChange, onRemove }) {
  const t = useT();
  const language = useSettingsStore((s) => s.language);
  const setupRef = useRef(null);

  const changePower = (power) => {
    const fresh = defaultUnit(power);
    onChange({ power, effect: fresh.effect, params: { ...unit.params, range: fresh.params.range, cooldown: fresh.params.cooldown, amount: fresh.params.amount } });
  };

  const previewEffect = (effect = unit.effect) => {
    setupRef.current?.playSlot('attack1');
    setupRef.current?.playEffect(effect, { range: unit.params.range, shape: 'line' });
    playPowerSound(SUMMON_SOUND_EFFECT[effect]);
  };

  return (
    <div className="unit-box">
      <label className="field-label">{t('units.name')}</label>
      <input
        className="fantasy-input"
        type="text"
        maxLength={40}
        placeholder={t('units.namePlaceholder')}
        value={unit.name}
        onChange={(e) => onChange({ name: e.target.value })}
      />

      <div className="sk-grid">
        <label className="ol-field">
          <span>{t('units.power')}</span>
          <select className="fantasy-input" value={unit.power} onChange={(e) => changePower(e.target.value)}>
            {UNIT_POWERS.map((power) => (
              <option key={power} value={power}>{t(`units.power.${power}`)}</option>
            ))}
          </select>
        </label>
        <label className="ol-field">
          <span>{t('skills.effect')}</span>
          <select
            className="fantasy-input"
            value={unit.effect}
            onChange={(e) => {
              onChange({ effect: e.target.value });
              previewEffect(e.target.value);
            }}
          >
            {UNIT_EFFECTS[unit.power].map((effect) => (
              <option key={effect} value={effect}>{skillEffectLabel(effect, language)}</option>
            ))}
          </select>
        </label>
        {STAT_KEYS.map((key) => (
          <label className="ol-field" key={key}>
            <span>{key === 'amount' ? t(`units.amount.${unit.power}`) : t(`units.stat.${key}`)}</span>
            <input
              className="fantasy-input"
              type="number"
              min={UNIT_PARAMS[key].min}
              max={UNIT_PARAMS[key].max}
              step={UNIT_PARAMS[key].step}
              value={unit.params[key]}
              onChange={(e) => onChange({ params: { ...unit.params, [key]: e.target.value } })}
            />
          </label>
        ))}
      </div>
      <p className="ol-note">{t(`units.hint.${unit.power}`)}</p>

      <ActorSetup
        ref={setupRef}
        slots={UNIT_ANIMATION_SLOTS}
        scaleSpec={UNIT_PARAMS.scale}
        value={{ movement: unit.movement, scale: unit.params.scale, animations: unit.animations }}
        file={file}
        modelUrl={unit.modelUrl || null}
        onFile={onFile}
        onChange={({ scale, ...rest }) => onChange({ ...rest, ...(scale === undefined ? {} : { params: { ...unit.params, scale } }) })}
      />

      <div className="ol-form-row sk-actions">
        <button className="mini-btn" onClick={() => previewEffect()}>▶ {t('skills.play')}</button>
        {onRemove && <button className="mini-btn danger" onClick={onRemove}>{t('units.remove')}</button>}
      </div>
    </div>
  );
}
