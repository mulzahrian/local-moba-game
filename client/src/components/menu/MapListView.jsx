import React, { useCallback, useEffect, useState } from 'react';
import { useT } from '../../i18n/index.js';
import { mapApi } from '../../map/mapApi.js';

export function MapListView({ onBack, onEdit }) {
  const t = useT();
  const [maps, setMaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setMaps(await mapApi.list());
      setError('');
    } catch {
      setError(t('maps.loadError'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const remove = async (map) => {
    if (!window.confirm(t('maps.confirmDelete', { name: map.name }))) return;
    try {
      await mapApi.remove(map.id);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="menu-panel wide">
      <h2 className="panel-title">{t('maps.title')}</h2>

      <div className="map-pick-list">
        {loading && <p className="hint">{t('common.loading')}</p>}
        {error && <p className="hint error">{error}</p>}
        {!loading && !error && maps.length === 0 && <p className="hint">{t('maps.empty')}</p>}

        {maps.map((map) => (
          <div key={map.id} className="map-card row">
            <div className="map-card-info">
              <span className="map-card-name">{map.name}</span>
              <span className="map-card-meta">
                {map.objectCount} {t('common.objects')} • {t('maps.updated')}{' '}
                {new Date(map.updatedAt).toLocaleString()}
              </span>
            </div>
            <div className="map-card-actions">
              <button className="mini-btn" onClick={() => onEdit(map.id)}>{t('maps.edit')}</button>
              <button className="mini-btn danger" onClick={() => remove(map)}>{t('common.delete')}</button>
            </div>
          </div>
        ))}
      </div>

      <div className="menu-buttons">
        <button className="fantasy-btn primary" onClick={() => onEdit(null)}>{t('maps.new')}</button>
        <button className="fantasy-btn ghost" onClick={onBack}>{t('common.back')}</button>
      </div>
    </div>
  );
}
