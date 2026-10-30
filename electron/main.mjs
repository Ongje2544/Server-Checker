import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, Menu, Tray, dialog, shell } from 'electron';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ICON = path.join(ROOT, 'build', 'icon.png');
// Fixed so the page's origin, and with it the saved theme, stays the same between runs.
const PORT = 38787;
const ORIGIN = `http://127.0.0.1:${PORT}`;

let window = null;
let tray = null;
let quitting = false;

function showWindow() {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function createWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'VPS Monitor',
    icon: ICON,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f1f3f6',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.once('ready-to-show', () => window.show());

  // The page drives real machines, so it must never navigate away from this app.
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${ORIGIN}/`)) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Closing keeps pings and schedules running; the tray menu really quits.
  window.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    window.hide();
  });
  window.loadURL(ORIGIN);
}

function createTray() {
  tray = new Tray(ICON);
  tray.setToolTip('VPS Monitor');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'เปิด VPS Monitor', click: showWindow },
    { type: 'separator' },
    { label: 'ออกจากโปรแกรม', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showWindow);
}

async function start() {
  process.env.PORT = String(PORT);
  process.env.HOST = '127.0.0.1';
  process.env.DATA_DIR = path.join(app.getPath('userData'), 'data');
  await app.whenReady();
  Menu.setApplicationMenu(null);
  try {
    const { ready } = await import('../server.js');
    await ready;
  } catch (err) {
    dialog.showErrorBox('VPS Monitor', `เปิดโปรแกรมไม่ได้: ${err.message}`);
    app.exit(1);
    return;
  }
  createTray();
  createWindow();
}

if (app.requestSingleInstanceLock()) {
  app.setAppUserModelId('com.vpsmonitor.app');
  app.on('second-instance', showWindow);
  app.on('before-quit', () => { quitting = true; });
  // The hidden window keeps running; only the tray menu ends the app.
  app.on('window-all-closed', () => {});
  start();
} else {
  app.quit();
}
