import type { ToolRegistry } from './registry.js';

export type ToolExposureKind = 'core' | 'discoverable';

declare module './types.js' {
  interface ToolDefinition {
    /** Provider-surface policy; omitted definitions are discoverable by default. */
    exposure?: ToolExposureKind;
  }
}

export type ToolRevealResult = 'revealed' | 'already-revealed' | 'unknown';

export interface ToolExposure {
  isExposed(name: string): boolean;
  reveal(name: string): ToolRevealResult;
  revealedNames(): string[];
}

/**
 * Creates one session's monotonic provider-tool exposure view.
 *
 * The registry is consulted live so the view remains bounded by real definitions
 * while still supporting registries that are populated after this object is made.
 */
export function createToolExposure(
  opts: { progressive: boolean },
  registry: Pick<ToolRegistry, 'get'>,
): ToolExposure {
  const revealed = new Set<string>();

  return {
    isExposed(name) {
      if (!opts.progressive) return true;
      const definition = registry.get(name);
      return definition?.exposure === 'core' || revealed.has(name);
    },

    reveal(name) {
      if (!registry.get(name)) return 'unknown';
      if (revealed.has(name)) return 'already-revealed';
      revealed.add(name);
      return 'revealed';
    },

    revealedNames() {
      return [...revealed];
    },
  };
}
