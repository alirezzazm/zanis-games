// Circuit puzzle: rotate the wire tiles so current flows from the battery (left) to the lamp (right).
// Each tile is a bitmask of open sides; the board is generated from a random path so it is always solvable.

import { h, randomInt, shuffle, fa, host } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { LIGHT_PRODUCTS } from '../data/products.js';

const SIZE = 5;
const MAX_SCORE = 100;
const NORTH = 1;
const EAST = 2;
const SOUTH = 4;
const WEST = 8;
const SIDES = [
  { bit: NORTH, opposite: SOUTH, row: -1, column: 0 },
  { bit: EAST, opposite: WEST, row: 0, column: 1 },
  { bit: SOUTH, opposite: NORTH, row: 1, column: 0 },
  { bit: WEST, opposite: EAST, row: 0, column: -1 },
];

export const rotate = (mask) => ((mask << 1) & 15) | (mask >> 3);
const cellIndex = (row, column) => row * SIZE + column;

/** Random self-avoiding path from (startRow, 0) to any cell in the last column (depth-first search). */
function randomPath(startRow) {
  const visited = new Set([cellIndex(startRow, 0)]);
  const path = [[startRow, 0]];
  const walk = (row, column) => {
    if (column === SIZE - 1) return true;
    for (const side of shuffle(SIDES)) {
      const nextRow = row + side.row;
      const nextColumn = column + side.column;
      const key = cellIndex(nextRow, nextColumn);
      if (nextRow < 0 || nextRow >= SIZE || nextColumn < 0 || nextColumn >= SIZE || visited.has(key)) continue;
      visited.add(key);
      path.push([nextRow, nextColumn]);
      if (walk(nextRow, nextColumn)) return true;
      path.pop();
    }
    return false;
  };
  walk(startRow, 0);
  return path;
}

/** Builds the solved board (masks along the path, random wires elsewhere). */
export function createBoard() {
  const startRow = randomInt(0, SIZE - 1);
  const path = randomPath(startRow);
  const masks = new Array(SIZE * SIZE).fill(0);
  path.forEach(([row, column], step) => {
    let mask = 0;
    const link = (other) => {
      if (!other) return;
      const side = SIDES.find((candidate) => candidate.row === other[0] - row && candidate.column === other[1] - column);
      mask |= side.bit;
    };
    link(path[step - 1]);
    link(path[step + 1]);
    if (step === 0) mask |= WEST; // feed from the battery
    if (step === path.length - 1) mask |= EAST; // out to the lamp
    masks[cellIndex(row, column)] = mask;
  });
  const fillers = [NORTH | SOUTH, NORTH | EAST, NORTH | EAST | SOUTH];
  for (let index = 0; index < masks.length; index++) {
    if (masks[index] === 0) masks[index] = fillers[randomInt(0, fillers.length - 1)];
  }
  const endRow = path[path.length - 1][0];
  return { masks, startRow, endRow };
}

/** Cells reachable from the battery through matching openings. */
export function liveCells(masks, startRow) {
  const live = new Set();
  const start = cellIndex(startRow, 0);
  if (!(masks[start] & WEST)) return live;
  const queue = [[startRow, 0]];
  live.add(start);
  while (queue.length) {
    const [row, column] = queue.shift();
    for (const side of SIDES) {
      const nextRow = row + side.row;
      const nextColumn = column + side.column;
      if (nextRow < 0 || nextRow >= SIZE || nextColumn < 0 || nextColumn >= SIZE) continue;
      const key = cellIndex(nextRow, nextColumn);
      if (live.has(key)) continue;
      if (masks[cellIndex(row, column)] & side.bit && masks[key] & side.opposite) {
        live.add(key);
        queue.push([nextRow, nextColumn]);
      }
    }
  }
  return live;
}

function wireSvg(mask) {
  const ends = { [NORTH]: '50,0', [EAST]: '100,50', [SOUTH]: '50,100', [WEST]: '0,50' };
  const lines = SIDES.filter((side) => mask & side.bit)
    .map((side) => `<path class="wire" d="M50,50 L${ends[side.bit]}"/>`)
    .join('');
  return `<svg viewBox="0 0 100 100">${lines}<circle cx="50" cy="50" r="9" fill="currentColor" opacity=".5"/></svg>`;
}

export default {
  id: 'circuit',
  title: 'مدار را ببند',
  blurb: 'سیم‌ها را بچرخان تا محصول زانیس روشن شود',
  emoji: '🔌',
  category: 'چالش فنی',
  kind: 'score',
  mount(stage, api) {
    const { masks: solution, startRow, endRow } = createBoard();
    // The thing to power up is a different Zanis light every round.
    const product = LIGHT_PRODUCTS[randomInt(0, LIGHT_PRODUCTS.length - 1)];
    // Scramble by rotating every tile a random number of quarter turns.
    const masks = solution.map((mask) => {
      let turned = mask;
      for (let turn = randomInt(0, 3); turn > 0; turn--) turned = rotate(turned);
      return turned;
    });
    let moves = 0;
    let seconds = 0;
    let done = false;

    const cells = masks.map((_, index) => h('button.cell', { onclick: () => turn(index) }));
    const grid = h('div.circuit', { style: { gridTemplateColumns: `repeat(${SIZE}, 1fr)` } }, cells);
    const side = (row, content) =>
      h(
        'div.circuit-side',
        { style: { gridTemplateRows: `repeat(${SIZE}, 1fr)` } },
        Array.from({ length: SIZE }, (_, index) => h('span', index === row ? content : null)),
      );
    const lampPhoto = h('img.circuit-lamp', { src: product.image, alt: product.name, draggable: false });
    const lamp = side(endRow, lampPhoto);
    // Layout is forced LTR so "battery left, lamp right" matches the wire directions.
    stage.append(
      h('div', { style: { display: 'flex', direction: 'ltr', gap: '6px', width: '100%', justifyContent: 'center' } }, side(startRow, '🔋'), grid, lamp),
    );

    const clock = setInterval(() => {
      seconds += 1;
      updateHud();
    }, 1000);

    function updateHud() {
      api.setHud([
        ['چرخش', fa(moves)],
        ['زمان', fa(seconds)],
      ]);
    }
    function render() {
      const live = liveCells(masks, startRow);
      cells.forEach((cell, index) => {
        cell.innerHTML = wireSvg(masks[index]);
        cell.classList.toggle('live', live.has(index));
      });
      const end = cellIndex(endRow, SIZE - 1);
      return live.has(end) && Boolean(masks[end] & EAST);
    }
    function turn(index) {
      if (done) return;
      masks[index] = rotate(masks[index]);
      moves += 1;
      sfx.tap();
      updateHud();
      if (!render()) return;
      done = true;
      clearInterval(clock);
      lampPhoto.classList.add('lit');
      host.vibrate(60);
      const score = Math.max(10, Math.round(MAX_SCORE - seconds * 0.7 - moves * 0.4));
      setTimeout(
        () =>
          api.finish({
            score,
            emoji: '💡',
            image: product.image,
            title: 'روشن شد!',
            detail: `${product.name} · ${fa(score)} امتیاز · ${fa(moves)} چرخش در ${fa(seconds)} ثانیه`,
            win: true,
          }),
        700,
      );
    }
    render();
    updateHud();
    api.setHint('هر خانه را لمس کن تا سیم ۹۰ درجه بچرخد.');
    return () => clearInterval(clock);
  },
};
