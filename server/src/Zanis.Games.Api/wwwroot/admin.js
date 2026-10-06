// Dashboard of the Zanis lights game: game settings, scores, booth computers and the account.
// Plain modules, no build step; every call goes to /api/admin on the same origin.

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const fa = (value) =>
  (typeof value === 'number' ? value.toLocaleString('en-US') : String(value ?? ''))
    .replace(/\d/g, (digit) => FA_DIGITS[Number(digit)])
    .replace(/,/g, '٬');
const when = (iso) => (iso ? new Date(iso).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran', dateStyle: 'short', timeStyle: 'short' }) : '—');

/** Tiny hyperscript: h('div.card', { onclick }, child, 'text'). */
function h(selector, props, ...children) {
  const [tag, ...classes] = selector.split('.');
  const element = document.createElement(tag || 'div');
  if (classes.length) element.className = classes.join(' ');
  if (props && typeof props === 'object' && !(props instanceof Node) && !Array.isArray(props)) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'style' && typeof value === 'object') Object.assign(element.style, value);
      else if (key.startsWith('on')) element.addEventListener(key.slice(2), value);
      else if (key in element && key !== 'list') element[key] = value;
      else element.setAttribute(key, value);
    }
  } else if (props != null) {
    children.unshift(props);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

let toastTimer = 0;
function toast(message, bad = false) {
  const node = document.getElementById('toast');
  node.textContent = message;
  node.className = bad ? 'show bad' : 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (node.className = ''), 3200);
}

class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || 'ارتباط با سرور برقرار نشد.');
    this.status = status;
    this.errors = body?.errors ?? {};
  }
}

async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`/api/admin${path}`, {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'X-Zanis-Admin': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, null);
  }
  if (response.status === 401 && path !== '/login') {
    showLogin();
    throw new ApiError(401, { message: 'دوباره وارد شوید.' });
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}

const root = document.getElementById('app');
let me = null;

// ---------------------------------------------------------------- sign-in
function showLogin() {
  me = null;
  const username = h('input', { autocomplete: 'username', dir: 'ltr', id: 'login-user' });
  const password = h('input', { type: 'password', autocomplete: 'current-password', dir: 'ltr', id: 'login-pass' });
  const error = h('p.error');
  const button = h('button.btn.block', { type: 'submit' }, 'ورود');
  const form = h('form.card.stack.login',
    {
      onsubmit: async (event) => {
        event.preventDefault();
        button.disabled = true;
        error.textContent = '';
        try {
          me = await api('/login', { method: 'POST', body: { username: username.value, password: password.value } });
          showApp();
        } catch (failure) {
          error.textContent = failure.message;
        } finally {
          button.disabled = false;
        }
      },
    },
    h('div.brand', h('div.mark', 'Z'), h('div', h('h1', 'داشبورد مسابقه'), h('small', 'چراغ‌ها را بگیر — زانیس'))),
    h('label', { htmlFor: 'login-user' }, 'نام کاربری'), username,
    h('label', { htmlFor: 'login-pass' }, 'رمز'), password,
    error, button,
  );
  root.replaceChildren(h('div.center-page', form));
  username.focus();
}

// ---------------------------------------------------------------- shell
const TABS = [
  ['summary', 'خلاصه و برترین‌ها', summaryTab],
  ['settings', 'تنظیمات بازی', settingsTab],
  ['scores', 'همهٔ امتیازها', scoresTab],
  ['kiosks', 'دستگاه‌ها', kiosksTab],
  ['account', 'حساب', accountTab],
];

function showApp() {
  const current = TABS.find(([id]) => `#${id}` === location.hash) ?? TABS[0];
  const content = h('main.content');
  root.replaceChildren(
    h('header.top',
      h('div.brand', h('div.mark', 'Z'), h('div', h('h1', 'داشبورد مسابقهٔ زانیس'), h('small', `خوش آمدید، ${me?.username ?? ''}`))),
      h('nav.tabs', TABS.map(([id, title]) => h(`a${id === current[0] ? '.on' : ''}`, { href: `#${id}` }, title))),
    ),
    content,
  );
  current[2](content).catch((failure) => {
    if (failure.status !== 401) content.replaceChildren(h('p.error', failure.message));
  });
}
window.addEventListener('hashchange', () => me && showApp());

