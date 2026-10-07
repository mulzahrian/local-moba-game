import React, { useEffect, useState } from 'react';
import { useT } from '../../i18n/index.js';
import { useSettingsStore } from '../../store/settingsStore.js';
import { mapApi } from '../../map/mapApi.js';
import { TEAM_SIZES, DEFAULT_TEAM_SIZE } from '../../../../shared/matchConfig.js';
import { SKY_OPTIONS, WEATHER_OPTIONS, DEFAULT_SKY, DEFAULT_WEATHER } from '../../map/environment.js';

const DEFAULT_MAP_ID = '';

// Picks the battlefield and the N vs N format; singlePlayer fills the other places with computer players.
export function CreateRoomView({ onBack, onCreateRoom, singlePlayer = false }) {
  const t = useT();
  const playerName = useSettingsStore((s) => s.playerName);
  const [maps, setMaps] = useState([]);
  const [selected, setSelected] = useState(DEFAULT_MAP_ID);
  const [sky, setSky] = useState(DEFAULT_SKY);
  const [weather, setWeather] = useState(DEFAULT_WEATHER);
  const [teamSize, setTeamSize] = useState(DEFAULT_TEAM_SIZE);
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
      <h2 className="panel-title">{t(singlePlayer ? 'create.titleSingle' : 'create.title')}</h2>

      <div className="map-pick-list">
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

        <button
          className={`map-card ${selected === DEFAULT_MAP_ID ? 'selected' : ''}`}
          onClick={() => selectMap(DEFAULT_MAP_ID, null)}
        >
          <span className="map-card-name">{t('create.defaultMap')}</span>
          <span className="map-card-meta">{t('create.defaultMapDesc')}</span>
        </button>
      </div>

      <div className="setting-row">
        <span className="setting-label">{t('create.versus')}</span>
        <div className="toggle-group">
          {TEAM_SIZES.map((size) => (
            <button key={size} className={`toggle-btn ${teamSize === size ? 'active' : ''}`} onClick={() => setTeamSize(size)}>
              {size}v{size}
            </button>
          ))}
        </div>
      </div>
      <p className="hint">
        {singlePlayer ? t('create.versusHintSingle', { others: teamSize * 2 - 1 }) : t('create.versusHint', { total: teamSize * 2 })}
      </p>
      {choiceRow(t('create.sky'), SKY_OPTIONS, sky, setSky, 'editor.sky.')}
      {choiceRow(t('create.weather'), WEATHER_OPTIONS, weather, setWeather, 'editor.weather.')}

      <div className="menu-buttons">
        <button className="fantasy-btn primary" onClick={() => onCreateRoom(playerName.trim(), selected || null, { sky, weather }, { teamSize, singlePlayer })}>
          {t(singlePlayer ? 'create.startSingle' : 'create.start')}
        </button>
        <button className="fantasy-btn ghost" onClick={onBack}>{t('common.back')}</button>
      </div>
    </div>
  );
}
