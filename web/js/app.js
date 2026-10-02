// App shell: hash router, visitor sign-in, home menu, game host, leaderboard and operator panel.

import { h, fa, toast, normalizePhone, host } from './core/util.js';
import { sfx } from './core/audio.js';
import { store } from './core/store.js';
import { BRAND_MARK } from './data/products.js';
import wheel from './games/wheel.js';
import plinko from './games/plinko.js';
import scratch from './games/scratch.js';
import reaction from './games/reaction.js';
import quiz from './games/quiz.js';
import memory from './games/memory.js';
import puzzle from './games/puzzle.js';
import circuit from './games/circuit.js';
import passport from './games/passport.js';
import photo from './games/photo.js';

const GAMES = [wheel, plinko, scratch, reaction, quiz, memory, puzzle, circuit, passport, photo];
const SECTIONS = [
  { title: 'شانس و جایزه', ids: ['wheel', 'plinko', 'scratch'] },
  { title: 'مهارت و سرعت', ids: ['reaction', 'circuit'] },
  { title: 'هوش و اطلاعات', ids: ['quiz', 'memory', 'puzzle'] },
  { title: 'غرفه‌گردی و عکس', ids: ['passport', 'photo'] },
];
const OPERATOR_HOLD_MS = 1500;

const root = document.getElementById('app');
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
  const [route, param] = location.hash.replace(/^#\/?/, '').split('/');
  if (route === 'operator') return operatorScreen();
  if (!store.currentPlayer()) return signInScreen();
  if (route === 'play') return gameScreen(param);
  if (route === 'top') return leaderboardScreen(param);
  return homeScreen();
}

