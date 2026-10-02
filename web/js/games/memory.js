// Memory: find the pairs of products. Fewer moves and less time give a higher score.

import { h, shuffle, fa, host } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { PRODUCTS, BRAND_MARK } from '../data/products.js';

const PAIRS = 8;
const MAX_SCORE = 100;

export default {
  id: 'memory',
  title: 'جفت‌ها را پیدا کن',
  blurb: 'کارت‌های محصولات را دوتا دوتا پیدا کن',
  emoji: '🃏',
  category: 'دیجیتال',
  kind: 'score',
  mount(stage, api) {
    const chosen = shuffle(PRODUCTS).slice(0, PAIRS);
    const deck = shuffle([...chosen, ...chosen]);
    let open = [];
    let matched = 0;
    let moves = 0;
    let locked = false;
    let seconds = 0;
    let flipBack = 0;

    const cards = deck.map((product, index) =>
      h(
        'button.mcard',
        { 'aria-label': 'کارت بسته', onclick: () => flip(index) },
        h('div.face.back', { html: BRAND_MARK }),
        h('div.face.front', h('div', { html: product.icon }), h('span', product.name)),
      ),
    );
    stage.append(h('div.memory', cards));

    const clock = setInterval(() => {
      seconds += 1;
      updateHud();
    }, 1000);
    updateHud();

    function updateHud() {
      api.setHud([
        ['حرکت', fa(moves)],
        ['جفت', `${fa(matched)} از ${fa(PAIRS)}`],
        ['زمان', fa(seconds)],
      ]);
    }

    function flip(index) {
      const card = cards[index];
      if (locked || card.classList.contains('open') || card.classList.contains('done')) return;
      card.classList.add('open');
      sfx.tap();
      open.push(index);
      if (open.length < 2) return;
      moves += 1;
      const [first, second] = open;
      if (deck[first].id === deck[second].id) {
        cards[first].classList.add('done');
        cards[second].classList.add('done');
        matched += 1;
        open = [];
        sfx.good();
        host.vibrate(20);
        if (matched === PAIRS) win();
      } else {
        locked = true;
        flipBack = setTimeout(() => {
          cards[first].classList.remove('open');
          cards[second].classList.remove('open');
          open = [];
          locked = false;
        }, 800);
      }
      updateHud();
    }

    function win() {
      clearInterval(clock);
      // Perfect play is PAIRS moves; each extra move and each second costs a little.
      const score = Math.max(10, Math.round(MAX_SCORE - (moves - PAIRS) * 3 - seconds * 0.5));
      setTimeout(
        () =>
          api.finish({
            score,
            emoji: '🎉',
            title: `${fa(score)} امتیاز`,
            detail: `${fa(moves)} حرکت در ${fa(seconds)} ثانیه`,
            win: true,
          }),
        600,
      );
    }

    return () => {
      clearInterval(clock);
      clearTimeout(flipBack);
    };
  },
};
