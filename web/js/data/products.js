// Product catalogue used by the games (memory cards, puzzle, quiz).
// NOTE: these are typical lighting products. Replace names/wattages with the real Zanis catalogue
// and, if wanted, swap an `icon` for an <img> of the real product photo.

const svg = (body) =>
  `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const GLOW = '#ffc21a';
const BODY = '#dfe6ff';
const DARK = '#56618f';

export const PRODUCTS = [
  {
    id: 'bulb',
    name: 'لامپ حبابی LED',
    spec: '۱۲ وات',
    icon: svg(
      `<circle cx="32" cy="24" r="16" fill="${GLOW}"/><path d="M25 38h14v8H25z" fill="${BODY}"/><path d="M26 50h12M28 55h8" stroke="${DARK}" stroke-width="3"/>`,
    ),
  },
  {
    id: 'cylinder',
    name: 'لامپ استوانه‌ای',
    spec: '۳۰ وات',
    icon: svg(
      `<rect x="20" y="6" width="24" height="34" rx="8" fill="${GLOW}"/><path d="M25 40h14v8H25z" fill="${BODY}"/><path d="M26 52h12M28 57h8" stroke="${DARK}" stroke-width="3"/>`,
    ),
  },
  {
    id: 'candle',
    name: 'لامپ شمعی',
    spec: '۷ وات',
    icon: svg(
      `<path d="M32 4c8 10 10 18 10 24a10 10 0 0 1-20 0c0-6 2-14 10-24z" fill="${GLOW}"/><path d="M27 38h10v8H27z" fill="${BODY}"/><path d="M28 50h8M29 55h6" stroke="${DARK}" stroke-width="3"/>`,
    ),
  },
  {
    id: 'panel-square',
    name: 'پنل توکار ۶۰×۶۰',
    spec: '۴۸ وات',
    icon: svg(
      `<rect x="8" y="8" width="48" height="48" rx="4" fill="${BODY}"/><rect x="14" y="14" width="36" height="36" rx="2" fill="${GLOW}"/>`,
    ),
  },
  {
    id: 'panel-round',
    name: 'پنل روکار گرد',
    spec: '۱۸ وات',
    icon: svg(`<circle cx="32" cy="32" r="25" fill="${BODY}"/><circle cx="32" cy="32" r="18" fill="${GLOW}"/>`),
  },
  {
    id: 'projector',
    name: 'پروژکتور SMD',
    spec: '۵۰ وات',
    icon: svg(
      `<rect x="10" y="12" width="44" height="30" rx="3" fill="${DARK}"/><rect x="15" y="17" width="34" height="20" rx="2" fill="${GLOW}"/><path d="M22 42v8h20v-8M18 54h28" stroke="${BODY}" stroke-width="4"/>`,
    ),
  },
  {
    id: 'linear',
    name: 'چراغ خطی',
    spec: '۴۰ وات',
    icon: svg(
      `<rect x="4" y="24" width="56" height="12" rx="6" fill="${BODY}"/><rect x="9" y="28" width="46" height="5" rx="2.5" fill="${GLOW}"/><path d="M16 24V12M48 24V12" stroke="${DARK}" stroke-width="3"/>`,
    ),
  },
  {
    id: 'strip',
    name: 'ریسه نواری LED',
    spec: '۵ متر',
    icon: svg(
      `<path d="M8 44c0-18 14-30 26-30s14 12 6 16-18 0-14 10 22 6 30-2" stroke="${BODY}" stroke-width="7"/><g fill="${GLOW}"><circle cx="14" cy="34" r="3"/><circle cx="26" cy="18" r="3"/><circle cx="40" cy="20" r="3"/><circle cx="30" cy="36" r="3"/><circle cx="44" cy="46" r="3"/></g>`,
    ),
  },
  {
    id: 'street',
    name: 'چراغ خیابانی',
    spec: '۱۰۰ وات',
    icon: svg(
      `<path d="M14 58V16c0-6 6-8 12-8h14" stroke="${DARK}" stroke-width="5"/><path d="M36 4h22l-4 10H36z" fill="${BODY}"/><path d="M38 16l-6 22h28l-6-22z" fill="${GLOW}" opacity=".55"/>`,
    ),
  },
  {
    id: 'spot',
    name: 'هالوژن COB',
    spec: '۷ وات',
    icon: svg(
      `<circle cx="32" cy="30" r="22" fill="${BODY}"/><circle cx="32" cy="30" r="14" fill="${DARK}"/><circle cx="32" cy="30" r="8" fill="${GLOW}"/><path d="M12 54h40" stroke="${DARK}" stroke-width="3"/>`,
    ),
  },
  {
    id: 'highbay',
    name: 'چراغ سوله‌ای',
    spec: '۱۵۰ وات',
    icon: svg(
      `<path d="M32 4v10" stroke="${DARK}" stroke-width="4"/><rect x="24" y="14" width="16" height="10" rx="2" fill="${DARK}"/><path d="M12 42l10-18h20l10 18z" fill="${BODY}"/><ellipse cx="32" cy="43" rx="20" ry="5" fill="${GLOW}"/>`,
    ),
  },
  {
    id: 'bracket',
    name: 'براکت LED',
    spec: '۳۶ وات',
    icon: svg(
      `<rect x="6" y="22" width="52" height="20" rx="4" fill="${BODY}"/><rect x="11" y="27" width="42" height="10" rx="3" fill="${GLOW}"/><path d="M6 32H2M62 32h-4" stroke="${DARK}" stroke-width="3"/>`,
    ),
  },
];

/** The Zanis mark: a stylised "Z" drawn as a light beam. Used on tiles and card backs. */
export const BRAND_MARK = svg(
  `<path d="M16 14h32L18 50h30" stroke="#1a1300" stroke-width="7"/><circle cx="48" cy="14" r="4" fill="#fff"/>`,
);
