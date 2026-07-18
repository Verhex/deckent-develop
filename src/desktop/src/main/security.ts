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
  // RULE: this function must only ever be called with `session.defaultSession` (see
  // `installSecurityLockdown` below — it is the sole caller). Electron sessions are
  // isolated per-`partition`: a BrowserWindow created with `webPreferences.partition` gets
  // its OWN Session instance that neither the permission handlers nor the CSP injection
  // below would ever touch, silently escaping this entire lockdown. window-manager.ts
  // enforces the other half of this invariant with a guard against ever setting
  // `partition`, so this app has exactly one Session and it is always the one hardened
  // here.

  // Default-DENY: no permission (media, geolocation, notifications, clipboard, ...) is
  // ever needed by this shell. A future feature that genuinely needs one must change
  // this handler explicitly — it can never silently fall through to "granted".
  target.setPermissionRequestHandler((_webContents, permission, callback) => {
    console.warn(`[security] denied permission request: ${permission}`);
    callback(false);
  });

  // Twin of the async handler above, for the SYNCHRONOUS permission-check path
  // (`setPermissionCheckHandler`). Electron's own docs are explicit that both handlers
  // are required for complete coverage — some web APIs (e.g. sync `navigator.*` checks)
  // consult only this check handler and never reach the request handler at all, so
  // omitting this twin would leave those paths on Chromium's permissive default.
  target.setPermissionCheckHandler((_webContents, permission) => {
    console.warn(`[security] denied permission check: ${permission}`);
    return false;
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
        'Content-Security-Policy': [buildLocalRendererCsp(deps.getActiveDaemonOrigins())],
      },
    });
  });
}

/**
 * D4-3 (approved SURF-4 decision #2) — the local renderer's CSP: everything
 * stays 'self'-only EXCEPT `connect-src`, which the shell's own
 * fetch/EventSource transport needs.
 *
 * Loopback port-wildcards are ALWAYS allowed: a document's CSP is fixed at
 * load time, but the shell connects to a daemon chosen AFTER load — and the
 * connect flow itself already hard-rejects every non-loopback plain-http
 * target (born-600, LOCAL_CONNECT_HOSTS in ipc-handlers.ts), so
 * `http://127.0.0.1:* http://localhost:* http://[::1]:*` is exactly the
 * enforceable boundary, not a loosening. Non-loopback origins (a future
 * https/ssh-tunnel remote) additionally join dynamically and take effect on
 * the next document load. Exported for the unit pin (shell-transport.test.ts).
 */
export function buildLocalRendererCsp(daemonOrigins: readonly string[]): string {
  // NOTE: Chromium rejects a bracketed-IPv6 host-source with a port wildcard
  // (`http://[::1]:*`) as invalid — an ::1 daemon therefore joins via its
  // exact dynamic origin below instead of a wildcard.
  //
  // 583/N3 «Makine Dairesi»: the terminal panel opens a renderer-owned
  // WebSocket to the daemon (`/api/terminal/ws`), so the ws-scheme loopback
  // wildcards are listed EXPLICITLY — CSP3's http→ws scheme matching is not
  // relied upon (explicit sources are guaranteed + self-documenting). Each
  // dynamic origin gets its ws twin derived the same way (http→ws, https→wss).
  const loopback = ['http://127.0.0.1:*', 'http://localhost:*', 'ws://127.0.0.1:*', 'ws://localhost:*'];
  const dynamic = daemonOrigins.filter((origin) => !loopback.some((l) => origin.startsWith(l.slice(0, l.length - 1))));
  const dynamicWs = dynamic
    .filter((origin) => origin.startsWith('http'))
    .map((origin) => origin.replace(/^http/, 'ws'));
  const connectSources = ["'self'", ...loopback, ...dynamic, ...dynamicWs];
  return `default-src 'self'; connect-src ${connectSources.join(' ')}`;
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
