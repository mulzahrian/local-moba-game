import React, { useEffect, useState } from 'react';
import { ACTION_SLOTS, getActionDef, getManaCost } from '../../../shared/characterConfig.js';
import { skillSlot } from '../../../shared/skillConfig.js';
import { useT } from '../i18n/index.js';
import { ensureSkillLibrary, getSkill, listSkills } from '../skill/skillLibrary.js';
import { useSettingsStore } from '../store/settingsStore.js';
import { useSkillStore } from '../store/skillStore.js';
import { useWalletStore } from '../store/walletStore.js';
import { SkillIcon } from './SkillIcon.jsx';
import { SkillInventory } from './SkillInventory.jsx';
import { CoinIcon, EmoteIcon, JumpIcon, RuneIcon, ShopOrbIcon, SpellbookIcon, SwordIcon } from './HudIcons.jsx';
import { ShopPanel, formatClock } from './ShopPanel.jsx';
import '../styles/Skills.css';

const SLOT_GLYPHS = {
  attack1: SwordIcon,
  skill1: (props) => <RuneIcon variant={0} {...props} />,
  skill2: (props) => <RuneIcon variant={1} {...props} />,
  skill3: (props) => <RuneIcon variant={2} {...props} />,
  emote: EmoteIcon,
  jump: JumpIcon
};
const BAR_SLOTS = ACTION_SLOTS.filter((slot) => slot !== 'attack2'); // attack2 is the follow-up of attack1

// Cooldown / mana overview of the local player's actions. Polls the running GameScene a few times a second.
export function SkillBar({ getScene }) {
  const t = useT();
  const language = useSettingsStore((s) => s.language);
  const equipped = useSkillStore((s) => s.equipped);
  const [state, setState] = useState(null);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const gold = useWalletStore((s) => s.gold);
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
      if (typing) return;
      if (event.code === 'KeyK') setInventoryOpen((open) => !open);
      if (event.code === 'KeyB') setShopOpen((open) => !open);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!state) return null;

  // The shop button only exists near your own tower, and only while the shop is open.
  const shopAvailable = Boolean(state.shop?.nearBase && state.shop.secondsLeft > 0 && !state.dead);

  const cooldownOf = (slot) => {
    const cooldown = state.cooldowns[slot];
    return { cooldown, fraction: cooldown ? cooldown.remaining / cooldown.total : 0 };
  };
  const lacks = (cost) => state.mana !== null && state.mana !== undefined && state.mana < cost;
  const cooldownOverlay = ({ cooldown, fraction }) =>
    fraction > 0 && (
      <span className="slot-cooldown" style={{ height: `${fraction * 100}%` }}>
        <b>{(cooldown.remaining / 1000).toFixed(1)}</b>
      </span>
    );

  return (
    <>
      <div className="hud-skills">
        <div className="hud-abilities">
          {BAR_SLOTS.map((slot) => {
            const def = getActionDef(state.role, slot);
            const cd = cooldownOf(slot);
            const cost = getManaCost(state.role, slot);
            const label = def?.name ? def.name[language] || def.name.en : t(`anim.${slot}`);
            const Glyph = SLOT_GLYPHS[slot] || SLOT_GLYPHS.skill1;
            return (
              <div
                key={slot}
                className={`hud-slot ability ${lacks(cost) ? 'no-mana' : ''} ${state.dead ? 'dead' : ''} ${cd.fraction > 0 ? 'cooling' : ''}`}
                title={label}
              >
                <Glyph size={30} />
                <span className="slot-name">{label}</span>
                {cost > 0 && <span className="slot-cost">{cost}</span>}
                {cooldownOverlay(cd)}
              </div>
            );
          })}
        </div>

        <div className="hud-items">
          {equipped.map((id, index) => {
            const skill = id ? getSkill(id) : null;
            if (!skill) return <div key={`empty-${index}`} className="hud-slot item empty" title={t('skills.emptySlot')} />;
            const cd = cooldownOf(skillSlot(id));
            return (
              <div
                key={id}
                className={`hud-slot item ${lacks(skill.mana) ? 'no-mana' : ''} ${state.dead ? 'dead' : ''} ${cd.fraction > 0 ? 'cooling' : ''}`}
                title={skill.name}
              >
                <SkillIcon skill={skill} size={36} />
                {skill.mana > 0 && <span className="slot-cost">{skill.mana}</span>}
                {cooldownOverlay(cd)}
              </div>
            );
          })}
        </div>

        <div className="hud-purse">
          <div className="hud-gold" title={t('shop.goldTitle')}>
            <CoinIcon size={22} />
            <span>{gold.toLocaleString()}</span>
          </div>
          {shopAvailable && (
            <button className="hud-btn shop" onClick={() => setShopOpen((open) => !open)}>
              <ShopOrbIcon size={28} />
              <span className="hud-btn-label">{t('shop.button')}</span>
              <span className="hud-btn-sub">{formatClock(state.shop.secondsLeft)}</span>
            </button>
          )}
          <button className="hud-btn" onClick={() => setInventoryOpen((open) => !open)}>
            <SpellbookIcon size={28} />
            <span className="hud-btn-label">{t('skills.inventoryButton')}</span>
          </button>
        </div>
      </div>
      {inventoryOpen && <SkillInventory onClose={() => setInventoryOpen(false)} />}
      {shopOpen && shopAvailable && <ShopPanel secondsLeft={state.shop.secondsLeft} onClose={() => setShopOpen(false)} />}
    </>
  );
}