// Catalogue data: every product has its photo, and the default grids show each product once.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { PRODUCTS } from '../web/js/data/products.js';
import { DEFAULT_SETTINGS } from '../web/js/game/settings.js';

test('products have unique ids and image files, enough for the default grids', () => {
  const { windows, android } = DEFAULT_SETTINGS.grids;
  assert.ok(PRODUCTS.length >= windows.columns * windows.rows, 'the Windows grid shows each product once');
  assert.ok(PRODUCTS.length >= android.columns * android.rows);
  assert.equal(new Set(PRODUCTS.map((product) => product.id)).size, PRODUCTS.length);
  for (const product of PRODUCTS) {
    assert.ok(existsSync(new URL(`../web/${product.image}`, import.meta.url)), `missing ${product.image}`);
  }
});
