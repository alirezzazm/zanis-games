// Talks to the game server: downloads the game settings, sends tournament scores (queued while
// offline) and reads the scores for the scrolling bar. Every call fails soft: the game never waits
// for the network longer than TIMEOUT_MS and keeps working with what it has on the device.

import { store } from './store.js';
import { DEFAULT_SERVER_URL } from '../data/config.js';
import { normalizeSettings } from '../game/settings.js';

const TIMEOUT_MS = 6000;

/** What the operator panel shows about the connection. */
export const status = { online: null, keyRejected: false, lastError: '' };

export function serverUrl() {
  const chosen = String(store.booth.serverUrl || '').trim().replace(/\/+$/, '');
  if (chosen) return chosen;
  // The /play/ page of the server itself (practice in a browser): same origin.
  if (/^https?:$/.test(location.protocol) && location.pathname.startsWith('/play/')) return location.origin;
  return DEFAULT_SERVER_URL.replace(/\/+$/, '');
}

class HttpError extends Error {
  constructor(statusCode, body) {
    super(body?.message || `HTTP ${statusCode}`);
    this.status = statusCode;
    this.body = body;
  }
}

async function request(path, { method = 'GET', body, kiosk = false, timeout = TIMEOUT_MS } = {}) {
  const base = serverUrl();
  if (!base) throw new Error('no server address');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (kiosk) headers['X-Kiosk-Key'] = store.booth.kioskKey;
    const response = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });
    const data = await response.json().catch(() => null);
    status.online = true;
    if (!response.ok) throw new HttpError(response.status, data);
    return data;
  } catch (error) {
    if (!(error instanceof HttpError)) {
      status.online = false;
      status.lastError = error?.name === 'AbortError' ? 'timeout' : String(error?.message || error);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Settings for the next round on this platform: the last ones from the server, or the defaults. */
export function currentSettings(platform = 'android') {
  return normalizeSettings(store.remote?.settings, platform);
}

/** Downloads the settings; true when they were refreshed. */
export async function refreshSettings() {
  try {
    const data = await request('/api/game/settings');
    if (!data?.settings) return false;
    store.setRemote({ version: data.version, updatedAt: data.updatedAt, settings: data.settings });
    return true;
  } catch {
    return false;
  }
}

/** Server answers for rounds sent in this session, by clientId: { rank, best, plays }. */
const receipts = new Map();
let flushing = null;

/** Sends every queued round, oldest first; stops at the first network or key problem. */
export function flushPending() {
  if (flushing) return flushing;
  flushing = (async () => {
    if (!store.booth.kioskKey) return;
    for (const round of [...store.state.pending]) {
      try {
        const data = await request('/api/kiosk/scores', { method: 'POST', body: round, kiosk: true });
        status.keyRejected = false;
        receipts.set(round.clientId, data);
        store.markSent(round.clientId);
      } catch (error) {
        if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
          status.keyRejected = true;
          return;
        }
        // A round the server refuses as invalid would block the queue for ever; it stays in the
        // device history (CSV export) but is not sent again.
        if (error instanceof HttpError && error.status === 400) {
          store.markSent(round.clientId);
          continue;
        }
        return;
      }
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Sends a finished round (and anything queued before it); resolves with its rank, or null offline. */
export async function submitRound(round) {
  await flushPending();
  if (!receipts.has(round.clientId)) await flushPending();
  return receipts.get(round.clientId) ?? null;
}

/** Rounds this number has played on any booth computer, or null when the server is unreachable. */
export async function playsOnServer(phone) {
  if (!store.booth.kioskKey) return null;
  try {
    const data = await request(`/api/kiosk/plays?phone=${encodeURIComponent(phone)}`, { kiosk: true, timeout: 3000 });
    return typeof data?.plays === 'number' ? data.plays : null;
  } catch {
    return null;
  }
}

/** Checks the address and the kiosk key for the operator panel. */
export async function testConnection() {
  try {
    await request('/api/game/settings');
  } catch (error) {
    return { ok: false, message: error instanceof HttpError ? `سرور خطا داد (${error.status}).` : 'سرور در دسترس نیست.' };
  }
  if (!store.booth.kioskKey) return { ok: true, message: 'سرور در دسترس است. کلید دستگاه وارد نشده است.' };
  try {
    const data = await request('/api/kiosk/ping', { kiosk: true });
    status.keyRejected = false;
    return { ok: true, message: `وصل شد: «${data?.kiosk ?? 'دستگاه'}».` };
  } catch (error) {
    if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
      status.keyRejected = true;
      return { ok: false, message: 'کلید دستگاه را سرور نپذیرفت. کلید تازه را از داشبورد بگیرید.' };
    }
    return { ok: false, message: 'سرور در دسترس نیست.' };
  }
}

/** "علی رضایی" -> "علی ر." — the scrolling bar never shows full names or numbers. */
export function shortName(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'بازیکن';
  return words.length > 1 ? `${words[0]} ${words[1][0]}.` : words[0];
}

function tehranDay(date) {
  return new Date(date).toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' });
}

/** The bar's data built from this device alone (used while the server is unreachable). */
function localTicker(settings) {
  const history = store.state.history;
  const recent = history.slice(0, settings.tickerRecent).map((round) => ({ name: shortName(round.name), score: round.score }));
  const today = tehranDay(Date.now());
  const best = new Map();
  for (const round of history) {
    if (settings.tickerTopToday && tehranDay(round.playedAt) !== today) continue;
    if ((best.get(round.phone)?.score ?? -1) < round.score) best.set(round.phone, round);
  }
  const top = [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, settings.tickerTop)
    .map((round) => ({ name: shortName(round.name), score: round.score }));
  return { recent, top };
}

/** Scores for the scrolling bar: from the server, or from this device when offline. */
export async function fetchTicker() {
  const settings = currentSettings();
  try {
    const data = await request('/api/game/ticker');
    if (Array.isArray(data?.recent) && Array.isArray(data?.top)) return { recent: data.recent, top: data.top };
  } catch {
    // fall through to the local copy
  }
  return localTicker(settings);
}
