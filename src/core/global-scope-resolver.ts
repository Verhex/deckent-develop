import { posix, win32 } from 'node:path';

/**
 * GLOBAL-SCOPE-RESOLVER (Sıra-200 ONB-GLOBAL dilim-1; ADR-G-001 "Tomorrow"
 * scope-aware resolution; ADR-D-002 STATE-RESOLVER sibling; Yasa#2 platform
 * matrix — design doc: docs/design/onb-global-install.md).
 *
 * Pure, injectable resolver for deckent's *global* (user-machine-wide) state
 * roots on every supported platform. Today the global scope is a flat,
 * platform-blind `~/.deckent` (`src/core/constants.ts` GLOBAL_DECKENT_DIR);
 * this module computes the *platform-correct* target layout
 * (XDG / AppData / Library conventions) without touching the filesystem and
 * without reading `process.env` / `process.platform` — both are injected by
 * the caller, so tests are hermetic by construction (no fs, no os mocking).
 *
 * IMPORTANT — intentionally UNWIRED: nothing in `constants.ts` / `config.ts`
 * consumes this module yet. The existing config precedence
 * (defaults → `~/.deckent/config.json` → `.deckent/config.json` → `DECKENT_*`
 * env, ADR-G-001) is unchanged. Adoption (dual-read, migration, default
 * flip) is a separate ADR decision — see the design doc's ADR draft.
 *
 * Precedence (highest → lowest), mirroring `state-paths.ts`:
 *   1. `DECKENT_HOME` env override — ALL role dirs collapse onto that single
 *      directory (flat, exactly like today's `~/.deckent`), so sandboxes and
 *      tests keep one knob for the whole global scope.
 *   2. Platform convention (see the per-platform rules below).
 *
 * Per-platform conventions (`deckent` app segment):
 *   - linux / wsl — XDG Base Directory spec:
 *       config `$XDG_CONFIG_HOME` (fallback `~/.config`)   + `/deckent`
 *       data   `$XDG_DATA_HOME`   (fallback `~/.local/share`) + `/deckent`
 *       cache  `$XDG_CACHE_HOME`  (fallback `~/.cache`)     + `/deckent`
 *       state  `$XDG_STATE_HOME`  (fallback `~/.local/state`) + `/deckent`
 *     WSL is Linux userland → identical rules; it is a distinct platform tag
 *     so callers (doctor / migration) can apply WSL-specific guidance
 *     (e.g. warn when a global dir would land on `/mnt/c` — 9P fs).
 *   - darwin — Apple conventions:
 *       config = data = state = `~/Library/Application Support/deckent`
 *       cache  = `~/Library/Caches/deckent`
 *     (Role roots MAY physically coincide where the platform convention
 *      merges them; role owners namespace their own files/subdirs.)
 *   - win32 — Known Folder conventions:
 *       config = data = `%APPDATA%\deckent` (roaming)
 *       cache  = state = `%LOCALAPPDATA%\deckent` (machine-local)
 *     Fallbacks: `%APPDATA%` → `<home>\AppData\Roaming`, `%LOCALAPPDATA%` →
 *     `<home>\AppData\Local`; home = `%USERPROFILE%` → `%HOMEDRIVE%%HOMEPATH%`.
 *
 * Unsupported platforms fail honestly (Yasa#2 — never silently): a typed
 * {@link GlobalScopeResolutionError} with code `UNSUPPORTED_PLATFORM`.
 * Empty-string env values are treated as unset (state-paths.ts convention).
 */

/** The four platforms of the Yasa#2 matrix. WSL is deliberately distinct from linux. */
export type GlobalScopePlatform = 'darwin' | 'linux' | 'win32' | 'wsl';

/** Injected environment snapshot — shape-compatible with `process.env`. */
export type GlobalScopeEnv = Readonly<Record<string, string | undefined>>;

/** How the global-scope roots were derived. */
export type GlobalScopeSource = 'env-override' | 'platform-convention';

/**
 * Resolved global-scope roots. Role dirs MAY physically coincide where the
 * platform convention merges roles (darwin, win32) — callers namespace by
 * file/subdir, never by assuming role roots are distinct directories.
 */
