import { contextBridge, ipcRenderer } from 'electron';
import { API_METHODS, type Api, type HatchmarkBridge } from '../shared/types';

const api = {} as Record<string, (...args: unknown[]) => Promise<unknown>>;
for (const name of API_METHODS) api[name] = (...args) => ipcRenderer.invoke(`api:${name}`, ...args);

const bridge: HatchmarkBridge = {
  api: api as unknown as Api,
  fileUrl: (abs) => `hatchmark-img://local/${encodeURIComponent(abs)}`,
};

contextBridge.exposeInMainWorld('hatchmark', bridge);