function brandHeader() {
  const mark = h('div.mark', { html: BRAND_MARK });
  // Holding the logo opens the operator panel (hidden from visitors).
  let holdTimer = 0;
  mark.addEventListener('pointerdown', () => {
    holdTimer = setTimeout(() => navigate('#/operator'), OPERATOR_HOLD_MS);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((type) => mark.addEventListener(type, () => clearTimeout(holdTimer)));
  return h('div.brand', mark, h('div', h('h1', 'بازی‌های زانیس'), h('small', 'صنایع روشنایی زانیس')));
}

// ---------------------------------------------------------------- sign-in
function signInScreen() {
  const name = h('input', { autocomplete: 'name', maxLength: 40, placeholder: 'مثلاً علی رضایی', id: 'signin-name' });
  const phone = h('input', { inputMode: 'tel', autocomplete: 'tel', maxLength: 13, placeholder: '۰۹۱۲۱۲۳۴۵۶۷', id: 'signin-phone' });
  const nameError = h('div.error');
  const phoneError = h('div.error');

  function submit() {
    const cleanName = name.value.trim();
    const cleanPhone = normalizePhone(phone.value);
    nameError.textContent = cleanName.length < 3 ? 'نام را کامل وارد کن.' : '';
    phoneError.textContent = cleanPhone ? '' : 'شمارهٔ موبایل ۱۱ رقمی و با ۰۹ شروع می‌شود.';
    if (cleanName.length < 3 || !cleanPhone) {
      sfx.bad();
      return;
    }
    sfx.good();
    store.signIn(cleanName, cleanPhone);
    navigate('#/');
  }
  phone.addEventListener('keydown', (event) => event.key === 'Enter' && submit());

  root.append(
    h('div.stack', { style: { flex: '1', justifyContent: 'center' } },
      brandHeader(),
      h('div.card.stack',
        h('h2', 'بازی کن، جایزه ببر!'),
        h('p.muted', { style: { lineHeight: '1.9' } }, 'نام و شمارهٔ موبایلت را وارد کن تا امتیازها و جایزه‌هایت ثبت شود.'),
        h('div.field', h('label', { htmlFor: 'signin-name' }, 'نام و نام خانوادگی'), name, nameError),
        h('div.field', h('label', { htmlFor: 'signin-phone' }, 'شمارهٔ موبایل'), phone, phoneError),
        h('button.btn.block', { id: 'signin-submit', onclick: submit }, 'شروع'),
        h('p.muted.center', { style: { fontSize: '12px', lineHeight: '1.8' } }, 'شماره فقط برای اعلام برندگان و اطلاع‌رسانی زانیس استفاده می‌شود.'),
      ),
    ),
  );
}

// ---------------------------------------------------------------- home
function homeScreen() {
  const player = store.currentPlayer();
  const tiles = (ids) =>
    ids.map((id, index) => {
      const game = GAMES.find((candidate) => candidate.id === id);
      const best = player.scores[id];
      const usedUp = game.kind === 'chance' && !store.canPlayChance(id);
      return h('button.tile', {
          id: `tile-${id}`,
          style: { animationDelay: `${index * 50}ms`, opacity: usedUp ? '0.5' : '1' },
          onclick: () => {
            sfx.tap();
            if (usedUp) toast('این بازی شانسی را قبلاً انجام داده‌ای.');
            else navigate(`#/play/${id}`);
          },
        },
        best ? h('span.best', `${fa(best)} امتیاز`) : null,
        h('span.emoji', game.emoji),
        h('b', game.title),
        h('small', usedUp ? 'انجام شد ✓' : game.blurb),
      );
    });

  root.append(
    h('div.topbar', brandHeader(), h('div.spacer'),
      h('button.icon-btn', { 'aria-label': 'برترین‌ها', onclick: () => navigate('#/top') }, '🏆'),
    ),
    h('div.player-chip',
      h('div.grow', h('b', player.name), h('div.muted', { style: { fontSize: '12px' } }, 'مجموع امتیاز')),
      h('span.score', fa(store.totalScore(player))),
      h('button.icon-btn', { id: 'next-player', style: { fontSize: '13px' }, onclick: () => { store.signOut(); navigate('#/'); } }, 'نفر بعدی'),
    ),
    ...SECTIONS.flatMap((section) => [h('div.section-title', section.title), h('div.grid', tiles(section.ids))]),
    player.prizes.length
      ? h('div.card', { style: { marginTop: '16px' } },
          h('b', 'جایزه‌های تو'),
          h('p.muted', { style: { lineHeight: '2', marginTop: '6px' } }, player.prizes.map((prize) => `🎁 ${prize.label}`).join('  ·  ')),
        )
      : null,
  );
}

// ---------------------------------------------------------------- game host
function gameScreen(gameId) {
  const game = GAMES.find((candidate) => candidate.id === gameId);
  if (!game) return navigate('#/');
  if (game.kind === 'chance' && !store.canPlayChance(game.id)) {
    toast('این بازی شانسی را قبلاً انجام داده‌ای.');
    return navigate('#/');
  }
  const hud = h('div.hud');
  const stage = h('div.stage');
  const hint = h('p.hint');
  let finished = false;

  const api = {
    setHud(pills) {
      hud.replaceChildren(...pills.map(([label, value]) => h('div.pill', h('small', label), h('b', value))));
    },
    setHint(text) {
      hint.textContent = text;
    },
    finish({ score, emoji, title, detail, win }) {
      if (finished) return;
      finished = true;
      // Chance games count the play when the prize is committed (see store.drawPrize).
      const isBest = store.recordScore(game.id, score, { countPlay: game.kind !== 'chance' });
      (win ? sfx.win : sfx.lose)();
      const replayable = game.kind !== 'chance' || store.canPlayChance(game.id);
      const overlay = h('div.overlay',
        h('div.card.stack',
          h('div.emoji', emoji),
          h('div.big', title),
          h('p.muted', { style: { lineHeight: '1.9' } }, detail),
          isBest && score > 0 && game.kind === 'score' ? h('b', { style: { color: 'var(--green)' } }, 'رکورد جدید تو! 🎉') : null,
          h('div.row',
            replayable ? h('button.btn.secondary.grow', { onclick: () => { overlay.remove(); navigate(`#/play/${game.id}`); } }, 'دوباره') : null,
            h('button.btn.grow', { id: 'result-home', onclick: () => { overlay.remove(); navigate('#/'); } }, 'بازی‌های دیگر'),
          ),
        ),
      );
      document.body.append(overlay);
      cleanupOverlay = () => overlay.remove();
    },
  };
  let cleanupOverlay = null;

  root.append(
    h('div.topbar',
      h('button.icon-btn', { 'aria-label': 'بازگشت', onclick: () => navigate('#/') }, '→'),
      h('h2', `${game.emoji} ${game.title}`),
    ),
    h('div.game', hud, stage, hint),
  );
  // Mount after layout so games can measure the stage width.
  const unmount = game.mount(stage, api);
  cleanup = () => {
    unmount?.();
    cleanupOverlay?.();
  };
}

// ---------------------------------------------------------------- leaderboard
function leaderboardScreen(gameId) {
  const scored = GAMES.filter((game) => game.kind === 'score');
  const me = store.currentPlayer();
  const rows = store.leaderboard(gameId);
  const medal = ['🥇', '🥈', '🥉'];
  const maskPhone = (phone) => `${phone.slice(0, 4)}•••${phone.slice(-2)}`;

  root.append(
    h('div.topbar',
      h('button.icon-btn', { 'aria-label': 'بازگشت', onclick: () => navigate('#/') }, '→'),
      h('h2', '🏆 برترین‌ها'),
    ),
    h('div.tabs',
      h(`button${gameId ? '' : '.on'}`, { onclick: () => navigate('#/top') }, 'مجموع'),
      scored.map((game) => h(`button${gameId === game.id ? '.on' : ''}`, { onclick: () => navigate(`#/top/${game.id}`) }, game.title)),
    ),
    rows.length
      ? h('div.card', { style: { marginTop: '10px' } },
          h('table.lb',
            rows.map((entry, index) =>
              h(`tr${entry.phone === me.phone ? '.me' : ''}`,
                h('td', { style: { width: '44px' } }, medal[index] ?? fa(index + 1)),
                h('td', entry.name, h('div.muted', { style: { fontSize: '12px', direction: 'ltr', textAlign: 'right' } }, maskPhone(entry.phone))),
                h('td', { style: { textAlign: 'left', fontWeight: '800' } }, fa(entry.score)),
              ),
            ),
          ),
        )
      : h('p.hint', { style: { marginTop: '40px' } }, 'هنوز امتیازی ثبت نشده. اولین نفر باش!'),
  );
}

// ---------------------------------------------------------------- operator panel
function operatorScreen() {
  const { settings } = store.state;
  let unlocked = false;

  function lockView() {
    const pin = h('input', { type: 'password', inputMode: 'numeric', maxLength: 8, placeholder: 'رمز مسئول غرفه', id: 'operator-pin' });
    const error = h('div.error');
    const submit = () => {
      if (pin.value === store.state.settings.pin) {
        unlocked = true;
        draw();
      } else {
        error.textContent = 'رمز درست نیست.';
        sfx.bad();
      }
    };
    return h('div.card.stack',
      h('div.field', h('label', { htmlFor: 'operator-pin' }, 'رمز'), pin, error),
      h('button.btn.block', { onclick: submit }, 'ورود'),
    );
  }

  function panelView() {
    const players = Object.values(store.state.players);
    const csv = h('textarea.csv', { readOnly: true, value: store.exportCsv() });
    const chances = h('input', { type: 'number', min: 1, max: 20, value: settings.chancePlaysPerVisitor });
    const newPin = h('input', { inputMode: 'numeric', maxLength: 8, placeholder: 'رمز جدید (۴ تا ۸ رقم)' });

    return h('div.stack',
      h('div.card.stack',
        h('b', `بازدیدکننده‌های ثبت‌شده: ${fa(players.length)}`),
        csv,
        h('div.row',
          h('button.btn.grow', { onclick: () => host.share(store.exportCsv()) }, 'ارسال فهرست (CSV)'),
          h('button.btn.secondary', { onclick: () => navigator.clipboard?.writeText(store.exportCsv()).then(() => toast('کپی شد')) }, 'کپی'),
        ),
      ),
      h('div.card.stack',
        h('b', 'جایزه‌ها (موجودی و شانس)'),
        h('div.prize-row.muted', { style: { fontSize: '12px' } }, h('span', 'جایزه'), h('span', 'موجودی'), h('span', 'وزن شانس')),
        store.state.prizes.map((prize) =>
          h('div.prize-row',
            h('span', prize.label),
            h('input', { type: 'number', value: prize.stock, 'aria-label': `موجودی ${prize.label}`,
              onchange: (event) => store.updatePrize(prize.id, { stock: Math.max(-1, Math.trunc(Number(event.target.value)) || 0) }) }),
            h('input', { type: 'number', value: prize.weight, 'aria-label': `وزن ${prize.label}`,
              onchange: (event) => store.updatePrize(prize.id, { weight: Math.max(0, Number(event.target.value) || 0) }) }),
          ),
        ),
        h('p.muted', { style: { fontSize: '12px', lineHeight: '1.8' } }, 'موجودی ‎−۱ یعنی نامحدود. جایزه با موجودی صفر دیگر درنمی‌آید.'),
      ),
      h('div.card.stack',
        h('b', 'تنظیمات'),
        h('div.field', h('label', 'هر بازدیدکننده چند بار هر بازی شانسی را انجام دهد؟'), chances),
        h('button.btn.secondary.block', {
          onclick: () => {
            store.updateSettings({ chancePlaysPerVisitor: Math.min(20, Math.max(1, Math.trunc(Number(chances.value)) || 1)) });
            toast('ذخیره شد');
          },
        }, 'ذخیرهٔ تعداد دفعات'),
        h('div.field', h('label', 'تغییر رمز مسئول'), newPin),
        h('button.btn.secondary.block', {
          onclick: () => {
            if (!/^\d{4,8}$/.test(newPin.value)) return toast('رمز باید ۴ تا ۸ رقم باشد.');
            store.updateSettings({ pin: newPin.value });
            return toast('رمز عوض شد');
          },
        }, 'ذخیرهٔ رمز'),
        h('button.btn.secondary.block', {
          onclick: () => {
            const muted = !store.state.settings.muted;
            store.updateSettings({ muted });
            sfx.setMuted(muted);
            toast(muted ? 'صدا خاموش شد' : 'صدا روشن شد');
          },
        }, 'روشن/خاموش کردن صدا'),
      ),
      h('div.card.stack',
        h('b', 'کدهای ایستگاه‌های پاسپورت'),
        h('p.muted', { style: { lineHeight: '2' } }, store.state.stations.map((station) => `${station.emoji} ${station.title}: ${fa(station.code)}`).join('  ·  ')),
      ),
      h('button.btn.danger.block', {
        onclick: () => {
          if (!window.confirm('همهٔ بازدیدکننده‌ها و امتیازها پاک شود؟ اول فهرست را ارسال کرده‌ای؟')) return;
          store.resetAll();
          toast('پاک شد');
          draw();
        },
      }, 'پاک کردن همهٔ داده‌ها'),
    );
  }

  function draw() {
    root.replaceChildren(
      h('div.topbar',
        h('button.icon-btn', { 'aria-label': 'بازگشت', onclick: () => navigate('#/') }, '→'),
        h('h2', 'پنل مسئول غرفه'),
      ),
      unlocked ? panelView() : lockView(),
    );
  }
  draw();
}

sfx.setMuted(store.state.settings.muted);
window.addEventListener('hashchange', render);
render();
