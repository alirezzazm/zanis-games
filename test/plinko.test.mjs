// Plinko physics: every drop must reach the bins (no ball may balance on a peg forever).
import assert from 'node:assert/strict';
import { test } from 'node:test';

// The game modules import browser-only helpers; the physics functions themselves are pure.
globalThis.window = globalThis;
globalThis.document = { getElementById: () => null };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const { stepBall, createPegs } = await import('../web/js/games/plinko.js');

test('a ball dropped anywhere along the top always lands in a bin', () => {
  const width = 400;
  const height = 500;
  const dims = { width, ballRadius: width / 32, pegRadius: width / 70 };
  const pegs = createPegs(width, height);
  const binTop = height - height * 0.12;
  for (let drop = 0; drop < 400; drop++) {
    const ball = { x: 20 + (drop / 400) * (width - 40), y: dims.ballRadius + 6, vx: 0, vy: 0 };
    let steps = 0;
    while (ball.y < binTop + dims.ballRadius && steps < 3000) {
      stepBall(ball, pegs, dims, 1 / 60);
      steps += 1;
    }
    assert.ok(steps < 3000, `ball dropped at x=${ball.x.toFixed(1)} got stuck`);
    assert.ok(ball.x >= 0 && ball.x <= width, 'ball stays inside the board');
  }
});
