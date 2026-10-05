import React, { useEffect, useState } from 'react';
import { listCharacters } from '../../character/characterAssets.js';
import { useT } from '../../i18n/index.js';
import { CharacterAvatar } from './CharacterAvatar.jsx';
import { RoleSkills } from './RoleSkills.jsx';
import '../../styles/Character.css';

// Grid of playable characters (the default hero plus everything made in the Character Generator).
export function CharacterPicker({ value, onChange }) {
  const t = useT();
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listCharacters()
      .then((list) => {
        if (cancelled) return;
        setCharacters(list);
        // A remembered character may have been deleted meanwhile
        if (value && !list.some((c) => c.id === value)) onChange('');
      })
      .catch(() => {
        if (cancelled) return;
        setError(t('pick.loadError'));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = characters.find((c) => c.id === value);

  return (
    <div className="char-picker">
      {loading && <p className="hint">{t('common.loading')}</p>}
      {error && <p className="hint error">{error}</p>}
      <div className="char-grid">
        {characters.map((character) => (
          <button
            key={character.id}
            className={`char-card ${character.id === value ? 'selected' : ''}`}
            onClick={() => onChange(character.id)}
          >
            <CharacterAvatar character={character} size={64} />
            <span className="char-card-name">{character.name}</span>
            <span className="char-card-role">
              {t(`role.${character.role}`)}
              {character.builtin ? ` • ${t('pick.builtin')}` : ''}
            </span>
          </button>
        ))}
      </div>
      {selected && <RoleSkills role={selected.role} />}
    </div>
  );
}
