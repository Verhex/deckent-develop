/**
 * DESK-1 (born-496 §392-007) — thin pre-daemon renderer state machine.
 * React-free, framework-free: plain TS+DOM. Screens: ProfilePicker ->
 * Connecting -> DaemonError. The real dashboard is never built here — once
 * a daemon handshake succeeds, the MAIN process swaps this window's
 * loadURL() to the daemon's own http origin (see electron.vite.config.ts).
 *
 * i18n (D4-2): every user-facing string flows through `t()` against a map
 * merged from `window.deckentDesktop.app.getStrings()` (IPC, full `desktop.*`
 * keys from src/cli/helpers/messages.ts — the ONE catalog) over an English
 * fallback map DERIVED from that same catalog at bundle time
 * (./i18n-fallback.ts). When the bridge is absent (plain-browser preview),
 * the derived fallback renders — screens still show, per the original spec
 * ("don't hide") — and there is ZERO renderer-local user-facing literal.
 * MSG values are the FULL keys (the pre-D4-2 short forms never matched the
 * IPC map — the silent drift this slice closed) and every entry must appear
 * in shared/desktop-messages.ts (pinned by tests/desktop-i18n.test.ts).
 */
import {
  CONNECTION_KINDS,
  type ConnectionKind,
  type ConnectionProfile,
  type ConnectResult,
  type DaemonSession,
  type DeckentDesktopApi,
} from '../shared/desktop-api.js';
import { mountShell } from './shell/mount.js';
import { DEFAULT_PREFERENCES, WATCH_NAMES, type DesktopPreferences, type WatchName } from '../shared/theme-tokens.js';
import { applyWatch } from './theme-runtime.js';
import { buildFallbackStrings } from './i18n-fallback.js';

declare global {
  interface Window {
    deckentDesktop?: DeckentDesktopApi;
  }
}

export const MSG = {
  connectionAddTitle: 'desktop.connection.add_title',
  connectionKindLocal: 'desktop.connection.kind.local',
  connectionKindWsl: 'desktop.connection.kind.wsl',
  connectionKindSsh: 'desktop.connection.kind.ssh',
  connectionKindContainer: 'desktop.connection.kind.container',
  connectionKindNotYetSupported: 'desktop.connection.kind_not_yet_supported',
  connectionConnectButton: 'desktop.connection.connect_button',
  connectionDeleteConfirm: 'desktop.connection.delete_confirm',
  connectingSpawning: 'desktop.connecting.spawning',
  connectingAdopting: 'desktop.connecting.adopting',
  connectingHealthCheck: 'desktop.connecting.health_check',
  connectingRetry: 'desktop.connecting.retry',
  themeTitle: 'desktop.theme.title',
  themeWatchDayWatch: 'desktop.theme.watch.day-watch',
  themeWatchNightWatch: 'desktop.theme.watch.night-watch',
  themeWatchOpenSea: 'desktop.theme.watch.open-sea',
  errorNodeNotFound: 'desktop.error.node_not_found',
  errorDeckentNotFound: 'desktop.error.deckent_not_found',
  errorPortConflict: 'desktop.error.port_conflict',
  errorDaemonCrashed: 'desktop.error.daemon_crashed',
  errorHealthTimeout: 'desktop.error.health_timeout',
  errorViewLogs: 'desktop.error.view_logs',
  appBrowserFallbackNotice: 'desktop.app.browser_fallback_notice',
  connectionListTitle: 'desktop.connection.list_title',
  connectionListLoading: 'desktop.connection.list_loading',
  connectionEmptyState: 'desktop.connection.empty_state',
  connectionListError: 'desktop.connection.list_error',
  connectionFieldLabel: 'desktop.connection.field_label',
  connectionFieldKind: 'desktop.connection.field_kind',
  connectionFieldProjectPath: 'desktop.connection.field_project_path',
  connectionFieldHost: 'desktop.connection.field_host',
  connectionFieldPort: 'desktop.connection.field_port',
  connectionFieldAutoStart: 'desktop.connection.field_auto_start',
  connectionFieldOrphanShutdown: 'desktop.connection.field_orphan_shutdown',
  connectionSubmitButton: 'desktop.connection.submit_button',
  connectionDeleteButton: 'desktop.connection.delete_button',
  connectionValidationRequired: 'desktop.connection.validation_required',
  connectionValidationPort: 'desktop.connection.validation_port',
  connectionAddError: 'desktop.connection.add_error',
  connectionRemoveError: 'desktop.connection.remove_error',
  connectingTitle: 'desktop.connecting.title',
  connectingIdle: 'desktop.connecting.idle',
  connectingConnected: 'desktop.connecting.connected',
  errorTitle: 'desktop.error.title',
  errorUnknown: 'desktop.error.unknown',
  errorBackButton: 'desktop.error.back_button',
} as const;

