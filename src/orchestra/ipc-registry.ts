// ═══ IPC Channel Registry ══════════════════════════════════════════
// Extracted from sprint-controller.ts — manages WorkerChannel registry
// for subprocess-based workers. tmux workers use file-based heartbeats.

import { ChannelRegistry } from '../agents/worker-ipc.js';
import type { WorkerChannel } from '../agents/worker-ipc.js';

/**
 * Module-level registry that maps taskId -> WorkerChannel.
 * Populated when workers are spawned via child_process.fork (subprocess backend).
 * tmux-based workers do not populate this registry -- they use file-based heartbeats.
 */
const _channelRegistry = new ChannelRegistry();

/**
 * Returns the module-level ChannelRegistry (used by Brain and tests).
 * @internal Used only within orchestra/ — not part of the public API surface.
 */
export function getChannelRegistry(): ChannelRegistry {
  return _channelRegistry;
}

/**
 * Register a WorkerChannel for a given taskId.
 * @internal Used only within orchestra/ — not part of the public API surface.
 */
export function registerWorkerChannel(taskId: string, channel: WorkerChannel): void {
  _channelRegistry.register(taskId, channel);
}

/**
 * Unregister and close the WorkerChannel for a given taskId.
 * @internal Used only within orchestra/ — not part of the public API surface.
 */
export function unregisterWorkerChannel(taskId: string): void {
  _channelRegistry.remove(taskId);
}
