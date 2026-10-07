import React, { useEffect, useState } from 'react';
import { getCharacterDefinition } from '../../character/characterAssets.js';
import { CharacterAvatar } from './CharacterAvatar.jsx';

// Profile picture of the character a player picked (looked up by id; the name is the fallback letter).
export function PlayerAvatar({ player, size = 28 }) {
  const [imageUrl, setImageUrl] = useState(null);
  const characterId = player.characterId;

  useEffect(() => {
    let cancelled = false;
    getCharacterDefinition(characterId)
      .then((def) => !cancelled && setImageUrl(def.imageUrl))
      .catch(() => !cancelled && setImageUrl(null));
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  return <CharacterAvatar character={{ name: player.characterName || player.name, imageUrl }} size={size} />;
}
