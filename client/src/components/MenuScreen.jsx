import React, { useState } from 'react';
import { PlayView } from './menu/PlayView.jsx';
import { MultiplayerView } from './menu/MultiplayerView.jsx';
import { CreateRoomView } from './menu/CreateRoomView.jsx';
import { JoinRoomView } from './menu/JoinRoomView.jsx';
import { MapListView } from './menu/MapListView.jsx';
import { ObjectLibraryView } from './menu/ObjectLibraryView.jsx';
import { SkillGeneratorView } from './menu/SkillGeneratorView.jsx';
import { SettingsView } from './menu/SettingsView.jsx';
import { MenuBackdrop } from './MenuBackdrop.jsx';
import { MapEditor } from './editor/MapEditor.jsx';
import { CharacterListView } from './menu/CharacterListView.jsx';
import { CharacterEditor } from './character/CharacterEditor.jsx';
import { useT } from '../i18n/index.js';

export function MenuScreen({ onCreateRoom, onJoinRoom }) {
  const t = useT();
  const [view, setView] = useState('main'); // main, play, single, multiplayer, create, join, maps, editor, characters, character-editor, skills, settings
  const [editingMapId, setEditingMapId] = useState(null); // null = new map
  const [editingCharacterId, setEditingCharacterId] = useState(null); // null = new character

  if (view === 'editor') {
    return <MapEditor mapId={editingMapId} onExit={() => setView('maps')} />;
  }
  if (view === 'character-editor') {
    return <CharacterEditor characterId={editingCharacterId} onExit={() => setView('characters')} />;
  }

  let content;
  switch (view) {
    case 'play':
      content = <PlayView onNavigate={setView} />;
      break;
    case 'single':
      content = <CreateRoomView singlePlayer onBack={() => setView('play')} onCreateRoom={onCreateRoom} />;
      break;
    case 'multiplayer':
      content = <MultiplayerView onNavigate={setView} />;
      break;
    case 'create':
      content = <CreateRoomView onBack={() => setView('multiplayer')} onCreateRoom={onCreateRoom} />;
      break;
    case 'join':
      content = <JoinRoomView onBack={() => setView('multiplayer')} onJoinRoom={onJoinRoom} />;
      break;
    case 'maps':
      content = (
        <MapListView
          onBack={() => setView('main')}
          onNavigate={setView}
          onEdit={(id) => {
            setEditingMapId(id);
            setView('editor');
          }}
        />
      );
      break;
    case 'map-objects':
      content = <ObjectLibraryView onBack={() => setView('main')} onNavigate={setView} />;
      break;
    case 'characters':
      content = (
        <CharacterListView
          onBack={() => setView('main')}
          onEdit={(id) => {
            setEditingCharacterId(id);
            setView('character-editor');
          }}
        />
      );
      break;
    case 'skills':
      content = <SkillGeneratorView onBack={() => setView('main')} />;
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
          <button className="fantasy-btn" onClick={() => setView('characters')}>
            {t('menu.characterGenerator')}
          </button>
          <button className="fantasy-btn" onClick={() => setView('skills')}>
            {t('menu.skillGenerator')}
          </button>
          <button className="fantasy-btn" onClick={() => setView('settings')}>
            {t('menu.settings')}
          </button>
        </div>
      );
  }

  return <MenuBackdrop wide={view === 'play' || view === 'map-objects' || view === 'skills'}>{content}</MenuBackdrop>;
}
