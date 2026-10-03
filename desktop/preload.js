// Exposes the same host bridge the Android build provides (window.Android, see web/js/core/util.js),
// so the web app runs unchanged on Windows.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('Android', {
  // A PC has no vibration motor; the call is accepted and ignored.
  vibrate() {},
  shareText(text) {
    ipcRenderer.invoke('share-text', String(text));
  },
  saveImage(dataUrl) {
    ipcRenderer.invoke('save-image', String(dataUrl));
  },
});
