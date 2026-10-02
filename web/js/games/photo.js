// Photo frame: selfie with a Zanis-branded frame. The photo is composed on a canvas and saved to
// the device gallery (through the Android bridge) so the visitor can share it on social media.

import { h, toast, host, loadImage, randomInt } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { LIGHT_PRODUCTS } from '../data/products.js';

const OUTPUT_WIDTH = 900;
const OUTPUT_HEIGHT = 1200;
const POINTS = 20;

/** Draws the branded frame (and, once loaded, the featured product badge) over the canvas. */
function drawFrame(context, width, height, badge) {
  const border = width * 0.035;
  context.lineWidth = border;
  context.strokeStyle = '#ffc21a';
  context.strokeRect(border / 2, border / 2, width - border, height - border);
  const band = height * 0.16;
  const gradient = context.createLinearGradient(0, height - band, 0, height);
  gradient.addColorStop(0, '#0b102000');
  gradient.addColorStop(0.35, '#0b1020e6');
  gradient.addColorStop(1, '#0b1020');
  context.fillStyle = gradient;
  context.fillRect(0, height - band * 1.4, width, band * 1.4);
  context.direction = 'rtl';
  context.textAlign = 'center';
  context.fillStyle = '#ffc21a';
  context.font = `900 ${Math.round(width * 0.085)}px Vazirmatn, sans-serif`;
  context.fillText('زانیس', width / 2, height - band * 0.52);
  context.fillStyle = '#ffffff';
  context.font = `700 ${Math.round(width * 0.036)}px Vazirmatn, sans-serif`;
  context.fillText('من در غرفهٔ روشنایی زانیس بودم  #زانیس', width / 2, height - band * 0.18);
  if (badge) {
    // Featured product in a white disc, top-right corner.
    const radius = width * 0.11;
    const centerX = width - border - radius - width * 0.02;
    const centerY = border + radius + width * 0.02;
    context.save();
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fillStyle = '#fff';
    context.fill();
    context.clip();
    context.drawImage(badge, centerX - radius * 0.82, centerY - radius * 0.82, radius * 1.64, radius * 1.64);
    context.restore();
    context.lineWidth = width * 0.008;
    context.strokeStyle = '#ffc21a';
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();
  }
  // Light rays in the top corner
  context.strokeStyle = '#ffc21acc';
  context.lineWidth = width * 0.008;
  for (let ray = 0; ray < 7; ray++) {
    const angle = (Math.PI / 2) * (ray / 6);
    context.beginPath();
    context.moveTo(border + Math.cos(angle) * width * 0.07, border + Math.sin(angle) * width * 0.07);
    context.lineTo(border + Math.cos(angle) * width * 0.15, border + Math.sin(angle) * width * 0.15);
    context.stroke();
  }
}

export default {
  id: 'photo',
  title: 'قاب عکس زانیس',
  blurb: 'با قاب زانیس عکس بگیر و منتشر کن',
  emoji: '📸',
  category: 'عکس و اشتراک',
  kind: 'activity',
  mount(stage, api) {
    let stream = null;
    let facing = 'user';
    const video = h('video.mirror', { autoplay: true, playsInline: true, muted: true });
    const frame = h('canvas');
    frame.width = OUTPUT_WIDTH;
    frame.height = OUTPUT_HEIGHT;
    drawFrame(frame.getContext('2d'), OUTPUT_WIDTH, OUTPUT_HEIGHT);
    // A different Zanis product is featured on the frame each time.
    const product = LIGHT_PRODUCTS[randomInt(0, LIGHT_PRODUCTS.length - 1)];
    let badge = null;
    loadImage(product.image).then((image) => {
      badge = image;
      const overlay = frame.getContext('2d');
      overlay.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      drawFrame(overlay, OUTPUT_WIDTH, OUTPUT_HEIGHT, badge);
    }).catch(() => {}); // without the photo the frame simply has no product badge
    const preview = h('div.photo-wrap', video, frame);
    const actions = h('div.row', { style: { width: '100%' } });
    stage.append(h('div.stack', { style: { alignItems: 'center', width: '100%' } }, preview, actions));

    async function startCamera() {
      stopCamera();
      if (!navigator.mediaDevices?.getUserMedia) {
        toast('دوربین روی این دستگاه در دسترس نیست.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        video.srcObject = stream;
        video.classList.toggle('mirror', facing === 'user');
      } catch {
        toast('اجازهٔ دوربین داده نشد.');
      }
    }
    function stopCamera() {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    function liveActions() {
      actions.replaceChildren(
        h(
          'button.btn.secondary',
          {
            'aria-label': 'تعویض دوربین',
            onclick: () => {
              facing = facing === 'user' ? 'environment' : 'user';
              startCamera();
            },
          },
          '🔄',
        ),
        h('button.btn.grow', { onclick: capture }, 'عکس بگیر'),
      );
    }
    function capture() {
      if (!stream || !video.videoWidth) {
        toast('دوربین هنوز آماده نیست.');
        return;
      }
      sfx.good();
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_WIDTH;
      canvas.height = OUTPUT_HEIGHT;
      const context = canvas.getContext('2d');
      // Cover-fit the camera frame into the 3:4 output, mirrored for the front camera.
      const scale = Math.max(OUTPUT_WIDTH / video.videoWidth, OUTPUT_HEIGHT / video.videoHeight);
      const drawWidth = video.videoWidth * scale;
      const drawHeight = video.videoHeight * scale;
      context.save();
      if (facing === 'user') {
        context.translate(OUTPUT_WIDTH, 0);
        context.scale(-1, 1);
      }
      context.drawImage(video, (OUTPUT_WIDTH - drawWidth) / 2, (OUTPUT_HEIGHT - drawHeight) / 2, drawWidth, drawHeight);
      context.restore();
      drawFrame(context, OUTPUT_WIDTH, OUTPUT_HEIGHT, badge);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      stopCamera();
      const shot = h('img', { src: dataUrl, alt: 'عکس با قاب زانیس' });
      preview.replaceChildren(shot);
      actions.replaceChildren(
        h(
          'button.btn.secondary',
          {
            onclick: () => {
              preview.replaceChildren(video, frame);
              liveActions();
              startCamera();
            },
          },
          'دوباره',
        ),
        h(
          'button.btn.grow',
          {
            onclick: () => {
              host.saveImage(dataUrl);
              api.finish({
                score: POINTS,
                emoji: '📸',
                title: 'عکس ذخیره شد',
                detail: 'عکس در گالری است؛ با هشتگ #زانیس منتشرش کن.',
                win: true,
              });
            },
          },
          'ذخیره در گالری',
        ),
      );
    }

    liveActions();
    startCamera();
    api.setHint('عکس فقط روی همین دستگاه ذخیره می‌شود.');
    return stopCamera;
  },
};
