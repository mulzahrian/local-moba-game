import React, { useCallback, useEffect, useState } from 'react';
import { useT } from '../../i18n/index.js';
import { listOpenRooms } from '../../services/roomApi.js';
import { useSettingsStore } from '../../store/settingsStore.js';

const REFRESH_MS = 3000;

export function JoinRoomView({ onBack, onJoinRoom }) {
  const t = useT();
  const playerName = useSettingsStore((s) => s.playerName);
  const [code, setCode] = useState('');
  const [rooms, setRooms] = useState(null); // null until the first answer
  const [error, setError] = useState(false);

  const refresh = useCallback(() => {
    listOpenRooms()
      .then((list) => {
        setRooms(list);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);

  // The list follows the server: full, started, finished and abandoned rooms drop out of it
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const join = (roomCode = code) => {
    if (roomCode.trim()) onJoinRoom(playerName.trim(), roomCode.trim());
  };

  return (
    <div className="menu-panel">
      <h2 className="panel-title">{t('join.title')}</h2>

      <label className="field-label">{t('join.available')}</label>
      <div className="room-list">
        {error && <p className="hint error">{t('join.listError')}</p>}
        {!error && rooms === null && <p className="hint">{t('common.loading')}</p>}
        {!error && rooms?.length === 0 && <p className="hint">{t('join.noRooms')}</p>}
        {!error && rooms?.map((room) => (
          <button
            key={room.code}
            className="room-row"
            disabled={room.players >= room.maxPlayers}
            onClick={() => join(room.code)}
          >
            <span className="room-row-info">
              <strong>{room.hostName || room.code}</strong>
              <span>{room.mapName || t('create.defaultMap')} • {room.teamSize}v{room.teamSize}</span>
            </span>
            <span className="room-row-code">{room.code}</span>
            <span className="room-row-count">{room.players}/{room.maxPlayers}</span>
          </button>
        ))}
      </div>

      <label className="field-label">{t('join.codeLabel')}</label>
      <input
        type="text"
        className="fantasy-input code"
        placeholder={t('join.codePlaceholder')}
        value={code}
        maxLength={6}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        onKeyDown={(e) => e.key === 'Enter' && join()}
      />

      <div className="menu-buttons">
        <button className="fantasy-btn primary" disabled={!code.trim()} onClick={() => join()}>
          {t('join.button')}
        </button>
        <button className="fantasy-btn ghost" onClick={onBack}>{t('common.back')}</button>
      </div>
    </div>
  );
}