// ---------------------------------------------------------------- summary
async function summaryTab(content) {
  let today = true;
  const board = h('div');
  const [summary] = await Promise.all([api('/summary')]);
  const stat = (label, value) => h('div.stat', h('small', label), h('b', value == null ? '—' : fa(value)));

  async function drawBoard() {
    const rows = await api(`/leaderboard?today=${today}&limit=50`);
    board.replaceChildren(
      h('div.row.between',
        h('h2', today ? 'برترین‌های امروز' : 'برترین‌های کل مسابقه'),
        h('div.seg',
          h(`button${today ? '.on' : ''}`, { onclick: () => { today = true; drawBoard(); } }, 'امروز'),
          h(`button${today ? '' : '.on'}`, { onclick: () => { today = false; drawBoard(); } }, 'کل مسابقه'),
        ),
      ),
      rows.length
        ? h('table',
            h('thead', h('tr', h('th', 'رتبه'), h('th', 'نام'), h('th', 'موبایل'), h('th', 'بهترین امتیاز'), h('th', 'دفعات بازی'), h('th', 'زمان'))),
            h('tbody', rows.map((row, index) =>
              h('tr', h('td', fa(index + 1)), h('td', row.name), h('td.ltr', row.phone), h('td.num', fa(row.score)), h('td', fa(row.plays)), h('td', when(row.playedAt))))),
          )
        : h('p.muted', 'هنوز امتیازی ثبت نشده است.'),
    );
  }

  content.replaceChildren(
    h('div.stats',
      stat('بازی امروز', summary.playsToday),
      stat('بازیکن امروز', summary.playersToday),
      stat('بهترین امتیاز امروز', summary.bestToday),
      stat('کل بازی‌ها', summary.plays),
      stat('کل بازیکن‌ها', summary.players),
      stat('بهترین امتیاز کل', summary.bestEver),
    ),
    h('section.card', board),
  );
  await drawBoard();
}

