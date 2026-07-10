/**
 * DESK-1 (born-496) — sandboxed preload: the ONLY place `ipcRenderer` /
 * `contextBridge` are touched. Implements `DeckentDesktopApi`
 * (../shared/desktop-api.js, SSOT) and exposes it as `window.deckentDesktop`.
 * Bundled to CJS (electron.vite.config.ts `preload.build` output.format) —
 * required because contextIsolation + sandbox stay ON for the renderer.
 *
 * Channel names below MUST stay byte-identical to `src/main/ipc-handlers.ts`
 * (DESK-B2-IPC-SECURITY) — every channel there is an `ipcMain.handle`, so
 * every channel here goes through `ipcRenderer.invoke`, including the
 * void-returning `window.*` methods (result intentionally discarded).
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type {
  ConnectionProfile,
  ConnectResult,
  DaemonStatusEvent,
  DeckentDesktopApi,
} from '../shared/desktop-api.js';

const CHANNELS = {
  connectionList: 'connection.list',
  connectionAdd: 'connection.add',
  connectionRemove: 'connection.remove',
  connectionConnect: 'connection.connect',
  connectionDisconnect: 'connection.disconnect',
  daemonStatus: 'daemon.status',
  windowMinimize: 'window.minimize',
  windowMaximize: 'window.maximize',
  windowClose: 'window.close',
  appGetVersion: 'app.getVersion',
  appOpenExternal: 'app.openExternal',
  appGetStrings: 'app.getStrings',
} as const;

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

const api = {
  isDesktop: true,
  connections: {
    list: () => invoke<ConnectionProfile[]>(CHANNELS.connectionList),
    add: (profile) => invoke<ConnectionProfile>(CHANNELS.connectionAdd, profile),
    remove: (id) => invoke<void>(CHANNELS.connectionRemove, id),
    connect: (id) => invoke<ConnectResult>(CHANNELS.connectionConnect, id),
    disconnect: (id) => invoke<void>(CHANNELS.connectionDisconnect, id),
  },
  daemon: {
    onStatus: (cb) => {
      const listener = (_event: IpcRendererEvent, event: DaemonStatusEvent) => cb(event);
      ipcRenderer.on(CHANNELS.daemonStatus, listener);
      return () => {
        ipcRenderer.removeListener(CHANNELS.daemonStatus, listener);
      };
    },
  },
  app: {
    getVersion: () => invoke<string>(CHANNELS.appGetVersion),
    openExternal: (url) => invoke<void>(CHANNELS.appOpenExternal, url),
    getStrings: () => invoke<Record<string, string>>(CHANNELS.appGetStrings),
  },
  window: {
    minimize: () => {
      void invoke<void>(CHANNELS.windowMinimize);
    },
    maximize: () => {
      void invoke<void>(CHANNELS.windowMaximize);
    },
    close: () => {
      void invoke<void>(CHANNELS.windowClose);
    },
  },
} satisfies DeckentDesktopApi;

contextBridge.exposeInMainWorld('deckentDesktop', api);
