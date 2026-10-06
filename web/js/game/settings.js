// Settings of the lights game. The admin dashboard (server/) edits them; the apps download them and
// keep the last copy, so a round always has valid settings even offline. The same limits are
// enforced by the server (server/src/Zanis.Games.Api/Game/GameSettings.cs): keep both in step.

export const DEFAULT_SETTINGS = Object.freeze({
  roundSeconds: 30,
  lampCount: 12,
  // How long a wave of lamps stays lit, at the start and at the end of the round (milliseconds).
  // The time shrinks evenly in between, so the game keeps getting faster.
  startVisibleMs: 1300,
  endVisibleMs: 500,
  // Dark pause between two waves.
  gapMs: 150,
  points: { yellow: 2, red: -3, empty: -1, missed: 0 },
  // From each stage's second on: how many yellow lamps light together, the most red (wrong) lamps
  // that may light with them, and the chance (percent) of each of those red lamps appearing.
  stages: [
    { fromSecond: 0, yellow: 1, red: 1, redChance: 30 },
    { fromSecond: 10, yellow: 2, red: 1, redChance: 40 },
    { fromSecond: 20, yellow: 2, red: 2, redChance: 50 },
  ],
  // Rounds one mobile number may play in the tournament (Windows); 0 = unlimited.
  maxPlaysPerPhone: 0,
  // Scrolling bar on the Windows game: latest scores and the best players.
  tickerRecent: 15,
  tickerTop: 10,
  // true: the best players of today (Tehran time); false: of all time.
  tickerTopToday: true,
});

export const LIMITS = Object.freeze({
  roundSeconds: [10, 300],
  lampCount: [4, 24],
  startVisibleMs: [200, 5000],
  endVisibleMs: [150, 5000],
  gapMs: [0, 2000],
  pointsYellow: [0, 100],
  pointsPenalty: [-100, 0],
  stages: [1, 10],
  lampsPerWave: [0, 6],
  redChance: [0, 100],
  maxPlaysPerPhone: [0, 100],
  ticker: [0, 50],
});

const int = (value, [min, max], fallback) => {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

/**
 * Returns complete, in-range settings from whatever was stored or downloaded. The server already
 * validates them; this only protects the game from a damaged cache or an older server.
 */
export function normalizeSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_SETTINGS;
  const roundSeconds = int(source.roundSeconds, LIMITS.roundSeconds, d.roundSeconds);
  const lampCount = int(source.lampCount, LIMITS.lampCount, d.lampCount);
  const startVisibleMs = int(source.startVisibleMs, LIMITS.startVisibleMs, d.startVisibleMs);
  const endVisibleMs = Math.min(startVisibleMs, int(source.endVisibleMs, LIMITS.endVisibleMs, d.endVisibleMs));
  const points = source.points && typeof source.points === 'object' ? source.points : {};

  let stages = Array.isArray(source.stages) ? source.stages : d.stages;
  stages = stages
    .slice(0, LIMITS.stages[1])
    .map((stage) => {
      const yellow = Math.max(1, int(stage?.yellow, LIMITS.lampsPerWave, 1));
      return {
        fromSecond: int(stage?.fromSecond, [0, roundSeconds - 1], 0),
        yellow: Math.min(yellow, lampCount),
        red: Math.min(int(stage?.red, LIMITS.lampsPerWave, 0), Math.max(0, lampCount - yellow)),
        redChance: int(stage?.redChance, LIMITS.redChance, 0),
      };
    })
    .sort((a, b) => a.fromSecond - b.fromSecond)
    .filter((stage, index, list) => index === 0 || stage.fromSecond !== list[index - 1].fromSecond);
  if (!stages.length) stages = d.stages.map((stage) => ({ ...stage }));
  stages[0] = { ...stages[0], fromSecond: 0 };

  return {
    roundSeconds,
    lampCount,
    startVisibleMs,
    endVisibleMs,
    gapMs: int(source.gapMs, LIMITS.gapMs, d.gapMs),
    points: {
      yellow: int(points.yellow, LIMITS.pointsYellow, d.points.yellow),
      red: int(points.red, LIMITS.pointsPenalty, d.points.red),
      empty: int(points.empty, LIMITS.pointsPenalty, d.points.empty),
      missed: int(points.missed, LIMITS.pointsPenalty, d.points.missed),
    },
    stages,
    maxPlaysPerPhone: int(source.maxPlaysPerPhone, LIMITS.maxPlaysPerPhone, d.maxPlaysPerPhone),
    tickerRecent: int(source.tickerRecent, LIMITS.ticker, d.tickerRecent),
    tickerTop: int(source.tickerTop, LIMITS.ticker, d.tickerTop),
    tickerTopToday: typeof source.tickerTopToday === 'boolean' ? source.tickerTopToday : d.tickerTopToday,
  };
}
