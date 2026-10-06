import React from 'react';
import { useT } from '../../i18n/index.js';

export function MultiplayerView({ onNavigate }) {
  const t = useT();

  return (
    <div className="menu-panel">
      <h2 className="panel-title">{t('multi.title')}</h2>

      <div className="menu-buttons">
        <button className="fantasy-btn primary" onClick={() => onNavigate('create')}>
          {t('play.createRoom')}
        </button>
        <button className="fantasy-btn" onClick={() => onNavigate('join')}>
          {t('play.joinRoom')}
        </button>
        <button className="fantasy-btn ghost" onClick={() => onNavigate('play')}>
          {t('common.back')}
        </button>
      </div>
    </div>
  );
}
