import React from 'react';
import '../../styles/Character.css';

// Profile picture of a character; falls back to the first letter of its name.
export function CharacterAvatar({ character, size = 56 }) {
  return (
    <span className="char-avatar" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {character.imageUrl ? <img src={character.imageUrl} alt="" draggable={false} /> : (character.name || '?').charAt(0)}
    </span>
  );
}
