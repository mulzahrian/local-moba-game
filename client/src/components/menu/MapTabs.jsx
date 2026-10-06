import React from 'react';
import { useT } from '../../i18n/index.js';

// Sub menu switcher shared by the Map Generator pages: the map list, the object library and the monsters.
export function MapTabs({ active, onNavigate }) {
  const t = useT();
  const tabs = [
    ['maps', 'maps.tab.maps'],
    ['map-objects', 'maps.tab.objects'],
    ['map-monsters', 'maps.tab.monsters']
  ];
  return (
    <div className="toggle-group map-tabs">
      {tabs.map(([view, label]) => (
        <button key={view} className={`toggle-btn ${active === view ? 'active' : ''}`} onClick={() => onNavigate(view)}>
          {t(label)}
        </button>
      ))}
    </div>
  );
}