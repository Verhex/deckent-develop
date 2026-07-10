/**
 * System tray icon + context menu (DESK-1, born-496).
 *
 * Dependency-injected on purpose (icon / mainWindow / connections / onQuit
 * all come from the caller) so this module never reaches into sibling
 * main-process modules (window-manager, daemon-lifecycle, ...) directly.
 */
import { Menu, Tray, type BrowserWindow, type MenuItemConstructorOptions, type NativeImage } from 'electron';
import { t } from './i18n.js';

/** A saved connection surfaced as a tray quick-connect entry. */
export interface TrayConnectionItem {
  id: string;
  label: string;
  onClick: () => void;
}

export interface CreateTrayOptions {
  /** Pre-built icon or file path — the caller owns icon asset resolution. */
  icon: NativeImage | string;
  mainWindow: BrowserWindow;
  connections: TrayConnectionItem[];
  onQuit: () => void;
}

function buildTrayMenu(options: CreateTrayOptions): Menu {
  const template: MenuItemConstructorOptions[] = [
    {
      label: t('desktop.tray.open'),
      click: () => {
        options.mainWindow.show();
        options.mainWindow.focus();
      },
    },
  ];

  if (options.connections.length > 0) {
    template.push({ type: 'separator' });
    for (const connection of options.connections) {
      template.push({ label: connection.label, click: connection.onClick });
    }
  }

  template.push({ type: 'separator' }, { label: t('desktop.tray.quit'), click: options.onQuit });

  return Menu.buildFromTemplate(template);
}

/** Create the tray icon + context menu (Open / connections / Quit). */
export function createTray(options: CreateTrayOptions): Tray {
  const tray = new Tray(options.icon);
  tray.setToolTip(t('desktop.tray.tooltip'));
  tray.setContextMenu(buildTrayMenu(options));
  tray.on('click', () => {
    options.mainWindow.show();
    options.mainWindow.focus();
  });
  return tray;
}

/** Rebuild the context menu — call after the connection list changes. */
export function refreshTrayMenu(tray: Tray, options: CreateTrayOptions): void {
  tray.setContextMenu(buildTrayMenu(options));
}
