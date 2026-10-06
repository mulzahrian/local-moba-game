import React from 'react';

const POWER_GLYPHS = { vanish: '👻', heal: '💚', control: '⛓️', fire: '🔥', necromancer: '💀', summoner: '🌀', support: '🛡️' };

// The icon uploaded for a skill, or a glyph of its power when it has none.
export function SkillIcon({ skill, size = 40 }) {
  const style = { width: size, height: size, fontSize: size * 0.55 };
  if (skill?.iconUrl) return <img className="skill-icon" src={skill.iconUrl} alt="" style={style} />;
  return (
    <span className="skill-icon skill-icon-glyph" style={style}>
      {POWER_GLYPHS[skill?.power] || '✨'}
    </span>
  );
}
