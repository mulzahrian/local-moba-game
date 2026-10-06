import React, { useEffect, useState } from 'react';
import { ACTION_SLOTS, getActionDef, getManaCost } from '../../../shared/characterConfig.js';
import { skillSlot } from '../../../shared/skillConfig.js';
import { useT } from '../i18n/index.js';
import { ensureSkillLibrary, getSkill, listSkills } from '../skill/skillLibrary.js';
import { useSettingsStore } from '../store/settingsStore.js';
import { useSkillStore } from '../store/skillStore.js';
import { SkillIcon } from './SkillIcon.jsx';
import { SkillInventory } from './SkillInventory.jsx';
import '../styles/Character.css';
import '../styles/Skills.css';

const SLOT_KEYS = { attack1: 'LMB', skill1: 'Z', skill2: 'X', skill3: 'C', emote: 'Q', jump: 'Space' };
const BAR_SLOTS = ACTION_SLOTS.filter((slot) => slot !== 'attack2'); // attack2 is the follow-up of attack1

// Cooldown / mana overview of the local player's actions. Polls the running GameScene a few times a second.
export function SkillBar({ getScene }) {
  const t = useT();
  const language = useSettingsStore((s) => s.language);
  const equipped = useSkillStore((s) => s.equipped);
  const [state, setState] = useState(null);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [, setLibraryVersion] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setState(getScene()?.getHudState() || null), 100);
    return () => clearInterval(timer);
  }, [getScene]);

  useEffect(() => {
    ensureSkillLibrary().then(() => {
      const ids = listSkills().map((skill) => skill.id);
      if (ids.length) useSkillStore.getState().prune(ids); // forget skills deleted in the Skill Generator
      setLibraryVersion((v) => v + 1);
    });
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
      if (event.code === 'KeyK' && !typing) setInventoryOpen((open) => !open);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!state) return null;

  return (
    <>
      <div className="skill-bar">
        {BAR_SLOTS.map((slot) => {
          const def = getActionDef(state.role, slot);
          const cooldown = state.cooldowns[slot];
          const fraction = cooldown ? cooldown.remaining / cooldown.total : 0;
          const cost = getManaCost(state.role, slot);
          const lacksMana = state.mana !== null && state.mana !== undefined && state.mana < cost;
          const label = def?.name ? def.name[language] || def.name.en : t(`anim.${slot}`);
          return (
            <div key={slot} className={`skill-slot ${lacksMana ? 'no-mana' : ''} ${state.dead ? 'dead' : ''}`} title={label}>
              <span className="skill-key">{SLOT_KEYS[slot]}</span>
              <span className="skill-name">{label}</span>
              {cost > 0 && <span className="skill-cost">{cost}</span>}
              {fraction > 0 && (
                <span className="skill-cooldown" style={{ height: `${fraction * 100}%` }}>
                  {(cooldown.remaining / 1000).toFixed(1)}
                </span>
              )}
            </div>
          );
        })}

        {equipped.map((id, index) => {
          const skill = id ? getSkill(id) : null;
          if (!skill) {
            return (
              <div key={`empty-${index}`} className="skill-slot skill-empty" title={t('skills.emptySlot')}>
                <span className="skill-key">{index + 1}</span>
              </div>
            );
          }
          const cooldown = state.cooldowns[skillSlot(id)];
          const fraction = cooldown ? cooldown.remaining / cooldown.total : 0;
          const lacksMana = state.mana !== null && state.mana !== undefined && state.mana < skill.mana;
          return (
            <div
              key={id}
              className={`skill-slot skill-equipped ${lacksMana ? 'no-mana' : ''} ${state.dead ? 'dead' : ''}`}
              title={skill.name}
            >
              <span className="skill-key">{index + 1}</span>
              <SkillIcon skill={skill} size={28} />
              <span className="skill-name">{skill.name}</span>
              {skill.mana > 0 && <span className="skill-cost">{skill.mana}</span>}
              {fraction > 0 && (
                <span className="skill-cooldown" style={{ height: `${fraction * 100}%` }}>
                  {(cooldown.remaining / 1000).toFixed(1)}
                </span>
              )}
            </div>
          );
        })}

        <button className="skill-bar-toggle" onClick={() => setInventoryOpen((open) => !open)} title="K">
          {t('skills.inventoryButton')}
        </button>
      </div>
      {inventoryOpen && <SkillInventory onClose={() => setInventoryOpen(false)} />}
    </>
  );
}
