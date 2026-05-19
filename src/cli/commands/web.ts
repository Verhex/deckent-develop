import { extname } from 'node:path';
import type { Command } from 'commander';
import { createHttpServer } from '../../api/server.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { print } from '../helpers/output.js';
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
    .description('Start web dashboard with API server')
    .option('--port <number>', 'Port to listen on', '3100')
    .option('--dev', 'Development mode — use Vite dev server for frontend')
    .action((opts: WebOpts) => {
      const root = resolveProjectRoot();
      const port = parseInt(opts.port ?? '3100', 10);

      if (opts.dev) {
        print("Run 'cd src/dashboard && npm run dev' for Vite dev server on port 5173");
      }

      const staticDir = opts.dev ? undefined : getDashboardStaticDir();
      if (staticDir && !dashboardIsBuilt(staticDir)) {
        print(`Warning: bundled dashboard not found at ${staticDir}`);
        print("Run 'npm run build:dashboard' (repo) or reinstall deckent. API still works.");
      }
      const api = createHttpServer(root, port, staticDir);

      print(`Deckent Web Dashboard on http://localhost:${port}`);

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
