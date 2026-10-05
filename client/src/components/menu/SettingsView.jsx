import React from 'react';
import { useT } from '../../i18n/index.js';
import { LANGUAGES } from '../../i18n/translations.js';
import { useSettingsStore } from '../../store/settingsStore.js';

export function SettingsView({ onBack }) {
  const t = useT();
  const musicOn = useSettingsStore((s) => s.musicOn);
  const setMusicOn = useSettingsStore((s) => s.setMusicOn);
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  return (
    <div className="menu-panel">
      <h2 className="panel-title">{t('settings.title')}</h2>

      <div className="setting-row">
        <span className="setting-label">{t('settings.music')}</span>
        <div className="toggle-group">
          <button className={`toggle-btn ${musicOn ? 'active' : ''}`} onClick={() => setMusicOn(true)}>
            {t('common.on')}
          </button>
          <button className={`toggle-btn ${!musicOn ? 'active' : ''}`} onClick={() => setMusicOn(false)}>
            {t('common.off')}
          </button>
        </div>
      </div>

      <div className="setting-row">
        <span className="setting-label">{t('settings.language')}</span>
        <div className="toggle-group">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              className={`toggle-btn ${language === lang.code ? 'active' : ''}`}
              onClick={() => setLanguage(lang.code)}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      <div className="menu-buttons">
        <button className="fantasy-btn ghost" onClick={onBack}>{t('common.back')}</button>
      </div>
    </div>
  );
}
