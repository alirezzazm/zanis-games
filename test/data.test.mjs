// Catalogue data: the largest grid can be filled with distinct products, each with its photo.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { PRODUCTS } from '../web/js/data/products.js';
import { LIMITS } from '../web/js/game/settings.js';

test('enough products with unique ids and image files for the largest grid', () => {
  assert.ok(PRODUCTS.length >= LIMITS.lampCount[1], 'the largest grid shows each product once');
  assert.equal(new Set(PRODUCTS.map((product) => product.id)).size, PRODUCTS.length);
  for (const product of PRODUCTS) {
    assert.ok(existsSync(new URL(`../web/${product.image}`, import.meta.url)), `missing ${product.image}`);
  }
});
