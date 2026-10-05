import React, { useEffect, useState } from 'react';
import { useT } from '../../i18n/index.js';
import { useSettingsStore } from '../../store/settingsStore.js';
import { mapApi } from '../../map/mapApi.js';
import { SKY_OPTIONS, WEATHER_OPTIONS, DEFAULT_SKY, DEFAULT_WEATHER } from '../../map/environment.js';

const DEFAULT_MAP_ID = '';

export function CreateRoomView({ onBack, onCreateRoom }) {
  const t = useT();
  const playerName = useSettingsStore((s) => s.playerName);
  const [maps, setMaps] = useState([]);
  const [selected, setSelected] = useState(DEFAULT_MAP_ID);
  const [sky, setSky] = useState(DEFAULT_SKY);
  const [weather, setWeather] = useState(DEFAULT_WEATHER);
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

  // Picking a map starts from its saved sky/weather; the host can still change them below.
  const selectMap = (id, map) => {
    setSelected(id);
    setSky(map?.sky || DEFAULT_SKY);
    setWeather(map?.weather || DEFAULT_WEATHER);
  };

  const choiceRow = (label, options, value, onChange, prefix) => (
    <div className="setting-row">
      <span className="setting-label">{label}</span>
      <div className="toggle-group">
        {options.map((option) => (
          <button key={option} className={`toggle-btn ${value === option ? 'active' : ''}`} onClick={() => onChange(option)}>
            {t(prefix + option)}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="menu-panel wide">
      <h2 className="panel-title">{t('create.title')}</h2>

      <div className="map-pick-list">
        <button
          className={`map-card ${selected === DEFAULT_MAP_ID ? 'selected' : ''}`}
          onClick={() => selectMap(DEFAULT_MAP_ID, null)}
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
            onClick={() => selectMap(map.id, map)}
          >
            <span className="map-card-name">{map.name}</span>
            <span className="map-card-meta">{map.objectCount} {t('common.objects')}</span>
          </button>
        ))}
      </div>

      {choiceRow(t('create.sky'), SKY_OPTIONS, sky, setSky, 'editor.sky.')}
      {choiceRow(t('create.weather'), WEATHER_OPTIONS, weather, setWeather, 'editor.weather.')}

      <div className="menu-buttons">
        <button className="fantasy-btn primary" onClick={() => onCreateRoom(playerName.trim(), selected || null, { sky, weather })}>
          {t('create.start')}
        </button>
        <button className="fantasy-btn ghost" onClick={onBack}>{t('common.back')}</button>
      </div>
    </div>
  );
}
