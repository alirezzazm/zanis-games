// Exposes the same host bridge the Android build provides (window.Android, see web/js/core/util.js)
// and tells the web app it runs as the Windows tournament (kiosk mode, see web/js/app.js).

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ZanisDesktop', { platform: 'windows' });

contextBridge.exposeInMainWorld('Android', {
  // A PC has no vibration motor; the call is accepted and ignored.
  vibrate() {},
  shareText(text) {
    ipcRenderer.invoke('share-text', String(text));
  },
});
