// Rules of the lights game: settings limits, the switch to the hard level, wave picking and scoring.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS, normalizeSettings } from '../web/js/game/settings.js';
import { bestColumns, createTally, isHard, levelAt, planWave } from '../web/js/game/engine.js';

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
    hardFromSecond: 50,
    normal: { visibleMs: 20, yellow: 9, red: 9, redChance: 300 },
    hard: 'broken',
    points: { yellow: -4, red: 7, empty: 'x' },
    tickerTopToday: 'yes',
  });
  assert.equal(settings.roundSeconds, 10);
  assert.equal(settings.lampCount, 24);
  assert.equal(settings.hardFromSecond, 9, 'the switch happens before the round ends');
  assert.deepEqual(settings.normal, { visibleMs: 150, yellow: 6, red: 6, redChance: 100 });
  assert.deepEqual(settings.hard, DEFAULT_SETTINGS.hard);
  assert.deepEqual(settings.points, { yellow: 0, red: 0, empty: -1, missed: 0 });
  assert.equal(settings.tickerTopToday, true);
});

test('a wave never asks for more lamps than the grid has', () => {
  const settings = normalizeSettings({ lampCount: 5, hard: { visibleMs: 500, yellow: 4, red: 6, redChance: 100 } });
  assert.deepEqual(settings.hard, { visibleMs: 500, yellow: 4, red: 1, redChance: 100 });
});

test('the round turns hard once, exactly at the chosen second', () => {
  const settings = normalizeSettings(DEFAULT_SETTINGS);
  assert.equal(isHard(settings, 14_999), false);
  assert.equal(isHard(settings, 15_000), true);
  assert.equal(levelAt(settings, 0).yellow, 1);
  assert.equal(levelAt(settings, 29_000).yellow, 2);
  // The pace is constant within a level.
  assert.equal(planWave(settings, 1_000).visibleMs, 1200);
  assert.equal(planWave(settings, 10_000).visibleMs, 1200);
  assert.equal(planWave(settings, 15_000).visibleMs, 700);
  assert.equal(planWave(settings, 29_000).visibleMs, 700);
});

test('a wave lit just before the switch ends at the switch', () => {
  const settings = normalizeSettings(DEFAULT_SETTINGS);
  const wave = planWave(settings, 14_600);
  assert.equal(wave.visibleMs, 400);
  assert.equal(wave.endsAtSwitch, true);
  assert.equal(planWave(settings, 5_000).endsAtSwitch, false);
  assert.equal(planWave(settings, 20_000).endsAtSwitch, false);
});

test('waves light the level counts on distinct lamps, avoiding the previous wave', () => {
  const settings = normalizeSettings({ lampCount: 12, hardFromSecond: 0, hard: { visibleMs: 500, yellow: 2, red: 2, redChance: 100 } });
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
  const settings = normalizeSettings({ normal: { visibleMs: 900, yellow: 1, red: 1, redChance: 30 } });
  const random = seeded(42);
  let reds = 0;
  for (let i = 0; i < 4000; i++) reds += planWave(settings, 0, [], random).red.length;
  assert.ok(reds > 4000 * 0.25 && reds < 4000 * 0.35, `got ${reds}`);
  const never = normalizeSettings({ normal: { visibleMs: 900, yellow: 1, red: 3, redChance: 0 } });
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
