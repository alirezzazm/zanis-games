// Rules of the lights game: settings limits, stages, speed, wave picking and scoring.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS, normalizeSettings } from '../web/js/game/settings.js';
import { bestColumns, createTally, planWave, stageAt, visibleMsAt } from '../web/js/game/engine.js';

/** Small deterministic [0, 1) generator. */
function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

test('defaults survive normalisation unchanged', () => {
  assert.deepEqual(normalizeSettings(DEFAULT_SETTINGS), JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
  assert.deepEqual(normalizeSettings(null), normalizeSettings(DEFAULT_SETTINGS));
});

test('out-of-range and broken values are clamped or replaced', () => {
  const settings = normalizeSettings({
    roundSeconds: 5,
    lampCount: 99,
    startVisibleMs: 600,
    endVisibleMs: 900,
    points: { yellow: -4, red: 7, empty: 'x' },
    stages: [
      { fromSecond: 3, yellow: 9, red: 9, redChance: 300 },
      { fromSecond: 3, yellow: 1, red: 0, redChance: 0 },
    ],
    tickerTopToday: 'yes',
  });
  assert.equal(settings.roundSeconds, 10);
  assert.equal(settings.lampCount, 24);
  assert.equal(settings.endVisibleMs, 600, 'the end of the round is never slower than the start');
  assert.deepEqual(settings.points, { yellow: 0, red: 0, empty: -1, missed: 0 });
  assert.equal(settings.stages.length, 1, 'stages starting at the same second collapse to one');
  assert.deepEqual(settings.stages[0], { fromSecond: 0, yellow: 6, red: 6, redChance: 100 });
  assert.equal(settings.tickerTopToday, true);
});

test('a wave never asks for more lamps than the grid has', () => {
  const settings = normalizeSettings({ lampCount: 5, stages: [{ fromSecond: 0, yellow: 4, red: 6, redChance: 100 }] });
  assert.deepEqual(settings.stages[0], { fromSecond: 0, yellow: 4, red: 1, redChance: 100 });
});

test('the stage follows the clock and the pace speeds up evenly', () => {
  const settings = normalizeSettings(DEFAULT_SETTINGS);
  assert.equal(stageAt(settings, 0).yellow, 1);
  assert.equal(stageAt(settings, 9_999).yellow, 1);
  assert.equal(stageAt(settings, 10_000).yellow, 2);
  assert.equal(stageAt(settings, 25_000).red, 2);
  assert.equal(visibleMsAt(settings, 0), 1300);
  assert.equal(visibleMsAt(settings, 15_000), 900);
  assert.equal(visibleMsAt(settings, 30_000), 500);
  assert.equal(visibleMsAt(settings, 99_000), 500);
});

test('waves light the stage counts on distinct lamps, avoiding the previous wave', () => {
  const settings = normalizeSettings({
    lampCount: 12,
    stages: [{ fromSecond: 0, yellow: 2, red: 2, redChance: 100 }],
  });
  const random = seeded(7);
  let previous = [];
  for (let i = 0; i < 200; i++) {
    const wave = planWave(settings, 0, previous, random);
    const lamps = [...wave.yellow, ...wave.red];
    assert.equal(wave.yellow.length, 2);
    assert.equal(wave.red.length, 2);
    assert.equal(new Set(lamps).size, 4);
    assert.ok(lamps.every((lamp) => lamp >= 0 && lamp < 12));
    assert.ok(lamps.every((lamp) => !previous.includes(lamp)));
    previous = lamps;
  }
});

test('red lamps appear about as often as the chance says', () => {
  const settings = normalizeSettings({ stages: [{ fromSecond: 0, yellow: 1, red: 1, redChance: 30 }] });
  const random = seeded(42);
  let reds = 0;
  for (let i = 0; i < 4000; i++) reds += planWave(settings, 0, [], random).red.length;
  assert.ok(reds > 4000 * 0.25 && reds < 4000 * 0.35, `got ${reds}`);
  const never = normalizeSettings({ stages: [{ fromSecond: 0, yellow: 1, red: 3, redChance: 0 }] });
  assert.equal(planWave(never, 0, [], random).red.length, 0);
});

test('scoring adds the configured points and never goes below zero', () => {
  const tally = createTally(normalizeSettings(DEFAULT_SETTINGS));
  assert.equal(tally.add('red'), -3);
  assert.equal(tally.score, 0);
  tally.add('yellow');
  tally.add('yellow');
  tally.add('yellow');
  tally.add('empty');
  assert.equal(tally.score, 5);
  tally.add('missed', 2);
  assert.deepEqual(tally.counts, { yellow: 3, red: 1, empty: 1, missed: 2 });
});

test('the grid shape fits the screen', () => {
  assert.equal(bestColumns(12, 360, 600), 3, 'portrait phone: 3 x 4');
  assert.equal(bestColumns(12, 1200, 500), 6, 'wide monitor: 6 x 2');
  assert.equal(bestColumns(16, 800, 800), 4);
});
