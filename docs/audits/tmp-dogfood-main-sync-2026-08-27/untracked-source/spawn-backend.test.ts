import { describe, expect, it } from 'vitest';

import type { ProviderName } from '../../src/core/task-types.js';
import {
  canExternalizeWorkerCore,
  type SpawnBackend,
} from '../../src/orchestra/spawn-backend.js';
import { DockerSpawnBackend } from '../../src/orchestra/spawn-backend-docker.js';

function route(name: string, capable: boolean): SpawnBackend {
  return {
    name,
    canDeliverWorkerCore: () => capable,
    spawn: () => undefined,
    kill: () => undefined,
    list: () => [],
    isAvailable: async () => true,
  };
}

describe('worker-core backend delivery capability', () => {
  it.each([
    ['auto', route('docker', true)],
    ['subprocess', route('subprocess', true)],
    ['tmux', route('tmux', true)],
    [undefined, route('host-adapter', true)],
  ])('retains core inline for non-explicit-Docker route %s', (requested, backend) => {
    expect(canExternalizeWorkerCore(backend, requested, 'claude')).toBe(false);
  });

  it('requires the exact Docker instance to advertise provider support', () => {
    expect(canExternalizeWorkerCore(route('docker', true), 'docker', 'claude')).toBe(true);
    expect(canExternalizeWorkerCore(route('docker', false), 'docker', 'claude')).toBe(false);
  });

  it('advertises only Docker Claude and enabled Docker Codex native channels', () => {
    const defaultDocker = new DockerSpawnBackend('/tmp/deckent-core-default');
    const codexDocker = new DockerSpawnBackend('/tmp/deckent-core-codex', {
      codexCoreChannel: true,
    });

    expect(defaultDocker.canDeliverWorkerCore('claude')).toBe(true);
    expect(defaultDocker.canDeliverWorkerCore('codex')).toBe(false);
    expect(codexDocker.canDeliverWorkerCore('codex')).toBe(true);
    expect(codexDocker.canDeliverWorkerCore('gemini' as ProviderName)).toBe(false);
  });
});
