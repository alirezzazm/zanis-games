// Scratch card: the prize is drawn up-front and revealed when enough of the foil is scratched off.
// Product prizes show the product photo under the foil.

import { h, setupCanvas, host } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { store } from '../core/store.js';
import { prizeImage } from '../data/products.js';
import { prizeResult, PRACTICE_HINT } from './prize.js';

const REVEAL_RATIO = 0.55;
const BRUSH = 26;

export default {
  id: 'scratch',
  title: 'کارت خراشی',
  blurb: 'روی کارت بکش و محصول زیر آن را پیدا کن',
  emoji: '🎟️',
  category: 'شانسی',
  kind: 'chance',
  mount(stage, api) {
    const width = Math.min(stage.clientWidth || 340, 400);
    const height = Math.round(width * 0.72);
    const practice = !store.hasPrizeRound('scratch');
    const prize = store.drawPrize('scratch', { practice });
    const photo = prizeImage(prize);

    const face = h(
      'div.card.center',
      {
        style: {
          width: `${width}px`,
          height: `${height}px`,
          display: 'grid',
          placeItems: 'center',
          background: prize.empty ? '#232c52' : 'linear-gradient(135deg,#fff3c4,#ffc21a)',
          color: prize.empty ? '#c9d2f5' : '#1a1300',
        },
      },
      h(
        'div',
        photo
          ? h('img.prize-photo', { src: photo, alt: '', draggable: false })
          : h('div', { style: { fontSize: '44px' } }, prize.empty ? '🙈' : '🎁'),
        h('b', { style: { fontSize: '20px', display: 'block', marginTop: '6px' } }, prize.label),
      ),
    );
    const canvas = h('canvas', { style: { position: 'absolute', inset: '0', borderRadius: '18px' } });
    const context = setupCanvas(canvas, width, height);
    stage.append(h('div', { style: { position: 'relative', width: `${width}px`, height: `${height}px` } }, face, canvas));

    // Foil
    const foil = context.createLinearGradient(0, 0, width, height);
    foil.addColorStop(0, '#9aa6d6');
    foil.addColorStop(0.5, '#dfe6ff');
    foil.addColorStop(1, '#8591c4');
    context.fillStyle = foil;
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#1a2340';
    context.font = `900 ${Math.round(width / 12)}px Vazirmatn, sans-serif`;
    context.textAlign = 'center';
    context.direction = 'rtl';
    context.fillText('اینجا را بخراش', width / 2, height / 2 + 8);
    context.globalCompositeOperation = 'destination-out';

    let revealed = false;
    let last = null;
    let finishTimer = 0;

    function scratch(event) {
      if (revealed) return;
      const rect = canvas.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      context.lineWidth = BRUSH * 2;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo((last ?? point).x, (last ?? point).y);
      context.lineTo(point.x, point.y);
      context.stroke();
      last = point;
    }
    function check() {
      last = null;
      if (revealed) return;
      // Sample the alpha channel on a coarse grid; reading every pixel is unnecessary.
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let cleared = 0;
      let total = 0;
      for (let index = 3; index < data.length; index += 4 * 24) {
        total += 1;
        if (data[index] === 0) cleared += 1;
      }
      if (cleared / total < REVEAL_RATIO) return;
      revealed = true;
      canvas.style.transition = 'opacity .4s';
      canvas.style.opacity = '0';
      host.vibrate(60);
      finishTimer = setTimeout(() => api.finish(prizeResult(prize, practice)), 700);
    }
    canvas.addEventListener('pointerdown', (event) => {
      sfx.tap();
      scratch(event);
    });
    canvas.addEventListener('pointermove', (event) => event.buttons && scratch(event));
    canvas.addEventListener('pointerup', check);
    canvas.addEventListener('pointerleave', check);
    api.setHint(practice ? PRACTICE_HINT : 'با انگشت روی کارت بکش.');
    return () => clearTimeout(finishTimer);
  },
};
