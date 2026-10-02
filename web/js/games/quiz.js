// Lighting quiz: 8 random questions, 15 seconds each; faster correct answers score more.

import { h, shuffle, fa, host } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { QUESTIONS } from '../data/quiz.js';

const QUESTION_COUNT = 8;
const SECONDS_PER_QUESTION = 15;
const BASE_POINTS = 6;
const SPEED_BONUS = 6;

export default {
  id: 'quiz',
  title: 'مسابقهٔ روشنایی',
  blurb: '۸ سؤال دربارهٔ نور و محصولات؛ سریع‌تر، امتیاز بیشتر',
  emoji: '🧠',
  category: 'مسابقهٔ اطلاعات',
  kind: 'score',
  mount(stage, api) {
    const questions = shuffle(QUESTIONS).slice(0, QUESTION_COUNT);
    let index = 0;
    let score = 0;
    let correct = 0;
    let timer = 0;
    let advance = 0;
    const wrap = h('div.stack', { style: { width: '100%', alignSelf: 'start' } });
    stage.append(wrap);
    stage.style.placeItems = 'start stretch';

    function updateHud(secondsLeft) {
      api.setHud([
        ['سؤال', `${fa(index + 1)} از ${fa(QUESTION_COUNT)}`],
        ['امتیاز', fa(score)],
        ['زمان', fa(secondsLeft)],
      ]);
    }

    function show() {
      const item = questions[index];
      const startedAt = Date.now();
      let answered = false;
      const bar = h('i', { style: { width: '100%' } });
      const note = h('p.muted', { style: { minHeight: '48px', lineHeight: '1.8' } });
      const buttons = item.options.map((option, optionIndex) =>
        h('button.answer', { onclick: () => answer(optionIndex) }, option),
      );
      wrap.replaceChildren(h('div.progress', bar), h('p.question', item.q), h('div.answers', buttons), note);
      updateHud(SECONDS_PER_QUESTION);

      timer = setInterval(() => {
        const elapsed = (Date.now() - startedAt) / 1000;
        const left = Math.max(0, SECONDS_PER_QUESTION - elapsed);
        bar.style.width = `${(left / SECONDS_PER_QUESTION) * 100}%`;
        updateHud(Math.ceil(left));
        if (left <= 0) answer(-1);
      }, 200);

      function answer(choice) {
        if (answered) return;
        answered = true;
        clearInterval(timer);
        const isRight = choice === item.answer;
        buttons[item.answer].classList.add('right');
        if (choice >= 0 && !isRight) buttons[choice].classList.add('wrong');
        if (isRight) {
          const speed = 1 - (Date.now() - startedAt) / (SECONDS_PER_QUESTION * 1000);
          score += BASE_POINTS + Math.round(SPEED_BONUS * Math.max(0, speed));
          correct += 1;
          sfx.good();
        } else {
          sfx.bad();
          host.vibrate(60);
        }
        note.textContent = item.note;
        updateHud(0);
        advance = setTimeout(next, 2200);
      }
    }

    function next() {
      index += 1;
      if (index < QUESTION_COUNT) {
        show();
        return;
      }
      api.finish({
        score,
        emoji: correct >= 6 ? '🏆' : '🧠',
        title: `${fa(correct)} پاسخ درست از ${fa(QUESTION_COUNT)}`,
        detail: `${fa(score)} امتیاز`,
        win: correct >= 5,
      });
    }

    show();
    return () => {
      clearInterval(timer);
      clearTimeout(advance);
    };
  },
};
