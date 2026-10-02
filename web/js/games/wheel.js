// Prize wheel: the prize is drawn first (weighted, stock-aware), then the wheel spins to that slice.
// Product prizes show the product photo on their slice.

import { h, setupCanvas, host, loadImage } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { store } from '../core/store.js';
import { prizeImage } from '../data/products.js';
import { prizeResult, PRACTICE_HINT } from './prize.js';

const SPIN_MS = 5200;
const FULL_TURNS = 6;

function drawWheel(context, size, prizes, photos, rotation) {
  const center = size / 2;
  const radius = center - 10;
  const slice = (Math.PI * 2) / prizes.length;
  context.clearRect(0, 0, size, size);
  context.save();
  context.translate(center, center);
  context.rotate(rotation);
  prizes.forEach((prize, index) => {
    context.beginPath();
    context.moveTo(0, 0);
    context.arc(0, 0, radius, index * slice, (index + 1) * slice);
    context.closePath();
    context.fillStyle = prize.color;
    context.fill();
    context.strokeStyle = '#0b1020';
    context.lineWidth = 3;
    context.stroke();

    context.save();
    context.rotate(index * slice + slice / 2);
    const photo = photos.get(prize.id);
    if (photo) {
      // Product photo in a white disc near the rim, kept upright relative to the slice.
      const photoRadius = Math.min(radius * 0.16, (radius * 0.78 * slice) / 2.4);
      context.save();
      context.translate(radius * 0.78, 0);
      context.rotate(Math.PI / 2);
      context.beginPath();
      context.arc(0, 0, photoRadius, 0, Math.PI * 2);
      context.fillStyle = '#fff';
      context.fill();
      context.clip();
      context.drawImage(photo, -photoRadius, -photoRadius, photoRadius * 2, photoRadius * 2);
      context.restore();
    }
    context.fillStyle = prize.empty ? '#c9d2f5' : '#10162c';
    context.font = `700 ${Math.round(size / 26)}px Vazirmatn, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.direction = 'rtl';
    context.fillText(prize.short, radius * (photo ? 0.42 : 0.6), 0);
    context.restore();
  });
  context.restore();
  // Hub and pointer (the pointer sits at the top, i.e. angle -90°).
  context.beginPath();
  context.arc(center, center, size * 0.08, 0, Math.PI * 2);
  context.fillStyle = '#0b1020';
  context.fill();
  context.strokeStyle = '#ffc21a';
  context.lineWidth = 4;
  context.stroke();
  context.beginPath();
  context.moveTo(center - 14, 2);
  context.lineTo(center + 14, 2);
  context.lineTo(center, 34);
  context.closePath();
  context.fillStyle = '#fff';
  context.fill();
}

export default {
  id: 'wheel',
  title: 'گردونهٔ شانس',
  blurb: 'بچرخان و محصول زانیس ببر',
  emoji: '🎡',
  category: 'شانسی',
  kind: 'chance',
  mount(stage, api) {
    const prizes = store.availablePrizes();
    const practice = !store.hasPrizeRound('wheel');
    const size = Math.min(stage.clientWidth || 360, 440);
    const canvas = h('canvas');
    const context = setupCanvas(canvas, size, size);
    const button = h('button.btn.block', { onclick: spin }, 'بچرخان!');
    stage.append(h('div.stack', { style: { alignItems: 'center', width: '100%' } }, canvas, button));
    if (practice) api.setHint(PRACTICE_HINT);

    const photos = new Map();
    let rotation = 0;
    let frame = 0;
    let spinning = false;
    const redraw = () => drawWheel(context, size, prizes, photos, rotation);
    redraw();
    // Photos arrive asynchronously; the wheel is usable before they do.
    prizes.forEach((prize) => {
      const source = prizeImage(prize);
      if (!source) return;
      loadImage(source)
        .then((image) => {
          photos.set(prize.id, image);
          if (!spinning) redraw();
        })
        .catch(() => {}); // a missing photo just leaves the text label
    });

    function spin() {
      if (spinning) return;
      spinning = true;
      button.disabled = true;
      const prize = store.drawPrize('wheel', { practice });
      const index = prizes.findIndex((candidate) => candidate.id === prize.id);
      const slice = (Math.PI * 2) / prizes.length;
      // Rotate so the middle of the winning slice ends under the pointer at -90°.
      const target = -Math.PI / 2 - (index * slice + slice / 2);
      const from = rotation;
      const to = target + Math.PI * 2 * FULL_TURNS;
      const startedAt = performance.now();
      let lastTick = -1;

      const step = (time) => {
        const progress = Math.min(1, (time - startedAt) / SPIN_MS);
        const eased = 1 - Math.pow(1 - progress, 4);
        rotation = from + (to - from) * eased;
        redraw();
        const tick = Math.floor(rotation / slice);
        if (tick !== lastTick) {
          lastTick = tick;
          sfx.tick();
        }
        if (progress < 1) {
          frame = requestAnimationFrame(step);
          return;
        }
        host.vibrate(60);
        api.finish(prizeResult(prize, practice));
      };
      frame = requestAnimationFrame(step);
    }

    return () => cancelAnimationFrame(frame);
  },
};
