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

test('one prize round per chance game; later rounds are practice and leave the stock alone', () => {
  assert.equal(store.hasPrizeRound('wheel'), true);
  const before = store.state.prizes.map((prize) => prize.stock);
  const prize = store.drawPrize('wheel');
  assert.equal(store.hasPrizeRound('wheel'), false);
  const index = store.state.prizes.findIndex((candidate) => candidate.id === prize.id);
  assert.equal(store.state.prizes[index].stock, before[index] > 0 ? before[index] - 1 : before[index]);

  const stockAfterPrizeRound = store.state.prizes.map((candidate) => candidate.stock);
  const prizesWon = store.currentPlayer().prizes.length;
  for (let round = 0; round < 20; round++) store.drawPrize('wheel', { practice: true });
  assert.deepEqual(store.state.prizes.map((candidate) => candidate.stock), stockAfterPrizeRound);
  assert.equal(store.currentPlayer().prizes.length, prizesWon);

  store.updateSettings({ prizeRoundsPerVisitor: 0 });
  assert.equal(store.hasPrizeRound('wheel'), true, '0 means unlimited prize rounds');
  store.updateSettings({ prizeRoundsPerVisitor: 1 });
});

test('a prize with no stock left is never drawn', () => {
  store.state.prizes.forEach((prize) => store.updatePrize(prize.id, { stock: prize.id === 'tape' ? 5 : 0 }));
  for (let draw = 0; draw < 5; draw++) assert.equal(store.drawPrize('scratch').id, 'tape');
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

test('a new CONFIG_VERSION replaces saved prizes and stations but keeps visitors', async () => {
  const saved = JSON.parse(memory.get('zanis-games-v1'));
  saved.configVersion = 0;
  saved.prizes = [{ id: 'old', label: 'old prize', short: 'old', color: '#000', weight: 1, stock: 3 }];
  memory.set('zanis-games-v1', JSON.stringify(saved));
  const { store: reloaded } = await import('../web/js/core/store.js?reload=1');
  assert.ok(reloaded.state.prizes.some((prize) => prize.id === 'bulb12'));
  assert.ok(!reloaded.state.prizes.some((prize) => prize.id === 'old'));
  assert.ok(reloaded.state.players['09121234567'], 'visitors survive the config update');
});
