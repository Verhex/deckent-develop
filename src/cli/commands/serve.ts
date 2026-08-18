import type { Command } from 'commander';
import { existsSync, readdirSync } from 'node:fs';
import { createHttpServer } from '../../api/server.js';
import { writeServeDaemonMeta, clearServeDaemonMeta } from '../../api/serve-daemon-meta.js';
import { registerShutdownHook } from '../helpers/shutdown-hooks.js';
import { LocalPtyBackend } from '../../api/terminal/session-backend.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { print, printError } from '../helpers/output.js';
import { getDashboardStaticDir } from '../helpers/dashboard-dir.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { loadConfig } from '../../core/config.js';
import { bootstrapProviders } from '../../core/provider.js';
import {
  bootstrapApprovalAuthority,
  type ApprovalAuthorityBootstrapResult,
} from '../../core/approval-authority-bootstrap.js';
import {
  openLocalProviderAuthorityRuntimeIfConfigured,
} from '../../providers/provider-authority-runtime-bootstrap.js';
import type {
  ProviderAuthorityRuntimeServiceOpenResult,
} from '../../core/provider-authority-composition.js';

/** Extended MIME types for static file serving (superset of server.ts defaults) */
export const EXTENDED_MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  // Images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  // Fonts
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  // Other
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.map': 'application/json',
};

/** Check if the static dist directory has content */
export function checkDistDirectory(staticDir: string): { exists: boolean; hasContent: boolean } {
  if (!existsSync(staticDir)) {
    return { exists: false, hasContent: false };
  }
  try {
    const entries = readdirSync(staticDir);
    return { exists: true, hasContent: entries.length > 0 };
  } catch {
    return { exists: true, hasContent: false };
  }
}

interface ServeOpts {
  port?: string;
  dev?: boolean;
  devPort?: string;
  host?: string;
  terminal?: boolean;
}

