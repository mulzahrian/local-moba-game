import React from 'react';
import { SKILL_SLOTS, getManaCost, getRoleConfig } from '../../../../shared/characterConfig.js';
import { useT } from '../../i18n/index.js';
import { useSettingsStore } from '../../store/settingsStore.js';
import '../../styles/Character.css';

const SKILL_KEYS = { skill1: 'Z', skill2: 'X', skill3: 'C' };

// Lists what a role can do: basic attack, its three skills (with keys, mana cost, damage, cooldown) and the emote.
export function RoleSkills({ role }) {
  const t = useT();
  const language = useSettingsStore((s) => s.language);
  const config = getRoleConfig(role);
  const { attack } = config;

  return (
    <div className="role-skills">
      <div className="role-skill">
        <span className="role-skill-key">{t('key.attack')}</span>
        <span className="role-skill-info">
          <strong>{t('char.attackLine')}</strong>
          <small>
            {t('char.damage')} {attack.damage1}/{attack.damage2} • {t('char.range')} {attack.range}
          </small>
        </span>
      </div>
      {SKILL_SLOTS.map((slot) => {
        const skill = config.skills[slot];
        return (
          <div className="role-skill" key={slot}>
            <span className="role-skill-key">{SKILL_KEYS[slot]}</span>
            <span className="role-skill-info">
              <strong>{skill.name[language] || skill.name.en}</strong>
              <small>
                {t('char.cost')} {getManaCost(role, slot)} • {t('char.damage')} {skill.damage} •{' '}
                {t('char.cooldown')} {skill.cooldown}s • {t('char.range')} {skill.range}
              </small>
            </span>
          </div>
        );
      })}
      <div className="role-skill">
        <span className="role-skill-key">{t('key.emote')}</span>
        <span className="role-skill-info">
          <strong>{t('anim.emote')}</strong>
        </span>
      </div>
    </div>
  );
}
