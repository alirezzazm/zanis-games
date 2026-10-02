// Renders every scene in scenes.js to an MP4 with sound: headless Chrome draws each frame on the
// canvas and synthesises the soundtrack (audio.js); ffmpeg encodes the frames and muxes the audio.
// Runs in CI (see .github/workflows/videos.yml).
//
//   npm install --no-save puppeteer-core && node videos/render.mjs
//   env: CHROME_PATH (default /usr/bin/google-chrome), FPS (default 30)

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'out');
const fps = Number(process.env.FPS ?? 30);

mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  // The page loads the fonts from ../web/fonts through file:// URLs.
  args: ['--no-sandbox', '--allow-file-access-from-files'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(pathToFileURL(path.join(here, 'scenes.html')).href);
  // Fonts load lazily; force both weights before the first frame so no frame falls back to a system font.
  await page.evaluate(async () => {
    await Promise.all([document.fonts.load('700 32px Vazirmatn'), document.fonts.load('900 32px Vazirmatn')]);
    await document.fonts.ready;
    await window.assetsReady;
  });
  const scenes = await page.evaluate(() => window.SCENES);

  for (const [sceneId, duration] of Object.entries(scenes)) {
    const output = path.join(outDir, `zanis-${sceneId}.mp4`);
    const silent = path.join(outDir, `${sceneId}.silent.mp4`);
    const soundtrack = path.join(outDir, `${sceneId}.wav`);
    const ffmpeg = spawn(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', silent],
      { stdio: ['pipe', 'inherit', 'inherit'] },
    );
    const frames = Math.round(duration * fps);
    for (let frame = 0; frame < frames; frame++) {
      const dataUrl = await page.evaluate(
        (id, seconds) => {
          window.renderFrame(id, seconds);
          return document.getElementById('stage').toDataURL('image/jpeg', 0.92);
        },
        sceneId,
        frame / fps,
      );
      const jpeg = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
      if (!ffmpeg.stdin.write(jpeg)) await once(ffmpeg.stdin, 'drain');
    }
    ffmpeg.stdin.end();
    const [exitCode] = await once(ffmpeg, 'close');
    if (exitCode !== 0) throw new Error(`ffmpeg failed for ${sceneId} (exit ${exitCode})`);
    writeFileSync(soundtrack, Buffer.from(await page.evaluate((id) => window.renderAudio(id), sceneId), 'base64'));
    const mux = spawn(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-i', silent, '-i', soundtrack, '-c:v', 'copy',
        // The synthesised track is quiet; normalise it to a comfortable playback loudness.
        '-af', 'loudnorm=I=-18:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100',
        '-shortest', '-movflags', '+faststart', output],
      { stdio: 'inherit' },
    );
    const [muxExit] = await once(mux, 'close');
    if (muxExit !== 0) throw new Error(`ffmpeg mux failed for ${sceneId} (exit ${muxExit})`);
    rmSync(silent);
    rmSync(soundtrack);
    console.log(`rendered ${output} (${frames} frames, with sound)`);
  }
} finally {
  await browser.close();
}
