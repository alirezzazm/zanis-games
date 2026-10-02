// Animated simulations of the booth activities that cannot be an Android game
// (physical buzz-wire, VR/AR experience, live installation race).
//
// Every scene is a pure function of time: renderFrame(sceneId, seconds) draws one frame.
// Open scenes.html?scene=buzz-wire in a browser to preview; videos/render.mjs turns them into MP4
// and adds the soundtrack from audio.js.

const WIDTH = 1280;
const HEIGHT = 720;
const canvas = document.getElementById('stage');
const c = canvas.getContext('2d');

const COLOR = {
  night: '#0b1020',
  wall: '#141c38',
  floor: '#0e1530',
  line: '#2a3560',
  text: '#f4f6ff',
  muted: '#a9b3d6',
  gold: '#ffc21a',
  orange: '#ff9d0a',
  green: '#2fd17c',
  red: '#ff5a6a',
  blue: '#4da3ff',
  skin: '#f2c9a0',
  metal: '#cfd6ee',
};

// Real product photos used inside the scenes (the VR product menu). Loaded once before rendering.
const PRODUCT_NAMES = {
  'square-panel-6060': 'پنل مربع ۶۰×۶۰',
  'backlight-20w': 'بک لایت ۲۰ وات',
  'bulb-12w': 'لامپ حبابی ۱۲ وات',
};
const ASSETS = {};
window.assetsReady = Promise.all(
  Object.keys(PRODUCT_NAMES).map(
    (productId) =>
      new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
          ASSETS[productId] = image;
          resolve();
        };
        image.onerror = resolve; // the menu card is simply left blank
        image.src = `../web/img/products/${productId}.webp`;
      }),
  ),
);

// ---------------------------------------------------------------- helpers
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (from, to, amount) => from + (to - from) * amount;
/** Progress 0..1 of `time` inside [start, end]. */
const span = (time, start, end) => clamp((time - start) / (end - start));
const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const toFa = (text) => String(text).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[digit]);
/** Deterministic pseudo-random in 0..1 (frames must not depend on Math.random). */
const noise = (seed) => {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

function text(value, x, y, { size = 32, weight = 700, color = COLOR.text, align = 'center', alpha = 1 } = {}) {
  c.save();
  c.globalAlpha = alpha;
  c.font = `${weight} ${size}px Vazirmatn, sans-serif`;
  c.fillStyle = color;
  c.textAlign = align;
  c.textBaseline = 'middle';
  c.direction = 'rtl';
  c.fillText(value, x, y);
  c.restore();
}

function roundRect(x, y, width, height, radius, fill, stroke) {
  c.beginPath();
  c.roundRect(x, y, width, height, radius);
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 3;
    c.stroke();
  }
}

