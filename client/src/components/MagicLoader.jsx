import React from 'react';

const RUNES = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ'];

// Rotating magic-circle spinner with orbiting sparks.
export function MagicLoader() {
  return (
    <div className="magic-loader" aria-hidden="true">
      <div className="magic-ring ring-outer">
        {RUNES.map((rune, i) => (
          <span
            key={rune}
            className="magic-rune"
            style={{ transform: `rotate(${i * 45}deg) translateY(-62px)` }}
          >
            {rune}
          </span>
        ))}
      </div>
      <div className="magic-ring ring-mid" />
      <svg className="magic-ring ring-star" viewBox="0 0 100 100">
        <polygon points="50,6 61,38 94,38 67,58 77,90 50,70 23,90 33,58 6,38 39,38" />
      </svg>
      <div className="magic-ring ring-inner" />
      <div className="magic-core" />
      <div className="magic-orbit orbit-a"><i /></div>
      <div className="magic-orbit orbit-b"><i /></div>
      <div className="magic-orbit orbit-c"><i /></div>
    </div>
  );
}
