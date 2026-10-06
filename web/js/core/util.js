// Small shared helpers: Persian digits, DOM building, toast, random.

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Formats a number (or numeric string) with Persian digits and thousands separators. */
export function fa(value) {
  const text = typeof value === 'number' ? value.toLocaleString('en-US') : String(value);
  return text.replace(/\d/g, (digit) => FA_DIGITS[Number(digit)]).replace(/,/g, '٬');
}

/** Converts Persian/Arabic digits typed by the user to Latin digits. */
export function toLatinDigits(text) {
  return String(text)
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

/** Iranian mobile number: 11 digits starting with 09. Returns the normalised number or null. */
export function normalizePhone(input) {
  const digits = toLatinDigits(input).replace(/\D/g, '').replace(/^98/, '0');
  return /^09\d{9}$/.test(digits) ? digits : null;
}

/**
 * Tiny hyperscript: h('div.card', { onclick }, child, 'text').
 * Class names come from the selector; `html` sets innerHTML for trusted static markup (icons).
 */
export function h(selector, props, ...children) {
  const [tag, ...classes] = selector.split('.');
  const element = document.createElement(tag || 'div');
  if (classes.length) element.className = classes.join(' ');
  if (props && typeof props === 'object' && !(props instanceof Node) && !Array.isArray(props)) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'html') element.innerHTML = value;
      else if (key === 'style' && typeof value === 'object') Object.assign(element.style, value);
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
export function toast(message) {
  const node = document.getElementById('toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 2400);
}

export const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

export function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Bridge to the Android host (MainActivity.Bridge) or the Windows one (desktop/preload.js); no-ops in a browser. */
export const host = {
  vibrate(ms = 20) {
    if (window.Android?.vibrate) window.Android.vibrate(ms);
    else navigator.vibrate?.(ms);
  },
  share(text) {
    if (window.Android?.shareText) return window.Android.shareText(text);
    if (navigator.share) return navigator.share({ text }).catch(() => {});
    return navigator.clipboard?.writeText(text).then(() => toast('کپی شد'));
  },
};
