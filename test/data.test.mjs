// Catalogue data: every product has its photo, and every quiz question is well-formed.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { DEFAULT_PRIZES, DEFAULT_STATIONS } from '../web/js/data/config.js';
import { PRODUCTS } from '../web/js/data/products.js';
import { QUESTIONS } from '../web/js/data/quiz.js';

test('every product has a unique id and an image file', () => {
  assert.ok(PRODUCTS.length >= 16, 'memory needs 8 products per round; more gives variety');
  assert.equal(new Set(PRODUCTS.map((product) => product.id)).size, PRODUCTS.length);
  for (const product of PRODUCTS) {
    assert.ok(existsSync(new URL(`../web/${product.image}`, import.meta.url)), `missing ${product.image}`);
  }
});

test('quiz questions have four distinct options and a valid answer', () => {
  for (const question of QUESTIONS) {
    assert.equal(question.options.length, 4, question.q);
    assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < 4, question.q);
    assert.equal(new Set(question.options).size, 4, `duplicate options: ${question.q}`);
    assert.ok(question.note.length > 0);
  }
});

test('prizes and stations are consistent', () => {
  assert.equal(new Set(DEFAULT_PRIZES.map((prize) => prize.id)).size, DEFAULT_PRIZES.length);
  assert.ok(DEFAULT_PRIZES.some((prize) => prize.empty && prize.stock === -1), 'an unlimited empty slot must exist');
  assert.equal(new Set(DEFAULT_STATIONS.map((station) => station.code)).size, DEFAULT_STATIONS.length);
});
