import React, { useMemo } from 'react';
import '../styles/GameResult.css';

const SHIELD_OUTER = 'M100 6 L186 34 V110 C186 166 150 208 100 236 C50 208 14 166 14 110 V34 Z';
const SHIELD_INNER = 'M100 24 L168 46 V108 C168 154 138 190 100 214 C62 190 32 154 32 108 V46 Z';

const rand = (min, max) => min + Math.random() * (max - min);

// Laurel branch hugging one side of the shield; `side` is -1 (left) or 1 (right).
function Laurel({ side }) {
  const leaves = Array.from({ length: 8 }, (_, i) => {
    const t = i / 7;
    const angle = -25 + t * 125; // degrees along an ellipse around the lower part of the shield
    const rad = (angle * Math.PI) / 180;
    return {
      x: 100 + side * Math.cos(rad) * 102,
      y: 120 + Math.sin(rad) * 124,
      rotate: side * (angle + 25),
      delay: 0.9 + i * 0.07
    };
  });
  return (
    <g className="gr-laurel">
      {leaves.map((leaf, i) => (
        <ellipse
          key={i}
          className="gr-leaf"
          cx={leaf.x}
          cy={leaf.y}
          rx="7"
          ry="15"
          transform={`rotate(${leaf.rotate} ${leaf.x} ${leaf.y})`}
          fill="url(#gr-leaf)"
          style={{ animationDelay: `${leaf.delay}s` }}
        />
      ))}
    </g>
  );
}

function VictoryEmblem() {
  return (
    <svg className="gr-emblem" viewBox="-30 -20 260 290" aria-hidden="true">
      <defs>
        <linearGradient id="gr-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6cf" />
          <stop offset="0.45" stopColor="#f3bf4c" />
          <stop offset="1" stopColor="#a86a14" />
        </linearGradient>
        <linearGradient id="gr-blue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3f6fd1" />
          <stop offset="1" stopColor="#14275e" />
        </linearGradient>
        <linearGradient id="gr-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d6f08a" />
          <stop offset="1" stopColor="#4c9a3a" />
        </linearGradient>
        <clipPath id="gr-clip-win"><path d={SHIELD_INNER} /></clipPath>
      </defs>
      <Laurel side={-1} />
      <Laurel side={1} />
      <path className="gr-shield-body" d={SHIELD_OUTER} fill="url(#gr-gold)" stroke="#6b4510" strokeWidth="3" />
      <path d={SHIELD_INNER} fill="url(#gr-blue)" stroke="#fff0b8" strokeWidth="2.5" />
      <g clipPath="url(#gr-clip-win)">
        <path d="M100 24 L168 46 V80 C140 70 120 80 100 100 C80 80 60 70 32 80 V46 Z" fill="rgba(255,255,255,0.1)" />
        <g className="gr-sheen">
          <rect x="0" y="0" width="34" height="260" fill="rgba(255,255,255,0.55)" transform="skewX(-20)" />
        </g>
      </g>
      <g className="gr-crest">
        <path
          d="M62 142 L68 92 L88 116 L100 80 L112 116 L132 92 L138 142 Z"
          fill="url(#gr-gold)"
          stroke="#fff0b8"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <rect x="62" y="142" width="76" height="12" rx="3" fill="url(#gr-gold)" stroke="#fff0b8" strokeWidth="2" />
        <circle cx="68" cy="90" r="5" fill="#ff6b6b" />
        <circle cx="100" cy="78" r="6" fill="#6fe0ff" />
        <circle cx="132" cy="90" r="5" fill="#ff6b6b" />
        <circle cx="100" cy="148" r="3.5" fill="#6fe0ff" />
      </g>
      <g className="gr-stars" fill="#fff0b8">
        <path d="M100 168 l4 9 10 1 -7.5 6.5 2.5 10 -9 -5.5 -9 5.5 2.5 -10 -7.5 -6.5 10 -1z" />
      </g>
    </svg>
  );
}

