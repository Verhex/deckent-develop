import type { Command } from 'commander';
import { existsSync, readdirSync } from 'node:fs';
import { createHttpServer } from '../../api/server.js';
import { LocalPtyBackend } from '../../api/terminal/session-backend.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { print, printError } from '../helpers/output.js';
import { getDashboardStaticDir } from '../helpers/dashboard-dir.js';
import { getMessage, getLanguage } from '../helpers/messages.js';

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
    .description('Start HTTP API server with SSE support')
    .option('--port <number>', 'Port to listen on', '3100')
    .option('--dev', 'Enable dev proxy mode — expects Vite dev server on --dev-port')
    .option('--dev-port <number>', 'Vite dev server port for --dev proxy mode', '5173')
    .option('--host <addr>', 'Bind address for the server', '127.0.0.1')
    .option('--no-terminal', 'Disable the embedded web terminal')
    .action((opts: ServeOpts) => {
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
        process.stderr.write('Warning: terminal disabled — non-localhost host requires explicit --no-terminal\n');
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

      const api = createHttpServer(root, {
        port,
        staticDir,
        host,
        terminalBackend,
      });

      const lang = getLanguage();
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

      const cleanup = (): void => {
        api.close().then(() => {
          process.exit(0);
        }).catch(() => {
          process.exit(1);
        });
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
    });
}
