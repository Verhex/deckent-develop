/**
 * Application menu (DESK-1, born-496).
 *
 * Standard roles (appMenu/editMenu/viewMenu/windowMenu) need no i18n —
 * Electron supplies the OS-localized label + content itself. Custom items
 * (Help submenu: Check for Updates, View Logs) go through i18n.ts's t().
 */
import { app, shell, Menu, type MenuItemConstructorOptions } from 'electron';
import { checkForUpdatesStub } from './auto-update.js';
import { t } from './i18n.js';

const isMac = process.platform === 'darwin';

function buildHelpMenuItems(): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [
    {
      label: t('desktop.update.check_for_updates'),
      click: () => {
        checkForUpdatesStub();
      },
    },
    { type: 'separator' },
    {
      label: t('desktop.error.view_logs'),
      click: () => {
        void shell.openPath(app.getPath('logs'));
      },
    },
  ];

  if (!isMac) {
    items.push({ type: 'separator' }, { role: 'about' });
  }

  return items;
}

/** Build the application menu template — role: appMenu is macOS-only (no i18n; role auto-labels/behaves). */
export function buildApplicationMenu(): Menu {
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      label: t('desktop.menu.help'),
      submenu: buildHelpMenuItems(),
    },
  ];

  return Menu.buildFromTemplate(template);
}

export function installApplicationMenu(): void {
  Menu.setApplicationMenu(buildApplicationMenu());
}
