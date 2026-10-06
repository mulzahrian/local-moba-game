import React from 'react';
import { MAX_EQUIPPED_SKILLS } from '../../../shared/skillConfig.js';
import { useT } from '../i18n/index.js';
import { getSkill } from '../skill/skillLibrary.js';
import { useSkillStore } from '../store/skillStore.js';
import { SkillIcon } from './SkillIcon.jsx';

// The skills the player owns: equip them on keys 1-4 (or take them off again).
export function SkillInventory({ onClose }) {
  const t = useT();
  const owned = useSkillStore((s) => s.owned);
  const equipped = useSkillStore((s) => s.equipped);
  const equip = useSkillStore((s) => s.equip);
  const unequip = useSkillStore((s) => s.unequip);
  const skills = owned.map(getSkill).filter(Boolean);

  return (
    <div className="skill-inventory" onMouseDown={(e) => e.stopPropagation()}>
      <h4>
        {t('skills.inventory')}
        <button className="skill-inventory-close" onClick={onClose} aria-label={t('common.cancel')}>×</button>
      </h4>
      {skills.length === 0 && <p className="hint">{t('skills.inventoryEmpty')}</p>}
      {skills.map((skill) => {
        const slot = equipped.indexOf(skill.id);
        return (
          <div className="skill-inventory-item" key={skill.id}>
            <SkillIcon skill={skill} size={36} />
            <div className="grow">
              <strong>{skill.name}</strong>
              <span className="meta">
                {t(`skills.power.${skill.power}`)} • {t('skills.mana')} {skill.mana} • {skill.cooldown}s
              </span>
            </div>
            {slot >= 0 ? (
              <button onClick={() => unequip(skill.id)}>{t('skills.unequip')} [{slot + 1}]</button>
            ) : (
              <button disabled={!equipped.includes(null)} onClick={() => equip(skill.id)}>{t('skills.equip')}</button>
            )}
          </div>
        );
      })}
      <p className="ol-note">{t('skills.keyHint', { max: MAX_EQUIPPED_SKILLS })}</p>
    </div>
  );
}
