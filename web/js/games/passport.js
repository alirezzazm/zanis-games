// Booth passport: the visitor collects a stamp at every station of the booth by entering the
// station code (printed next to the products) or scanning its QR code where the device supports it.

import { h, fa, toLatinDigits, toast, host } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { store } from '../core/store.js';
import { prizeImage } from '../data/products.js';

const POINTS_PER_STAMP = 20;

export default {
  id: 'passport',
  title: 'پاسپورت غرفه',
  blurb: 'از همهٔ بخش‌های غرفه مهر بگیر و جایزهٔ ویژه ببر',
  emoji: '🛂',
  category: 'گنج‌یابی',
  kind: 'activity',
  mount(stage, api) {
    const stations = store.state.stations;
    const wrap = h('div.stack', { style: { width: '100%', alignSelf: 'start' } });
    stage.append(wrap);
    stage.style.placeItems = 'start stretch';
    let stream = null;
    let scanTimer = 0;

    function stamps() {
      return store.currentPlayer()?.stamps ?? [];
    }
    function render() {
      const collected = stamps();
      const input = h('input', { inputMode: 'numeric', maxLength: 6, placeholder: 'کد ایستگاه', 'aria-label': 'کد ایستگاه' });
      const error = h('div.error');
      const canScan = 'BarcodeDetector' in window && navigator.mediaDevices?.getUserMedia;
      api.setHud([['مهرها', `${fa(collected.length)} از ${fa(stations.length)}`]]);
      wrap.replaceChildren(
        h(
          'div.stamps',
          stations.map((station) =>
            h(
              `div.stamp${collected.includes(station.id) ? '.got' : ''}`,
              prizeImage(station)
                ? h('img', { src: prizeImage(station), alt: '', draggable: false })
                : h('div.emoji', station.emoji),
              h('b', station.title),
              h('div', collected.includes(station.id) ? 'مهر شد ✓' : 'هنوز نه'),
            ),
          ),
        ),
        h(
          'div.card.stack',
          h('div.field', h('label', 'کد چهاررقمی کنار هر بخش غرفه را وارد کن'), input, error),
          h('button.btn.block', { onclick: () => submit(input.value, error) }, 'ثبت مهر'),
          canScan && h('button.btn.secondary.block', { onclick: scan }, 'اسکن QR ایستگاه'),
        ),
      );
    }
    function submit(raw, errorNode) {
      const code = toLatinDigits(raw).trim();
      const station = stations.find((candidate) => candidate.code === code);
      if (!station) {
        if (errorNode) errorNode.textContent = 'این کد درست نیست.';
        sfx.bad();
        return false;
      }
      if (!store.addStamp(station.id)) {
        toast('این مهر را قبلاً گرفته‌ای.');
        return true;
      }
      sfx.good();
      host.vibrate(30);
      toast(`مهر «${station.title}» ثبت شد`);
      render();
      if (stamps().length === stations.length) {
        api.finish({
          score: stations.length * POINTS_PER_STAMP,
          emoji: '🏅',
          title: 'پاسپورت کامل شد!',
          detail: 'برای دریافت جایزهٔ ویژه به مسئول غرفه مراجعه کن.',
          win: true,
        });
      }
      return true;
    }
    async function scan() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      } catch {
        toast('دسترسی به دوربین داده نشد؛ کد را دستی وارد کن.');
        return;
      }
      const video = h('video', { autoplay: true, playsInline: true, muted: true });
      video.srcObject = stream;
      const overlay = h(
        'div.overlay',
        h('div.card.stack', h('div.photo-wrap', video), h('button.btn.secondary.block', { onclick: stopScan }, 'بستن')),
      );
      document.body.append(overlay);
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      scanTimer = setInterval(async () => {
        try {
          const [code] = await detector.detect(video);
          // QR content is either the bare code or a URL ending with it (…/s/1101).
          const value = code?.rawValue?.match(/(\d{4,6})\s*$/)?.[1];
          if (value && submit(value)) stopScan();
        } catch {
          // Frame not ready yet; try again on the next tick.
        }
      }, 400);
      function stopScan() {
        clearInterval(scanTimer);
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
        overlay.remove();
      }
      scan.stop = stopScan;
    }

    render();
    api.setHint('هر مهر ۲۰ امتیاز؛ با کامل شدن پاسپورت جایزهٔ ویژه می‌گیری.');
    return () => scan.stop?.();
  },
};
