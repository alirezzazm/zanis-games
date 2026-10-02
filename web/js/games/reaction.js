// Reaction game: Zanis products light up at random; tap the lit ones fast, avoid the red (faulty) ones.

import { h, randomInt, shuffle, host, fa } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { PRODUCTS } from '../data/products.js';

const ROUND_SECONDS = 30;
const LAMPS = 16;
const FAULTY_CHANCE = 0.18;

export default {
  id: 'reaction',
  title: 'چراغ‌ها را بگیر',
  blurb: 'در ۳۰ ثانیه هر محصولی که روشن شد را لمس کن',
  emoji: '⚡',
  category: 'مهارتی',
  kind: 'score',
  mount(stage, api) {
    let score = 0;
    let remaining = ROUND_SECONDS;
    let running = false;
    let litTimeout = 0;
    let clock = 0;
    let litIndex = -1;

    // Each cell holds one product; a different set every round.
    const products = shuffle(PRODUCTS).slice(0, LAMPS);
    const lamps = products.map((product, index) =>
      h(
        'button.lamp',
        { 'aria-label': product.name, onpointerdown: () => hit(index) },
        h('img', { src: product.image, alt: '', draggable: false }),
      ),
    );
    const start = h('button.btn.block', { onclick: begin }, 'شروع');
    stage.append(h('div.stack', { style: { alignItems: 'center', width: '100%' } }, h('div.lamps', lamps), start));
    updateHud();

    function updateHud() {
      api.setHud([
        ['امتیاز', fa(score)],
        ['زمان', fa(remaining)],
      ]);
    }
    function clearLit() {
      if (litIndex >= 0) lamps[litIndex].classList.remove('on', 'bad');
      litIndex = -1;
    }
    function lightNext() {
      const previous = litIndex;
      clearLit();
      if (!running) return;
      let next = randomInt(0, LAMPS - 1);
      if (next === previous) next = (next + 1) % LAMPS;
      litIndex = next;
      const faulty = Math.random() < FAULTY_CHANCE;
      lamps[next].classList.add('on');
      lamps[next].classList.toggle('bad', faulty);
      // The game speeds up as the score grows.
      const visibleFor = Math.max(420, 1100 - score * 12);
      litTimeout = setTimeout(lightNext, visibleFor);
    }
    function hit(index) {
      if (!running) return;
      if (index !== litIndex) {
        score = Math.max(0, score - 1);
        sfx.bad();
      } else if (lamps[index].classList.contains('bad')) {
        score = Math.max(0, score - 3);
        sfx.bad();
        host.vibrate(80);
      } else {
        score += 2;
        sfx.good();
        host.vibrate(15);
      }
      updateHud();
      if (index === litIndex) {
        clearTimeout(litTimeout);
        lightNext();
      }
    }
    function begin() {
      start.remove();
      running = true;
      lightNext();
      clock = setInterval(() => {
        remaining -= 1;
        updateHud();
        if (remaining > 0) return;
        stop();
        api.finish({
          score,
          emoji: score >= 40 ? '🏆' : '⚡',
          title: `${fa(score)} امتیاز`,
          detail: 'قاب قرمز یعنی خراب؛ دست نزن!',
          win: score >= 20,
        });
      }, 1000);
    }
    function stop() {
      running = false;
      clearInterval(clock);
      clearTimeout(litTimeout);
      clearLit();
    }
    api.setHint('محصول روشن +۲ · قاب قرمز −۳ · لمس اشتباه −۱');
    return stop;
  },
};
