// Rules of the lights game, free of DOM and timers so they can be unit-tested (test/engine.test.mjs).

/** The stage in force at a moment of the round (stages are sorted, the first starts at 0). */
export function stageAt(settings, elapsedMs) {
  const second = elapsedMs / 1000;
  let current = settings.stages[0];
  for (const stage of settings.stages) {
    if (stage.fromSecond <= second) current = stage;
  }
  return current;
}

/** How long a wave stays lit: shrinks evenly from startVisibleMs to endVisibleMs over the round. */
export function visibleMsAt(settings, elapsedMs) {
  const progress = Math.min(1, Math.max(0, elapsedMs / (settings.roundSeconds * 1000)));
  return Math.round(settings.startVisibleMs + (settings.endVisibleMs - settings.startVisibleMs) * progress);
}

/**
 * Picks the lamps of the next wave: the stage's number of yellow lamps, plus up to `red` red lamps,
 * each appearing with redChance percent. Lamps of the previous wave are avoided when possible, so
 * a lamp never seems to "stay on".
 * @param {() => number} random a [0, 1) generator (Math.random in the game, seeded in tests)
 */
export function planWave(settings, elapsedMs, previous = [], random = Math.random) {
  const stage = stageAt(settings, elapsedMs);
  let reds = 0;
  for (let slot = 0; slot < stage.red; slot++) {
    if (random() * 100 < stage.redChance) reds++;
  }
  const needed = stage.yellow + reds;

  const all = Array.from({ length: settings.lampCount }, (_, index) => index);
  const fresh = all.filter((index) => !previous.includes(index));
  const pool = fresh.length >= needed ? fresh : all;
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return {
    yellow: pool.slice(0, stage.yellow),
    red: pool.slice(stage.yellow, needed),
    visibleMs: visibleMsAt(settings, elapsedMs),
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

/** Columns for a grid of `count` square cells that makes the cells as big as the box allows. */
export function bestColumns(count, width, height, gap = 12) {
  let best = { columns: Math.ceil(Math.sqrt(count)), size: 0 };
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const size = Math.min((width - gap * (columns - 1)) / columns, (height - gap * (rows - 1)) / rows);
    if (size > best.size + 0.5) best = { columns, size };
  }
  return best.columns;
}