function glow(x, y, radius, color, alpha = 1) {
  const gradient = c.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, `${color}00`);
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = gradient;
  c.beginPath();
  c.arc(x, y, radius, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** Booth backdrop: wall with the Zanis sign, ceiling lights and floor. */
function booth(time) {
  c.fillStyle = COLOR.night;
  c.fillRect(0, 0, WIDTH, HEIGHT);
  roundRect(40, 30, WIDTH - 80, 470, 24, COLOR.wall, COLOR.line);
  c.fillStyle = COLOR.floor;
  c.fillRect(0, 500, WIDTH, 220);
  c.strokeStyle = COLOR.line;
  c.lineWidth = 2;
  for (let index = 0; index < 9; index++) {
    c.beginPath();
    c.moveTo(index * 160, 500);
    c.lineTo(index * 160 - 80, HEIGHT);
    c.stroke();
  }
  // Sign
  roundRect(WIDTH - 360, 54, 290, 84, 18, COLOR.gold);
  text('زانیس', WIDTH - 215, 98, { size: 54, weight: 900, color: '#1a1300' });
  text('صنایع روشنایی', WIDTH - 215, 162, { size: 22, color: COLOR.muted });
  // Ceiling lights with a soft pulse
  for (let index = 0; index < 5; index++) {
    const x = 150 + index * 190;
    const pulse = 0.75 + 0.25 * Math.sin(time * 2 + index);
    glow(x, 36, 110, '#ffe9a6', 0.35 * pulse);
    roundRect(x - 44, 30, 88, 12, 6, '#fff3c4');
  }
}

/** Simple person: head, body, two arms pointing at hand positions. */
function person(x, groundY, { shirt = COLOR.blue, handA, handB, headset = false, scale = 1 } = {}) {
  const shoulderY = groundY - 190 * scale;
  c.lineCap = 'round';
  // Legs
  c.strokeStyle = '#27325c';
  c.lineWidth = 26 * scale;
  c.beginPath();
  c.moveTo(x - 18 * scale, groundY - 100 * scale);
  c.lineTo(x - 22 * scale, groundY);
  c.moveTo(x + 18 * scale, groundY - 100 * scale);
  c.lineTo(x + 22 * scale, groundY);
  c.stroke();
  // Body
  roundRect(x - 44 * scale, shoulderY, 88 * scale, 110 * scale, 26 * scale, shirt);
  // Arms
  c.strokeStyle = shirt;
  c.lineWidth = 20 * scale;
  for (const [side, hand] of [[-1, handA], [1, handB]]) {
    const shoulderX = x + side * 40 * scale;
    const target = hand ?? { x: shoulderX + side * 8 * scale, y: shoulderY + 100 * scale };
    c.beginPath();
    c.moveTo(shoulderX, shoulderY + 16 * scale);
    c.lineTo(target.x, target.y);
    c.stroke();
    c.fillStyle = COLOR.skin;
    c.beginPath();
    c.arc(target.x, target.y, 13 * scale, 0, Math.PI * 2);
    c.fill();
  }
  // Head
  c.fillStyle = COLOR.skin;
  c.beginPath();
  c.arc(x, shoulderY - 42 * scale, 36 * scale, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#2b2118';
  c.beginPath();
  c.arc(x, shoulderY - 52 * scale, 37 * scale, Math.PI, Math.PI * 2);
  c.fill();
  if (headset) {
    roundRect(x - 40 * scale, shoulderY - 58 * scale, 80 * scale, 34 * scale, 10 * scale, '#1b2548', COLOR.blue);
    glow(x, shoulderY - 41 * scale, 46 * scale, COLOR.blue, 0.35);
  }
}

function caption(value, time, start, end) {
  const alpha = Math.min(span(time, start, start + 0.4), 1 - span(time, end - 0.4, end));
  if (alpha <= 0) return;
  c.save();
  c.globalAlpha = alpha;
  roundRect(120, 606, WIDTH - 240, 78, 22, '#000000cc', COLOR.line);
  c.restore();
  text(value, WIDTH / 2, 646, { size: 32, alpha });
}

function titleCard(title, subtitle, time, duration = 2.4) {
  const alpha = 1 - span(time, duration - 0.5, duration);
  if (alpha <= 0) return;
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = COLOR.night;
  c.fillRect(0, 0, WIDTH, HEIGHT);
  c.restore();
  glow(WIDTH / 2, 300, 420, COLOR.gold, 0.18 * alpha);
  text(title, WIDTH / 2, 310, { size: 78, weight: 900, color: COLOR.gold, alpha });
  text(subtitle, WIDTH / 2, 400, { size: 34, color: COLOR.muted, alpha });
  text('شبیه‌سازی غرفهٔ زانیس', WIDTH / 2, 640, { size: 24, color: COLOR.muted, alpha });
}

function scoreBoard(x, y, title, rows, highlight = -1) {
  roundRect(x, y, 300, 60 + rows.length * 46, 18, '#0b1020', COLOR.line);
  text(title, x + 150, y + 32, { size: 24, color: COLOR.gold });
  rows.forEach(([name, value], index) => {
    const rowY = y + 78 + index * 46;
    if (index === highlight) roundRect(x + 10, rowY - 20, 280, 40, 10, '#ffc21a2e');
    text(name, x + 280, rowY, { size: 22, align: 'right', color: index === highlight ? COLOR.gold : COLOR.text });
    text(value, x + 20, rowY, { size: 22, align: 'left', color: index === highlight ? COLOR.gold : COLOR.muted });
  });
}

function lamp(x, y, radius, on, color = COLOR.gold) {
  if (on > 0) glow(x, y, radius * 4, color, 0.55 * on);
  c.fillStyle = on > 0 ? color : '#3a456f';
  c.beginPath();
  c.arc(x, y, radius, 0, Math.PI * 2);
  c.fill();
  roundRect(x - radius * 0.45, y + radius * 0.8, radius * 0.9, radius * 0.7, 4, COLOR.metal);
}

// ---------------------------------------------------------------- scene 1: buzz wire
const WIRE = { startX: 250, endX: 860, baseY: 380 };
const wireY = (x) => {
  const u = (x - WIRE.startX) / (WIRE.endX - WIRE.startX);
  return WIRE.baseY - 70 * Math.sin(u * Math.PI * 3) * Math.sin(u * Math.PI) - 40 * Math.sin(u * Math.PI);
};

function buzzWire(time) {
  booth(time);
  // Timeline: first attempt touches the wire at 7.2s, second attempt (9.5s → 20s) succeeds.
  const firstRun = easeInOut(span(time, 3, 7.2)) * 0.46;
  const secondRun = easeInOut(span(time, 9.5, 19.5));
  const touched = time >= 7.2 && time < 9.5;
  const progress = time < 9.5 ? firstRun : secondRun;
  const ringX = lerp(WIRE.startX + 16, WIRE.endX - 16, progress);
  const wobble = touched ? 0 : Math.sin(time * 9) * 6 * (1 - span(time, 9.5, 12) * 0.6);
  const ringY = wireY(ringX) + (touched ? 14 : wobble);
  const finished = time >= 19.5;

  // The player stands behind the table, so the table and wire are drawn over them.
  person(ringX - 40, 600, { shirt: COLOR.blue, handB: { x: ringX + 4, y: ringY + 70 }, handA: { x: ringX - 90, y: 470 } });
  // Table
  roundRect(180, 440, 760, 30, 10, '#27325c');
  roundRect(220, 470, 26, 110, 6, '#1b2548');
  roundRect(874, 470, 26, 110, 6, '#1b2548');
  // Posts and wire
  c.strokeStyle = COLOR.metal;
  c.lineWidth = 10;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(WIRE.startX, 440);
  c.lineTo(WIRE.startX, wireY(WIRE.startX));
  c.moveTo(WIRE.endX, 440);
  c.lineTo(WIRE.endX, wireY(WIRE.endX));
  c.stroke();
  c.lineWidth = 7;
  c.beginPath();
  for (let x = WIRE.startX; x <= WIRE.endX; x += 6) c.lineTo(x, wireY(x));
  c.stroke();

  c.strokeStyle = '#8f9cd0';
  c.lineWidth = 8;
  c.beginPath();
  c.moveTo(ringX + 4, ringY + 70);
  c.lineTo(ringX, ringY + 22);
  c.stroke();
  c.strokeStyle = touched ? COLOR.red : COLOR.gold;
  c.lineWidth = 7;
  c.beginPath();
  c.ellipse(ringX, ringY, 12, 22, 0, 0, Math.PI * 2);
  c.stroke();
  if (touched) {
    const flash = 0.5 + 0.5 * Math.sin(time * 30);
    glow(ringX, ringY, 90, COLOR.red, 0.7 * flash);
    text('بوق!', ringX, ringY - 80, { size: 54, weight: 900, color: COLOR.red });
  }

  // Signal lamp + timer panel
  roundRect(950, 250, 250, 190, 20, '#0b1020', COLOR.line);
  lamp(1075, 300, 24, touched ? 1 : finished ? 1 : 0.15, touched ? COLOR.red : finished ? COLOR.green : COLOR.gold);
  const seconds = time < 3 ? 0 : time < 7.2 ? time - 3 : time < 9.5 ? 4.2 : Math.min(time, 19.5) - 9.5;
  text(toFa(seconds.toFixed(1)), 1075, 390, { size: 54, weight: 900, color: touched ? COLOR.red : COLOR.text });
  text('ثانیه', 1075, 425, { size: 20, color: COLOR.muted });

  // Spectators
  person(1010, 610, { shirt: '#b07cff', scale: 0.8, handA: finished ? { x: 960, y: 400 } : undefined, handB: finished ? { x: 1060, y: 400 } : undefined });
  person(1130, 610, { shirt: COLOR.orange, scale: 0.8, handB: finished ? { x: 1180, y: 400 } : undefined });

  if (finished) {
    const pop = easeOut(span(time, 19.5, 20.3));
    scoreBoard(70, 190 - (1 - pop) * 40, 'رکوردهای امروز', [['سارا', '۹٫۴'], ['شما', '۱۰٫۰'], ['رضا', '۱۲٫۸'], ['مهدی', '۱۵٫۱']], 1);
    for (let index = 0; index < 40; index++) {
      const fall = (time - 19.5) * (120 + noise(index) * 160);
      c.fillStyle = [COLOR.gold, COLOR.green, COLOR.blue, COLOR.red][index % 4];
      c.fillRect(200 + noise(index + 7) * 880, 60 + fall, 10, 16);
    }
  }

  caption('بازیکن باید حلقه را از این سر سیم تا آن سر ببرد، بدون برخورد.', time, 2.6, 7);
  caption('برخورد حلقه با سیم: چراغ قرمز و بوق؛ از اول!', time, 7.2, 9.6);
  caption('دست ثابت و سرعت بیشتر یعنی رکورد بهتر.', time, 10.2, 16);
  caption('رکورد ثبت می‌شود؛ بهترین‌های هر روز جایزه می‌گیرند.', time, 19.6, 24);
  titleCard('سیم و حلقه', 'بازی مهارتی فیزیکی غرفه', time);
}

// ---------------------------------------------------------------- scene 2: VR / AR
// Timeline (seconds): 0 title · 2.4 visitor puts the headset on · 8 first-person view inside the
// headset (dark room → Zanis panels switch on → product menu → colour temperature) · 27 AR on a phone.
const VR = { headsetOn: 6.2, povStart: 8, lightsStart: 11.3, menuStart: 15.5, select: 18.2, tempStart: 20.5, povEnd: 26.5, arStart: 27 };
const VR_MENU = ['square-panel-6060', 'backlight-20w', 'bulb-12w'];

/** A quadrilateral given by four [x, y] corners. */
function quad(points, fill, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = fill;
  c.beginPath();
  points.forEach(([x, y], index) => (index ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
  c.restore();
}

const mix = (from, to, amount) => {
  const parse = (hex) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  const [a, b] = [parse(from), parse(to)];
  // Hex output, because glow() appends an alpha suffix to the colour it is given.
  return `#${a.map((value, index) => Math.round(lerp(value, b[index], amount)).toString(16).padStart(2, '0')).join('')}`;
};

/**
 * First-person view: a room in one-point perspective. `pan` shifts the vanishing point as the head
 * turns, `lightsOn` (0..3) switches the ceiling fixtures on one by one, `warmth` (0 cool .. 1 warm)
 * sets the colour temperature, `round` swaps the square panels for round backlights.
 */
function povRoom(pan, lightsOn, warmth, round) {
  const back = { x: 380 + pan, y: 190, w: 520, h: 300 };
  const lit = clamp(lightsOn / 3);
  const lightColor = mix('#dff1ff', '#ffd9a0', warmth);
  const shade = (dark, bright) => mix(dark, bright, lit);
  const corners = { tl: [back.x, back.y], tr: [back.x + back.w, back.y], bl: [back.x, back.y + back.h], br: [back.x + back.w, back.y + back.h] };

  quad([[0, 0], [WIDTH, 0], corners.tr, corners.tl], shade('#10162c', '#e8ecf8')); // ceiling
  quad([[0, HEIGHT], [WIDTH, HEIGHT], corners.br, corners.bl], shade('#0c1124', '#8a6f52')); // floor
  quad([[0, 0], corners.tl, corners.bl, [0, HEIGHT]], shade('#141b36', '#c9d3ee')); // left wall
  quad([[WIDTH, 0], corners.tr, corners.br, [WIDTH, HEIGHT]], shade('#141b36', '#bcc8e8')); // right wall
  quad([corners.tl, corners.tr, corners.br, corners.bl], shade('#19213f', '#dde4f7')); // back wall

  // Furniture on the back wall: sofa, picture, side table with a plant.
  roundRect(back.x + 70, back.y + 190, 250, 90, 18, shade('#232c52', '#4d5fa8'));
  roundRect(back.x + 90, back.y + 160, 210, 50, 14, shade('#2a3460', '#5d70bd'));
  roundRect(back.x + 110, back.y + 40, 150, 90, 6, shade('#1d2547', '#f3e6c8'), shade('#2a3560', '#7a5a2e'));
  roundRect(back.x + 380, back.y + 215, 80, 65, 6, shade('#232c52', '#7a5a2e'));
  c.fillStyle = shade('#1f3a34', '#3fae6a');
  c.beginPath();
  c.ellipse(back.x + 420, back.y + 190, 34, 44, 0, 0, Math.PI * 2);
  c.fill();
  // A window on the left wall, in perspective.
  quad([[90 + pan * 0.25, 190], [250 + pan * 0.55, 235], [250 + pan * 0.55, 400], [90 + pan * 0.25, 470]], shade('#0b1020', '#9fd0ff'));

  // Three ceiling fixtures between the viewer and the back wall.
  for (let index = 0; index < 3; index++) {
    const depth = 0.28 + index * 0.24; // 0 = at the viewer, 1 = at the back wall
    const centerX = lerp(WIDTH / 2, back.x + back.w / 2, depth);
    const y = lerp(0, back.y, depth) + 6;
    const half = lerp(190, 74, depth);
    const thick = lerp(64, 22, depth);
    const on = clamp(lightsOn - index);
    c.fillStyle = on > 0 ? lightColor : '#39446f';
    c.beginPath();
    if (round) c.ellipse(centerX, y + thick / 2, half * 0.62, thick * 0.62, 0, 0, Math.PI * 2);
    else c.roundRect(centerX - half, y, half * 2, thick, 8);
    c.fill();
    if (on > 0) {
      quad([[centerX - half, y + thick], [centerX + half, y + thick], [centerX + half * 2.6, HEIGHT], [centerX - half * 2.6, HEIGHT]], lightColor, 0.16 * on);
      glow(centerX, y + thick / 2, half * 1.5, lightColor, 0.35 * on);
    }
  }
}

/** Black goggle mask with a nose notch, so the frame reads as "seen through the headset". */
function headsetMask() {
  c.save();
  c.fillStyle = '#000';
  c.beginPath();
  c.rect(0, 0, WIDTH, HEIGHT);
  c.roundRect(50, 40, WIDTH - 100, HEIGHT - 150, 150);
  c.fill('evenodd');
  c.beginPath();
  c.moveTo(WIDTH / 2 - 110, HEIGHT - 108);
  c.quadraticCurveTo(WIDTH / 2, HEIGHT - 250, WIDTH / 2 + 110, HEIGHT - 108);
  c.closePath();
  c.fill();
  const vignette = c.createRadialGradient(WIDTH / 2, 300, 260, WIDTH / 2, 300, 640);
  vignette.addColorStop(0, '#00000000');
  vignette.addColorStop(1, '#000000cc');
  c.fillStyle = vignette;
  c.fillRect(0, 0, WIDTH, HEIGHT);
  c.restore();
  roundRect(WIDTH / 2 - 150, 54, 300, 40, 20, '#000000aa', COLOR.blue);
  text('نمای داخل هدست VR', WIDTH / 2, 75, { size: 22, color: COLOR.blue });
}

/** Floating product menu inside VR: three real Zanis products; the controller ray picks the middle one. */
function vrMenu(time) {
  const appear = easeOut(span(time, VR.menuStart, VR.menuStart + 0.8));
  if (appear <= 0) return;
  const selected = time >= VR.select;
  VR_MENU.forEach((productId, index) => {
    const x = 330 + index * 220;
    const y = 250 + (1 - appear) * 60 + Math.sin(time * 1.6 + index) * 5;
    const active = selected && index === 1;
    c.save();
    c.globalAlpha = appear * (selected && !active ? 0.45 : 1);
    roundRect(x, y, 180, 210, 18, '#0b1020dd', active ? COLOR.gold : COLOR.blue);
    roundRect(x + 20, y + 16, 140, 140, 12, '#ffffff');
    const photo = ASSETS[productId];
    if (photo) c.drawImage(photo, x + 24, y + 20, 132, 132);
    c.restore();
    text(PRODUCT_NAMES[productId], x + 90, y + 184, { size: 17, color: active ? COLOR.gold : COLOR.text, alpha: appear });
  });
  // Controller ray from the lower right towards the middle card.
  const aim = easeInOut(span(time, VR.menuStart + 0.8, VR.select));
  const target = { x: lerp(820, 640, aim), y: lerp(520, 370, aim) };
  c.save();
  c.globalAlpha = appear;
  c.strokeStyle = COLOR.gold;
  c.lineWidth = 4;
  c.setLineDash([14, 10]);
  c.beginPath();
  c.moveTo(1010, 600);
  c.lineTo(target.x, target.y);
  c.stroke();
  c.setLineDash([]);
  glow(target.x, target.y, selected ? 34 : 20, COLOR.gold, 0.9);
  roundRect(985, 560, 70, 120, 26, '#1b2548', COLOR.blue);
  c.restore();
}

function vrAr(time) {
  if (time < VR.povStart) {
    // --- Outside view: the visitor lowers the headset onto their eyes.
    booth(time);
    const lower = easeInOut(span(time, 3.4, VR.headsetOn));
    const headsetY = lerp(250, 371, lower);
    const worn = lower >= 1;
    person(640, 620, { shirt: COLOR.blue, headset: worn, handA: { x: 590, y: worn ? 470 : headsetY + 18 }, handB: { x: 690, y: worn ? 470 : headsetY + 18 } });
    if (!worn) {
      roundRect(600, headsetY, 80, 34, 10, '#1b2548', COLOR.blue);
      glow(640, headsetY + 17, 46, COLOR.blue, 0.35);
    }
    roundRect(180, 300, 250, 190, 20, '#0b1020', COLOR.line);
    text('ایستگاه VR', 305, 340, { size: 30, weight: 900, color: COLOR.gold });
    text('خانهٔ مجازی زانیس', 305, 390, { size: 22, color: COLOR.muted });
    text('۲ دقیقه برای هر نفر', 305, 440, { size: 20, color: COLOR.muted });
    caption('بازدیدکننده هدست را روی چشمش می‌گذارد.', time, 2.6, 6.6);
    caption('حالا ببینیم داخل هدست چه می‌بیند…', time, 6.7, 8);
    // Blink to black just before the first-person view.
    const blink = span(time, 7.4, VR.povStart);
    if (blink > 0) quad([[0, 0], [WIDTH, 0], [WIDTH, HEIGHT], [0, HEIGHT]], '#000000', blink);
  } else if (time < VR.arStart) {
    // --- First-person view through the headset.
    const local = time - VR.povStart;
    const pan = Math.sin(local * 0.55) * 150 * (1 - span(time, VR.menuStart - 1, VR.menuStart) * 0.8);
    const lightsOn = clamp((time - VR.lightsStart) / 1.3, 0, 3);
    const warmth = time < VR.tempStart ? 0.15 : 0.15 + 0.85 * (0.5 - 0.5 * Math.cos(((time - VR.tempStart) / 2.6) * Math.PI));
    povRoom(pan, lightsOn, warmth, time >= VR.select);
    vrMenu(time);
    if (time >= VR.tempStart) {
      // Colour-temperature slider driven by the controller.
      roundRect(390, 520, 500, 16, 8, '#000000aa', COLOR.line);
      const knob = 390 + 500 * (1 - warmth);
      const scale = c.createLinearGradient(390, 0, 890, 0);
      scale.addColorStop(0, '#ffd9a0');
      scale.addColorStop(1, '#dff1ff');
      roundRect(392, 522, 496, 12, 6, scale);
      glow(knob, 528, 26, COLOR.gold, 0.9);
      text(warmth > 0.5 ? 'آفتابی ۳۰۰۰K' : 'مهتابی ۶۵۰۰K', 640, 486, { size: 26, weight: 900 });
    }
    headsetMask();
    const fadeIn = 1 - span(time, VR.povStart, VR.povStart + 0.6);
    const fadeOut = span(time, VR.povEnd, VR.arStart);
    const black = Math.max(fadeIn, fadeOut);
    if (black > 0) quad([[0, 0], [WIDTH, 0], [WIDTH, HEIGHT], [0, HEIGHT]], '#000000', black);
    caption('داخل هدست: یک خانهٔ خاموش. با چرخاندن سر، دورتادور اتاق دیده می‌شود.', time, 8.4, 11.2);
    caption('پنل‌های زانیس یکی‌یکی روشن می‌شوند و اتاق جان می‌گیرد.', time, 11.4, 15.3);
    caption('با دسته، محصول را از منو انتخاب می‌کنید؛ همان لحظه روی سقف عوض می‌شود.', time, 15.6, 20.3);
    caption('رنگ نور را هم امتحان کنید: آفتابی یا مهتابی؟', time, 20.6, 26.2);
  } else {
    // --- AR part: phone pointed at a bare ceiling; the product appears on the screen.
    booth(time);
    const arTime = time - VR.arStart;
    const appear = easeOut(span(arTime, 3, 4.2));
    roundRect(120, 200, 420, 230, 20, '#1b2548', COLOR.line);
    text('سقف واقعی (خالی)', 330, 315, { size: 26, color: COLOR.muted });
    person(360, 620, { shirt: COLOR.orange, handA: { x: 560, y: 380 }, handB: { x: 640, y: 392 } });
    c.save();
    c.translate(760, 350);
    c.rotate(-0.06);
    c.scale(0.82, 0.82);
    roundRect(-190, -250, 380, 500, 34, '#05070f', COLOR.metal);
    c.save();
    c.beginPath();
    c.roundRect(-174, -232, 348, 464, 22);
    c.clip();
    c.fillStyle = '#39446f';
    c.fillRect(-174, -232, 348, 464);
    c.fillStyle = '#232c52';
    c.fillRect(-174, 120, 348, 112);
    if (appear > 0) {
      c.globalAlpha = appear;
      c.fillStyle = '#fff3c4';
      c.beginPath();
      c.roundRect(-70, -150 + (1 - appear) * -40, 140, 140, 10);
      c.fill();
      c.globalAlpha = 0.3 * appear;
      c.fillStyle = '#ffe9a6';
      c.beginPath();
      c.moveTo(-70, -10);
      c.lineTo(70, -10);
      c.lineTo(174, 232);
      c.lineTo(-174, 232);
      c.closePath();
      c.fill();
      c.globalAlpha = 1;
    }
    c.restore();
    if (appear > 0) {
      roundRect(-140, 160, 280, 46, 23, COLOR.gold);
      text('پنل مربع توکار ۶۰×۶۰ زانیس', 0, 184, { size: 20, color: '#1a1300' });
    }
    c.restore();
    text('نمای دوربین گوشی', 760, 118, { size: 22, color: COLOR.blue });
    caption('واقعیت افزوده: دوربین گوشی را رو به سقف بگیرید.', time, VR.arStart + 0.4, VR.arStart + 3.2);
    caption('چراغ انتخابی روی سقف خودتان دیده می‌شود، پیش از خرید.', time, VR.arStart + 3.4, VR.arStart + 7.4);
    caption('برای اجرا: هدست VR یا تبلت با قابلیت AR و مدل سه‌بعدی محصولات لازم است.', time, VR.arStart + 7.6, 38);
  }
  titleCard('تجربهٔ VR و AR', 'نور زانیس را پیش از خرید ببینید', time);
}

// ---------------------------------------------------------------- scene 3: installation race
function workBench(x, progress, time, done) {
  roundRect(x - 190, 430, 380, 28, 10, '#27325c');
  roundRect(x - 160, 458, 24, 120, 6, '#1b2548');
  roundRect(x + 136, 458, 24, 120, 6, '#1b2548');
  // Practice board: switch on the left, lamp on the right, wire drawn as the work progresses.
  roundRect(x - 150, 250, 300, 170, 14, '#e9dcc0', '#8a7448');
  roundRect(x - 122, 310, 44, 60, 8, '#ffffff', '#8f9cd0');
  roundRect(x - 108, done ? 318 : 340, 16, 22, 4, done ? COLOR.green : '#8f9cd0');
  c.strokeStyle = COLOR.red;
  c.lineWidth = 6;
  c.lineCap = 'round';
  c.beginPath();
  const wireEnd = lerp(x - 78, x + 86, clamp(progress * 1.15));
  c.moveTo(x - 78, 340);
  c.bezierCurveTo(x - 30, 290, x + 20, 400, wireEnd, lerp(340, 322, clamp(progress * 1.15)));
  c.stroke();
  lamp(x + 100, 310, 22, done ? 1 : 0);
  // Progress bar
  roundRect(x - 150, 210, 300, 18, 9, '#0b1020', COLOR.line);
  roundRect(x - 148, 212, 296 * clamp(progress), 14, 7, done ? COLOR.green : COLOR.gold);
  if (!done && progress > 0) {
    // Screwdriver sparks while working
    for (let index = 0; index < 3; index++) {
      const phase = noise(Math.floor(time * 14) + index);
      glow(wireEnd + (phase - 0.5) * 30, 330 + (noise(index + time) - 0.5) * 20, 10, COLOR.gold, 0.8);
    }
  }
}

function installRace(time) {
  booth(time);
  const start = 5;
  const countdown = time >= 2.6 && time < start;
  const leftProgress = span(time, start, 17.5);
  const rightProgress = span(time, start, 21.5) * 0.86 + 0.04 * Math.sin(time);
  const leftDone = time >= 17.5;
  workBench(330, leftProgress, time, leftDone);
  workBench(880, clamp(rightProgress), time, false);
  const bob = (phase) => Math.sin(time * 8 + phase) * 10;
  person(250, 630, { shirt: COLOR.blue, handA: leftDone ? { x: 190, y: 380 } : { x: 290 + bob(0), y: 400 }, handB: leftDone ? { x: 320, y: 370 } : { x: 360 + bob(1), y: 370 + bob(2) } });
  person(800, 630, { shirt: '#b07cff', handA: { x: 840 + bob(3), y: 400 }, handB: { x: 910 + bob(4), y: 372 + bob(5) } });
  text('شرکت‌کنندهٔ ۱', 330, 180, { size: 24, color: COLOR.muted });
  text('شرکت‌کنندهٔ ۲', 880, 180, { size: 24, color: COLOR.muted });
  // Referee with a stopwatch
  person(1170, 640, { shirt: COLOR.orange, scale: 0.9, handB: { x: 1225, y: 400 } });
  roundRect(1060, 190, 170, 110, 18, '#0b1020', COLOR.line);
  const clock = time < start ? 0 : Math.min(time, 17.5) - start;
  text(toFa(clock.toFixed(1)), 1145, 236, { size: 46, weight: 900 });
  text('ثانیه', 1145, 276, { size: 18, color: COLOR.muted });

  if (countdown) {
    const number = Math.ceil(start - time);
    const pulse = 1 + 0.25 * (1 - ((start - time) % 1));
    text(toFa(number), WIDTH / 2, 330, { size: 170 * pulse, weight: 900, color: COLOR.gold });
  }
  if (leftDone) {
    const pop = easeOut(span(time, 17.5, 18.3));
    text('برنده!', 330, 130 - (1 - pop) * 30, { size: 56, weight: 900, color: COLOR.green, alpha: pop });
    for (let index = 0; index < 36; index++) {
      const fall = (time - 17.5) * (130 + noise(index) * 150);
      c.fillStyle = [COLOR.gold, COLOR.green, COLOR.blue, COLOR.red][index % 4];
      c.fillRect(120 + noise(index + 3) * 440, 40 + fall, 10, 16);
    }
    if (time > 19) scoreBoard(455, 250, 'سریع‌ترین نصب‌ها', [['شما', '۱۲٫۵'], ['حمید', '۱۳٫۹'], ['نیما', '۱۶٫۲']], 0);
  }

  caption('دو الکتریکی هم‌زمان یک کلید و سرپیچ را روی تختهٔ تمرین نصب می‌کنند.', time, 2.6, 6.4);
  caption('زمان‌سنج روشن است؛ هر کس زودتر لامپ را روشن کند برنده است.', time, 6.8, 12.5);
  caption('داور سیم‌کشی را از نظر ایمنی و درستی هم بررسی می‌کند.', time, 12.9, 17.3);
  caption('برنده جایزه می‌گیرد و رکورد روی تابلو می‌ماند.', time, 17.7, 24);
  titleCard('مسابقهٔ سرعت نصب', 'چالش واقعی با محصول، ویژهٔ الکتریکی‌ها', time);
}

// ---------------------------------------------------------------- registry
const SCENES = {
  'buzz-wire': { duration: 24, draw: buzzWire },
  'vr-ar': { duration: 38, draw: vrAr },
  'install-race': { duration: 24, draw: installRace },
};

/** Draws one frame. Used by the renderer (videos/render.mjs) and by the live preview below. */
window.renderFrame = (sceneId, seconds) => {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, WIDTH, HEIGHT);
  SCENES[sceneId].draw(seconds);
};
window.SCENES = Object.fromEntries(Object.entries(SCENES).map(([id, scene]) => [id, scene.duration]));

// Live preview: scenes.html?scene=vr-ar (add &t=12 to freeze a frame).
const params = new URLSearchParams(location.search);
const previewScene = params.get('scene');
if (previewScene && SCENES[previewScene]) {
  Promise.all([document.fonts.ready, window.assetsReady]).then(() => {
    if (params.has('t')) {
      window.renderFrame(previewScene, Number(params.get('t')));
      return;
    }
    const startedAt = performance.now();
    const loop = (now) => {
      window.renderFrame(previewScene, ((now - startedAt) / 1000) % SCENES[previewScene].duration);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}
