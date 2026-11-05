import { contextBridge, ipcRenderer } from 'electron';
import { API_METHODS, type Api, type PlchldrBridge } from '../shared/types';

const api = {} as Record<string, (...args: unknown[]) => Promise<unknown>>;
for (const name of API_METHODS) api[name] = (...args) => ipcRenderer.invoke(`api:${name}`, ...args);

const bridge: PlchldrBridge = {
  api: api as unknown as Api,
  fileUrl: (abs) => `plchldr-img://local/${encodeURIComponent(abs)}`,
};

contextBridge.exposeInMainWorld('plchldr', bridge);
