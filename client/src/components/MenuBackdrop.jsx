import React from 'react';
import { EmberCanvas } from './EmberCanvas.jsx';
import { MainMenuCharacter } from './MainMenuCharacter.jsx';
import { useT } from '../i18n/index.js';
import backgroundUrl from '../public/img/background.png';
import logoUrl from '../public/img/rapp-moba.png';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/800.css';
import '../styles/Menu.css';

// Shared fantasy menu shell: background art, fire glow, rising embers and the game title.
export function MenuBackdrop({ children, wide = false, showCharacter = false }) {
  const t = useT();
  return (
    <div className="menu-container" style={{ backgroundImage: `url(${backgroundUrl})` }}>
      <div className="menu-vignette" />
      <div className="menu-fire-glow" />
      <EmberCanvas />
      {showCharacter && <MainMenuCharacter />}

      <div className={`menu-content ${wide ? 'wide' : ''}`}>
        <div className="menu-header">
          <div className="menu-logo-wrap">
            <img className="menu-logo" src={logoUrl} alt="RAPP MOBA" />
          </div>
          <div className="title-ornament" />
          <h1 className="title">{t('app.title')}</h1>
          <p className="subtitle">{t('app.subtitle')}</p>
          <div className="title-ornament" />
        </div>
        {children}
      </div>
    </div>
  );
}
