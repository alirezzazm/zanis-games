// Booth data kept on the device (localStorage): visitors, best scores, prize stock, settings.
// There is no server: the operator exports the visitor list as CSV from the operator panel.

import { CONFIG_VERSION, DEFAULT_PRIZES, DEFAULT_STATIONS } from '../data/config.js';

const KEY = 'zanis-games-v1';
const NO_PRIZE = { id: 'none', label: 'پوچ', short: 'پوچ', color: '#39446f', weight: 1, stock: -1, empty: true };

const initialState = () => ({
  version: 1,
  configVersion: CONFIG_VERSION,
  players: {}, // phone -> { name, phone, createdAt, scores: { [gameId]: best }, prizes: [{ gameId, label, at }], stamps: [], plays: {} }
  currentPhone: null,
  prizes: DEFAULT_PRIZES.map((prize) => ({ ...prize })),
  stations: DEFAULT_STATIONS.map((station) => ({ ...station })),
  // prizeRoundsPerVisitor: how many rounds of each chance game can win a prize (0 = unlimited).
  // Further rounds are still playable, as practice rounds that award nothing.
  settings: { pin: '1405', prizeRoundsPerVisitor: 1, muted: false },
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialState();
    const saved = JSON.parse(raw);
    const fresh = initialState();
    // Shallow-merge so fields added in newer versions get their defaults.
    const merged = { ...fresh, ...saved, settings: { ...fresh.settings, ...saved.settings } };
    if (saved.configVersion !== CONFIG_VERSION) {
      // The booth configuration shipped with the app changed: take the new prizes and stations.
      merged.prizes = fresh.prizes;
      merged.stations = fresh.stations;
      merged.configVersion = CONFIG_VERSION;
    }
    return merged;
  } catch {
    return initialState();
  }
}

let state = load();
const listeners = new Set();

function commit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable: keep playing with in-memory state.
  }
  listeners.forEach((listener) => listener(state));
}

export const store = {
  get state() {
    return state;
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  currentPlayer() {
    return state.currentPhone ? state.players[state.currentPhone] ?? null : null;
  },
  signIn(name, phone) {
    const existing = state.players[phone];
    state.players[phone] = existing
      ? { ...existing, name }
      : { name, phone, createdAt: Date.now(), scores: {}, prizes: [], stamps: [], plays: {} };
    state.currentPhone = phone;
    commit();
  },
  signOut() {
    state.currentPhone = null;
    commit();
  },

  totalScore(player) {
    return Object.values(player.scores).reduce((sum, score) => sum + score, 0);
  },
  /** Records a finished round; keeps the best score per game. Returns true when it is a new personal best. */
  recordScore(gameId, score, { countPlay = true } = {}) {
    const player = this.currentPlayer();
    if (!player) return false;
    if (countPlay) player.plays[gameId] = (player.plays[gameId] ?? 0) + 1;
    const isBest = score > (player.scores[gameId] ?? 0);
    if (isBest) player.scores[gameId] = score;
    commit();
    return isBest;
  },
  playsOf(gameId) {
    return this.currentPlayer()?.plays[gameId] ?? 0;
  },
  /**
   * True while the visitor can still win a prize in this chance game. Prize rounds are limited per
   * visitor so the stock lasts the whole exhibition; after that the game stays playable for fun.
   */
  hasPrizeRound(gameId) {
    const limit = state.settings.prizeRoundsPerVisitor;
    return limit === 0 || this.playsOf(gameId) < limit;
  },
  countChancePlay(gameId) {
    const player = this.currentPlayer();
    if (!player) return;
    player.plays[gameId] = (player.plays[gameId] ?? 0) + 1;
    commit();
  },

  /** Prizes that can still be won (stock left). "Empty" slots (stock = -1) are always available. */
  availablePrizes() {
    const available = state.prizes.filter((prize) => prize.stock !== 0 && prize.weight > 0);
    // If the operator ran every prize down to zero, the games still need something to land on.
    return available.length ? available : [NO_PRIZE];
  },
  /**
   * Weighted random draw among available prizes. A normal round decrements the stock and logs the
   * prize for the visitor; a practice round only picks what to show.
   */
  drawPrize(gameId, { practice = false } = {}) {
    const pool = this.availablePrizes();
    const totalWeight = pool.reduce((sum, prize) => sum + prize.weight, 0);
    let pick = Math.random() * totalWeight;
    const prize = pool.find((candidate) => (pick -= candidate.weight) < 0) ?? pool[pool.length - 1];
    if (practice) return prize;
    // The play is counted as soon as the prize is committed, so leaving the screen cannot re-roll it.
    this.countChancePlay(gameId);
    this.awardPrize(gameId, prize.id);
    return prize;
  },
  awardPrize(gameId, prizeId) {
    const prize = state.prizes.find((candidate) => candidate.id === prizeId);
    const player = this.currentPlayer();
    if (!prize) return;
    if (prize.stock > 0) prize.stock -= 1;
    if (player && !prize.empty) player.prizes.push({ gameId, label: prize.label, at: Date.now() });
    commit();
  },

  addStamp(stationId) {
    const player = this.currentPlayer();
    if (!player || player.stamps.includes(stationId)) return false;
    player.stamps.push(stationId);
    commit();
    return true;
  },

  leaderboard(gameId) {
    return Object.values(state.players)
      .map((player) => ({
        name: player.name,
        phone: player.phone,
        score: gameId ? player.scores[gameId] ?? 0 : this.totalScore(player),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
  },

  updateSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    commit();
  },
  updatePrize(prizeId, patch) {
    const prize = state.prizes.find((candidate) => candidate.id === prizeId);
    if (prize) Object.assign(prize, patch);
    commit();
  },
  exportCsv() {
    const header = 'name,phone,total_score,prizes,stamps,registered_at';
    const escape = (text) => `"${String(text).replace(/"/g, '""')}"`;
    const rows = Object.values(state.players).map((player) =>
      [
        escape(player.name),
        player.phone,
        this.totalScore(player),
        escape(player.prizes.map((prize) => prize.label).join(' | ')),
        player.stamps.length,
        new Date(player.createdAt).toISOString(),
      ].join(','),
    );
    return [header, ...rows].join('\n');
  },
  resetAll() {
    const { settings } = state;
    state = { ...initialState(), settings };
    commit();
  },
};