export function registerServe(program: Command): void {
  program
    .command('serve')
    .description(getMessage('cli.serve.desc', getLanguage(undefined)))
    .option('--port <number>', 'Port to listen on', '3100')
    .option('--dev', 'Enable dev proxy mode — expects Vite dev server on --dev-port')
    .option('--dev-port <number>', 'Vite dev server port for --dev proxy mode', '5173')
    .option('--host <addr>', 'Bind address for the server', '127.0.0.1')
    .option('--no-terminal', 'Disable the embedded web terminal')
    .action(async (opts: ServeOpts) => {
      const root = resolveProjectRoot();
      const port = parseInt(opts.port ?? '3100', 10);

      if (isNaN(port) || port < 1 || port > 65535) {
        printError(new Error(`Invalid port: ${opts.port}`));
        process.exitCode = 1;
        return;
      }

      // Non-localhost host: disable terminal and warn (spec §5)
      const host = opts.host ?? '127.0.0.1';
      const isLocalhost = host === '127.0.0.1' || host === '::1' || host === 'localhost';
      const terminalEnabled = opts.terminal !== false && isLocalhost;
      if (!isLocalhost && opts.terminal !== false) {
        process.stderr.write(getMessage('serve.terminal_non_localhost_warning', getLanguage()) + '\n');
      }

      // Instantiate the local PTY backend when the terminal is enabled. This
      // wires the embedded web terminal subsystem in server.ts (token mint,
      // bootstrap inject, ws gateway, HTTP control routes). Without it, the
      // server boots in API-only mode and the terminal panel cannot connect.
      const terminalBackend = terminalEnabled ? new LocalPtyBackend() : undefined;

      // Build check: warn if the bundled dashboard is missing or empty
      const staticDir = opts.dev ? undefined : getDashboardStaticDir();
      if (!opts.dev && staticDir) {
        const distCheck = checkDistDirectory(staticDir);
        if (!distCheck.exists) {
          print(`Warning: Bundled dashboard not found: ${staticDir}`);
          print('Run the dashboard build before serving: npm run build:dashboard');
          print('Or use --dev flag to proxy a Vite dev server.');
          print('API endpoints will still work without static files.');
          print('');
        } else if (!distCheck.hasContent) {
          print(`Warning: Bundled dashboard is empty: ${staticDir}`);
          print('Run the dashboard build: npm run build:dashboard');
          print('');
        }
      }

      // Dev proxy mode info
      if (opts.dev) {
        const devPort = parseInt(opts.devPort ?? '5173', 10);
        print(`Dev proxy mode: API on :${port}, proxying static to Vite on :${devPort}`);
        print('Ensure Vite dev server is running: npm run dev (in src/dashboard/)');
        print('');
      }

      // D4-3 (born-680'in API-ikizi): /api/run-flow/propose planner-core'a
      // iner (compileRunProposal → callZeroConfigPlanner → resolveAdapter) —
      // provider bootstrap'ı olmayan bir serve-daemon'da her propose
      // "No providers registered" 502'siyle ölüyordu. do.ts/start.ts'in AYNI
      // bootstrap-konvansiyonu; fail-soft (fire-and-forget): provider'sız bir
      // ortamda API-only mod aynen çalışmaya devam eder, propose dürüst hata verir.
      let approvalAuthority: Extract<ApprovalAuthorityBootstrapResult, { state: 'ready' }> | undefined;
      let providerAuthority: ProviderAuthorityRuntimeServiceOpenResult | undefined;
      try {
        const config = await loadConfig(root);
        providerAuthority = openLocalProviderAuthorityRuntimeIfConfigured(root, config);
        void bootstrapProviders(config).catch((err: unknown) => {
          process.stderr.write(`[serve] provider bootstrap skipped: ${err instanceof Error ? err.message : String(err)}\n`);
        });
        const approvalBootstrap = bootstrapApprovalAuthority(root, config);
        if (approvalBootstrap.state === 'ready') {
          approvalAuthority = approvalBootstrap;
        } else if (approvalBootstrap.state === 'hold') {
          process.stderr.write(getMessage(
            'serve.approval_authority_hold',
            getLanguage(),
            {
              reason: approvalBootstrap.reasonCode,
              detail: approvalBootstrap.detailCode,
            },
          ) + '\n');
        }
      } catch (err) {
        process.stderr.write(`[serve] provider bootstrap skipped: ${err instanceof Error ? err.message : String(err)}\n`);
      }

      let api: ReturnType<typeof createHttpServer>;
      try {
        api = createHttpServer(root, {
          port,
          staticDir,
          host,
          terminalBackend,
          ...(approvalAuthority
            ? {
                approvalAuthority: {
                  runtime: approvalAuthority.runtime,
                  policy: approvalAuthority.policy,
                  verifier: approvalAuthority.verifier,
                },
              }
            : {}),
          ...(providerAuthority ? { providerAuthority } : {}),
        });
      } catch (error) {
        approvalAuthority?.runtime.close();
        providerAuthority?.close();
        throw error;
      }

      const lang = getLanguage();

      // DESK-1 (born-496): persist the daemon handshake file so a desktop shell
      // can adopt this daemon (pid-ownership + /health verified — the file is a
      // hint, not proof). Non-fatal: the server is fully usable without it.
      try {
        writeServeDaemonMeta(root, {
          host,
          port,
          projectRoot: root,
          apiToken: api.apiToken,
          terminalToken: api.terminalToken,
          terminalEnabled: terminalEnabled && api.terminalToken !== undefined,
        });
      } catch (metaErr) {
        process.stderr.write(getMessage('serve.daemon_meta_failed', lang, {
          error: metaErr instanceof Error ? metaErr.message : String(metaErr),
        }) + '\n');
      }
      print(getMessage('serve.listening', lang, { host, port: String(port) }));
      print('');
      print(getMessage('serve.token_injected', lang));
      if (terminalEnabled && api.terminalToken) {
        print(getMessage('serve.terminal_enabled', lang));
      } else {
        print(getMessage('serve.terminal_disabled', lang));
      }
      print(getMessage('serve.stop_hint', lang));
      print(getMessage('serve.port_tip', lang));
      print('');

      // Graceful shutdown via the entry-level shutdown-hook registry (born-496
      // B1 live finding): a command-registered `process.on(SIGINT/SIGTERM)`
      // listener here is DEAD CODE — entry.ts's bootstrap-time onSignal wins
      // registration order and exits synchronously, so this command's previous
      // cleanup (incl. api.close()) never ran on a real signal. The hook is
      // awaited by onSignal (bounded) on SIGINT+SIGTERM (win32: SIGINT+SIGBREAK).
      // Idempotent by contract: clear swallows ENOENT, close resolves twice.
      registerShutdownHook(async () => {
        // Sync file-clear FIRST so a hung close can never block it.
        clearServeDaemonMeta(root);
        const outcomes = await Promise.allSettled([
          Promise.resolve().then(() => approvalAuthority?.runtime.close()),
          Promise.resolve().then(() => providerAuthority?.close()),
          api.close(),
        ]);
        const failed = outcomes.find(
          (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
        );
        if (failed) throw failed.reason;
      });
    });
}
