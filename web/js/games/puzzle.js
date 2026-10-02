// Swap puzzle: a poster of one Zanis product is cut into 3×3 pieces and shuffled;
// tap two pieces to swap them until the picture is whole. A different product every round.

import { h, shuffle, fa, host, loadImage, randomInt } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { PRODUCTS } from '../data/products.js';

const SIZE = 3;
const MAX_SCORE = 100;
const POSTER_PX = 600;

/**
 * Draws the poster the puzzle is cut from: the product photo on a lit background, with the brand
 * above and the product name below. The diagonal light rays make every piece distinguishable,
 * including the ones that only show background.
 */
function drawPoster(product, photo) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = POSTER_PX;
  const c = canvas.getContext('2d');
  const background = c.createLinearGradient(0, 0, POSTER_PX, POSTER_PX);
  background.addColorStop(0, '#ffc21a');
  background.addColorStop(0.45, '#ff9d0a');
  background.addColorStop(1, '#1a2a6c');
  c.fillStyle = background;
  c.fillRect(0, 0, POSTER_PX, POSTER_PX);
  c.strokeStyle = '#ffffff40';
  c.lineWidth = 16;
  for (let ray = -6; ray < 14; ray++) {
    c.beginPath();
    c.moveTo(ray * 70, 0);
    c.lineTo(ray * 70 - 260, POSTER_PX);
    c.stroke();
  }
  // Product photo on a white rounded card
  const card = 360;
  const cardX = (POSTER_PX - card) / 2;
  const cardY = 120;
  c.fillStyle = '#fff';
  c.beginPath();
  c.roundRect(cardX, cardY, card, card, 32);
  c.fill();
  c.drawImage(photo, cardX + 14, cardY + 14, card - 28, card - 28);
  c.strokeStyle = '#0b1020';
  c.lineWidth = 8;
  c.beginPath();
  c.roundRect(cardX, cardY, card, card, 32);
  c.stroke();
  // Brand and product name
  c.direction = 'rtl';
  c.textAlign = 'center';
  c.fillStyle = '#0b1020';
  c.font = '900 76px Vazirmatn, sans-serif';
  c.fillText('زانیس', POSTER_PX / 2, 86);
  c.fillStyle = '#fff';
  c.font = '700 34px Vazirmatn, sans-serif';
  c.fillText(product.name, POSTER_PX / 2, 548, POSTER_PX - 40);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export default {
  id: 'puzzle',
  title: 'پازل محصول',
  blurb: 'تکه‌ها را جابه‌جا کن تا عکس محصول کامل شود',
  emoji: '🧩',
  category: 'دیجیتال',
  kind: 'score',
  mount(stage, api) {
    const product = PRODUCTS[randomInt(0, PRODUCTS.length - 1)];
    const total = SIZE * SIZE;
    const solved = Array.from({ length: total }, (_, index) => index);
    let order = shuffle(solved);
    // A shuffle can come out already solved; make sure the player has something to do.
    if (order.every((piece, slot) => piece === slot)) order = [...order.slice(1), order[0]];
    let poster = '';
    let selected = -1;
    let moves = 0;
    let seconds = 0;
    let clock = 0;
    let disposed = false;

    const board = h('div.board', { style: { gridTemplateColumns: `repeat(${SIZE}, 1fr)` } });
    stage.append(board);

    function updateHud() {
      api.setHud([
        ['حرکت', fa(moves)],
        ['زمان', fa(seconds)],
      ]);
    }
    function render() {
      board.replaceChildren(
        ...order.map((piece, slot) => {
          const column = piece % SIZE;
          const row = Math.floor(piece / SIZE);
          return h(`button.piece${slot === selected ? '.sel' : ''}`, {
            'aria-label': `تکهٔ ${slot + 1}`,
            style: {
              backgroundImage: `url(${poster})`,
              backgroundSize: `${SIZE * 100}% ${SIZE * 100}%`,
              backgroundPosition: `${(column / (SIZE - 1)) * 100}% ${(row / (SIZE - 1)) * 100}%`,
            },
            onclick: () => pick(slot),
          });
        }),
      );
    }
    function pick(slot) {
      sfx.tap();
      if (selected < 0) {
        selected = slot;
        render();
        return;
      }
      if (selected !== slot) {
        [order[selected], order[slot]] = [order[slot], order[selected]];
        moves += 1;
      }
      selected = -1;
      render();
      updateHud();
      if (!order.every((piece, index) => piece === index)) return;
      clearInterval(clock);
      host.vibrate(40);
      const score = Math.max(10, Math.round(MAX_SCORE - Math.max(0, moves - total) * 3 - seconds * 0.6));
      setTimeout(
        () =>
          api.finish({
            score,
            emoji: '🧩',
            image: product.image,
            title: `${fa(score)} امتیاز`,
            detail: `${product.name} · ${fa(moves)} جابه‌جایی در ${fa(seconds)} ثانیه`,
            win: true,
          }),
        500,
      );
    }

    updateHud();
    api.setHint('دو تکه را پشت سر هم لمس کن تا جایشان عوض شود.');
    // The poster needs the product photo and the brand font; the clock starts once it is on screen.
    Promise.all([loadImage(product.image), document.fonts?.ready]).catch(() => [null]).then(([photo]) => {
      if (disposed || !photo) return;
      poster = drawPoster(product, photo);
      render();
      clock = setInterval(() => {
        seconds += 1;
        updateHud();
      }, 1000);
    });
    return () => {
      disposed = true;
      clearInterval(clock);
    };
  },
};
