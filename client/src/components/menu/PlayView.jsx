import React from 'react';
import { useT } from '../../i18n/index.js';
import { useSettingsStore } from '../../store/settingsStore.js';

export function PlayView({ onNavigate }) {
  const t = useT();
  const playerName = useSettingsStore((s) => s.playerName);
  const setPlayerName = useSettingsStore((s) => s.setPlayerName);
  const ready = playerName.trim().length > 0;

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

      <div className="menu-buttons">
        <button className="fantasy-btn primary" disabled={!ready} onClick={() => onNavigate('create')}>
          {t('play.createRoom')}
        </button>
        <button className="fantasy-btn" disabled={!ready} onClick={() => onNavigate('join')}>
          {t('play.joinRoom')}
        </button>
        <button className="fantasy-btn ghost" onClick={() => onNavigate('main')}>
          {t('common.back')}
        </button>
      </div>
    </div>
  );
}
