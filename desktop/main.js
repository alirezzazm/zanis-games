// Windows host for the booth games: a full-screen window showing the same web app as the Android
// build. The app is served from a private "app://" origin, because ES modules and the camera
// (getUserMedia) need a real, secure origin; file:// pages get neither.

const { app, BrowserWindow, clipboard, ipcMain, net, protocol, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_ORIGIN = 'app://zanis';
const WEB_ROOT = path.join(__dirname, 'web');
const READY_MESSAGE = 'zanis-games ready';
// CI runs the packaged program with ZANIS_SMOKE=1: it must exit 0 once the web app reports ready.
const SMOKE_TEST = process.env.ZANIS_SMOKE === '1';
const SMOKE_TIMEOUT_MS = 60_000;
const WINDOWED = process.argv.includes('--windowed') || SMOKE_TEST;

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

/** Maps an app:// URL to a file inside WEB_ROOT; anything that escapes the folder is refused. */
function resolveAsset(requestUrl) {
  const { pathname } = new URL(requestUrl);
  const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const file = path.normalize(path.join(WEB_ROOT, relative));
  return file.startsWith(WEB_ROOT + path.sep) ? file : null;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 480,
    height: 900,
    fullscreen: !WINDOWED,
    autoHideMenuBar: true,
    backgroundColor: '#0b1020',
    title: 'بازی‌های زانیس',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.removeMenu();

  // The games are fully offline: never leave the bundled pages or open new windows.
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_ORIGIN)) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // F11 toggles full screen for the operator; Esc leaves it. Closing is Alt+F4.
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') window.setFullScreen(!window.isFullScreen());
    if (input.key === 'Escape' && window.isFullScreen()) window.setFullScreen(false);
  });

  if (SMOKE_TEST) {
    const timeout = setTimeout(() => {
      console.error('smoke test: the web app never reported ready');
      app.exit(1);
    }, SMOKE_TIMEOUT_MS);
    window.webContents.on('console-message', (details) => {
      const text = details.message ?? '';
      // Electron reports the level as a word; older versions used a number (3 = error).
      if (details.level === 'error' || details.level === 3) {
        console.error(`smoke test: page error: ${text}`);
        clearTimeout(timeout);
        app.exit(1);
      }
      if (text.includes(READY_MESSAGE)) {
        console.log('smoke test: ready');
        clearTimeout(timeout);
        app.exit(0);
      }
    });
  }

  window.loadURL(`${APP_ORIGIN}/index.html`);
}

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const file = resolveAsset(request.url);
    if (!file || !fs.existsSync(file)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  // Only the camera is ever granted, and only to the bundled app (photo frame, QR scan).
  const fromApp = (url) => typeof url === 'string' && url.startsWith(APP_ORIGIN);
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'media' && fromApp(webContents.getURL()));
  });
  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, origin) => permission === 'media' && fromApp(origin),
  );

  createWindow();
});

app.on('window-all-closed', () => app.quit());

// ---------------------------------------------------------------- bridge (see preload.js)

/** Saves a "data:image/jpeg;base64,…" photo to Pictures\Zanis and shows it in Explorer. */
ipcMain.handle('save-image', (_event, dataUrl) => {
  const folder = path.join(app.getPath('pictures'), 'Zanis');
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `zanis-${Date.now()}.jpg`);
  fs.writeFileSync(file, Buffer.from(String(dataUrl).slice(String(dataUrl).indexOf(',') + 1), 'base64'));
  shell.showItemInFolder(file);
  return file;
});

/**
 * "Share" on a PC: the text (the visitor list as CSV) is written to Documents\Zanis, shown in
 * Explorer and also copied to the clipboard. The UTF-8 BOM lets Excel open Persian names correctly.
 */
ipcMain.handle('share-text', (_event, text) => {
  const folder = path.join(app.getPath('documents'), 'Zanis');
  fs.mkdirSync(folder, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const file = path.join(folder, `zanis-visitors-${stamp}.csv`);
  fs.writeFileSync(file, `﻿${text}`, 'utf8');
  clipboard.writeText(String(text));
  shell.showItemInFolder(file);
  return file;
});
