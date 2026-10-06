// App shell for the lights game. Two modes share one web app:
//  - practice (Android, browser): play as often as you like; nothing is recorded.
//  - kiosk (Windows, ?mode=kiosk): name and mobile first, then one tournament round whose score goes
//    to the server; the scrolling bar at the bottom shows the best and latest scores.

import { h, fa, toast, normalizePhone, host } from './core/util.js';
import { sfx } from './core/audio.js';
import { store } from './core/store.js';
import { createTicker } from './core/ticker.js';
import {
  currentSettings, fetchTicker, flushPending, playsOnServer, refreshSettings, serverUrl, status, submitRound, testConnection,
} from './core/sync.js';
import { BRAND_MARK } from './data/products.js';
import { DEFAULT_SERVER_URL, KIOSK_RESULT_SECONDS } from './data/config.js';
import { playRound } from './game/lights.js';

const KIOSK = Boolean(window.ZanisDesktop) || new URLSearchParams(location.search).get('mode') === 'kiosk';
const OPERATOR_HOLD_MS = 1500;
const SYNC_EVERY_MS = 30_000;
const TICKER_EVERY_MS = 20_000;

const root = document.getElementById('app');
document.body.classList.add(KIOSK ? 'kiosk' : 'practice');
let cleanup = null;

