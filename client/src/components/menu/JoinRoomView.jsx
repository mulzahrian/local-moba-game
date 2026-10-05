import React, { useState } from 'react';
import { useT } from '../../i18n/index.js';
import { useSettingsStore } from '../../store/settingsStore.js';

export function JoinRoomView({ onBack, onJoinRoom }) {
  const t = useT();
  const playerName = useSettingsStore((s) => s.playerName);
  const [code, setCode] = useState('');

  const join = () => {
    if (code.trim()) onJoinRoom(playerName.trim(), code.trim());
  };

  return (
    <div className="menu-panel">
      <h2 className="panel-title">{t('join.title')}</h2>

      <input
        type="text"
        className="fantasy-input code"
        placeholder={t('join.codePlaceholder')}
        value={code}
        maxLength={6}
        autoFocus
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        onKeyDown={(e) => e.key === 'Enter' && join()}
      />

      <div className="menu-buttons">
        <button className="fantasy-btn primary" disabled={!code.trim()} onClick={join}>
          {t('join.button')}
        </button>
        <button className="fantasy-btn ghost" onClick={onBack}>{t('common.back')}</button>
      </div>
    </div>
  );
}
