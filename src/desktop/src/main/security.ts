/**
 * DESK-B2-IPC-SECURITY (born-496 §392-004) — session/webContents lockdown for the
 * desktop shell (blueprint §2 security-tabanı).
 *
 * Every policy here is default-DENY: nothing is allowed unless it matches an explicit
 * allow-check the caller supplies (the local renderer's own origin + whichever daemon
 * origins are currently connected). This module never tracks "which daemon is active"
 * itself — window-manager.ts (DESK-B2-WINDOW-APP) owns that state and is expected to
 * pass it in via `SecurityPolicyDeps`, so this module stays free of electron-vite
 * dev/prod URL-shape knowledge and never reaches into a sibling main-process module's
 * state directly (same DI discipline as tray.ts).
 */
import { app, session, shell, type Session, type WebContents } from 'electron';

export interface SecurityPolicyDeps {
  /** True for the bundled renderer's own origin — file://.../out/renderer/index.html in
   * production, or the electron-vite dev server URL (`process.env.ELECTRON_RENDERER_URL`)
   * in development. Injected because only the window-manager/constants layer knows which
   * shape applies to the current run. */
  isLocalRendererUrl(url: string): boolean;
  /** Origins of daemons this app is currently connected to (`http://host:port`, one per
   * live connection). Navigation within an active daemon's own served UI is allowed;
   * everything else outside the local renderer is not. */
  getActiveDaemonOrigins(): readonly string[];
}

/**
 * The ONE gate every "leave the app" path funnels through: openExternal
 * (ipc-handlers.ts) and any disallowed will-navigate/will-redirect/window.open target
 * here. Scheme-only allowlist (http/https) — a malformed URL is rejected, never thrown.
 */
export function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isOriginAllowed(url: string, deps: SecurityPolicyDeps): boolean {
  if (deps.isLocalRendererUrl(url)) return true;
  try {
    return deps.getActiveDaemonOrigins().includes(new URL(url).origin);
  } catch {
    return false;
  }
}

/** Shared by will-navigate and will-redirect: same allow-set, same fallback. */
function guardNavigation(targetUrl: string, event: { preventDefault(): void }, deps: SecurityPolicyDeps): void {
  if (isOriginAllowed(targetUrl, deps)) return;

  event.preventDefault();
  if (isAllowedExternalUrl(targetUrl)) {
    void shell.openExternal(targetUrl);
  } else {
    console.warn(`[security] blocked navigation to disallowed URL: ${targetUrl}`);
  }
}

function hardenWebContents(contents: WebContents, deps: SecurityPolicyDeps): void {
  contents.on('will-navigate', (details) => guardNavigation(details.url, details, deps));
  contents.on('will-redirect', (details) => guardNavigation(details.url, details, deps));

  // window.open() / target="_blank" always denied — an allowed external target still
  // goes through shell.openExternal rather than a second in-app BrowserWindow, so a
  // popup can never bypass the will-navigate lockdown above.
  contents.setWindowOpenHandler((details) => {
    if (isAllowedExternalUrl(details.url)) {
      void shell.openExternal(details.url);
    } else {
      console.warn(`[security] blocked window.open to disallowed URL: ${details.url}`);
    }
    return { action: 'deny' };
  });

  // This app never uses <webview>. `will-attach-webview` is the actual preventable
  // hook — `did-attach-webview` (named in the blueprint directive) fires AFTER
  // attachment and cannot be cancelled, so blocking here is the correct
  // implementation of "block webview attachment entirely".
  contents.on('will-attach-webview', (event) => {
    console.warn('[security] blocked <webview> attach attempt');
    event.preventDefault();
  });
}

function hardenSession(target: Session, deps: SecurityPolicyDeps): void {
  // Default-DENY: no permission (media, geolocation, notifications, clipboard, ...) is
  // ever needed by this shell. A future feature that genuinely needs one must change
  // this handler explicitly — it can never silently fall through to "granted".
  target.setPermissionRequestHandler((_webContents, permission, callback) => {
    console.warn(`[security] denied permission request: ${permission}`);
    callback(false);
  });

  // CSP applies ONLY to the local renderer's own responses — a daemon's served
  // dashboard is a different origin with its own security policy, and forcing our
  // 'self'-only CSP onto it would be both wrong (not our origin) and outside the
  // directive's stated scope ("local-renderer'a CSP").
  target.webRequest.onHeadersReceived((details, callback) => {
    if (!deps.isLocalRendererUrl(details.url)) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'"],
      },
    });
  });
}

/**
 * Install app-wide lockdown. Call once at startup, after `app.whenReady()` and BEFORE
 * the first `BrowserWindow` is created — `web-contents-created` then hardens every
 * WebContents this app ever creates (present or future), so no window can slip through
 * unhardened.
 */
export function installSecurityLockdown(deps: SecurityPolicyDeps): void {
  hardenSession(session.defaultSession, deps);
  app.on('web-contents-created', (_event, contents) => {
    hardenWebContents(contents, deps);
  });
}
