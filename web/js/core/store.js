// Data kept on the device (localStorage): booth settings, the last game settings from the server,
// the player at the screen, finished rounds, and scores still waiting to reach the server.

const KEY = 'zanis-lights-v1';
const HISTORY_LIMIT = 500;

const initialState = () => ({
  version: 1,
  // Booth settings, changed in the operator panel (hold the logo). serverUrl empty = the default
  // address built into the app (see data/config.js).
  booth: { pin: '1405', muted: false, serverUrl: '', kioskKey: '' },
  // Last settings downloaded from the server: { version, updatedAt, settings }.
  remote: null,
  // Player signed in on the Windows game: { name, phone }.
  player: null,
  // Finished tournament rounds on this device, newest first.
  history: [],
  // Rounds not yet accepted by the server (sent again when the connection is back).
  pending: [],
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialState();
    const saved = JSON.parse(raw);
    const fresh = initialState();
    return {
      ...fresh,
      ...saved,
      booth: { ...fresh.booth, ...saved.booth },
      history: Array.isArray(saved.history) ? saved.history : [],
      pending: Array.isArray(saved.pending) ? saved.pending : [],
    };
  } catch {
    return initialState();
  }
}

let state = load();

function commit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable: keep going with the in-memory state.
  }
}

/** A unique id per round, so a round sent twice (retry after a timeout) is stored once. */
function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export const store = {
  get state() {
    return state;
  },

  get booth() {
    return state.booth;
  },
  updateBooth(patch) {
    state.booth = { ...state.booth, ...patch };
    commit();
  },

  get remote() {
    return state.remote;
  },
  setRemote(remote) {
    state.remote = remote;
    commit();
  },

  get player() {
    return state.player;
  },
  signIn(name, phone) {
    state.player = { name, phone };
    commit();
  },
  signOut() {
    state.player = null;
    commit();
  },

  /** Rounds this mobile number has played on this device. */
  playsOf(phone) {
    return state.history.filter((round) => round.phone === phone).length;
  },

  /** Saves a finished tournament round and queues it for the server. Returns the saved round. */
  recordRound({ name, phone, score, counts, settingsVersion }) {
    const round = {
      clientId: newId(),
      name,
      phone,
      score,
      hits: counts.yellow,
      redTaps: counts.red,
      wrongTaps: counts.empty,
      missed: counts.missed,
      settingsVersion: settingsVersion ?? 0,
      playedAt: new Date().toISOString(),
    };
    state.history = [round, ...state.history].slice(0, HISTORY_LIMIT);
    state.pending = [...state.pending, round];
    commit();
    return round;
  },
  markSent(clientId) {
    state.pending = state.pending.filter((round) => round.clientId !== clientId);
    commit();
  },

  exportCsv() {
    const header = 'name,phone,score,hits,red_taps,wrong_taps,missed,played_at,sent';
    const escape = (text) => `"${String(text).replace(/"/g, '""')}"`;
    const pendingIds = new Set(state.pending.map((round) => round.clientId));
    const rows = state.history.map((round) =>
      [escape(round.name), round.phone, round.score, round.hits, round.redTaps, round.wrongTaps, round.missed,
        round.playedAt, pendingIds.has(round.clientId) ? 'no' : 'yes'].join(','),
    );
    return [header, ...rows].join('\n');
  },
  /** Clears the rounds of this device; rounds not yet sent stay queued unless includePending. */
  clearHistory({ includePending = false } = {}) {
    const pendingIds = new Set(state.pending.map((round) => round.clientId));
    state.history = includePending ? [] : state.history.filter((round) => pendingIds.has(round.clientId));
    if (includePending) state.pending = [];
    state.player = null;
    commit();
  },
};
