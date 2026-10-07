// One round of the lights game on screen: a grid of Zanis products (columns x rows from the
// dashboard). A yellow-lit product must be hit; a red one (crossed out) must be left alone. The
// round starts at the normal level and quietly turns hard once, at the second set in the dashboard
// (see engine.js); it reports through onFinish.

import { h, fa, shuffle, host } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { PRODUCTS } from '../data/products.js';
import { createTally, planWave } from './engine.js';

const COUNTDOWN_FROM = 3;
const GLOW = 14;

/**
 * @param {HTMLElement} stage the box the grid fills
 * @param {{ settings: object, onHud: (hud: {score: number, remaining: number}) => void,
 *           onFinish: (result: {score: number, counts: object}) => void }} options
 * @returns {() => void} stops the round (no result is reported)
 */
export function playRound(stage, { settings, onHud, onFinish }) {
  const tally = createTally(settings);
  const roundMs = settings.roundSeconds * 1000;
  // Each product once; a grid larger than the catalogue starts the shuffled list again.
  const shuffled = shuffle(PRODUCTS);
  const products = Array.from({ length: settings.lampCount }, (_, index) => shuffled[index % shuffled.length]);
  const cells = products.map((product, index) =>
    h('button.lamp', {
        type: 'button',
        'aria-label': product.name,
        onpointerdown: (event) => {
          event.preventDefault();
          hit(index);
        },
      },
      h('img', { src: product.image, alt: '', draggable: false }),
      h('span.no', { 'aria-hidden': 'true' }, '✕'),
    ),
  );
  const grid = h('div.lamps', cells);
  const countdown = h('div.countdown');
  stage.append(grid, countdown);

  const lit = new Map(); // lamp index -> 'yellow' | 'red'
  let lastWave = [];
  let running = false;
  let startedAt = 0;
  let waveTimer = 0;
  let clock = 0;
  let countdownTimer = 0;
  let waveEndsAtSwitch = false;

  // The grid has the columns and rows set in the dashboard; the products are as large as the
  // stage allows.
  function layout() {
    // Leave room for the glow of a lit lamp.
    const width = stage.clientWidth - GLOW * 2;
    const height = stage.clientHeight - GLOW * 2;
    if (!width || !height) return;
    const { columns, rows } = settings;
    const gap = columns > 4 || rows > 4 ? 10 : 12;
    grid.style.gap = `${gap}px`;
    const size = Math.floor(Math.min((width - gap * (columns - 1)) / columns, (height - gap * (rows - 1)) / rows));
    grid.style.gridTemplateColumns = `repeat(${columns}, ${size}px)`;
    grid.style.gridAutoRows = `${size}px`;
  }
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(layout) : null;
  resizeObserver?.observe(stage);
  requestAnimationFrame(layout);

  const elapsed = () => performance.now() - startedAt;
  const remainingSeconds = () => Math.max(0, Math.ceil((roundMs - elapsed()) / 1000));
  const updateHud = () => onHud({ score: tally.score, remaining: running ? remainingSeconds() : settings.roundSeconds });

  function setLamp(index, state) {
    const cell = cells[index];
    cell.classList.toggle('on', state === 'yellow');
    cell.classList.toggle('bad', state === 'red');
    if (state) lit.set(index, state);
    else lit.delete(index);
  }
  function darkenAll() {
    [...lit.keys()].forEach((index) => setLamp(index, null));
  }
  function flash(index, kind, delta) {
    const cell = cells[index];
    cell.classList.remove('flash-good', 'flash-bad');
    void cell.offsetWidth; // restart the animation
    cell.classList.add(delta >= 0 ? 'flash-good' : 'flash-bad');
    if (delta) {
      const label = h(`span.delta.${delta > 0 ? 'up' : 'down'}`, { dir: 'ltr' }, `${delta > 0 ? '+' : '−'}${fa(Math.abs(delta))}`);
      cell.append(label);
      setTimeout(() => label.remove(), 700);
    }
  }

  function nextWave() {
    darkenAll();
    if (!running) return;
    const now = elapsed();
    const wave = planWave(settings, now, lastWave);
    waveEndsAtSwitch = wave.endsAtSwitch;
    wave.yellow.forEach((index) => setLamp(index, 'yellow'));
    wave.red.forEach((index) => setLamp(index, 'red'));
    lastWave = [...wave.yellow, ...wave.red];
    clearTimeout(waveTimer);
    waveTimer = setTimeout(expireWave, wave.visibleMs);
  }
  function expireWave() {
    const missed = waveEndsAtSwitch ? 0 : [...lit.values()].filter((state) => state === 'yellow').length;
    if (missed && tally.add('missed', missed) < 0) sfx.bad();
    darkenAll();
    updateHud();
    waveTimer = setTimeout(nextWave, settings.gapMs);
  }

  function hit(index) {
    if (!running) return;
    const state = lit.get(index);
    let delta;
    if (state === 'yellow') {
      delta = tally.add('yellow');
      setLamp(index, null);
      sfx.good();
      host.vibrate(15);
      // Every yellow lamp of the wave is caught: move on without waiting for the wave to expire.
      if (![...lit.values()].includes('yellow')) {
        clearTimeout(waveTimer);
        darkenAll();
        waveTimer = setTimeout(nextWave, settings.gapMs);
      }
    } else if (state === 'red') {
      delta = tally.add('red');
      setLamp(index, null);
      sfx.bad();
      host.vibrate(80);
    } else {
      delta = tally.add('empty');
      if (delta) sfx.bad();
    }
    flash(index, state, delta);
    updateHud();
  }

  function begin() {
    countdown.remove();
    running = true;
    startedAt = performance.now();
    nextWave();
    clock = setInterval(() => {
      updateHud();
      if (elapsed() >= roundMs) finish();
    }, 100);
  }
  function halt() {
    running = false;
    clearTimeout(waveTimer);
    clearInterval(clock);
    clearTimeout(countdownTimer);
    darkenAll();
  }
  function finish() {
    halt();
    onFinish({ score: tally.score, counts: tally.counts });
  }

  // 3, 2, 1, then go.
  let count = COUNTDOWN_FROM;
  const step = () => {
    if (count === 0) return begin();
    countdown.textContent = fa(count);
    countdown.classList.remove('tick');
    void countdown.offsetWidth;
    countdown.classList.add('tick');
    sfx.tick();
    count -= 1;
    countdownTimer = setTimeout(step, 800);
    return undefined;
  };
  updateHud();
  step();

  return () => {
    halt();
    resizeObserver?.disconnect();
  };
}
