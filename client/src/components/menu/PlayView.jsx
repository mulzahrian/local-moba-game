import React from 'react';
import { useT } from '../../i18n/index.js';
import { useSettingsStore } from '../../store/settingsStore.js';
import { CharacterPicker } from '../character/CharacterPicker.jsx';

export function PlayView({ onNavigate }) {
  const t = useT();
  const playerName = useSettingsStore((s) => s.playerName);
  const setPlayerName = useSettingsStore((s) => s.setPlayerName);
  const characterId = useSettingsStore((s) => s.characterId);
  const setCharacterId = useSettingsStore((s) => s.setCharacterId);
  const ready = playerName.trim().length > 0 && characterId !== '';

  return (
    <div className="menu-panel">
      <h2 className="panel-title">{t('play.title')}</h2>

      <label className="field-label" htmlFor="hero-name">{t('play.playerName')}</label>
      <input
        id="hero-name"
        type="text"
        className="fantasy-input"
        placeholder={t('play.enterName')}
        value={playerName}
        maxLength={20}
        onChange={(e) => setPlayerName(e.target.value)}
      />

      <label className="field-label char-picker-label">{t('pick.title')}</label>
      <CharacterPicker value={characterId} onChange={setCharacterId} />
      {characterId === '' && <p className="hint">{t('pick.required')}</p>}

      <div className="menu-buttons">
        <button className="fantasy-btn primary" disabled={!ready} onClick={() => onNavigate('single')}>
          {t('play.singlePlayer')}
        </button>
        <button className="fantasy-btn" disabled={!ready} onClick={() => onNavigate('multiplayer')}>
          {t('play.multiplayer')}
        </button>
        <button className="fantasy-btn ghost" onClick={() => onNavigate('main')}>
          {t('common.back')}
        </button>
      </div>
    </div>
  );
}
