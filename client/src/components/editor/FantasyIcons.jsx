import React from 'react';

const GOLD = '#e8c26a';
const GOLD_DARK = '#7a5418';

function Svg({ children, size = 30, defs }) {
  return (
    <svg className="ed-icon" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      {defs && <defs>{defs}</defs>}
      {children}
    </svg>
  );
}

const gradient = (id, from, to) => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stopColor={from} />
    <stop offset="1" stopColor={to} />
  </linearGradient>
);

const Tree = () => (
  <Svg defs={<>{gradient('fi-tree-a', '#8be0a0', '#1f7a4a')}{gradient('fi-tree-b', '#5fc27f', '#145a37')}</>}>
    <circle cx="36" cy="10" r="4" fill="#ffe9a3" opacity="0.9" />
    <circle cx="38" cy="9" r="3.4" fill="#12301f" />
    <path d="M24 5 L34 19 H14 Z" fill="url(#fi-tree-a)" stroke={GOLD} strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M24 13 L37 28 H11 Z" fill="url(#fi-tree-b)" stroke={GOLD} strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M24 22 L40 38 H8 Z" fill="url(#fi-tree-a)" stroke={GOLD} strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M21 38 H27 L28 44 H20 Z" fill="#6b3f1d" stroke={GOLD_DARK} strokeWidth="1" />
    <path d="M24 9 l1 2.4 2.4 1 -2.4 1 -1 2.4 -1 -2.4 -2.4 -1 2.4 -1 z" fill="#fff6c9" />
  </Svg>
);

const Bush = () => (
  <Svg defs={<>{gradient('fi-bush', '#9be86f', '#2f7d2a')}</>}>
    <circle cx="15" cy="30" r="9" fill="url(#fi-bush)" stroke={GOLD} strokeWidth="1.2" />
    <circle cx="33" cy="30" r="9" fill="url(#fi-bush)" stroke={GOLD} strokeWidth="1.2" />
    <circle cx="24" cy="22" r="11" fill="url(#fi-bush)" stroke={GOLD} strokeWidth="1.2" />
    <path d="M6 40 Q24 46 42 40" fill="none" stroke={GOLD_DARK} strokeWidth="2" strokeLinecap="round" />
    <circle cx="19" cy="25" r="2" fill="#ff5d7a" />
    <circle cx="29" cy="19" r="2" fill="#ff5d7a" />
    <circle cx="33" cy="31" r="2" fill="#ff5d7a" />
    <circle cx="13" cy="33" r="2" fill="#ff5d7a" />
    <path d="M24 8 Q30 4 34 8 Q30 12 24 8 Z" fill="#c8ff9a" stroke={GOLD} strokeWidth="0.8" />
  </Svg>
);

const Props = () => (
  <Svg defs={<>{gradient('fi-gem-a', '#c7a6ff', '#5a2fb0')}{gradient('fi-gem-b', '#8fd0ff', '#2a5fb8')}</>}>
    <path d="M8 40 L12 26 L20 22 L26 40 Z" fill="#6f6a66" stroke={GOLD_DARK} strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M12 26 L20 22 L18 32 Z" fill="#9a948f" />
    <path d="M24 40 L24 18 L32 6 L40 18 L40 40 Z" fill="url(#fi-gem-a)" stroke={GOLD} strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M32 6 L32 40" stroke="#e9dcff" strokeWidth="1" opacity="0.7" />
    <path d="M24 18 H40" stroke="#e9dcff" strokeWidth="1" opacity="0.6" />
    <path d="M13 40 L15 31 L21 28 L24 40 Z" fill="url(#fi-gem-b)" stroke={GOLD} strokeWidth="1" strokeLinejoin="round" />
    <path d="M6 41 H43" stroke={GOLD_DARK} strokeWidth="2" strokeLinecap="round" />
    <path d="M38 8 l1 2.4 2.4 1 -2.4 1 -1 2.4 -1 -2.4 -2.4 -1 2.4 -1 z" fill="#fff6c9" />
  </Svg>
);

const Building = () => (
  <Svg defs={<>{gradient('fi-wall', '#c9c1b2', '#6f675a')}{gradient('fi-roof', '#e0584a', '#7a1c14')}</>}>
    <path d="M24 3 V10" stroke={GOLD} strokeWidth="1.5" />
    <path d="M24 3 L33 5.5 L24 8 Z" fill="#e0584a" />
    <path d="M6 18 L10 11 L14 18 Z" fill="url(#fi-roof)" stroke={GOLD} strokeWidth="1" strokeLinejoin="round" />
    <path d="M34 18 L38 11 L42 18 Z" fill="url(#fi-roof)" stroke={GOLD} strokeWidth="1" strokeLinejoin="round" />
    <path d="M18 20 L24 9 L30 20 Z" fill="url(#fi-roof)" stroke={GOLD} strokeWidth="1" strokeLinejoin="round" />
    <rect x="6" y="18" width="8" height="24" fill="url(#fi-wall)" stroke={GOLD_DARK} strokeWidth="1" />
    <rect x="34" y="18" width="8" height="24" fill="url(#fi-wall)" stroke={GOLD_DARK} strokeWidth="1" />
    <rect x="14" y="20" width="20" height="22" fill="url(#fi-wall)" stroke={GOLD_DARK} strokeWidth="1" />
    <path d="M14 20 V17 H17 V20 M20 20 V17 H23 V20 M26 20 V17 H29 V20 M31 20 V17 H34 V20" fill="#8d8576" stroke={GOLD_DARK} strokeWidth="0.8" />
    <path d="M19 42 V33 Q24 26 29 33 V42 Z" fill="#2a170a" stroke={GOLD} strokeWidth="1.2" />
    <rect x="8.5" y="24" width="3" height="5" rx="1.5" fill="#ffd36b" />
    <rect x="36.5" y="24" width="3" height="5" rx="1.5" fill="#ffd36b" />
    <path d="M4 42 H44" stroke={GOLD_DARK} strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

const Animal = () => (
  <Svg defs={<>{gradient('fi-wolf', '#c4ccd8', '#4a5468')}</>}>
    <path
      d="M8 6 L18 14 H30 L40 6 L41 22 Q41 32 33 38 L28 43 H20 L15 38 Q7 32 7 22 Z"
      fill="url(#fi-wolf)"
      stroke={GOLD}
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
    <path d="M11 11 L16 16 L12 21 Z M37 11 L32 16 L36 21 Z" fill="#2a2f3b" />
    <path d="M17 33 L24 28 L31 33 L28 39 H20 Z" fill="#e9edf3" stroke={GOLD_DARK} strokeWidth="0.8" strokeLinejoin="round" />
    <path d="M22 35 H26 L24 38 Z" fill="#1b1b22" />
    <path d="M13 24 L21 27 L20 22 Z M35 24 L27 27 L28 22 Z" fill="#ffcf4a" stroke="#6a3b00" strokeWidth="0.8" strokeLinejoin="round" />
    <path d="M15 40 L12 45 M33 40 L36 45" stroke={GOLD_DARK} strokeWidth="1.2" strokeLinecap="round" />
  </Svg>
);

const Creature = () => (
  <Svg defs={<>{gradient('fi-slime', '#8fe9ff', '#2a8fd8')}</>}>
    <path
      d="M24 5 Q28 12 35 18 Q43 24 42 33 Q41 42 24 42 Q7 42 6 33 Q5 24 13 18 Q20 12 24 5 Z"
      fill="url(#fi-slime)"
      stroke={GOLD}
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <path d="M14 22 Q17 16 22 14" fill="none" stroke="#e8fbff" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
    <circle cx="18" cy="29" r="3" fill="#102a44" />
    <circle cx="30" cy="29" r="3" fill="#102a44" />
    <circle cx="19" cy="28" r="1" fill="#fff" />
    <circle cx="31" cy="28" r="1" fill="#fff" />
    <path d="M19 35 Q24 39 29 35" fill="none" stroke="#102a44" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M39 8 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2 z" fill="#fff6c9" />
    <path d="M9 12 l0.9 2.2 2.2 0.9 -2.2 0.9 -0.9 2.2 -0.9 -2.2 -2.2 -0.9 2.2 -0.9 z" fill="#fff6c9" />
  </Svg>
);

const Fallback = () => (
  <Svg>
    <path d="M24 4 L40 16 L34 40 H14 L8 16 Z" fill="#5a2fb0" stroke={GOLD} strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M24 4 V40 M8 16 H40" stroke="#e9dcff" strokeWidth="1" opacity="0.6" />
  </Svg>
);

const CATEGORY_ICONS = {
  tree: Tree,
  bush: Bush,
  props: Props,
  building: Building,
  animal: Animal,
  creature: Creature
};

export function CategoryIcon({ id }) {
  const Icon = CATEGORY_ICONS[id] || Fallback;
  return <Icon />;
}

const stroke = { fill: 'none', stroke: GOLD, strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' };

const CAMERA_ICONS = {
  cursor: (
    <>
      <path
        d="M11 5 L11 36 L18.5 29 L23.5 41 L29 38.5 L24 27 L34 27 Z"
        fill="#fff2b8"
        stroke="#7a5418"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M14 13 V28 L18.5 24" fill="none" stroke="#e8c26a" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
      <path d="M38 7 l1 2.4 2.4 1 -2.4 1 -1 2.4 -1 -2.4 -2.4 -1 2.4 -1 z" fill="#ffd36b" />
    </>
  ),
  rotateLeft: (
    <>
      <path d="M36 14 A15 15 0 1 0 38 30" {...stroke} />
      <path d="M36 5 V15 H26" {...stroke} />
      <circle cx="24" cy="24" r="3" fill="#ffd36b" />
    </>
  ),
  rotateRight: (
    <>
      <path d="M12 14 A15 15 0 1 1 10 30" {...stroke} />
      <path d="M12 5 V15 H22" {...stroke} />
      <circle cx="24" cy="24" r="3" fill="#ffd36b" />
    </>
  ),
  tiltUp: (
    <>
      <path d="M8 34 L24 12 L40 34" {...stroke} />
      <path d="M14 40 H34" {...stroke} />
      <circle cx="24" cy="26" r="2.6" fill="#ffd36b" />
    </>
  ),
  tiltDown: (
    <>
      <path d="M8 14 L24 36 L40 14" {...stroke} />
      <path d="M14 8 H34" {...stroke} />
      <circle cx="24" cy="22" r="2.6" fill="#ffd36b" />
    </>
  ),
  top: (
    <>
      <circle cx="24" cy="24" r="14" {...stroke} />
      <circle cx="24" cy="24" r="4" fill="#ffd36b" />
      <path d="M24 4 V10 M24 38 V44 M4 24 H10 M38 24 H44" {...stroke} />
    </>
  ),
  reset: (
    <>
      <path d="M8 24 L24 8 L40 24" {...stroke} />
      <path d="M13 22 V40 H35 V22" {...stroke} />
      <path d="M20 40 V30 H28 V40" {...stroke} />
    </>
  )
};

export function CameraIcon({ name }) {
  return (
    <svg className="ed-icon" width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
      {CAMERA_ICONS[name]}
    </svg>
  );
}
