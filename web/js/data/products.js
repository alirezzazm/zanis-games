// Real products from the Zanis catalogue (https://zaniselec.com), used by the memory game and the quiz.
// Names are exactly as published on the site; photos are resized copies of the site's product images.
// To add a product: put a square image in web/img/products/ and add a line here.

export const PRODUCTS = [
  { id: 'bulb-12w', name: 'لامپ حبابی 12 وات', family: 'لامپ', image: 'img/products/bulb-12w.webp' },
  { id: 'cylinder-50w', name: 'لامپ حبابی استوانه ای 50 وات', family: 'لامپ', image: 'img/products/cylinder-50w.webp' },
  { id: 'candle-8w', name: 'لامپ شمعی 8 وات مدل اشکی', family: 'لامپ', image: 'img/products/candle-8w.webp' },
  { id: 'eye-3w-gold', name: 'لامپ چشمی 3 وات بدنه طلایی لنزی', family: 'لامپ', image: 'img/products/eye-3w-gold.webp' },
  { id: 'halogen-7w', name: 'لامپ هالوژنی پایه سوزنی لنزی 7 وات', family: 'هالوژن', image: 'img/products/halogen-7w.webp' },
  { id: 'round-panel-18w', name: 'پنل گرد توکار 18 وات کلاسیک', family: 'پنل گرد', image: 'img/products/round-panel-18w.webp' },
  { id: 'round-surface-24w', name: 'پنل گرد روکار 24 وات', family: 'پنل گرد', image: 'img/products/round-surface-24w.webp' },
  { id: 'backlight-20w', name: 'بک لایت 20 وات', family: 'پنل گرد', image: 'img/products/backlight-20w.webp' },
  { id: 'square-panel-6060', name: 'پنل مربع توکار 90 وات 60*60', family: 'پنل مربع', image: 'img/products/square-panel-6060.webp' },
  { id: 'square-surface-24w', name: 'پنل مربع رو کار 24 وات', family: 'پنل مربع', image: 'img/products/square-surface-24w.webp' },
  { id: 'projector-starlens-100w', name: 'پروژکتور استارلنز 100 وات', family: 'پروژکتور', image: 'img/products/projector-starlens-100w.webp' },
  { id: 'projector-corn-50w', name: 'پروژکتور بلالی 50 وات', family: 'پروژکتور', image: 'img/products/projector-corn-50w.webp' },
  { id: 'bracket-omega-50w', name: 'براکت امگا 50 وات', family: 'براکت', image: 'img/products/bracket-omega-50w.webp' },
  { id: 'strip-120', name: 'ریسه شلنگی 120', family: 'ریسه', image: 'img/products/strip-120.webp' },
  { id: 'brilliant-12w', name: 'دکوراتیو چوب راش برلیان 12 وات (دو شعله)', family: 'دکوراتیو', image: 'img/products/brilliant-12w.webp' },
  { id: 'dina-cube', name: 'چراغ دکوراتیو مکعبی دینا', family: 'دکوراتیو', image: 'img/products/dina-cube.webp' },
  { id: 'emergency-light', name: 'چراغ شارژی اضطراری', family: 'سنسور و اضطراری', image: 'img/products/emergency-light.webp' },
  { id: 'motion-sensor', name: 'سنسور حرکتی روکار', family: 'سنسور و اضطراری', image: 'img/products/motion-sensor.webp' },
  { id: 'photocell-16a', name: 'فتوسل 16 آمپر', family: 'سنسور و اضطراری', image: 'img/products/photocell-16a.webp' },
  { id: 'protector-4', name: 'محافظ چهار پریز 10 آمپر سیمی', family: 'محافظ', image: 'img/products/protector-4.webp' },
  { id: 'fan-hozhen', name: 'هواکش مدل هوژن بدنه سفید', family: 'هواکش', image: 'img/products/fan-hozhen.webp' },
  { id: 'waterproof-25w', name: 'چراغ روکار ضدآب 25 وات', family: 'ضدآب', image: 'img/products/waterproof-25w.webp' },
  { id: 'connector-sp2', name: 'کانکتور SP-2', family: 'لوازم جانبی', image: 'img/products/connector-sp2.webp' },
  { id: 'remote-relay-1', name: 'ریسیور و ریموت تک رله', family: 'لوازم جانبی', image: 'img/products/remote-relay-1.webp' },
  { id: 'projector-starlens-50w', name: 'پروژکتور استارلنز 50 وات', family: 'پروژکتور', image: 'img/products/projector-starlens-50w.webp' },
  { id: 'tape', name: 'چسب برق', family: 'لوازم جانبی', image: 'img/products/tape.webp' },
];

export const productById = (id) => PRODUCTS.find((product) => product.id === id) ?? null;

/** Photo of the product a prize (or passport station) stands for; undefined for non-product prizes. */
export const prizeImage = (item) => productById(item?.productId)?.image;

/** Products that give light: used where a game needs "a lamp" (circuit, photo frame). */
const LIGHT_FAMILIES = ['لامپ', 'هالوژن', 'پنل گرد', 'پنل مربع', 'پروژکتور', 'براکت', 'دکوراتیو'];
export const LIGHT_PRODUCTS = PRODUCTS.filter((product) => LIGHT_FAMILIES.includes(product.family));

const svg = (body) =>
  `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/** The Zanis mark: a stylised "Z" drawn as a light beam. Used on tiles and card backs. */
export const BRAND_MARK = svg(
  `<path d="M16 14h32L18 50h30" stroke="#1a1300" stroke-width="7"/><circle cx="48" cy="14" r="4" fill="#fff"/>`,
);