const FALLBACK_STRINGS: Record<string, string> = buildFallbackStrings();

const KIND_LABEL_KEYS: Record<ConnectionKind, string> = {
  local: MSG.connectionKindLocal,
  wsl: MSG.connectionKindWsl,
  ssh: MSG.connectionKindSsh,
  container: MSG.connectionKindContainer,
};

/** Mirrors src/cli/helpers/messages.ts's getMessage() {varName} interpolation exactly. */
function t(strings: Record<string, string>, key: string, vars?: Record<string, string>): string {
  const template = strings[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_match, varName: string) => vars[varName] ?? `{${varName}}`);
}

interface ElOptions {
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
  on?: Record<string, (event: Event) => void>;
}

function el<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  options: ElOptions = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);
  if (options.className !== undefined) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      node.setAttribute(name, value);
    }
  }
  if (options.on) {
    for (const [eventName, handler] of Object.entries(options.on)) {
      node.addEventListener(eventName, handler);
    }
  }
  if (children.length > 0) {
    node.append(...children);
  }
  return node;
}

function clearNode(node: HTMLElement): void {
  node.replaceChildren();
}

function getDeckentApi(): DeckentDesktopApi | null {
  return typeof window !== 'undefined' && window.deckentDesktop?.isDesktop === true ? window.deckentDesktop : null;
}

async function loadStrings(api: DeckentDesktopApi | null): Promise<Record<string, string>> {
  if (!api) return { ...FALLBACK_STRINGS };
  try {
    const ipcStrings = await api.app.getStrings();
    return { ...FALLBACK_STRINGS, ...ipcStrings };
  } catch {
    return { ...FALLBACK_STRINGS };
  }
}

type Screen =
  | { kind: 'profilePicker' }
  | { kind: 'connecting'; profileId: string }
  | { kind: 'daemonError'; profileId: string; errorKey: string; errorVars?: Record<string, string> }
  // D4-3 — the post-connect React shell (Console/Chat/Approval/History).
  | { kind: 'shell'; session: DaemonSession };

interface RenderContext {
  api: DeckentDesktopApi | null;
  strings: Record<string, string>;
  /** D4-1 — the live watch/theme preferences (mutated in place on switch so
   *  every later screen render sees the current choice). */
  preferences: DesktopPreferences;
  navigate: (screen: Screen) => void;
}

type Cleanup = () => void;

function assertNever(value: never): never {
  throw new Error(`Unhandled screen kind: ${JSON.stringify(value)}`);
}

function renderScreen(root: HTMLElement, ctx: RenderContext, screen: Screen): Cleanup {
  switch (screen.kind) {
    case 'profilePicker':
      return renderProfilePicker(root, ctx);
    case 'connecting':
      return renderConnecting(root, ctx, screen.profileId);
    case 'daemonError':
      return renderDaemonError(root, ctx, screen.profileId, screen.errorKey, screen.errorVars);
    case 'shell':
      // D4-3 — hand the cleared container to React; unmount on navigate-away.
      return mountShell(root, { session: screen.session, strings: ctx.strings });
    default:
      return assertNever(screen);
  }
}