// ---------------------------------------------------------------- game settings
async function settingsTab(content) {
  const data = await api('/settings');
  let version = data.version;
  let model = structuredClone(data.settings);
  const defaults = data.defaults;
  const errors = new Map(); // path -> message element

  const seconds = (ms) => Math.round(ms) / 1000;
  /** One labelled number input bound to a path of the model; `scale` converts ms <-> seconds. */
  function numberField(path, label, help, { min, max, step = 1, scale = 1 } = {}) {
    const get = () => path.split('.').reduce((value, key) => value?.[key], model);
    const input = h('input', {
      type: 'number', min: min / scale, max: max / scale, step, dir: 'ltr', value: get() / scale,
      oninput: () => {
        const keys = path.split('.');
        const last = keys.pop();
        const target = keys.reduce((value, key) => value[key], model);
        target[last] = Math.round(Number(input.value) * scale);
        drawTimeline();
      },
    });
    const error = h('div.error');
    errors.set(path, error);
    return h('div.field', h('label', label), input, help ? h('small.muted', help) : null, error);
  }

  const timeline = h('div.timeline');
  function drawTimeline() {
    const total = Math.max(1, model.roundSeconds);
    const switchAt = Math.min(Math.max(0, model.hardFromSecond), total);
    const part = (className, title, level, from, to) =>
      h(`div.seg-stage.${className}`, { style: { width: `${((to - from) / total) * 100}%` } },
        h('b', `${title} · ${fa(from)} تا ${fa(to)} ثانیه`),
        h('span', `${fa(level.yellow)} زرد · هر موج ${fa(seconds(level.visibleMs))} ثانیه`),
        h('span.red', level.red ? `تا ${fa(level.red)} قرمز · ${fa(level.redChance)}٪` : 'بدون قرمز'),
      );
    timeline.replaceChildren(
      h('div.bar',
        switchAt > 0 ? part('normal', 'عادی', model.normal, 0, switchAt) : null,
        switchAt < total ? part('hard', 'سخت', model.hard, switchAt, total) : null,
      ),
      h('p.muted', switchAt > 0
        ? `بازی دقیقاً در ثانیهٔ ${fa(switchAt)} یک بار سخت‌تر می‌شود و تا آخر همان‌طور می‌ماند.`
        : 'بازی از اول در حالت سخت است.'),
    );
  }

  const status = h('p.muted');
  const save = h('button.btn', { type: 'submit' }, 'ذخیرهٔ تنظیمات');
  const showStatus = () => {
    status.textContent = `نسخهٔ ${fa(version)}${data.updatedBy ? ` — آخرین ذخیره: ${when(data.updatedAt)} توسط ${data.updatedBy}` : ' — هنوز تنظیمی ذخیره نشده و بازی با پیش‌فرض‌ها اجرا می‌شود'}`;
  };

  function draw() {
    errors.clear();
    const tickerToday = h('input', { type: 'checkbox', checked: model.tickerTopToday, onchange: () => (model.tickerTopToday = tickerToday.checked) });
    const form = h('form.stack',
      {
        onsubmit: async (event) => {
          event.preventDefault();
          errors.forEach((element) => (element.textContent = ''));
          save.disabled = true;
          try {
            const saved = await api('/settings', { method: 'PUT', body: { settings: model, expectedVersion: version } });
            version = saved.version;
            data.updatedAt = saved.updatedAt;
            data.updatedBy = saved.updatedBy;
            model = structuredClone(saved.settings);
            draw();
            toast('ذخیره شد. دستگاه‌ها تا نیم دقیقهٔ دیگر تنظیمات تازه را می‌گیرند.');
          } catch (failure) {
            let shown = false;
            for (const [path, message] of Object.entries(failure.errors)) {
              const element = errors.get(path) ?? errors.get(path.split('.')[0]);
              if (element) {
                element.textContent = message;
                shown = true;
              }
            }
            toast(shown ? 'بعضی مقدارها درست نیست؛ پیام قرمز زیر هر کدام را ببینید.' : failure.message, true);
          } finally {
            save.disabled = false;
          }
        },
      },
      h('section.card.stack',
        h('h2', 'زمان'),
        h('div.grid',
          numberField('roundSeconds', 'زمان هر دور (ثانیه)', 'مدت یک دور مسابقه.', { min: 10, max: 300 }),
          numberField('hardFromSecond', 'از ثانیهٔ چند سخت‌تر شود', 'بازی فقط یک بار، دقیقاً در همین ثانیه، به حالت سخت می‌رود. ۰ یعنی از اول سخت.', { min: 0, max: 299 }),
          numberField('gapMs', 'مکث بین موج‌ها (ثانیه)', 'تاریکی کوتاه بین دو موج.', { min: 0, max: 2000, step: 0.05, scale: 1000 }),
          numberField('lampCount', 'تعداد چراغ‌ها (محصولات)', 'بین ۴ تا ۲۴.', { min: 4, max: 24 }),
        ),
        timeline,
      ),
      h('div.levels',
        h('section.card.stack',
          h('h2', 'حالت عادی'),
          h('p.muted', 'از شروع بازی تا ثانیهٔ سخت شدن.'),
          numberField('normal.visibleMs', 'روشن ماندن هر موج (ثانیه)', 'کمتر = سریع‌تر.', { min: 150, max: 5000, step: 0.05, scale: 1000 }),
          numberField('normal.yellow', 'چراغ زرد هم‌زمان', 'بین ۱ تا ۶.', { min: 1, max: 6 }),
          numberField('normal.red', 'بیشترین چراغ قرمز هم‌زمان', '۰ یعنی بدون قرمز.', { min: 0, max: 6 }),
          numberField('normal.redChance', 'شانس آمدن هر قرمز (٪)', 'بین ۰ تا ۱۰۰.', { min: 0, max: 100 }),
        ),
        h('section.card.stack',
          h('h2', 'حالت سخت'),
          h('p.muted', 'از ثانیهٔ سخت شدن تا پایان بازی.'),
          numberField('hard.visibleMs', 'روشن ماندن هر موج (ثانیه)', 'کمتر = سریع‌تر.', { min: 150, max: 5000, step: 0.05, scale: 1000 }),
          numberField('hard.yellow', 'چراغ زرد هم‌زمان', 'بین ۱ تا ۶.', { min: 1, max: 6 }),
          numberField('hard.red', 'بیشترین چراغ قرمز هم‌زمان', '۰ یعنی بدون قرمز.', { min: 0, max: 6 }),
          numberField('hard.redChance', 'شانس آمدن هر قرمز (٪)', 'بین ۰ تا ۱۰۰.', { min: 0, max: 100 }),
        ),
      ),
      h('section.card.stack',
        h('h2', 'امتیازها'),
        h('div.grid',
          numberField('points.yellow', 'زدن چراغ زرد', 'مثبت.', { min: 0, max: 100 }),
          numberField('points.red', 'زدن چراغ قرمز', 'منفی یا صفر.', { min: -100, max: 0 }),
          numberField('points.empty', 'زدن خانهٔ خاموش', 'منفی یا صفر.', { min: -100, max: 0 }),
          numberField('points.missed', 'چراغ زردی که از دست برود', 'منفی یا صفر.', { min: -100, max: 0 }),
        ),
        h('p.muted', 'امتیاز هیچ‌وقت کمتر از صفر نمی‌شود.'),
      ),
      h('section.card.stack',
        h('h2', 'مسابقه و نوار امتیاز ویندوز'),
        h('div.grid',
          numberField('maxPlaysPerPhone', 'دفعات مجاز بازی برای هر موبایل', '۰ یعنی نامحدود.', { min: 0, max: 100 }),
          numberField('tickerTop', 'تعداد برترین‌ها در نوار', '۰ یعنی نشان نده.', { min: 0, max: 50 }),
          numberField('tickerRecent', 'تعداد آخرین بازی‌ها در نوار', '۰ یعنی نشان نده.', { min: 0, max: 50 }),
        ),
        h('label.check', tickerToday, ' برترین‌ها و رتبه‌ها فقط از بازی‌های امروز حساب شود'),
      ),
      h('div.actions',
        save,
        h('button.btn.secondary', {
          type: 'button',
          onclick: () => {
            model = structuredClone(defaults);
            draw();
            toast('مقدارهای پیش‌فرض در فرم گذاشته شد؛ برای اعمال، ذخیره کنید.');
          },
        }, 'برگرداندن پیش‌فرض‌ها'),
        h('a.btn.secondary', { href: '/play/', target: '_blank', rel: 'noopener' }, 'امتحان بازی در مرورگر'),
      ),
      status,
    );
    content.replaceChildren(form);
    drawTimeline();
    showStatus();
  }
  draw();
}