function DefeatEmblem() {
  return (
    <svg className="gr-emblem" viewBox="-30 -20 260 290" aria-hidden="true">
      <defs>
        <linearGradient id="gr-iron" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b4b9c2" />
          <stop offset="0.5" stopColor="#6a707c" />
          <stop offset="1" stopColor="#2c3038" />
        </linearGradient>
        <linearGradient id="gr-blood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7a1d1d" />
          <stop offset="1" stopColor="#2a0707" />
        </linearGradient>
        <linearGradient id="gr-steel" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e6ebf2" />
          <stop offset="1" stopColor="#8a93a3" />
        </linearGradient>
        <clipPath id="gr-clip-lose"><path d={SHIELD_INNER} /></clipPath>
      </defs>
      <g className="gr-shield-body">
        <path d={SHIELD_OUTER} fill="url(#gr-iron)" stroke="#15171b" strokeWidth="3" />
        <path d={SHIELD_INNER} fill="url(#gr-blood)" stroke="#9aa0ab" strokeWidth="2.5" />
        <g clipPath="url(#gr-clip-lose)">
          <path d="M100 24 L168 46 V80 C140 70 120 80 100 100 C80 80 60 70 32 80 V46 Z" fill="rgba(0,0,0,0.25)" />
        </g>
      </g>
      <g className="gr-sword-top">
        <path d="M100 62 L109 76 L106 126 L92 114 L94 76 Z" fill="url(#gr-steel)" stroke="#2c3038" strokeWidth="1.5" strokeLinejoin="round" />
      </g>
      <g className="gr-sword-bottom">
        <path d="M92 114 L106 126 L106 150 L94 150 Z" fill="url(#gr-steel)" stroke="#2c3038" strokeWidth="1.5" strokeLinejoin="round" />
        <rect x="74" y="150" width="52" height="9" rx="3" fill="#a7742a" stroke="#2c3038" strokeWidth="1.5" />
        <rect x="95" y="159" width="10" height="26" rx="2" fill="#5a3a1a" stroke="#2c3038" strokeWidth="1.5" />
        <circle cx="100" cy="190" r="6" fill="#a7742a" stroke="#2c3038" strokeWidth="1.5" />
      </g>
      <g className="gr-cracks" fill="none" stroke="#0b0b0e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path pathLength="1" d="M100 6 L92 44 L108 70 L90 104 L104 138 L88 176 L100 236" />
        <path pathLength="1" d="M92 44 L52 62 L38 96" />
        <path pathLength="1" d="M104 138 L146 154 L170 190" />
        <path pathLength="1" d="M108 70 L150 64 L184 82" />
      </g>
    </svg>
  );
}

// Full-screen result of a match: an animated shield emblem with the verdict below it.
export function GameResultOverlay({ won, title, hint, buttonLabel, onContinue }) {
  const particles = useMemo(
    () =>
      Array.from({ length: won ? 36 : 22 }, (_, i) => ({
        id: i,
        left: rand(0, 100),
        size: rand(won ? 5 : 3, won ? 11 : 7),
        delay: rand(0, 4),
        duration: rand(won ? 4 : 5, won ? 8 : 9),
        drift: rand(-60, 60),
        hue: won ? [48, 38, 190, 330][i % 4] : [8, 14, 0][i % 3]
      })),
    [won]
  );

  return (
    <div className={`game-result ${won ? 'won' : 'lost'}`} role="dialog" aria-live="polite">
      <div className="gr-backdrop" />
      {won && <div className="gr-rays" />}
      <div className="gr-particles" aria-hidden="true">
        {particles.map((p) => (
          <span
            key={p.id}
            className="gr-particle"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              '--drift': `${p.drift}px`,
              '--hue': p.hue
            }}
          />
        ))}
      </div>

      <div className="gr-content">
        <div className="gr-emblem-wrap">
          <div className="gr-glow" />
          {won ? <VictoryEmblem /> : <DefeatEmblem />}
          <div className="gr-flash" />
        </div>
        <div className="gr-banner">
          <h2>{title}</h2>
        </div>
        <p className="gr-hint">{hint}</p>
        <button className="fantasy-btn gr-btn" onClick={onContinue}>
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
