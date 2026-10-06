import React, { useEffect, useState } from 'react';
import { getCharacterDefinition } from '../character/characterAssets.js';
import { useT } from '../i18n/index.js';
import { CharacterAvatar } from './character/CharacterAvatar.jsx';
import { ChevronIcon } from './HudIcons.jsx';

const percent = (value, max) => Math.max(0, Math.min(100, (value / (max || 1)) * 100));

// The local hero: profile picture with level, health and mana. Can be minimized to a compact strip.
export function HeroCard({ player }) {
  const t = useT();
  const [minimized, setMinimized] = useState(false);
  const [character, setCharacter] = useState(null);
  const characterId = player?.characterId;

  useEffect(() => {
    let cancelled = false;
    getCharacterDefinition(characterId)
      .then((def) => !cancelled && setCharacter(def))
      .catch(() => !cancelled && setCharacter(null));
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  if (!player) return null;

  const maxHealth = player.maxHealth || 100;
  const maxMana = player.maxMana || 100;
  const health = Math.max(0, Math.round(player.health));
  const mana = Math.max(0, Math.round(player.mana));
  const low = health / maxHealth <= 0.3;

  return (
    <div className={`hero-card ${minimized ? 'minimized' : ''} ${player.dead ? 'dead' : ''}`}>
      <div className="hero-portrait">
        <CharacterAvatar character={{ name: character?.name || player.name, imageUrl: character?.imageUrl }} size={96} />
        <span className="hero-level" title={t('hud.level')}>{player.level}</span>
      </div>

      <div className="hero-body">
        <div className="hero-name">
          <strong>{player.name}</strong>
          <span>{player.role ? t(`role.${player.role}`) : ''}</span>
        </div>

        <div className={`hero-bar hp ${low ? 'low' : ''}`} title={t('hud.health')}>
          <span className="trail" style={{ width: `${percent(health, maxHealth)}%` }} />
          <span className="fill" style={{ width: `${percent(health, maxHealth)}%` }} />
          <span className="value">{health} / {maxHealth}</span>
        </div>
        <div className="hero-bar mana" title={t('hud.mana')}>
          <span className="trail" style={{ width: `${percent(mana, maxMana)}%` }} />
          <span className="fill" style={{ width: `${percent(mana, maxMana)}%` }} />
          <span className="value">{mana} / {maxMana}</span>
        </div>
      </div>

      <button
        className="hud-collapse hero-collapse"
        onClick={() => setMinimized((value) => !value)}
        aria-label={minimized ? t('hud.maximize') : t('hud.minimize')}
        title={minimized ? t('hud.maximize') : t('hud.minimize')}
      >
        <ChevronIcon open={!minimized} />
      </button>
    </div>
  );
}
