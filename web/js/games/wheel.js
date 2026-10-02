// Prize wheel: the prize is drawn first (weighted, stock-aware), then the wheel spins to that slice.

import { h, setupCanvas, host } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { store } from '../core/store.js';

const SPIN_MS = 5200;
const FULL_TURNS = 6;

function drawWheel(context, size, prizes, rotation) {
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
    context.fillStyle = prize.empty ? '#c9d2f5' : '#10162c';
    context.font = `700 ${Math.round(size / 22)}px Vazirmatn, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.direction = 'rtl';
    context.fillText(prize.short, radius * 0.62, 0);
    context.restore();
  });
  context.restore();
  // Hub and pointer (the pointer sits at the top, i.e. angle -90°).
  context.beginPath();
  context.arc(center, center, size * 0.09, 0, Math.PI * 2);
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
  blurb: 'بچرخان و جایزه ببر',
  emoji: '🎡',
  category: 'شانسی',
  kind: 'chance',
  mount(stage, api) {
    const prizes = store.availablePrizes();
    const size = Math.min(stage.clientWidth || 360, 440);
    const canvas = h('canvas');
    const context = setupCanvas(canvas, size, size);
    const button = h('button.btn.block', { onclick: spin }, 'بچرخان!');
    stage.append(h('div.stack', { style: { alignItems: 'center', width: '100%' } }, canvas, button));

    let rotation = 0;
    let frame = 0;
    let spinning = false;
    drawWheel(context, size, prizes, rotation);

    function spin() {
      if (spinning) return;
      spinning = true;
      button.disabled = true;
      const prize = store.drawPrize('wheel');
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
        drawWheel(context, size, prizes, rotation);
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
        api.finish({
          score: prize.empty ? 0 : 50,
          emoji: prize.empty ? '🙈' : '🎁',
          title: prize.empty ? 'این بار پوچ!' : prize.label,
          detail: prize.empty
            ? 'بازی‌های امتیازی را امتحان کن و در جدول برترین‌ها بالا برو.'
            : 'جایزه‌ات را از مسئول غرفه بگیر.',
          win: !prize.empty,
        });
      };
      frame = requestAnimationFrame(step);
    }

    return () => cancelAnimationFrame(frame);
  },
};