// ---------------------------------------------------------------- scores
async function scoresTab(content) {
  let page = 1;
  let today = false;
  const pageSize = 50;
  const search = h('input', { type: 'search', placeholder: 'جستجوی نام یا موبایل' });
  const todayBox = h('input', { type: 'checkbox', onchange: () => { today = todayBox.checked; page = 1; load(); } });
  const list = h('div');
  const csv = h('a.btn.secondary', { href: '/api/admin/scores.csv' }, 'دانلود CSV');
  let searchTimer = 0;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { page = 1; load(); }, 300);
  });

  async function load() {
    csv.href = `/api/admin/scores.csv${today ? '?today=true' : ''}`;
    const query = new URLSearchParams({ page, pageSize, today, search: search.value.trim() });
    const result = await api(`/scores?${query}`);
    const pages = Math.max(1, Math.ceil(result.total / pageSize));
    list.replaceChildren(
      h('p.muted', `${fa(result.total)} دور`),
      result.items.length
        ? h('div.table-wrap', h('table',
            h('thead', h('tr', h('th', 'زمان'), h('th', 'نام'), h('th', 'موبایل'), h('th', 'امتیاز'), h('th', 'زرد'), h('th', 'قرمز'), h('th', 'خاموش'), h('th', 'جامانده'), h('th', 'دستگاه'), h('th', ''))),
            h('tbody', result.items.map((row) =>
              h('tr',
                h('td', when(row.playedAt)), h('td', row.name), h('td.ltr', row.phone), h('td.num', fa(row.score)),
                h('td', fa(row.hits)), h('td', fa(row.redTaps)), h('td', fa(row.wrongTaps)), h('td', fa(row.missed)), h('td', row.kiosk ?? '—'),
                h('td', h('button.btn.ghost', {
                  'aria-label': 'حذف',
                  onclick: async () => {
                    if (!confirm(`امتیاز ${row.score} از «${row.name}» حذف شود؟`)) return;
                    try {
                      await api(`/scores/${row.id}`, { method: 'DELETE' });
                      toast('حذف شد');
                      load();
                    } catch (failure) {
                      toast(failure.message, true);
                    }
                  },
                }, '✕')),
              ))),
          ))
        : h('p.muted', 'دوری پیدا نشد.'),
      pages > 1
        ? h('div.row.pager',
            h('button.btn.secondary', { disabled: page <= 1, onclick: () => { page -= 1; load(); } }, 'قبلی'),
            h('span', `صفحهٔ ${fa(page)} از ${fa(pages)}`),
            h('button.btn.secondary', { disabled: page >= pages, onclick: () => { page += 1; load(); } }, 'بعدی'),
          )
        : null,
    );
  }

  content.replaceChildren(
    h('section.card.stack',
      h('div.row.wrap', search, h('label.check', todayBox, ' فقط امروز'), h('div.spacer'), csv,
        h('button.btn.danger', {
          onclick: async () => {
            const phrase = prompt('همهٔ امتیازها برای همیشه پاک می‌شود. اول CSV را دانلود کنید.\nبرای ادامه بنویسید: پاک شود');
            if (phrase == null) return;
            try {
              const result = await api('/scores/clear', { method: 'POST', body: { confirm: phrase } });
              toast(`${fa(result.deleted)} دور پاک شد.`);
              load();
            } catch (failure) {
              toast(Object.values(failure.errors)[0] ?? failure.message, true);
            }
          },
        }, 'پاک کردن همه'),
      ),
      list,
    ),
  );
  await load();
}

