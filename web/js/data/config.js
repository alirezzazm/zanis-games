// Booth configuration. Edit this file to match the real exhibition: prizes, stock and stations.
// The operator can also change stock and chances from the operator panel (hold the logo, PIN 1405).

/**
 * Bump this number whenever the prizes or stations below change: devices that already have the app
 * then replace their saved prize list and stations with the new ones (visitors and scores are kept).
 */
export const CONFIG_VERSION = 2;

/**
 * Prizes for the chance games (wheel, Plinko, scratch card). Product names are from the Zanis catalogue.
 * weight = relative chance, stock = how many are left (-1 = unlimited), empty = "no prize" slot.
 * Stock numbers are placeholders: set the real quantities before the exhibition.
 */
export const DEFAULT_PRIZES = [
  { id: 'bulb12', label: 'لامپ حبابی ۱۲ وات', short: 'لامپ ۱۲W', color: '#ffc21a', weight: 16, stock: 60 },
  { id: 'discount10', label: 'کد تخفیف ۱۰٪', short: '۱۰٪ تخفیف', color: '#4da3ff', weight: 20, stock: -1 },
  { id: 'empty1', label: 'پوچ', short: 'پوچ', color: '#39446f', weight: 20, stock: -1, empty: true },
  { id: 'panel18', label: 'پنل گرد توکار ۱۸ وات', short: 'پنل ۱۸W', color: '#2fd17c', weight: 6, stock: 15 },
  { id: 'tape', label: 'چسب برق زانیس', short: 'چسب برق', color: '#b07cff', weight: 22, stock: 100 },
  { id: 'protector', label: 'محافظ دو پریز ۱۰ آمپر', short: 'محافظ', color: '#ff9d0a', weight: 5, stock: 10 },
  { id: 'empty2', label: 'پوچ', short: 'پوچ', color: '#39446f', weight: 20, stock: -1, empty: true },
  { id: 'projector50', label: 'پروژکتور استارلنز ۵۰ وات', short: 'پروژکتور', color: '#ff5a6a', weight: 2, stock: 5 },
];

/** Stations of the booth passport, one per product family. The code is printed (or shown as QR) at each station. */
export const DEFAULT_STATIONS = [
  { id: 'lamps', title: 'لامپ‌ها و هالوژن', emoji: '💡', code: '1101' },
  { id: 'panels', title: 'پنل گرد و مربع', emoji: '🔆', code: '2202' },
  { id: 'projectors', title: 'پروژکتور و براکت', emoji: '🔦', code: '3303' },
  { id: 'decorative', title: 'دکوراتیو برلیان و دینا', emoji: '✨', code: '4404' },
  { id: 'sensors', title: 'سنسور، فتوسل و محافظ', emoji: '🛡️', code: '5505' },
];
