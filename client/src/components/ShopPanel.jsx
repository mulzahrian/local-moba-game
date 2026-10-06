import React from 'react';
import { useT } from '../i18n/index.js';
import { listSkills } from '../skill/skillLibrary.js';
import { useSkillStore } from '../store/skillStore.js';
import { useToastStore } from '../store/toastStore.js';
import { useWalletStore } from '../store/walletStore.js';
import { SkillIcon } from './SkillIcon.jsx';

export const formatClock = (seconds) => {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

// The skill shop: buy skills with your money. It is only reachable near your own tower and while the shop is open.
export function ShopPanel({ secondsLeft, onClose }) {
  const t = useT();
  const gold = useWalletStore((s) => s.gold);
  const spend = useWalletStore((s) => s.spend);
  const owned = useSkillStore((s) => s.owned);
  const addSkill = useSkillStore((s) => s.addSkill);
  const push = useToastStore((s) => s.push);
  const skills = [...listSkills()].sort((a, b) => a.price - b.price);

  const buy = (skill) => {
    if (owned.includes(skill.id) || !spend(skill.price)) return;
    addSkill(skill.id);
    push(t('shop.bought', { skill: skill.name }));
  };

  return (
    <div className="skill-inventory shop-panel" onMouseDown={(e) => e.stopPropagation()}>
      <h4>
        {t('shop.title')}
        <button className="skill-inventory-close" onClick={onClose} aria-label={t('common.cancel')}>×</button>
      </h4>
      <p className="shop-status">
        <span>{t('shop.gold', { gold })}</span>
        <span>{t('shop.closesIn', { time: formatClock(secondsLeft) })}</span>
      </p>
      {skills.length === 0 && <p className="hint">{t('shop.empty')}</p>}
      {skills.map((skill) => {
        const has = owned.includes(skill.id);
        return (
          <div className="skill-inventory-item" key={skill.id}>
            <SkillIcon skill={skill} size={36} />
            <div className="grow">
              <strong>{skill.name}</strong>
              <span className="meta">
                {t(`skills.power.${skill.power}`)} • {t('skills.mana')} {skill.mana} • {skill.cooldown}s
              </span>
            </div>
            <button disabled={has || gold < skill.price} onClick={() => buy(skill)}>
              {has ? t('shop.owned') : t('shop.buy', { price: skill.price })}
            </button>
          </div>
        );
      })}
    </div>
  );
}
