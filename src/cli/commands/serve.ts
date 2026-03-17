import type { Command } from 'commander';
import { createHttpServer } from '../../api/server.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { print } from '../helpers/output.js';

interface ServeOpts {
  port?: string;
}

export function registerServe(program: Command): void {
  program
    .command('serve')
    .description('Start HTTP API server with SSE support')
    .option('--port <number>', 'Port to listen on', '3100')
    .action((opts: ServeOpts) => {
      const root = resolveProjectRoot();
      const port = parseInt(opts.port ?? '3100', 10);
      const api = createHttpServer(root, port);

      print(`Deckent API server listening on http://localhost:${port}`);

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