// ---------------------------------------------------------------- booth computers
async function kiosksTab(content) {
  const name = h('input', { placeholder: 'مثلاً نمایشگر غرفهٔ اصلی', maxLength: 40 });
  const created = h('div');
  const list = h('div');

  async function load() {
    const kiosks = await api('/kiosks');
    list.replaceChildren(kiosks.length
      ? h('div.table-wrap', h('table',
          h('thead', h('tr', h('th', 'نام'), h('th', 'کلید'), h('th', 'ساخته‌شده'), h('th', 'آخرین تماس'), h('th', 'وضعیت'), h('th', ''))),
          h('tbody', kiosks.map((kiosk) =>
            h(`tr${kiosk.revokedAt ? '.dim' : ''}`,
              h('td', kiosk.name), h('td.ltr', `${kiosk.keyPrefix}…`), h('td', when(kiosk.createdAt)), h('td', when(kiosk.lastSeenAt)),
              h('td', kiosk.revokedAt ? `باطل‌شده (${when(kiosk.revokedAt)})` : 'فعال'),
              h('td', kiosk.revokedAt ? null : h('button.btn.ghost', {
                onclick: async () => {
                  if (!confirm(`کلید «${kiosk.name}» باطل شود؟ آن دستگاه دیگر نمی‌تواند امتیاز بفرستد.`)) return;
                  await api(`/kiosks/${kiosk.id}`, { method: 'DELETE' });
                  toast('باطل شد');
                  load();
                },
              }, 'باطل کردن')),
            ))),
        ))
      : h('p.muted', 'هنوز دستگاهی ثبت نشده است.'));
  }

  content.replaceChildren(
    h('section.card.stack',
      h('h2', 'افزودن رایانهٔ غرفه'),
      h('p.muted', 'هر رایانه‌ای که بازی ویندوزی روی آن اجرا می‌شود یک کلید جدا می‌گیرد. کلید را در بازی، پنل مسئول غرفه (لوگو را دو ثانیه نگه دارید) وارد کنید. کلید فقط همین یک بار نشان داده می‌شود.'),
      h('form.row.wrap', {
          onsubmit: async (event) => {
            event.preventDefault();
            try {
              const result = await api('/kiosks', { method: 'POST', body: { name: name.value } });
              name.value = '';
              const key = h('code.key', result.key);
              created.replaceChildren(h('div.notice.stack',
                h('b', `کلید «${result.kiosk.name}»:`), key,
                h('div.row',
                  h('button.btn.secondary', { type: 'button', onclick: () => navigator.clipboard?.writeText(result.key).then(() => toast('کپی شد')) }, 'کپی کلید'),
                  h('small.muted', 'بعد از بستن این صفحه دیگر دیده نمی‌شود.'),
                ),
              ));
              load();
            } catch (failure) {
              toast(Object.values(failure.errors)[0] ?? failure.message, true);
            }
          },
        },
        name, h('button.btn', { type: 'submit' }, 'ساخت کلید'),
      ),
      created,
    ),
    h('section.card.stack', h('h2', 'دستگاه‌ها'), list),
  );
  await load();
}

