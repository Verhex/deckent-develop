// tests/core/nervous-enabled-integration.test.ts
// Sprint 148 Task 6 — Nervous System enabled=true integration tests
// Verifies that the project config activates the nervous system
// and that new-project defaults remain safely disabled.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createDefaultConfig } from '../../src/core/config.js';

// ─── Test 1: .deckent/config.json loads with enabled=true ──────────────────

describe('nervous_system enabled=true pivot (Sprint 148 T-006)', () => {
  // PR #16 made .deckent/config.json gitignored (it's a runtime file, not
  // a tracked fixture). Skip the dogfood assertion when the file is absent
  // (clean checkout / CI without a deckent init).
  const projectRoot = join(process.cwd());
  const configPath = join(projectRoot, '.deckent', 'config.json');
  const hasProjectConfig = existsSync(configPath);

  it.skipIf(!hasProjectConfig)('project config .deckent/config.json has nervous_system.enabled === true', () => {
    const raw = readFileSync(configPath, 'utf-8');
    const projectConfig = JSON.parse(raw) as { nervous_system?: { enabled?: boolean; mode?: string } };

    expect(projectConfig.nervous_system).toBeDefined();
    expect(projectConfig.nervous_system!.enabled).toBe(true);
    // Sprint 180 W3-2 (Faz 1 smoke) changed dogfood mode 'balanced' → 'strict'.
    // Test accepts any valid authority mode rather than pinning a single value.
    expect(['balanced', 'strict', 'permissive']).toContain(projectConfig.nervous_system!.mode);
  });

  // ─── Test 2: createDefaultConfig() has enabled=false ─────────────────────

  it('createDefaultConfig() returns nervous_system.enabled === false (new project safe default)', () => {
    const defaults = createDefaultConfig();

    expect(defaults.nervous_system).toBeDefined();
    expect(defaults.nervous_system!.enabled).toBe(false);
    expect(defaults.nervous_system!.mode).toBe('balanced');
  });

  // ─── Test 3: Brain boot integration — NervousObserver instantiable when enabled ──

  it('NervousObserver can be instantiated when config enabled=true (Brain boot readiness)', async () => {
    // Dynamically import NervousObserver to avoid side-effects at module load
    const { NervousObserver } = await import('../../src/nervous/observer.js');

    // Simulate Brain boot: config.nervous_system.enabled === true → instantiate observer
    const projectRoot = process.cwd();
    const observer = new NervousObserver(projectRoot);

    // Observer should exist and not be started yet (Brain controls lifecycle)
    expect(observer).toBeDefined();
    expect(observer.isStarted).toBe(false);

    // start() should succeed without throwing
    expect(() => observer.start()).not.toThrow();
    expect(observer.isStarted).toBe(true);

    // Clean up
    observer.stop();
    expect(observer.isStarted).toBe(false);
  });
});