export interface GlobalScopePaths {
  /** Platform the resolution was computed for. */
  readonly platform: GlobalScopePlatform;
  /** 'env-override' when `DECKENT_HOME` won; 'platform-convention' otherwise. */
  readonly source: GlobalScopeSource;
  /** Resolved user home, or null when unresolvable (only possible under env-override). */
  readonly home: string | null;
  /** Role: user-editable configuration (config.json, mcp.json). */
  readonly configDir: string;
  /** Role: durable user data (credentials/, keys/, gateway pairing). */
  readonly dataDir: string;
  /** Role: rebuildable caches (model-catalog, auto-detect) — safe to delete. */
  readonly cacheDir: string;
  /** Role: machine-local operational state (ledgers, daemon runtime). */
  readonly stateDir: string;
  /**
   * Today's flat global dir (`<home>/.deckent`) — the migration/dual-read
   * probe seam. Null when home is unresolvable (env-override without a home).
   */
  readonly legacyDir: string | null;
}

/** Error codes for {@link GlobalScopeResolutionError}. */
export type GlobalScopeResolutionErrorCode = 'HOME_NOT_RESOLVED' | 'UNSUPPORTED_PLATFORM';

/** Typed error — global-scope resolution failed honestly (Yasa#2: never silent). */
export class GlobalScopeResolutionError extends Error {
  readonly code: GlobalScopeResolutionErrorCode;

  constructor(code: GlobalScopeResolutionErrorCode, message: string) {
    super(message);
    this.name = 'GlobalScopeResolutionError';
    this.code = code;
  }
}

/** App directory segment used under every platform root. */
const APP_DIR = 'deckent';

/** Env override knob — same knob `state-paths.ts` honors for the flat dir. */
const DECKENT_HOME_ENV = 'DECKENT_HOME';

/** Read an env var, treating empty string as unset (state-paths.ts convention). */
function envValue(env: GlobalScopeEnv, key: string): string | undefined {
  const value = env[key];
  return value !== undefined && value !== '' ? value : undefined;
}

/** Resolve the user home from the injected env for the given platform, or null. */
function resolveHomeFromEnv(platform: GlobalScopePlatform, env: GlobalScopeEnv): string | null {
  if (platform === 'win32') {
    const userProfile = envValue(env, 'USERPROFILE');
    if (userProfile) return userProfile;
    const homeDrive = envValue(env, 'HOMEDRIVE');
    const homePath = envValue(env, 'HOMEPATH');
    if (homeDrive && homePath) return win32.join(homeDrive, homePath);
    return null;
  }
  return envValue(env, 'HOME') ?? null;
}

/**
 * Map a Node `process.platform` value (plus WSL env markers) onto the Yasa#2
 * platform matrix. Linux with `WSL_DISTRO_NAME` / `WSL_INTEROP` set is tagged
 * 'wsl' (resolution rules are identical to linux; the tag exists so callers
 * can apply WSL-specific guidance). Anything outside the matrix fails
 * honestly with `UNSUPPORTED_PLATFORM` — never a silent fallback (Yasa#2).
 *
 * @param nodePlatform A `process.platform`-shaped string (injected, not read).
 * @param env Injected environment snapshot (WSL marker detection).
 */
export function normalizeGlobalScopePlatform(
  nodePlatform: string,
  env: GlobalScopeEnv,
): GlobalScopePlatform {
  switch (nodePlatform) {
    case 'darwin':
      return 'darwin';
    case 'win32':
      return 'win32';
    case 'linux':
      return envValue(env, 'WSL_DISTRO_NAME') !== undefined || envValue(env, 'WSL_INTEROP') !== undefined
        ? 'wsl'
        : 'linux';
    default:
      throw new GlobalScopeResolutionError(
        'UNSUPPORTED_PLATFORM',
        `[deckent] Global scope resolution does not support platform '${nodePlatform}'. ` +
          `Supported: darwin, linux, win32, wsl. ` +
          `Set ${DECKENT_HOME_ENV} to a directory to override explicitly.`,
      );
  }
}

