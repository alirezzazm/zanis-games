// Device store and score sync: rounds are queued, sent once, and the bar works offline.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const memory = new Map();
globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
globalThis.location = { protocol: 'https:', pathname: '/', origin: 'https://example.test' };
const { store } = await import('../web/js/core/store.js');
const sync = await import('../web/js/core/sync.js');
const { normalizePhone } = await import('../web/js/core/util.js');

const counts = { yellow: 10, red: 1, empty: 2, missed: 3 };
const offline = async () => {
  throw new TypeError('Failed to fetch');
};

test('a finished round is kept and queued for the server', () => {
  const round = store.recordRound({ name: 'مریم احمدی', phone: '09121234567', score: 17, counts, settingsVersion: 4 });
  assert.equal(round.hits, 10);
  assert.equal(round.redTaps, 1);
  assert.equal(store.state.pending.length, 1);
  assert.equal(store.playsOf('09121234567'), 1);
  assert.match(store.exportCsv(), /"مریم احمدی",09121234567,17,10,1,2,3,.*,no/);
});

test('queued rounds are sent with the kiosk key, once, and the receipt gives the rank', async () => {
  store.updateBooth({ serverUrl: 'https://games.example.test/', kioskKey: 'zk_test' });
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 201, json: async () => ({ rank: 2, best: 17, plays: 1 }) };
  };
  const round = store.recordRound({ name: 'علی', phone: '09351112233', score: 9, counts, settingsVersion: 4 });
  const receipt = await sync.submitRound(round);
  assert.equal(receipt.rank, 2);
  assert.equal(calls.length, 2, 'the earlier queued round is sent too');
  assert.equal(calls[0].url, 'https://games.example.test/api/kiosk/scores');
  assert.equal(calls[0].init.headers['X-Kiosk-Key'], 'zk_test');
  assert.equal(store.state.pending.length, 0);
});

test('offline rounds stay queued; a rejected key stops the queue', async () => {
  globalThis.fetch = offline;
  const round = store.recordRound({ name: 'سارا', phone: '09191234567', score: 3, counts, settingsVersion: 4 });
  assert.equal(await sync.submitRound(round), null);
  assert.equal(store.state.pending.length, 1);
  assert.equal(sync.status.online, false);

  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: 'bad key' }) });
  await sync.flushPending();
  assert.equal(store.state.pending.length, 1);
  assert.equal(sync.status.keyRejected, true);
});

test('the scrolling bar falls back to this device with short names', async () => {
  globalThis.fetch = offline;
  const { top, recent } = await sync.fetchTicker();
  assert.equal(recent[0].name, 'سارا');
  assert.deepEqual(top[0], { name: 'مریم ا.', score: 17 });
  assert.ok(!JSON.stringify({ top, recent }).includes('0912'), 'no phone numbers on screen');
});

test('downloaded settings are normalised before use', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ version: 5, updatedAt: '2026-10-06T10:00:00Z', settings: { roundSeconds: 45, lampCount: 1000 } }),
  });
  assert.equal(await sync.refreshSettings(), true);
  const settings = sync.currentSettings();
  assert.equal(settings.roundSeconds, 45);
  assert.equal(settings.lampCount, 24);
  assert.equal(store.remote.version, 5);
});

test('mobile numbers are normalised from Persian digits', () => {
  assert.equal(normalizePhone('۰۹۱۲ ۱۲۳ ۴۵۶۷'), '09121234567');
  assert.equal(normalizePhone('+989121234567'), '09121234567');
  assert.equal(normalizePhone('0912'), null);
});
