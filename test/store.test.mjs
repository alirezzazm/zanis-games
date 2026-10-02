// Booth store: sign-in, best scores, prize stock and the per-visitor limit on chance games.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const memory = new Map();
globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
const { store } = await import('../web/js/core/store.js');
const { normalizePhone, fa, toLatinDigits } = await import('../web/js/core/util.js').catch(() => ({}));

test('keeps the best score per game and totals them', () => {
  store.signIn('علی', '09121234567');
  assert.equal(store.recordScore('quiz', 40), true);
  assert.equal(store.recordScore('quiz', 25), false);
  store.recordScore('memory', 80);
  assert.equal(store.totalScore(store.currentPlayer()), 120);
  assert.equal(store.leaderboard()[0].score, 120);
});

test('a chance game can be played once per visitor and the stock goes down', () => {
  assert.equal(store.canPlayChance('wheel'), true);
  const before = store.state.prizes.map((prize) => prize.stock);
  const prize = store.drawPrize('wheel');
  assert.equal(store.canPlayChance('wheel'), false);
  const index = store.state.prizes.findIndex((candidate) => candidate.id === prize.id);
  assert.equal(store.state.prizes[index].stock, before[index] > 0 ? before[index] - 1 : before[index]);
});

test('a prize with no stock left is never drawn', () => {
  store.state.prizes.forEach((prize) => store.updatePrize(prize.id, { stock: prize.id === 'cap' ? 5 : 0 }));
  for (let draw = 0; draw < 5; draw++) assert.equal(store.drawPrize('scratch').id, 'cap');
  // Nothing left: the games fall back to a single empty slot instead of crashing.
  assert.deepEqual(
    store.availablePrizes().map((prize) => prize.id),
    ['none'],
  );
  assert.equal(store.drawPrize('plinko').empty, true);
});

test('CSV export has one row per visitor and escapes quotes', () => {
  store.signIn('رضا "برق"', '09350000000');
  const lines = store.exportCsv().split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[2], /"رضا ""برق"""/);
});

test('phone and digit helpers', { skip: !normalizePhone }, () => {
  assert.equal(normalizePhone('۰۹۱۲ ۱۲۳ ۴۵۶۷'), '09121234567');
  assert.equal(normalizePhone('+98 912 123 4567'), '09121234567');
  assert.equal(normalizePhone('12345'), null);
  assert.equal(fa(1234567), '۱٬۲۳۴٬۵۶۷');
  assert.equal(toLatinDigits('٣۴'), '34');
});
