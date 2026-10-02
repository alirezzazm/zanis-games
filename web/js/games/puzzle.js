// Swap puzzle: a 3×3 poster is shuffled; tap two pieces to swap them until the picture is whole.

import { h, shuffle, fa, host } from '../core/util.js';
import { sfx } from '../core/audio.js';

const SIZE = 3;
const MAX_SCORE = 100;
const POSTER_PX = 600;

/** Draws the poster the puzzle is cut from: a night street lit by a Zanis street light. */
function drawPoster() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = POSTER_PX;
  const c = canvas.getContext('2d');
  const sky = c.createLinearGradient(0, 0, 0, POSTER_PX);
  sky.addColorStop(0, '#0b1020');
  sky.addColorStop(1, '#2a3a7a');
  c.fillStyle = sky;
  c.fillRect(0, 0, POSTER_PX, POSTER_PX);
  // Stars
  c.fillStyle = '#ffffffcc';
  for (let i = 0; i < 40; i++) c.fillRect((i * 97) % POSTER_PX, (i * 53) % 260, 3, 3);
  // Buildings with lit windows
  const buildings = [
    [20, 300, 130, 300, '#151d38'],
    [170, 240, 110, 360, '#1a2444'],
    [300, 330, 150, 270, '#151d38'],
    [470, 270, 120, 330, '#1a2444'],
  ];
  buildings.forEach(([x, y, w, hgt, color], b) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, hgt);
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 3; col++) {
        c.fillStyle = (row + col + b) % 3 === 0 ? '#ffc21a' : '#2b3766';
        c.fillRect(x + 14 + col * (w / 3.4), y + 18 + row * 44, w / 6, 22);
      }
  });
  // Street light and its beam
  const beam = c.createRadialGradient(430, 190, 10, 430, 420, 320);
  beam.addColorStop(0, '#ffe9a6cc');
  beam.addColorStop(1, '#ffc21a00');
  c.fillStyle = beam;
  c.beginPath();
  c.moveTo(430, 190);
  c.lineTo(250, 600);
  c.lineTo(600, 600);
  c.closePath();
  c.fill();
  c.strokeStyle = '#dfe6ff';
  c.lineWidth = 12;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(540, 600);
  c.lineTo(540, 190);
  c.quadraticCurveTo(540, 150, 470, 160);
  c.stroke();
  c.fillStyle = '#ffc21a';
  c.fillRect(400, 160, 80, 26);
  // Road and brand
  c.fillStyle = '#0e1530';
  c.fillRect(0, 540, POSTER_PX, 60);
  c.fillStyle = '#ffc21a';
  c.font = '900 92px Vazirmatn, sans-serif';
  c.direction = 'rtl';
  c.textAlign = 'right';
  c.fillText('زانیس', 560, 110);
  c.fillStyle = '#dfe6ff';
  c.font = '700 30px Vazirmatn, sans-serif';
  c.fillText('روشنایی شهر', 560, 150);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export default {
  id: 'puzzle',
  title: 'پازل نور',
  blurb: 'تکه‌ها را جابه‌جا کن تا تصویر کامل شود',
  emoji: '🧩',
  category: 'دیجیتال',
  kind: 'score',
  mount(stage, api) {
    const poster = drawPoster();
    const total = SIZE * SIZE;
    const solved = Array.from({ length: total }, (_, index) => index);
    let order = shuffle(solved);
    // A shuffle can come out already solved; make sure the player has something to do.
    if (order.every((piece, slot) => piece === slot)) order = [...order.slice(1), order[0]];
    let selected = -1;
    let moves = 0;
    let seconds = 0;

    const board = h('div.board', { style: { gridTemplateColumns: `repeat(${SIZE}, 1fr)` } });
    stage.append(board);
    const clock = setInterval(() => {
      seconds += 1;
      updateHud();
    }, 1000);

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
          return h('button.piece', {
            class: slot === selected ? 'piece sel' : 'piece',
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
            title: `${fa(score)} امتیاز`,
            detail: `${fa(moves)} جابه‌جایی در ${fa(seconds)} ثانیه`,
            win: true,
          }),
        500,
      );
    }
    render();
    updateHud();
    api.setHint('دو تکه را پشت سر هم لمس کن تا جایشان عوض شود.');
    return () => clearInterval(clock);
  },
};