// ---------------------------------------------------------------- account
async function accountTab(content) {
  const current = h('input', { type: 'password', autocomplete: 'current-password', dir: 'ltr' });
  const next = h('input', { type: 'password', autocomplete: 'new-password', dir: 'ltr' });
  const repeat = h('input', { type: 'password', autocomplete: 'new-password', dir: 'ltr' });
  const error = h('p.error');
  content.replaceChildren(
    h('section.card.stack.narrow',
      h('h2', 'تغییر رمز'),
      h('form.stack', {
          onsubmit: async (event) => {
            event.preventDefault();
            error.textContent = '';
            if (next.value !== repeat.value) {
              error.textContent = 'تکرار رمز با رمز جدید یکی نیست.';
              return;
            }
            try {
              await api('/password', { method: 'PUT', body: { currentPassword: current.value, newPassword: next.value } });
              current.value = next.value = repeat.value = '';
              toast('رمز عوض شد. نشست‌های دیگر بسته شدند.');
            } catch (failure) {
              error.textContent = Object.values(failure.errors)[0] ?? failure.message;
            }
          },
        },
        h('label', 'رمز فعلی'), current,
        h('label', 'رمز جدید (دست‌کم ۱۰ نویسه)'), next,
        h('label', 'تکرار رمز جدید'), repeat,
        error,
        h('button.btn', { type: 'submit' }, 'ذخیرهٔ رمز'),
      ),
    ),
    h('section.card.stack.narrow',
      h('button.btn.secondary', {
        onclick: async () => {
          await api('/logout', { method: 'POST' }).catch(() => {});
          showLogin();
        },
      }, 'خروج از داشبورد'),
    ),
  );
}

// ---------------------------------------------------------------- start
api('/me').then((user) => {
  me = user;
  showApp();
}).catch((failure) => {
  if (failure.status !== 401) showLogin();
});