export async function bootstrap(root: HTMLElement | null): Promise<void> {
  if (!root) return;
  const api = getDeckentApi();
  const strings = await loadStrings(api);
  const preferences = await loadPreferences(api);
  // Re-apply the persisted watch over main.ts's synchronous default
  // (restart-persist done-criterion; same idempotent runtime path).
  applyWatch(document.documentElement, preferences);

  let cleanup: Cleanup | null = null;

  const navigate = (screen: Screen): void => {
    cleanup?.();
    clearNode(root);
    cleanup = renderScreen(root, { api, strings, preferences, navigate }, screen);
  };

  // D4-3 — the daemon session drives the shell: a push (connect succeeded)
  // mounts it, a null push (disconnect) returns to the picker, and a reload
  // mid-session resumes straight into the shell via the pull path.
  api?.daemon.onSession((session) => {
    navigate(session ? { kind: 'shell', session } : { kind: 'profilePicker' });
  });
  const existingSession = await loadSession(api);
  navigate(existingSession ? { kind: 'shell', session: existingSession } : { kind: 'profilePicker' });
}

/** Pull the current session (renderer reload path) — bridge-absent/IPC
 *  failure degrade to null (picker renders, honest and non-blocking). */
async function loadSession(api: DeckentDesktopApi | null): Promise<DaemonSession | null> {
  if (!api) return null;
  try {
    return await api.session.get();
  } catch {
    return null;
  }
}

/** Persisted watch/theme preferences; browser-preview (no bridge) and any IPC
 *  failure degrade to defaults — the UI must render either way. */
