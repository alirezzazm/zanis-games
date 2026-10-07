// Settings of the lights game. The admin dashboard (server/) edits them; the apps download them and
// keep the last copy, so a round always has valid settings even offline. The same limits are
// enforced by the server (server/src/Zanis.Games.Api/Game/GameSettings.cs): keep both in step.
//
// A round has two levels: "normal" from the start, and "hard" from hardFromSecond on. The game
// changes level once, at exactly that second, without any message; within a level the pace stays
// the same. The grid of products (columns x rows) is set separately for Windows and Android.

export const DEFAULT_SETTINGS = Object.freeze({
  roundSeconds: 30,
  grids: { windows: { columns: 5, rows: 5 }, android: { columns: 3, rows: 4 } },
  hardFromSecond: 15,
  // visibleMs: how long a wave of lamps stays lit; yellow: yellow lamps per wave; red: the most red
  // (wrong) lamps lit with them; redChance: chance (percent) of each of those red lamps appearing.
  normal: { visibleMs: 1200, yellow: 1, red: 1, redChance: 30 },
  hard: { visibleMs: 700, yellow: 2, red: 2, redChance: 50 },
  // Dark pause between two waves.
  gapMs: 150,
  points: { yellow: 2, red: -3, empty: -1, missed: 0 },
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
  gridSide: [2, 6],
  visibleMs: [150, 5000],
  gapMs: [0, 2000],
  pointsYellow: [0, 100],
  pointsPenalty: [-100, 0],
  yellow: [1, 6],
  red: [0, 6],
  redChance: [0, 100],
  maxPlaysPerPhone: [0, 100],
  ticker: [0, 50],
});

const int = (value, [min, max], fallback) => {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

function normalizeLevel(raw, fallback, lampCount) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const yellow = Math.min(lampCount, int(source.yellow, LIMITS.yellow, fallback.yellow));
  return {
    visibleMs: int(source.visibleMs, LIMITS.visibleMs, fallback.visibleMs),
    yellow,
    red: Math.min(lampCount - yellow, int(source.red, LIMITS.red, fallback.red)),
    redChance: int(source.redChance, LIMITS.redChance, fallback.redChance),
  };
}

function normalizeGrid(raw, fallback) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    columns: int(source.columns, LIMITS.gridSide, fallback.columns),
    rows: int(source.rows, LIMITS.gridSide, fallback.rows),
  };
}

/**
 * Returns complete, in-range settings from whatever was stored or downloaded, for one platform
 * ('windows' or 'android'): columns, rows and lampCount are that platform's grid. The server already
 * validates the settings; this only protects the game from a damaged cache or an older server.
 */
export function normalizeSettings(raw, platform = 'android') {
  const source = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_SETTINGS;
  const roundSeconds = int(source.roundSeconds, LIMITS.roundSeconds, d.roundSeconds);
  const sourceGrids = source.grids && typeof source.grids === 'object' ? source.grids : {};
  const grids = {
    windows: normalizeGrid(sourceGrids.windows, d.grids.windows),
    android: normalizeGrid(sourceGrids.android, d.grids.android),
  };
  const grid = platform === 'windows' ? grids.windows : grids.android;
  const lampCount = grid.columns * grid.rows;
  const points = source.points && typeof source.points === 'object' ? source.points : {};

  return {
    roundSeconds,
    grids,
    columns: grid.columns,
    rows: grid.rows,
    lampCount,
    hardFromSecond: int(source.hardFromSecond, [0, roundSeconds - 1], Math.min(d.hardFromSecond, roundSeconds - 1)),
    normal: normalizeLevel(source.normal, d.normal, lampCount),
    hard: normalizeLevel(source.hard, d.hard, lampCount),
    gapMs: int(source.gapMs, LIMITS.gapMs, d.gapMs),
    points: {
      yellow: int(points.yellow, LIMITS.pointsYellow, d.points.yellow),
      red: int(points.red, LIMITS.pointsPenalty, d.points.red),
      empty: int(points.empty, LIMITS.pointsPenalty, d.points.empty),
      missed: int(points.missed, LIMITS.pointsPenalty, d.points.missed),
    },
    maxPlaysPerPhone: int(source.maxPlaysPerPhone, LIMITS.maxPlaysPerPhone, d.maxPlaysPerPhone),
    tickerRecent: int(source.tickerRecent, LIMITS.ticker, d.tickerRecent),
    tickerTop: int(source.tickerTop, LIMITS.ticker, d.tickerTop),
    tickerTopToday: typeof source.tickerTopToday === 'boolean' ? source.tickerTopToday : d.tickerTopToday,
  };
}
