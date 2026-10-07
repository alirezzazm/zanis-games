// Rules of the lights game, free of DOM and timers so they can be unit-tested (test/engine.test.mjs).

/** True from hardFromSecond on: the round switches to the hard level once, at that second. */
export function isHard(settings, elapsedMs) {
  return elapsedMs >= settings.hardFromSecond * 1000;
}

/** The level in force at a moment of the round. */
export function levelAt(settings, elapsedMs) {
  return isHard(settings, elapsedMs) ? settings.hard : settings.normal;
}

/**
 * Picks the lamps of the next wave: the level's number of yellow lamps, plus up to `red` red lamps,
 * each appearing with redChance percent. Lamps of the previous wave are avoided when possible, so
 * a lamp never seems to "stay on".
 * @param {() => number} random a [0, 1) generator (Math.random in the game, seeded in tests)
 */
export function planWave(settings, elapsedMs, previous = [], random = Math.random) {
  const level = levelAt(settings, elapsedMs);
  let reds = 0;
  for (let slot = 0; slot < level.red; slot++) {
    if (random() * 100 < level.redChance) reds++;
  }
  const needed = level.yellow + reds;
  const visibleMs = isHard(settings, elapsedMs)
    ? level.visibleMs
    : Math.max(1, Math.min(level.visibleMs, settings.hardFromSecond * 1000 - elapsedMs));

  const all = Array.from({ length: settings.lampCount }, (_, index) => index);
  const fresh = all.filter((index) => !previous.includes(index));
  const pool = fresh.length >= needed ? fresh : all;
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return {
    yellow: pool.slice(0, level.yellow),
    red: pool.slice(level.yellow, needed),
    visibleMs,
    // A wave lit just before the switch is cut short so the hard level starts on time; its
    // untouched yellow lamps are not counted as missed.
    endsAtSwitch: visibleMs < level.visibleMs,
  };
}

/**
 * Score bookkeeping of one round. kind: 'yellow' (hit a lit yellow lamp), 'red' (hit a red lamp),
 * 'empty' (hit a dark lamp) or 'missed' (a yellow lamp went dark untouched). The score never drops
 * below zero.
 */
export function createTally(settings) {
  const counts = { yellow: 0, red: 0, empty: 0, missed: 0 };
  let score = 0;
  return {
    add(kind, times = 1) {
      counts[kind] += times;
      const delta = settings.points[kind] * times;
      score = Math.max(0, score + delta);
      return delta;
    },
    get score() {
      return score;
    },
    get counts() {
      return { ...counts };
    },
  };
}
