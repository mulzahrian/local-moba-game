import React, { useEffect, useState } from 'react';
import { ACTION_SLOTS, getActionDef, getManaCost } from '../../../shared/characterConfig.js';
import { useT } from '../i18n/index.js';
import { useSettingsStore } from '../store/settingsStore.js';
import '../styles/Character.css';

const SLOT_KEYS = { attack1: 'LMB', skill1: 'Z', skill2: 'X', skill3: 'C', emote: 'Q', jump: 'Space' };
const BAR_SLOTS = ACTION_SLOTS.filter((slot) => slot !== 'attack2'); // attack2 is the follow-up of attack1

// Cooldown / mana overview of the local player's actions. Polls the running GameScene a few times a second.
export function SkillBar({ getScene }) {
  const t = useT();
  const language = useSettingsStore((s) => s.language);
  const [state, setState] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setState(getScene()?.getHudState() || null), 100);
    return () => clearInterval(timer);
  }, [getScene]);

  if (!state) return null;

  return (
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
    </div>
  );
}
