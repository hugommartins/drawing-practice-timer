import { createReadStream } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { authorizeImage, createApi, type ApiWithInternals } from '../../src/main/handlers';
import { API_METHODS } from '../../src/shared/types';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export interface Harness {
  url: string;
  api: ApiWithInternals;
  dataDir: string;
  /** What the fake "choose a folder" dialog returns next. */
  pickNext(folder: string | null): void;
  close(): Promise<void>;
}

export const DIST = path.resolve(__dirname, '../../dist/renderer');

/**
 * Serves the built renderer over HTTP and backs `window.plchldr` with the real createApi,
 * so UI tests exercise the same code the Electron main process runs. Only the native
 * folder picker is faked.
 */
export async function startHarness(): Promise<Harness> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'plchldr-data-'));
  let nextPick: string | null = null;
  const api = createApi({ dataDir, pickFolder: async () => nextPick });

  const server: Server = createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://localhost');
    if (u.pathname.startsWith('/img/')) {
      const abs = await authorizeImage(api, u.pathname.slice(5));
      if (!abs) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream' });
      createReadStream(abs).on('error', () => res.destroy()).pipe(res);
      return;
    }
    const rel = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
    const file = path.join(DIST, rel);
    if (!file.startsWith(DIST + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).on('error', () => res.writeHead(404).end()).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/`,
    api,
    dataDir,
    pickNext: (f) => {
      nextPick = f;
    },
    close: () =>
      new Promise((r) => {
        server.close(() => r());
        server.closeAllConnections(); // keep-alive sockets would otherwise hold close() open
      }),
  };
}

/** Script injected before the app loads: window.plchldr forwards to the Node side. */
export const bridgeInitScript = `
  const methods = ${JSON.stringify(API_METHODS)};
  const api = {};
  for (const m of methods) api[m] = (...args) => window.__plchldrApi(m, args);
  window.plchldr = { api, fileUrl: (abs) => '/img/' + encodeURIComponent(abs) };
`;
