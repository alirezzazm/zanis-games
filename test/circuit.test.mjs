// Circuit puzzle: every generated board must be solvable, and rotation must be a 4-cycle.
import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.window = globalThis;
globalThis.document = { getElementById: () => null };
const { createBoard, liveCells, rotate } = await import('../web/js/games/circuit.js');

const SIZE = 5;
const EAST = 2;

test('the solved board carries current from the battery to the lamp', () => {
  for (let round = 0; round < 300; round++) {
    const { masks, startRow, endRow } = createBoard();
    const end = endRow * SIZE + (SIZE - 1);
    assert.ok(liveCells(masks, startRow).has(end), 'lamp cell is live');
    assert.ok(masks[end] & EAST, 'lamp cell opens towards the lamp');
    assert.ok(masks.every((mask) => mask > 0 && mask < 16), 'every cell has a wire tile');
  }
});

test('four quarter turns bring a tile back to where it started', () => {
  for (let mask = 1; mask < 16; mask++) {
    assert.equal(rotate(rotate(rotate(rotate(mask)))), mask);
  }
  assert.equal(rotate(1), 2); // north -> east
  assert.equal(rotate(8), 1); // west -> north
});
