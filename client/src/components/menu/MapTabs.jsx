import React from 'react';
import { useT } from '../../i18n/index.js';

// Sub menu switcher shared by the Map Generator pages: the map list and the object library.
export function MapTabs({ active, onNavigate }) {
  const t = useT();
  return (
    <div className="toggle-group map-tabs">
      <button className={`toggle-btn ${active === 'maps' ? 'active' : ''}`} onClick={() => onNavigate('maps')}>
        {t('maps.tab.maps')}
      </button>
      <button
        className={`toggle-btn ${active === 'map-objects' ? 'active' : ''}`}
        onClick={() => onNavigate('map-objects')}
      >
        {t('maps.tab.objects')}
      </button>
    </div>
  );
}
