/**
 * tests/orchestra/ipc-registry.test.ts
 *
 * Tests for the extracted IPC channel registry module.
 * Covers: getChannelRegistry, registerWorkerChannel, unregisterWorkerChannel
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('../../src/agents/worker-ipc.js', () => {
  const mockRegistry = {
    register: vi.fn(),
    remove: vi.fn(),
    get: vi.fn(),
  };
  return {
    ChannelRegistry: vi.fn().mockImplementation(() => mockRegistry),
    __mockRegistry: mockRegistry,
  };
});

import {
  getChannelRegistry,
  registerWorkerChannel,
  unregisterWorkerChannel,
} from '../../src/orchestra/ipc-registry.js';

describe('ipc-registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getChannelRegistry', () => {
    it('should return a ChannelRegistry instance', () => {
      const registry = getChannelRegistry();
      expect(registry).toBeDefined();
      expect(typeof registry.register).toBe('function');
      expect(typeof registry.remove).toBe('function');
      expect(typeof registry.get).toBe('function');
    });

    it('should return the same instance on multiple calls (singleton)', () => {
      const r1 = getChannelRegistry();
      const r2 = getChannelRegistry();
      expect(r1).toBe(r2);
    });
  });

  describe('registerWorkerChannel', () => {
    it('should delegate to registry.register()', () => {
      const mockChannel = { pause: vi.fn(), resume: vi.fn() } as unknown as import('../../src/agents/worker-ipc.js').WorkerChannel;
      registerWorkerChannel('task-001', mockChannel);
      const registry = getChannelRegistry();
      expect(registry.register).toHaveBeenCalledWith('task-001', mockChannel);
    });
  });

  describe('unregisterWorkerChannel', () => {
    it('should delegate to registry.remove()', () => {
      unregisterWorkerChannel('task-002');
      const registry = getChannelRegistry();
      expect(registry.remove).toHaveBeenCalledWith('task-002');
    });
  });
});
