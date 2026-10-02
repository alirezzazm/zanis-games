// Picture questions of the quiz: one correct product name among four distinct options.
import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.window = globalThis;
globalThis.document = { getElementById: () => null };
const { pictureQuestions } = await import('../web/js/games/quiz.js');
const { PRODUCTS } = await import('../web/js/data/products.js');

test('picture questions show a product photo and hide the right name among four', () => {
  for (let round = 0; round < 50; round++) {
    const questions = pictureQuestions(3);
    assert.equal(questions.length, 3);
    assert.equal(new Set(questions.map((question) => question.image)).size, 3, 'three different products');
    for (const question of questions) {
      const product = PRODUCTS.find((candidate) => candidate.image === question.image);
      assert.equal(question.options.length, 4);
      assert.equal(new Set(question.options).size, 4);
      assert.equal(question.options[question.answer], product.name);
    }
  }
});
