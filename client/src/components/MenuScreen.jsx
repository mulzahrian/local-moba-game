import React, { useState } from 'react';
import { PlayView } from './menu/PlayView.jsx';
import { CreateRoomView } from './menu/CreateRoomView.jsx';
import { JoinRoomView } from './menu/JoinRoomView.jsx';
import { MapListView } from './menu/MapListView.jsx';
import { SettingsView } from './menu/SettingsView.jsx';
import { MenuBackdrop } from './MenuBackdrop.jsx';
import { MapEditor } from './editor/MapEditor.jsx';
import { useT } from '../i18n/index.js';

export function MenuScreen({ onCreateRoom, onJoinRoom }) {
  const t = useT();
  const [view, setView] = useState('main'); // main, play, create, join, maps, editor, settings
  const [editingMapId, setEditingMapId] = useState(null); // null = new map

  if (view === 'editor') {
    return <MapEditor mapId={editingMapId} onExit={() => setView('maps')} />;
  }

  let content;
  switch (view) {
    case 'play':
      content = <PlayView onNavigate={setView} />;
      break;
    case 'create':
      content = <CreateRoomView onBack={() => setView('play')} onCreateRoom={onCreateRoom} />;
      break;
    case 'join':
      content = <JoinRoomView onBack={() => setView('play')} onJoinRoom={onJoinRoom} />;
      break;
    case 'maps':
      content = (
        <MapListView
          onBack={() => setView('main')}
          onEdit={(id) => {
            setEditingMapId(id);
            setView('editor');
          }}
        />
      );
      break;
    case 'settings':
      content = <SettingsView onBack={() => setView('main')} />;
      break;
    default:
      content = (
        <div className="menu-buttons">
          <button className="fantasy-btn primary" onClick={() => setView('play')}>
            {t('menu.playGame')}
          </button>
          <button className="fantasy-btn" onClick={() => setView('maps')}>
            {t('menu.mapGenerator')}
          </button>
          <button className="fantasy-btn" onClick={() => setView('settings')}>
            {t('menu.settings')}
          </button>
        </div>
      );
  }

  return <MenuBackdrop>{content}</MenuBackdrop>;
}
