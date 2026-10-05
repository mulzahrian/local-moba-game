import React, { useEffect, useState } from 'react';
import { useT } from '../../i18n/index.js';
import { useSettingsStore } from '../../store/settingsStore.js';
import { mapApi } from '../../map/mapApi.js';

const DEFAULT_MAP_ID = '';

export function CreateRoomView({ onBack, onCreateRoom }) {
  const t = useT();
  const playerName = useSettingsStore((s) => s.playerName);
  const [maps, setMaps] = useState([]);
  const [selected, setSelected] = useState(DEFAULT_MAP_ID);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    mapApi
      .list()
      .then((list) => !cancelled && setMaps(list))
      .catch(() => !cancelled && setError(t('create.loadError')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="menu-panel wide">
      <h2 className="panel-title">{t('create.title')}</h2>

      <div className="map-pick-list">
        <button
          className={`map-card ${selected === DEFAULT_MAP_ID ? 'selected' : ''}`}
          onClick={() => setSelected(DEFAULT_MAP_ID)}
        >
          <span className="map-card-name">{t('create.defaultMap')}</span>
          <span className="map-card-meta">{t('create.defaultMapDesc')}</span>
        </button>

        {loading && <p className="hint">{t('common.loading')}</p>}
        {error && <p className="hint error">{error}</p>}
        {!loading && !error && maps.length === 0 && <p className="hint">{t('create.noMaps')}</p>}

        {maps.map((map) => (
          <button
            key={map.id}
            className={`map-card ${selected === map.id ? 'selected' : ''}`}
            onClick={() => setSelected(map.id)}
          >
            <span className="map-card-name">{map.name}</span>
            <span className="map-card-meta">{map.objectCount} {t('common.objects')}</span>
          </button>
        ))}
      </div>

      <div className="menu-buttons">
        <button className="fantasy-btn primary" onClick={() => onCreateRoom(playerName.trim(), selected || null)}>
          {t('create.start')}
        </button>
        <button className="fantasy-btn ghost" onClick={onBack}>{t('common.back')}</button>
      </div>
    </div>
  );
}