async function loadPreferences(api: DeckentDesktopApi | null): Promise<DesktopPreferences> {
  if (!api) return DEFAULT_PREFERENCES;
  try {
    return await api.preferences.get();
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

// --- ProfilePicker -----------------------------------------------------

const WATCH_LABEL_KEYS: Record<WatchName, string> = {
  'day-watch': MSG.themeWatchDayWatch,
  'night-watch': MSG.themeWatchNightWatch,
  'open-sea': MSG.themeWatchOpenSea,
};

/** D4-1 — the watch (theme) selector: applies instantly through the theme
 *  runtime and persists over IPC (fire-and-forget; a persist failure never
 *  blocks the visual switch — the store read at next boot simply lags). */
function renderWatchSwitcher(ctx: RenderContext): HTMLElement {
  const select = el('select', { attrs: { id: 'watch-select', 'aria-label': t(ctx.strings, MSG.themeTitle) } });
  for (const watch of WATCH_NAMES) {
    const option = el('option', { text: t(ctx.strings, WATCH_LABEL_KEYS[watch]), attrs: { value: watch } });
    if (watch === ctx.preferences.watch) option.setAttribute('selected', '');
    select.append(option);
  }
  select.addEventListener('change', () => {
    const watch = select.value as WatchName;
    ctx.preferences.watch = watch;
    applyWatch(document.documentElement, ctx.preferences);
    void ctx.api?.preferences.set({ watch }).catch(() => {
      // Visual switch already happened; persistence is best-effort here and
      // honest at next boot (defaults/last-persisted win). No UI interruption.
    });
  });
  return el('div', { className: 'watch-switcher' }, [
    el('label', { text: t(ctx.strings, MSG.themeTitle), attrs: { for: 'watch-select' } }),
    select,
  ]);
}

function renderProfilePicker(root: HTMLElement, ctx: RenderContext): Cleanup {
  let disposed = false;

  const container = el('div', { className: 'screen screen--profile-picker' });
  container.append(
    el('div', { className: 'screen-header' }, [
      el('h1', { text: t(ctx.strings, MSG.connectionListTitle) }),
      renderWatchSwitcher(ctx),
    ]),
  );

  if (!ctx.api) {
    container.append(el('p', { className: 'notice', text: t(ctx.strings, MSG.appBrowserFallbackNotice) }));
  }

  const listContainer = el('div', { className: 'profile-list' });
  container.append(listContainer);

  const labelInput = el('input', { attrs: { id: 'profile-label', type: 'text', autocomplete: 'off' } });
  const labelError = el('span', { className: 'field-error field-error--hidden' });
  const labelField = el('div', { className: 'form-field' }, [
    el('label', { text: t(ctx.strings, MSG.connectionFieldLabel), attrs: { for: 'profile-label' } }),
    labelInput,
    labelError,
  ]);

  const kindSelect = el('select', { attrs: { id: 'profile-kind' } });
  for (const kind of CONNECTION_KINDS) {
    kindSelect.append(el('option', { text: t(ctx.strings, KIND_LABEL_KEYS[kind]), attrs: { value: kind } }));
  }
  const kindField = el('div', { className: 'form-field' }, [
    el('label', { text: t(ctx.strings, MSG.connectionFieldKind), attrs: { for: 'profile-kind' } }),
    kindSelect,
  ]);
  const kindNotice = el('p', {
    className: 'notice notice--hidden',
    text: t(ctx.strings, MSG.connectionKindNotYetSupported),
  });

  const projectPathInput = el('input', { attrs: { id: 'profile-project-path', type: 'text', autocomplete: 'off' } });
  const projectPathError = el('span', { className: 'field-error field-error--hidden' });
  const projectPathField = el('div', { className: 'form-field' }, [
    el('label', { text: t(ctx.strings, MSG.connectionFieldProjectPath), attrs: { for: 'profile-project-path' } }),
    projectPathInput,
    projectPathError,
  ]);

  const hostInput = el('input', {
    attrs: { id: 'profile-host', type: 'text', autocomplete: 'off', value: '127.0.0.1' },
  });
  const hostError = el('span', { className: 'field-error field-error--hidden' });
  const hostField = el('div', { className: 'form-field' }, [
    el('label', { text: t(ctx.strings, MSG.connectionFieldHost), attrs: { for: 'profile-host' } }),
    hostInput,
    hostError,
  ]);

  const portInput = el('input', {
    attrs: { id: 'profile-port', type: 'number', min: '1', max: '65535', value: '3100' },
  });
  const portError = el('span', { className: 'field-error field-error--hidden' });
  const portField = el('div', { className: 'form-field' }, [
    el('label', { text: t(ctx.strings, MSG.connectionFieldPort), attrs: { for: 'profile-port' } }),
    portInput,
    portError,
  ]);

  const autoStartInput = el('input', { attrs: { id: 'profile-auto-start', type: 'checkbox' } });
  autoStartInput.checked = true;
  const autoStartField = el('div', { className: 'form-field form-field--checkbox' }, [
    autoStartInput,
    el('label', { text: t(ctx.strings, MSG.connectionFieldAutoStart), attrs: { for: 'profile-auto-start' } }),
  ]);

  const orphanInput = el('input', { attrs: { id: 'profile-orphan-shutdown', type: 'checkbox' } });
  orphanInput.checked = true;
  const orphanField = el('div', { className: 'form-field form-field--checkbox' }, [
    orphanInput,
    el('label', { text: t(ctx.strings, MSG.connectionFieldOrphanShutdown), attrs: { for: 'profile-orphan-shutdown' } }),
  ]);

  const formError = el('p', { className: 'error-message field-error--hidden' });
  const submitButton = el('button', {
    className: 'btn btn--primary',
    text: t(ctx.strings, MSG.connectionSubmitButton),
    attrs: { type: 'submit' },
  });

  const form = el('form', { className: 'connection-form' }, [
    labelField,
    kindField,
    kindNotice,
    projectPathField,
    hostField,
    portField,
    autoStartField,
    orphanField,
    formError,
    submitButton,
  ]);

  const fieldInputs = [labelInput, projectPathInput, hostInput, portInput, autoStartInput, orphanInput];

  function updateKindState(): void {
    const supported = kindSelect.value === 'local' && ctx.api !== null;
    for (const input of fieldInputs) {
      input.disabled = !supported;
    }
    submitButton.disabled = !supported;
    kindNotice.classList.toggle('notice--hidden', kindSelect.value === 'local');
  }
  kindSelect.addEventListener('change', updateKindState);
  updateKindState();

  function setFieldError(span: HTMLElement, show: boolean, message?: string): void {
    if (show) {
      span.textContent = message ?? t(ctx.strings, MSG.connectionValidationRequired);
      span.classList.remove('field-error--hidden');
    } else {
      span.textContent = '';
      span.classList.add('field-error--hidden');
    }
  }

  function validateForm(): boolean {
    const labelValue = labelInput.value.trim();
    const projectPathValue = projectPathInput.value.trim();
    const hostValue = hostInput.value.trim();
    const portValue = Number(portInput.value);
    const portValid = Number.isInteger(portValue) && portValue >= 1 && portValue <= 65535;

    setFieldError(labelError, labelValue === '');
    setFieldError(projectPathError, projectPathValue === '');
    setFieldError(hostError, hostValue === '');
    setFieldError(portError, !portValid, portValid ? undefined : t(ctx.strings, MSG.connectionValidationPort));

    return labelValue !== '' && projectPathValue !== '' && hostValue !== '' && portValid;
  }

  function resetForm(): void {
    form.reset();
    hostInput.value = '127.0.0.1';
    portInput.value = '3100';
    autoStartInput.checked = true;
    orphanInput.checked = true;
    for (const span of [labelError, projectPathError, hostError, portError]) {
      setFieldError(span, false);
    }
  }

  async function submitForm(): Promise<void> {
    if (!ctx.api) return;
    submitButton.disabled = true;
    try {
      await ctx.api.connections.add({
        label: labelInput.value.trim(),
        kind: 'local',
        projectPath: projectPathInput.value.trim(),
        host: hostInput.value.trim(),
        port: Number(portInput.value),
        autoStart: autoStartInput.checked,
        orphanShutdownOnQuit: orphanInput.checked,
      });
      if (disposed) return;
      setFieldError(formError, false);
      resetForm();
      await refreshList();
    } catch {
      if (disposed) return;
      setFieldError(formError, true, t(ctx.strings, MSG.connectionAddError));
    } finally {
      if (!disposed) submitButton.disabled = kindSelect.value !== 'local';
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (kindSelect.value !== 'local' || !ctx.api) return;
    if (!validateForm()) return;
    void submitForm();
  });

  container.append(el('h2', { text: t(ctx.strings, MSG.connectionAddTitle) }), form);
  root.append(container);

  function renderProfiles(profiles: ConnectionProfile[]): void {
    if (profiles.length === 0) {
      listContainer.replaceChildren(el('p', { className: 'empty-state', text: t(ctx.strings, MSG.connectionEmptyState) }));
      return;
    }
    listContainer.replaceChildren(...profiles.map(renderProfileRow));
  }

  function renderProfileRow(profile: ConnectionProfile): HTMLElement {
    const info = el('div', { className: 'profile-row__info' }, [
      el('span', { className: 'profile-row__label', text: profile.label }),
      el('span', { className: 'badge', text: t(ctx.strings, KIND_LABEL_KEYS[profile.kind]) }),
    ]);
    const connectButton = el('button', {
      className: 'btn btn--primary',
      text: t(ctx.strings, MSG.connectionConnectButton),
      on: { click: () => ctx.navigate({ kind: 'connecting', profileId: profile.id }) },
    });
    const deleteButton = el('button', {
      className: 'btn btn--danger',
      text: t(ctx.strings, MSG.connectionDeleteButton),
      on: { click: () => void handleDelete(profile.id) },
    });
    const actions = el('div', { className: 'profile-row__actions' }, [connectButton, deleteButton]);
    return el('div', { className: 'profile-row' }, [info, actions]);
  }

  async function handleDelete(id: string): Promise<void> {
    if (!ctx.api) return;
    if (!window.confirm(t(ctx.strings, MSG.connectionDeleteConfirm))) return;
    try {
      await ctx.api.connections.remove(id);
      if (disposed) return;
      await refreshList();
    } catch {
      if (disposed) return;
      listContainer.append(el('p', { className: 'error-message', text: t(ctx.strings, MSG.connectionRemoveError) }));
    }
  }

  async function refreshList(): Promise<void> {
    if (!ctx.api) {
      renderProfiles([]);
      return;
    }
    listContainer.replaceChildren(el('p', { className: 'status-message', text: t(ctx.strings, MSG.connectionListLoading) }));
    try {
      const profiles = await ctx.api.connections.list();
      if (disposed) return;
      renderProfiles(profiles);
    } catch {
      if (disposed) return;
      listContainer.replaceChildren(el('p', { className: 'error-message', text: t(ctx.strings, MSG.connectionListError) }));
    }
  }

  void refreshList();

  return () => {
    disposed = true;
  };
}

// --- Connecting ----------------------------------------------------------

function renderConnecting(root: HTMLElement, ctx: RenderContext, profileId: string): Cleanup {
  let disposed = false;
  let settled = false;

  const container = el('div', { className: 'screen screen--connecting' });
  const spinner = el('div', { className: 'spinner', attrs: { 'aria-hidden': 'true' } });
  const statusText = el('p', { className: 'status-message', text: t(ctx.strings, MSG.connectingIdle) });
  container.append(el('h1', { text: t(ctx.strings, MSG.connectingTitle) }), spinner, statusText);

  function setStatus(key: string, vars?: Record<string, string>): void {
    statusText.textContent = t(ctx.strings, key, vars);
  }

  function goToError(errorKey: string, errorVars?: Record<string, string>): void {
    if (disposed || settled) return;
    settled = true;
    ctx.navigate({ kind: 'daemonError', profileId, errorKey, errorVars });
  }

  if (!ctx.api) {
    setStatus(MSG.appBrowserFallbackNotice);
    container.append(
      el('button', {
        className: 'btn btn--secondary',
        text: t(ctx.strings, MSG.errorBackButton),
        on: { click: () => ctx.navigate({ kind: 'profilePicker' }) },
      }),
    );
    root.append(container);
    return () => {
      disposed = true;
    };
  }

  const api = ctx.api;

  const unsubscribe = api.daemon.onStatus((event) => {
    if (disposed || settled || event.profileId !== profileId) return;
    switch (event.status) {
      case 'spawning':
        setStatus(MSG.connectingSpawning);
        break;
      case 'adopting':
        setStatus(MSG.connectingAdopting);
        break;
      case 'health-polling':
        setStatus(MSG.connectingHealthCheck);
        break;
      case 'connected':
        setStatus(MSG.connectingConnected);
        break;
      case 'idle':
        setStatus(MSG.connectingIdle);
        break;
      case 'error':
        goToError(event.errorKey ?? MSG.errorUnknown, event.errorVars);
        break;
      default:
        console.warn(`[renderer] unhandled daemon status: ${String(event.status)}`);
        break;
    }
  });

  root.append(container);

  api.connections
    .connect(profileId)
    .then((result: ConnectResult) => {
      if (!result.ok) goToError(result.errorKey, result.errorVars);
    })
    .catch(() => {
      goToError(MSG.errorUnknown);
    });

  return () => {
    disposed = true;
    unsubscribe();
  };
}

// --- DaemonError -----------------------------------------------------------

function renderDaemonError(
  root: HTMLElement,
  ctx: RenderContext,
  profileId: string,
  errorKey: string,
  errorVars?: Record<string, string>,
): Cleanup {
  const container = el('div', { className: 'screen screen--daemon-error' });

  const resolvedKey = errorKey in ctx.strings ? errorKey : MSG.errorUnknown;
  const message = el('p', { className: 'error-message', text: t(ctx.strings, resolvedKey, errorVars) });

  const detailsToggle = el('button', { className: 'btn btn--link', text: t(ctx.strings, MSG.errorViewLogs) });
  const detailsPanel = el('pre', { className: 'error-details error-details--hidden' });
  const detailsLines = [`errorKey: ${errorKey}`, ...Object.entries(errorVars ?? {}).map(([k, v]) => `${k}: ${v}`)];
  detailsPanel.textContent = detailsLines.join('\n');
  detailsToggle.addEventListener('click', () => {
    detailsPanel.classList.toggle('error-details--hidden');
  });

  const retryButton = el('button', {
    className: 'btn btn--primary',
    text: t(ctx.strings, MSG.connectingRetry),
    on: { click: () => ctx.navigate({ kind: 'connecting', profileId }) },
  });
  const backButton = el('button', {
    className: 'btn btn--secondary',
    text: t(ctx.strings, MSG.errorBackButton),
    on: { click: () => ctx.navigate({ kind: 'profilePicker' }) },
  });

  container.append(
    el('h1', { text: t(ctx.strings, MSG.errorTitle) }),
    message,
    el('div', { className: 'actions' }, [retryButton, detailsToggle, backButton]),
    detailsPanel,
  );
  root.append(container);

  return () => {};
}
