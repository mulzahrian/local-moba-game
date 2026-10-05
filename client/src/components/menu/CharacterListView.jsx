import React, { useCallback, useEffect, useState } from 'react';
import { characterApi } from '../../character/characterApi.js';
import { invalidateCharacter } from '../../character/characterAssets.js';
import { useT } from '../../i18n/index.js';
import { CharacterAvatar } from '../character/CharacterAvatar.jsx';
import '../../styles/Character.css';

export function CharacterListView({ onBack, onEdit }) {
  const t = useT();
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setCharacters(await characterApi.list());
      setError('');
    } catch {
      setError(t('chars.loadError'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const remove = async (character) => {
    if (!window.confirm(t('chars.confirmDelete', { name: character.name }))) return;
    try {
      await characterApi.remove(character.id);
      invalidateCharacter(character.id);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="menu-panel wide">
      <h2 className="panel-title">{t('chars.title')}</h2>

      <div className="map-pick-list">
        {loading && <p className="hint">{t('common.loading')}</p>}
        {error && <p className="hint error">{error}</p>}
        {!loading && !error && characters.length === 0 && <p className="hint">{t('chars.empty')}</p>}

        {characters.map((character) => (
          <div key={character.id} className="map-card row">
            <CharacterAvatar character={character} size={48} />
            <div className="map-card-info char-list-info">
              <span className="map-card-name">{character.name}</span>
              <span className="map-card-meta">
                {t(`role.${character.role}`)} • {t('chars.updated')} {new Date(character.updatedAt).toLocaleString()}
              </span>
            </div>
            <div className="map-card-actions">
              <button className="mini-btn" onClick={() => onEdit(character.id)}>{t('chars.edit')}</button>
              <button className="mini-btn danger" onClick={() => remove(character)}>{t('common.delete')}</button>
            </div>
          </div>
        ))}
      </div>

      <div className="menu-buttons">
        <button className="fantasy-btn primary" onClick={() => onEdit(null)}>{t('chars.new')}</button>
        <button className="fantasy-btn ghost" onClick={onBack}>{t('common.back')}</button>
      </div>
    </div>
  );
}
