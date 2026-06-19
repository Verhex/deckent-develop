import { extname } from 'node:path';
import type { Command } from 'commander';
import { createHttpServer } from '../../api/server.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { print } from '../helpers/output.js';
import { getMessage } from '../helpers/messages.js';
import { detectLang } from '../helpers/i18n.js';
import { getDashboardStaticDir, dashboardIsBuilt } from '../helpers/dashboard-dir.js';

interface WebOpts {
  port?: string;
  dev?: boolean;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

export function getMimeType(filePath: string): string {
  return MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';
}

export function registerWeb(program: Command): void {
  program
    .command('web')
    .description('Start web dashboard with API server (deprecated — use `deckent serve`)')
    .option('--port <number>', 'Port to listen on', '3100')
    .option('--dev', 'Development mode — use Vite dev server for frontend')
    .action((opts: WebOpts) => {
      const root = resolveProjectRoot();
      const lang = detectLang(root);
      const port = parseInt(opts.port ?? '3100', 10);

      print(getMessage('web.deprecated_use_serve', lang));

      if (opts.dev) {
        print(getMessage('web.dev_server_hint', lang));
      }

      const staticDir = opts.dev ? undefined : getDashboardStaticDir();
      if (staticDir && !dashboardIsBuilt(staticDir)) {
        print(getMessage('web.dashboard_not_found', lang, { name: staticDir }));
        print(getMessage('web.build_dashboard_hint', lang));
      }
      const api = createHttpServer(root, port, staticDir);

      print(getMessage('web.listening', lang, { name: String(port) }));

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
