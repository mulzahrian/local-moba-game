import React from 'react';

const GOLD = '#f4d78a';
const GOLD_DARK = '#8a6a2e';

// Small arcane-styled SVG icons for the gameplay HUD (gold line work with a glowing core).
function Icon({ size = 24, children, className = '' }) {
  return (
    <svg className={`hud-icon ${className}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      {children}
    </svg>
  );
}

const stroke = { fill: 'none', stroke: GOLD, strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const SwordIcon = (props) => (
  <Icon {...props}>
    <path d="M10 38 L34 14 L38 10 L38 15 L33 20 L14 40 Z" fill="#d9e6f2" stroke={GOLD} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M12 30 L18 36" {...stroke} />
    <path d="M8 40 L12 36" {...stroke} />
    <circle cx="38" cy="10" r="2.6" fill="#fff6c9" />
  </Icon>
);

export const RuneIcon = ({ variant = 0, ...props }) => (
  <Icon {...props}>
    <circle cx="24" cy="24" r="16" {...stroke} strokeWidth="1.8" />
    <circle cx="24" cy="24" r="11" {...stroke} strokeWidth="1" opacity="0.6" strokeDasharray="2 3" />
    {variant === 0 && <path d="M24 10 L29 24 L24 38 L19 24 Z" fill="#8fd0ff" stroke={GOLD} strokeWidth="1.6" strokeLinejoin="round" />}
    {variant === 1 && <path d="M24 9 L28 20 L40 20 L30 27 L34 39 L24 32 L14 39 L18 27 L8 20 L20 20 Z" fill="#c7a6ff" stroke={GOLD} strokeWidth="1.4" strokeLinejoin="round" />}
    {variant === 2 && <path d="M24 38 C14 30 12 20 18 15 C22 12 24 16 24 18 C24 16 26 12 30 15 C36 20 34 30 24 38 Z" fill="#ff8a6b" stroke={GOLD} strokeWidth="1.6" strokeLinejoin="round" />}
  </Icon>
);

export const EmoteIcon = (props) => (
  <Icon {...props}>
    <circle cx="24" cy="24" r="15" {...stroke} />
    <circle cx="18" cy="21" r="2" fill={GOLD} />
    <circle cx="30" cy="21" r="2" fill={GOLD} />
    <path d="M16 28 Q24 36 32 28" {...stroke} />
  </Icon>
);

export const JumpIcon = (props) => (
  <Icon {...props}>
    <path d="M24 8 L36 22 H28 V34 H20 V22 H12 Z" fill="#9be8c8" stroke={GOLD} strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M14 41 H34" {...stroke} />
  </Icon>
);

export const CoinIcon = (props) => (
  <Icon {...props}>
    <circle cx="24" cy="24" r="17" fill="url(#hud-coin)" stroke={GOLD_DARK} strokeWidth="2" />
    <circle cx="24" cy="24" r="12" fill="none" stroke="#fff3c4" strokeWidth="1.4" opacity="0.8" />
    <path d="M24 14 L27 22 L35 22 L28.6 27 L31 35 L24 30 L17 35 L19.4 27 L13 22 L21 22 Z" fill="#fff3c4" opacity="0.9" />
    <defs>
      <linearGradient id="hud-coin" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffe48a" />
        <stop offset="1" stopColor="#c9891f" />
      </linearGradient>
    </defs>
  </Icon>
);

// Crystal orb on a golden stand with sparkles: the magic shop.
export const ShopOrbIcon = (props) => (
  <Icon {...props}>
    <defs>
      <radialGradient id="hud-orb" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stopColor="#f2e6ff" />
        <stop offset="0.45" stopColor="#9a6bff" />
        <stop offset="1" stopColor="#2c1470" />
      </radialGradient>
    </defs>
    <path d="M14 42 H34 L31 35 H17 Z" fill="#7a5418" stroke={GOLD} strokeWidth="1.6" strokeLinejoin="round" />
    <circle cx="24" cy="21" r="13" fill="url(#hud-orb)" stroke={GOLD} strokeWidth="2" />
    <path d="M17 16 Q20 11 26 11" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
    <path d="M24 17 l1.6 3.6 3.6 1.6 -3.6 1.6 -1.6 3.6 -1.6 -3.6 -3.6 -1.6 3.6 -1.6 z" fill="#fff6c9" />
    <path d="M40 8 l1 2.4 2.4 1 -2.4 1 -1 2.4 -1 -2.4 -2.4 -1 2.4 -1 z" fill="#fff6c9" />
    <path d="M7 12 l0.8 1.8 1.8 0.8 -1.8 0.8 -0.8 1.8 -0.8 -1.8 -1.8 -0.8 1.8 -0.8 z" fill="#fff6c9" />
  </Icon>
);

export const SpellbookIcon = (props) => (
  <Icon {...props}>
    <path d="M9 10 H36 Q39 10 39 13 V37 Q39 40 36 40 H9 Z" fill="#4a2a78" stroke={GOLD} strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M9 10 V40" {...stroke} strokeWidth="3" />
    <path d="M24 17 l2 4.6 4.6 2 -4.6 2 -2 4.6 -2 -4.6 -4.6 -2 4.6 -2 z" fill={GOLD} />
  </Icon>
);

export const ChatIcon = (props) => (
  <Icon {...props}>
    <path d="M8 12 Q8 8 12 8 H36 Q40 8 40 12 V28 Q40 32 36 32 H22 L14 40 V32 H12 Q8 32 8 28 Z" fill="rgba(244,215,138,0.18)" stroke={GOLD} strokeWidth="2" strokeLinejoin="round" />
    <circle cx="17" cy="20" r="2" fill={GOLD} />
    <circle cx="24" cy="20" r="2" fill={GOLD} />
    <circle cx="31" cy="20" r="2" fill={GOLD} />
  </Icon>
);

export const ChevronIcon = ({ open = true, size = 14 }) => (
  <svg
    className="hud-chevron"
    width={size}
    height={size}
    viewBox="0 0 16 16"
    aria-hidden="true"
    style={{ transform: open ? 'rotate(0deg)' : 'rotate(180deg)' }}
  >
    <path d="M3 6 L8 11 L13 6" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
