// The scrolling score bar of the Windows game: best players and latest rounds, always moving.

import { h, fa } from './util.js';

const PIXELS_PER_SECOND = 90;
const MEDALS = ['🥇', '🥈', '🥉'];

export function createTicker() {
  const track = h('div.ticker-track');
  const element = h('div.ticker', { 'aria-label': 'امتیازها' }, h('div.ticker-label', '🏆 امتیازها'), h('div.ticker-window', track));
  let signature = '';

  function items({ top, recent }, topToday) {
    const parts = [];
    if (top.length) {
      parts.push(h('span.ticker-head', topToday ? 'برترین‌های امروز' : 'برترین‌ها'));
      top.forEach((entry, index) =>
        parts.push(h('span.ticker-item', `${MEDALS[index] ?? `${fa(index + 1)}.`} ${entry.name}`, h('b', fa(entry.score)))),
      );
    }
    if (recent.length) {
      parts.push(h('span.ticker-head', 'آخرین بازی‌ها'));
      recent.forEach((entry) => parts.push(h('span.ticker-item', entry.name, h('b', fa(entry.score)))));
    }
    if (!parts.length) parts.push(h('span.ticker-head', 'هنوز کسی بازی نکرده؛ اولین نفر باش! ⚡'));
    return parts;
  }

  return {
    element,
    /** Replaces the content; the animation restarts only when the scores really changed. */
    update(data, topToday) {
      const next = JSON.stringify([data, topToday]);
      if (next === signature) return;
      signature = next;
      // Two copies side by side make the loop seamless: the track moves by exactly one copy.
      const copy = () => h('div.ticker-copy', items(data, topToday));
      track.replaceChildren(copy(), copy());
      requestAnimationFrame(() => {
        const width = track.firstChild.getBoundingClientRect().width;
        track.style.animationDuration = `${Math.max(12, width / PIXELS_PER_SECOND)}s`;
        track.classList.remove('run');
        void track.offsetWidth;
        track.classList.add('run');
      });
    },
  };
}
