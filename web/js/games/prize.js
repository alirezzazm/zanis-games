// Shared by the three chance games (wheel, Plinko, scratch card): how a drawn prize is reported.

import { prizeImage } from '../data/products.js';

export const PRACTICE_HINT = 'این دور تفریحی است: جایزهٔ این بازی را قبلاً گرفته‌ای، ولی می‌توانی باز هم بازی کنی.';

/**
 * Result shown after a chance game.
 * A practice round (the visitor already used their prize rounds) shows what it landed on but awards nothing.
 */
export function prizeResult(prize, practice) {
  if (prize.empty) {
    return {
      score: 0,
      emoji: '🙈',
      title: 'این بار پوچ!',
      detail: practice ? 'دور تفریحی بود. بازی‌های امتیازی را هم امتحان کن.' : 'دوباره بازی کن یا بازی‌های دیگر را امتحان کن.',
      win: false,
    };
  }
  return {
    score: practice ? 0 : 50,
    emoji: '🎁',
    image: prizeImage(prize),
    title: prize.label,
    detail: practice
      ? 'این دور تفریحی بود و جایزه ندارد؛ جایزهٔ این بازی فقط در دور اصلی داده می‌شود.'
      : 'جایزه‌ات را از مسئول غرفه بگیر.',
    win: !practice,
  };
}