function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function render() {
  cleanup?.();
  cleanup = null;
  root.replaceChildren();
  window.scrollTo(0, 0);
  const route = location.hash.replace(/^#\/?/, '').split('/')[0];
  if (route === 'operator') return operatorScreen();
  if (route === 'play' && (!KIOSK || store.player)) return gameScreen();
  return KIOSK ? signInScreen() : practiceHome();
}

function brandHeader() {
  const mark = h('div.mark', { html: BRAND_MARK });
  // Holding the logo opens the operator panel (hidden from visitors).
  let holdTimer = 0;
  mark.addEventListener('pointerdown', () => {
    holdTimer = setTimeout(() => navigate('#/operator'), OPERATOR_HOLD_MS);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((type) => mark.addEventListener(type, () => clearTimeout(holdTimer)));
  return h('div.brand', mark, h('div', h('h1', 'چراغ‌ها را بگیر'), h('small', 'صنایع روشنایی زانیس')));
}

// Wrapped in a left-to-right isolate so the sign stays in front of the number in Persian text.
const signed = (value) => `⁦${value > 0 ? '+' : '−'}${fa(Math.abs(value))}⁩`;

/** The rules card, written from the current settings. */
function rulesCard(settings) {
  const { points, stages } = settings;
  const sample = (className, image) =>
    h(`span.lamp.sample.${className}`, h('img', { src: image, alt: '', draggable: false }), h('span.no', '✕'));
  const lines = [
    h('div.rule', sample('on', 'img/products/bulb-12w.webp'), h('div', h('b', 'زرد روشن شد؟ بزن!'), h('small', `هر بار ${signed(points.yellow)} امتیاز`))),
    h('div.rule', sample('bad', 'img/products/projector-starlens-50w.webp'),
      h('div', h('b', 'قرمز با ضربدر؟ دست نزن!'), h('small', points.red ? `زدنش ${signed(points.red)} امتیاز` : 'زدنش امتیازی ندارد'))),
  ];
  const extra = [];
  if (points.empty) extra.push(`زدن خانهٔ خاموش ${signed(points.empty)}`);
  if (points.missed) extra.push(`چراغ زردی که از دست برود ${signed(points.missed)}`);
  const most = stages.reduce((acc, stage) => ({ yellow: Math.max(acc.yellow, stage.yellow), red: Math.max(acc.red, stage.red) }), { yellow: 0, red: 0 });
  const pace = [`${fa(settings.roundSeconds)} ثانیه وقت داری و بازی مدام سریع‌تر می‌شود`];
  if (most.yellow > 1 || most.red > 1) pace.push('کم‌کم چند چراغ با هم روشن می‌شود');
  return h('div.card.stack.rules',
    ...lines,
    h('p.muted', `${pace.join('؛ ')}.${extra.length ? ` ${extra.join('، ')}.` : ''}`),
  );
}

// ---------------------------------------------------------------- practice (Android)
function practiceHome() {
  const settings = currentSettings();
  root.append(
    h('div.stack', { style: { flex: '1', justifyContent: 'center' } },
      brandHeader(),
      h('span.badge', 'نسخهٔ تمرینی'),
      rulesCard(settings),
      h('button.btn.block.huge', { id: 'practice-start', onclick: () => { sfx.tap(); navigate('#/play'); } }, 'شروع تمرین'),
      h('p.muted.center.small', 'اینجا فقط تمرین است و امتیازی ثبت نمی‌شود. مسابقهٔ اصلی روی نمایشگر غرفهٔ زانیس برگزار می‌شود.'),
    ),
  );
  refreshAndRedraw();
}

/** Downloads the settings; redraws a waiting screen when they changed (never a round or a half-typed form). */
async function refreshAndRedraw() {
  const before = store.remote?.version;
  if (!(await refreshSettings()) || store.remote?.version === before) return;
  const route = location.hash.replace(/^#\/?/, '').split('/')[0];
  const typing = [...root.querySelectorAll('input')].some((input) => input.value);
  if (route !== 'play' && route !== 'operator' && !typing) render();
}

// ---------------------------------------------------------------- tournament sign-in (Windows)
function signInScreen() {
  const settings = currentSettings();
  const name = h('input', { autocomplete: 'off', maxLength: 40, placeholder: 'مثلاً علی رضایی', id: 'signin-name' });
  const phone = h('input', { inputMode: 'tel', autocomplete: 'off', maxLength: 13, placeholder: '۰۹۱۲۱۲۳۴۵۶۷', id: 'signin-phone' });
  const nameError = h('div.error');
  const phoneError = h('div.error');
  const submitButton = h('button.btn.block.huge', { id: 'signin-submit', onclick: submit }, 'شروع مسابقه');

  async function submit() {
    const cleanName = name.value.trim().replace(/\s+/g, ' ');
    const cleanPhone = normalizePhone(phone.value);
    nameError.textContent = cleanName.length < 3 ? 'نام را کامل وارد کن.' : '';
    phoneError.textContent = cleanPhone ? '' : 'شمارهٔ موبایل ۱۱ رقمی و با ۰۹ شروع می‌شود.';
    if (cleanName.length < 3 || !cleanPhone) {
      sfx.bad();
      return;
    }
    const limit = currentSettings().maxPlaysPerPhone;
    if (limit) {
      submitButton.disabled = true;
      const remotePlays = await playsOnServer(cleanPhone);
      submitButton.disabled = false;
      // Rounds still queued on this device are not on the server yet.
      const queued = store.state.pending.filter((round) => round.phone === cleanPhone).length;
      const plays = Math.max(store.playsOf(cleanPhone), (remotePlays ?? 0) + queued);
      if (plays >= limit) {
        phoneError.textContent = `با این شماره ${fa(limit)} بار بازی شده و نوبتش تمام است.`;
        sfx.bad();
        return;
      }
    }
    sfx.good();
    store.signIn(cleanName, cleanPhone);
    navigate('#/play');
  }
  name.addEventListener('keydown', (event) => event.key === 'Enter' && phone.focus());
  phone.addEventListener('keydown', (event) => event.key === 'Enter' && submit());

  root.append(
    h('div.kiosk-home',
      h('div.stack', brandHeader(), h('h2.title', 'مسابقهٔ سرعت زانیس'), rulesCard(settings)),
      h('div.card.stack',
        h('h2', 'نام و شماره‌ات را بنویس'),
        h('p.muted', 'امتیازت با همین شماره ثبت می‌شود و برنده‌ها با آن خبر می‌شوند.'),
        h('div.field', h('label', { htmlFor: 'signin-name' }, 'نام و نام خانوادگی'), name, nameError),
        h('div.field', h('label', { htmlFor: 'signin-phone' }, 'شمارهٔ موبایل'), phone, phoneError),
        submitButton,
      ),
    ),
  );
  setTimeout(() => name.focus(), 50);
}

// ---------------------------------------------------------------- the round
function gameScreen() {
  const settings = currentSettings();
  const settingsVersion = store.remote?.version ?? 0;
  const player = KIOSK ? store.player : null;
  const hud = h('div.hud');
  const stage = h('div.stage.lights');
  let overlay = null;
  let autoReturn = 0;

  const drawHud = ({ score, remaining }) => {
    const pills = [['امتیاز', fa(score)], ['زمان', fa(remaining)]];
    if (player) pills.unshift(['بازیکن', player.name]);
    hud.replaceChildren(...pills.map(([label, value]) => h('div.pill', h('small', label), h('b', value))));
    hud.classList.toggle('hurry', remaining <= 5);
  };

  root.append(
    h('div.topbar',
      KIOSK ? null : h('button.icon-btn', { 'aria-label': 'بازگشت', onclick: () => navigate('#/') }, '→'),
      h('h2', KIOSK ? '⚡ مسابقهٔ سرعت' : '⚡ تمرین'),
    ),
    h('div.game', hud, stage),
  );

  const stop = playRound(stage, { settings, onHud: drawHud, onFinish: finish });
  cleanup = () => {
    stop();
    clearInterval(autoReturn);
    overlay?.remove();
  };

  function finish({ score, counts }) {
    const great = score >= settings.points.yellow * 15;
    (score > 0 ? sfx.win : sfx.lose)();
    const stats = h('div.stats',
      h('span', `✔ ${fa(counts.yellow)} زرد`),
      h('span', `✕ ${fa(counts.red)} قرمز`),
      counts.missed ? h('span', `⌛ ${fa(counts.missed)} جامانده`) : null,
    );
    const card = h('div.card.stack', h('div.emoji', great ? '🏆' : '⚡'), h('div.big', `${fa(score)} امتیاز`), stats);
    overlay = h('div.overlay', card);
    document.body.append(overlay);

    if (!KIOSK) {
      card.append(
        h('p.muted', 'این دور تمرینی بود. برای ثبت امتیاز، در غرفهٔ زانیس روی نمایشگر مسابقه بده!'),
        h('div.row',
          h('button.btn.secondary.grow', { onclick: () => navigate('#/') }, 'خانه'),
          h('button.btn.grow', { id: 'result-again', onclick: () => render() }, 'دوباره'),
        ),
      );
      return;
    }

    const round = store.recordRound({ name: player.name, phone: player.phone, score, counts, settingsVersion });
    const rankLine = h('p.rank', serverUrl() ? 'در حال ثبت امتیاز…' : 'امتیازت روی این دستگاه ثبت شد.');
    const limit = settings.maxPlaysPerPhone;
    const canReplay = !limit || store.playsOf(player.phone) < limit;
    const countdown = h('small.muted');
    const next = () => {
      store.signOut();
      navigate('#/');
    };
    card.append(
      rankLine,
      h('div.row',
        canReplay ? h('button.btn.secondary.grow', { onclick: () => render() }, 'یک دور دیگر') : null,
        h('button.btn.grow', { id: 'result-next', onclick: next }, 'نفر بعدی'),
      ),
      countdown,
    );
    let left = KIOSK_RESULT_SECONDS;
    const tickDown = () => {
      countdown.textContent = `بازگشت خودکار تا ${fa(left)} ثانیهٔ دیگر`;
      if (left-- <= 0) next();
    };
    tickDown();
    autoReturn = setInterval(tickDown, 1000);

    submitRound(round).then((receipt) => {
      if (!overlay?.isConnected) return;
      if (receipt?.rank) {
        const scope = settings.tickerTopToday ? 'امروز' : 'کل مسابقه';
        rankLine.textContent = `رتبهٔ تو در ${scope}: ${fa(receipt.rank)}${receipt.best > score ? ` (بهترین امتیازت ${fa(receipt.best)})` : ''}`;
      } else if (serverUrl()) {
        rankLine.textContent = 'امتیازت روی این دستگاه ثبت شد و با برقراری اتصال ارسال می‌شود.';
      }
      ticker?.refresh();
    });
  }
}

// ---------------------------------------------------------------- operator panel
function operatorScreen() {
  let unlocked = false;

  function lockView() {
    const pin = h('input', { type: 'password', inputMode: 'numeric', maxLength: 8, placeholder: 'رمز مسئول غرفه', id: 'operator-pin' });
    const error = h('div.error');
    const submit = () => {
      if (pin.value === store.booth.pin) {
        unlocked = true;
        draw();
      } else {
        error.textContent = 'رمز درست نیست.';
        sfx.bad();
      }
    };
    pin.addEventListener('keydown', (event) => event.key === 'Enter' && submit());
    setTimeout(() => pin.focus(), 50);
    return h('div.card.stack',
      h('div.field', h('label', { htmlFor: 'operator-pin' }, 'رمز'), pin, error),
      h('button.btn.block', { onclick: submit }, 'ورود'),
    );
  }

  function connectionCard() {
    const address = h('input', { dir: 'ltr', value: store.booth.serverUrl, placeholder: DEFAULT_SERVER_URL || 'https://…' });
    const key = h('input', { dir: 'ltr', value: store.booth.kioskKey, placeholder: 'zk_…', autocomplete: 'off' });
    const result = h('p.muted');
    const remote = store.remote;
    const info = remote
      ? `تنظیمات بازی: نسخهٔ ${fa(remote.version)}، ${new Date(remote.updatedAt).toLocaleString('fa-IR')}`
      : 'تنظیمات بازی هنوز از سرور گرفته نشده؛ بازی با تنظیمات پیش‌فرض اجرا می‌شود.';
    const save = async () => {
      const url = address.value.trim();
      if (url && !/^https?:\/\/[^\s/]+/i.test(url)) return toast('نشانی باید با https:// شروع شود.');
      store.updateBooth({ serverUrl: url.replace(/\/+$/, ''), ...(KIOSK ? { kioskKey: key.value.trim() } : {}) });
      result.textContent = 'در حال آزمایش…';
      const outcome = await testConnection();
      result.textContent = outcome.message;
      if (outcome.ok) {
        await refreshSettings();
        if (KIOSK) await flushPending();
        draw();
        toast(outcome.message);
      }
      return undefined;
    };
    return h('div.card.stack',
      h('b', 'اتصال به سرور'),
      h('div.field', h('label', `نشانی سرور${DEFAULT_SERVER_URL ? ' (خالی = نشانی پیش‌فرض)' : ''}`), address),
      KIOSK ? h('div.field', h('label', 'کلید این دستگاه (از داشبورد، بخش دستگاه‌ها)'), key) : null,
      h('button.btn.secondary.block', { onclick: save }, 'ذخیره و آزمایش اتصال'),
      result,
      h('p.muted.small', info),
    );
  }

  function scoresCard() {
    const total = store.state.history.length;
    const pending = store.state.pending.length;
    return h('div.card.stack',
      h('b', `دورهای این دستگاه: ${fa(total)}`),
      h('p.muted', pending
        ? `${fa(pending)} امتیاز هنوز به سرور نرسیده${status.keyRejected ? ' (کلید دستگاه پذیرفته نشد)' : ''}.`
        : 'همهٔ امتیازها به سرور رسیده است.'),
      h('div.row',
        h('button.btn.secondary.grow', {
          onclick: async () => {
            await flushPending();
            toast(store.state.pending.length ? 'ارسال نشد؛ اتصال یا کلید دستگاه را بررسی کنید.' : 'ارسال شد');
            draw();
          },
        }, 'ارسال دوباره'),
        h('button.btn.secondary.grow', { onclick: () => host.share(store.exportCsv()) }, 'خروجی CSV'),
      ),
      h('button.btn.danger.block', {
        onclick: () => {
          const warning = pending
            ? `${fa(pending)} امتیاز هنوز به سرور نرسیده و با این کار از بین می‌رود. پاک شود؟`
            : 'فهرست دورهای این دستگاه پاک شود؟ (امتیازهای روی سرور می‌مانند)';
          if (!window.confirm(warning)) return;
          store.clearHistory({ includePending: true });
          ticker?.refresh();
          toast('پاک شد');
          draw();
        },
      }, 'پاک کردن دورهای این دستگاه'),
    );
  }

  function boothCard() {
    const newPin = h('input', { inputMode: 'numeric', maxLength: 8, placeholder: 'رمز جدید (۴ تا ۸ رقم)' });
    return h('div.card.stack',
      h('b', 'تنظیمات غرفه'),
      h('button.btn.secondary.block', {
        onclick: () => {
          const muted = !store.booth.muted;
          store.updateBooth({ muted });
          sfx.setMuted(muted);
          toast(muted ? 'صدا خاموش شد' : 'صدا روشن شد');
        },
      }, 'روشن/خاموش کردن صدا'),
      h('div.field', h('label', 'تغییر رمز مسئول'), newPin),
      h('button.btn.secondary.block', {
        onclick: () => {
          if (!/^\d{4,8}$/.test(newPin.value)) return toast('رمز باید ۴ تا ۸ رقم باشد.');
          store.updateBooth({ pin: newPin.value });
          return toast('رمز عوض شد');
        },
      }, 'ذخیرهٔ رمز'),
    );
  }

  function draw() {
    root.replaceChildren(
      h('div.topbar',
        h('button.icon-btn', { 'aria-label': 'بازگشت', onclick: () => navigate('#/') }, '→'),
        h('h2', 'پنل مسئول غرفه'),
      ),
      unlocked ? h('div.stack.operator', connectionCard(), KIOSK ? scoresCard() : null, boothCard()) : lockView(),
    );
  }
  draw();
}

// ---------------------------------------------------------------- background work
let ticker = null;

if (KIOSK) {
  const bar = createTicker();
  document.body.append(bar.element);
  ticker = {
    async refresh() {
      bar.update(await fetchTicker(), currentSettings().tickerTopToday);
    },
  };
  ticker.refresh();
  setInterval(() => ticker.refresh(), TICKER_EVERY_MS);
  setInterval(() => {
    refreshAndRedraw();
    flushPending();
  }, SYNC_EVERY_MS);
  flushPending();
}

sfx.setMuted(store.booth.muted);
window.addEventListener('hashchange', render);
render();
// The practice home refreshes the settings itself; the kiosk does it here.
if (KIOSK) refreshAndRedraw();
// The Android host forwards this line to logcat; the CI smoke tests wait for it.
console.info('zanis-games ready');
