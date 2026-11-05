import { BrowserWindow, Menu, app, dialog, ipcMain, net, protocol, shell } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { API_METHODS } from '../shared/types';
import { authorizeImage, createApi } from './handlers';
import { windowOptions } from './window';

const SCHEME = 'plchldr-img';

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { secure: true, supportFetchAPI: true, stream: true } }]);

// Test hooks. Real use never sets these.
if (process.env.PLCHLDR_USER_DATA) app.setPath('userData', process.env.PLCHLDR_USER_DATA);
const dataDir = process.env.PLCHLDR_DATA_DIR || path.join(app.getPath('userData'), 'data');
const testFolder = process.env.PLCHLDR_TEST_FOLDER;

let win: BrowserWindow | null = null;

const api = createApi({
  dataDir,
  pickFolder: async () => {
    if (testFolder) return testFolder;
    const opts = { title: 'Choose a folder of reference images', properties: ['openDirectory' as const] };
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return res.canceled ? null : (res.filePaths[0] ?? null);
  },
});

function createWindow(): void {
  win = new BrowserWindow(windowOptions(path.join(__dirname, '../preload/index.cjs')));
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  // Links that leave the app open in the default browser, never in the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(() => {
  for (const name of API_METHODS) {
    ipcMain.handle(`api:${name}`, (_event, ...args: unknown[]) => (api[name] as (...a: unknown[]) => unknown)(...args));
  }

  // plchldr-img://local/<encoded absolute path>  ->  the file, if it is an image inside a linked folder
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    const abs = await authorizeImage(api, url.pathname.slice(1));
    if (!abs) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(abs).toString());
  });

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]),
  );

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
