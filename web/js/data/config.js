// Booth configuration. Edit this file to match the real exhibition: prizes, stock and stations.
// The operator can also change stock and chances from the operator panel (hold the logo, PIN 1405).

/**
 * Prizes for the chance games (wheel, Plinko, scratch card).
 * weight = relative chance, stock = how many are left (-1 = unlimited), empty = "no prize" slot.
 */
export const DEFAULT_PRIZES = [
  { id: 'lamp12', label: 'لامپ LED ۱۲ وات', short: 'لامپ ۱۲W', color: '#ffc21a', weight: 18, stock: 60 },
  { id: 'discount10', label: 'کد تخفیف ۱۰٪', short: '۱۰٪ تخفیف', color: '#4da3ff', weight: 22, stock: -1 },
  { id: 'empty1', label: 'پوچ', short: 'پوچ', color: '#39446f', weight: 20, stock: -1, empty: true },
  { id: 'panel18', label: 'پنل روکار ۱۸ وات', short: 'پنل ۱۸W', color: '#2fd17c', weight: 6, stock: 15 },
  { id: 'discount20', label: 'کد تخفیف ۲۰٪', short: '۲۰٪ تخفیف', color: '#b07cff', weight: 10, stock: -1 },
  { id: 'cap', label: 'کلاه زانیس', short: 'کلاه', color: '#ff9d0a', weight: 12, stock: 40 },
  { id: 'empty2', label: 'پوچ', short: 'پوچ', color: '#39446f', weight: 20, stock: -1, empty: true },
  { id: 'projector50', label: 'پروژکتور ۵۰ وات', short: 'پروژکتور', color: '#ff5a6a', weight: 2, stock: 5 },
];

/** Stations of the booth passport. The code is printed (or shown as QR) at each station. */
export const DEFAULT_STATIONS = [
  { id: 'lamps', title: 'ویترین لامپ‌ها', emoji: '💡', code: '1101' },
  { id: 'panels', title: 'پنل و سقفی', emoji: '🔆', code: '2202' },
  { id: 'industrial', title: 'روشنایی صنعتی', emoji: '🏭', code: '3303' },
  { id: 'smart', title: 'هوشمند و ریسه', emoji: '🌈', code: '4404' },
  { id: 'expert', title: 'گفت‌وگو با کارشناس', emoji: '🧑‍🔧', code: '5505' },
];
