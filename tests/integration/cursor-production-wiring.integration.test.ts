import { mkdir, mkdtempDisposable, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { handleImageBuild } from '../../src/cli/commands/image.js';
import { loadCatalog, type RemoteCatalogResponse } from '../../src/core/model-catalog.js';
import {
  CURSOR_MODELS,
  ModelRegistry,
} from '../../src/core/model-registry.js';
import {
  buildProviderCommand,
  getProviderCommandSpec,
  PROVIDER_COMMAND_SPECS,
} from '../../src/core/provider-command-spec.js';
import type { SpawnImpl, SpawnedProcessLike } from '../../src/core/worker-image-check.js';
import {
  buildProviderAuthIsolation,
  resolveCursorHostCredentialRoot,
} from '../../src/orchestra/spawn-backend-docker.js';

function successfulSpawn(calls: Array<{ command: string; args: string[] }>): SpawnImpl {
  return (command: string, args: string[]): SpawnedProcessLike => {
    calls.push({ command, args: [...args] });
    const listeners: Record<string, (...values: unknown[]) => void> = {};
    const child: SpawnedProcessLike = {
      stdout: null,
      stderr: null,
      on(event: string, listener: (...values: unknown[]) => void) {
        listeners[event] = listener;
        return child;
      },
    };
    queueMicrotask(() => listeners['close']?.(0, null));
    return child;
  };
}

describe('Cursor production wiring fan-in', () => {
  it('carries Cursor from the image handler through canonical catalog and isolated Docker auth', async () => {
    // Exercise the production image handler rather than duplicating its argument
    // builder. Existing provider switches deliberately travel through the same call.
    const packageDirectory = await mkdtempDisposable(join(tmpdir(), 'cursor-production-image-'));
    try {
      const assets = join(packageDirectory.path, 'assets');
      await mkdir(assets, { recursive: true });
      await writeFile(join(assets, 'Dockerfile.worker'), 'FROM node:24-trixie-slim\n');
      const spawns: Array<{ command: string; args: string[] }> = [];
      expect(await handleImageBuild({
        root: packageDirectory.path,
        withCodex: true,
        withGemini: true,
        withOllama: true,
        withCursor: true,
      }, successfulSpawn(spawns))).toBe(0);
      expect(spawns).toHaveLength(1);
      expect(spawns[0]).toMatchObject({ command: 'docker' });
      expect(spawns[0]!.args.filter(arg => arg.startsWith('INSTALL_'))).toEqual([
        'INSTALL_CODEX=true',
        'INSTALL_GEMINI=true',
        'INSTALL_OLLAMA=true',
        'INSTALL_CURSOR=true',
      ]);

      // A valid remote response that knows nothing about Cursor must enrich, not
      // replace, Deckent's canonical registry. Then resolve the named verifier
      // model through the same catalog -> ModelRegistry -> provider-spec chain.
      const catalogDirectory = await mkdtempDisposable(join(tmpdir(), 'cursor-production-catalog-'));
      try {
        const cachePath = join(catalogDirectory.path, 'catalog.json');
        const remote: RemoteCatalogResponse = {
          version: 'integration-remote-without-cursor',
          models: [{
            id: 'remote-claude-fixture',
            apiId: 'remote-claude-fixture',
            provider: 'anthropic',
            tier: 'standard',
            contextWindow: 100_000,
            costPerMillion: { input: 1, output: 2 },
          }],
        };
        const catalog = await loadCatalog({
          cachePath,
          fetchImpl: async () => new Response(JSON.stringify(remote), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        });
        const cursorModels = catalog.models.filter(model => model.provider === 'cursor');
        expect(catalog.source).toBe('remote');
        expect(cursorModels).toHaveLength(4);
        expect(cursorModels.map(model => `${model.id}:${model.apiId}`))
          .toEqual(CURSOR_MODELS.map(model => `${model.id}:${model.apiId}`));

        const registry = new ModelRegistry(catalog.models);
        const verifier = registry.getOrThrow('cursor-grok-4.6-xhigh');
        expect(verifier).toMatchObject({ provider: 'cursor', apiId: 'cursor-grok-4.6-xhigh' });
        const cursorSpec = getProviderCommandSpec(verifier.provider);
        expect(cursorSpec).toBe(PROVIDER_COMMAND_SPECS.cursor);
        expect(buildProviderCommand(cursorSpec!, verifier.apiId, '/run/task/prompt.md'))
          .toContain('cursor-agent --mode ask -p --trust --output-format json --model cursor-grok-4.6-xhigh');

        // Host source authority and task-private Linux destination are independent:
        // only auth.json crosses the boundary, read-only, and no writeback can mutate it.
        const hostRoot = resolveCursorHostCredentialRoot('/home/operator', 'linux', {
          XDG_CONFIG_HOME: '/host/xdg',
        });
        expect(hostRoot).toBe('/host/xdg/cursor');
        const auth = buildProviderAuthIsolation(
          '/home/operator',
          'cursor',
          cursorSpec!.oauthHomeDir,
          false,
          path => path === '/host/xdg/cursor/auth.json',
          { hostCredentialRoot: hostRoot },
        );
        expect(auth.mountArgs).toEqual([
          '--mount',
          'type=bind,src=/host/xdg/cursor/auth.json,dst=/run/deckent-auth-cursor-auth.json,readonly',
        ]);
        expect(auth.bootstrapLines).toContain(
          'cp "/run/deckent-auth-cursor-auth.json" "$HOME/.config/cursor/auth.json" || exit 78',
        );
        expect(auth.writebackLines ?? []).toEqual([]);
        expect(auth.mountArgs.join(' ')).not.toContain('src=/host/xdg/cursor,dst=');
        expect(auth.mountArgs.join(' ')).not.toContain('/home/operator/.config');
        expect(auth.mountArgs.join(' ')).not.toContain('/home/operator:');

        // Cursor is additive: established provider command and credential contracts remain.
        expect(['claude', 'codex', 'gemini'].map(provider => getProviderCommandSpec(provider)?.binary))
          .toEqual(['claude', 'codex', 'gemini']);
        expect(buildProviderAuthIsolation('/home/operator', 'claude', '.claude', false, () => true)
          .mountArgs.join(' ')).toContain('/home/operator/.claude/.credentials.json');
        expect(buildProviderAuthIsolation('/home/operator', 'codex', '.codex', false, () => true)
          .mountArgs.join(' ')).toContain('/home/operator/.codex/auth.json');
        expect(buildProviderAuthIsolation('/home/operator', 'gemini', '.gemini', false, () => true)
          .mountArgs.join(' ')).toContain('/home/operator/.gemini/gemini-credentials.json');
      } finally {
        await catalogDirectory.remove();
      }
    } finally {
      await packageDirectory.remove();
    }
  });
});
