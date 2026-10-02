// Plinko: drop a glowing lamp from the top; it bounces through the pegs into a prize bin.
// The bin is decided by the physics; the prize of each bin is dealt from the available stock.

import { h, setupCanvas, clamp, shuffle, host } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { store } from '../core/store.js';

const ROWS = 8;
const BINS = 7;
const GRAVITY = 1500; // px/s²
const BOUNCE = 0.55;

/**
 * Advances the ball by `delta` seconds (gravity, walls, peg collisions). Mutates `ball`.
 * Returns true when it hit a peg during this step. Exported so the physics can be tested without a canvas.
 */
export function stepBall(ball, pegs, { width, ballRadius, pegRadius }, delta) {
  let hitPeg = false;
  ball.vy += GRAVITY * delta;
  ball.x += ball.vx * delta;
  ball.y += ball.vy * delta;
  if (ball.x < ballRadius || ball.x > width - ballRadius) {
    ball.x = clamp(ball.x, ballRadius, width - ballRadius);
    ball.vx *= -BOUNCE;
  }
  for (const peg of pegs) {
    const dx = ball.x - peg.x;
    const dy = ball.y - peg.y;
    const distance = Math.hypot(dx, dy);
    const minimum = ballRadius + pegRadius;
    if (distance >= minimum || distance === 0) continue;
    const nx = dx / distance;
    const ny = dy / distance;
    ball.x = peg.x + nx * minimum;
    ball.y = peg.y + ny * minimum;
    const dot = ball.vx * nx + ball.vy * ny;
    // A ball landing dead-centre on a peg would balance there, so nudge it off to one side.
    const nudge = Math.abs(nx) < 0.3 ? (dx >= 0 ? 1 : -1) * 80 : 0;
    ball.vx = (ball.vx - 2 * dot * nx) * BOUNCE + (Math.random() - 0.5) * 40 + nudge;
    ball.vy = (ball.vy - 2 * dot * ny) * BOUNCE;
    hitPeg = true;
  }
  return hitPeg;
}

/** Peg positions for a board of the given size: staggered rows above the prize bins. */
export function createPegs(width, height) {
  const binWidth = width / BINS;
  const top = height * 0.14;
  const rowGap = (height * 0.66) / ROWS;
  const pegs = [];
  for (let row = 0; row < ROWS; row++) {
    const count = row % 2 === 0 ? BINS + 1 : BINS;
    const offset = row % 2 === 0 ? 0 : binWidth / 2;
    for (let column = 0; column < count; column++) pegs.push({ x: offset + column * binWidth, y: top + row * rowGap });
  }
  return pegs;
}

export default {
  id: 'plinko',
  title: 'پلینکو',
  blurb: 'لامپ را رها کن تا در خانهٔ جایزه بیفتد',
  emoji: '🔻',
  category: 'شانسی',
  kind: 'chance',
  mount(stage, api) {
    const width = Math.min(stage.clientWidth || 360, 420);
    const height = Math.round(width * 1.25);
    const canvas = h('canvas');
    const context = setupCanvas(canvas, width, height);
    stage.append(canvas);

    const binWidth = width / BINS;
    const pegRadius = width / 70;
    const ballRadius = width / 32;
    const pegs = createPegs(width, height);
    // One prize per bin: real prizes are spread between "empty" bins.
    const pool = store.availablePrizes();
    const bins = shuffle(Array.from({ length: BINS }, (_, index) => pool[index % pool.length]));
    const binTop = height - height * 0.12;

    let ball = null;
    let aimX = width / 2;
    let frame = 0;
    let previousTime = 0;
    let finished = false;

    function draw() {
      context.clearRect(0, 0, width, height);
      bins.forEach((prize, index) => {
        context.fillStyle = prize.color;
        context.globalAlpha = 0.9;
        context.fillRect(index * binWidth + 2, binTop, binWidth - 4, height - binTop);
        context.globalAlpha = 1;
        context.fillStyle = prize.empty ? '#c9d2f5' : '#10162c';
        context.font = `700 ${Math.round(width / 34)}px Vazirmatn, sans-serif`;
        context.textAlign = 'center';
        context.direction = 'rtl';
        context.fillText(prize.short, index * binWidth + binWidth / 2, binTop + (height - binTop) / 2 + 4);
      });
      context.fillStyle = '#8f9cd0';
      pegs.forEach((peg) => {
        context.beginPath();
        context.arc(peg.x, peg.y, pegRadius, 0, Math.PI * 2);
        context.fill();
      });
      const x = ball ? ball.x : aimX;
      const y = ball ? ball.y : ballRadius + 6;
      const glow = context.createRadialGradient(x, y, 2, x, y, ballRadius * 2.4);
      glow.addColorStop(0, '#fff6cf');
      glow.addColorStop(0.4, '#ffc21a');
      glow.addColorStop(1, '#ffc21a00');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(x, y, ballRadius * 2.4, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffc21a';
      context.beginPath();
      context.arc(x, y, ballRadius, 0, Math.PI * 2);
      context.fill();
    }

    function step(time) {
      const delta = Math.min(0.02, (time - previousTime) / 1000);
      previousTime = time;
      if (stepBall(ball, pegs, { width, ballRadius, pegRadius }, delta)) sfx.tick();
      draw();
      if (ball.y >= binTop + ballRadius) {
        finished = true;
        const index = clamp(Math.floor(ball.x / binWidth), 0, BINS - 1);
        const prize = bins[index];
        store.awardPrize('plinko', prize.id);
        store.countChancePlay('plinko');
        host.vibrate(60);
        api.finish({
          score: prize.empty ? 0 : 50,
          emoji: prize.empty ? '🙈' : '🎁',
          title: prize.empty ? 'این بار پوچ!' : prize.label,
          detail: prize.empty ? 'شانست را در بازی‌های دیگر امتحان کن.' : 'جایزه‌ات را از مسئول غرفه بگیر.',
          win: !prize.empty,
        });
        return;
      }
      frame = requestAnimationFrame(step);
    }

    function aim(event) {
      if (ball) return;
      const rect = canvas.getBoundingClientRect();
      aimX = clamp(event.clientX - rect.left, ballRadius * 2, width - ballRadius * 2);
      draw();
    }
    function drop() {
      if (ball || finished) return;
      sfx.tap();
      ball = { x: aimX, y: ballRadius + 6, vx: (Math.random() - 0.5) * 30, vy: 0 };
      previousTime = performance.now();
      frame = requestAnimationFrame(step);
    }
    canvas.addEventListener('pointerdown', aim);
    canvas.addEventListener('pointermove', (event) => event.buttons && aim(event));
    canvas.addEventListener('pointerup', drop);
    api.setHint('انگشتت را روی بالای صفحه جابه‌جا کن و رها کن.');
    draw();

    return () => cancelAnimationFrame(frame);
  },
};