/**
 * Resolve the platform-correct global-scope directory layout.
 *
 * Pure function: no filesystem access, no `process.*` reads — `platform` and
 * `env` are injected, so the same call is deterministic on any host (the
 * path backend is selected by the *injected* platform: `path.win32` for
 * win32, `path.posix` otherwise — never by the host's `process.platform`).
 *
 * @param platform Target platform (use {@link normalizeGlobalScopePlatform}
 *   to derive it from `process.platform` + env at the call boundary).
 * @param env Environment snapshot (e.g. `process.env` at the call boundary).
 * @returns The resolved {@link GlobalScopePaths}.
 * @throws {GlobalScopeResolutionError} `HOME_NOT_RESOLVED` when no home can
 *   be derived and no `DECKENT_HOME` override is present;
 *   `UNSUPPORTED_PLATFORM` for platforms outside the matrix.
 *
 * @example
 * ```typescript
 * const paths = resolveGlobalScopePaths(
 *   normalizeGlobalScopePlatform(process.platform, process.env),
 *   process.env,
 * );
 * // linux → paths.configDir === '/home/user/.config/deckent'
 * ```
 */
export function resolveGlobalScopePaths(
  platform: GlobalScopePlatform,
  env: GlobalScopeEnv,
): GlobalScopePaths {
  if (platform !== 'darwin' && platform !== 'linux' && platform !== 'win32' && platform !== 'wsl') {
    // Reachable when callers pass an unvalidated string (JS callers, config).
    throw new GlobalScopeResolutionError(
      'UNSUPPORTED_PLATFORM',
      `[deckent] Global scope resolution does not support platform '${String(platform)}'. ` +
        `Supported: darwin, linux, win32, wsl.`,
    );
  }

  const pathApi = platform === 'win32' ? win32 : posix;
  const home = resolveHomeFromEnv(platform, env);
  const legacyDir = home !== null ? pathApi.join(home, '.deckent') : null;

  // ── Tier 1: DECKENT_HOME override — all roles collapse onto one flat dir ──
  const envOverride = envValue(env, DECKENT_HOME_ENV);
  if (envOverride) {
    return {
      platform,
      source: 'env-override',
      home,
      configDir: envOverride,
      dataDir: envOverride,
      cacheDir: envOverride,
      stateDir: envOverride,
      legacyDir,
    };
  }

  // ── Tier 2: platform convention (home is now mandatory) ──
  if (home === null) {
    const expected = platform === 'win32' ? 'USERPROFILE (or HOMEDRIVE+HOMEPATH)' : 'HOME';
    throw new GlobalScopeResolutionError(
      'HOME_NOT_RESOLVED',
      `[deckent] Cannot resolve the user home on '${platform}': ${expected} is not set. ` +
        `Set it, or set ${DECKENT_HOME_ENV} to an explicit global-scope directory.`,
    );
  }

  if (platform === 'win32') {
    const roaming = envValue(env, 'APPDATA') ?? win32.join(home, 'AppData', 'Roaming');
    const local = envValue(env, 'LOCALAPPDATA') ?? win32.join(home, 'AppData', 'Local');
    return {
      platform,
      source: 'platform-convention',
      home,
      configDir: win32.join(roaming, APP_DIR),
      dataDir: win32.join(roaming, APP_DIR),
      cacheDir: win32.join(local, APP_DIR),
      stateDir: win32.join(local, APP_DIR),
      legacyDir,
    };
  }

  if (platform === 'darwin') {
    const appSupport = posix.join(home, 'Library', 'Application Support', APP_DIR);
    return {
      platform,
      source: 'platform-convention',
      home,
      configDir: appSupport,
      dataDir: appSupport,
      cacheDir: posix.join(home, 'Library', 'Caches', APP_DIR),
      stateDir: appSupport,
      legacyDir,
    };
  }

  // linux | wsl — XDG Base Directory spec (WSL is Linux userland; same rules).
  const xdgConfig = envValue(env, 'XDG_CONFIG_HOME') ?? posix.join(home, '.config');
  const xdgData = envValue(env, 'XDG_DATA_HOME') ?? posix.join(home, '.local', 'share');
  const xdgCache = envValue(env, 'XDG_CACHE_HOME') ?? posix.join(home, '.cache');
  const xdgState = envValue(env, 'XDG_STATE_HOME') ?? posix.join(home, '.local', 'state');
  return {
    platform,
    source: 'platform-convention',
    home,
    configDir: posix.join(xdgConfig, APP_DIR),
    dataDir: posix.join(xdgData, APP_DIR),
    cacheDir: posix.join(xdgCache, APP_DIR),
    stateDir: posix.join(xdgState, APP_DIR),
    legacyDir,
  };
}
