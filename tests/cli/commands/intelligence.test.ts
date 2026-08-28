import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  registerIntelligence,
  type IntelligenceCommandDependencies,
} from '../../../src/cli/commands/intelligence.js';
import { FlowRegistry } from '../../../src/core/flow-registry.js';
import {
  WATCH_CAPABILITY_ID,
  type WatchCapabilityOutcome,
} from '../../../src/intelligence/watch-capability.js';
import {
  WATCH_FLOW_CRON,
  WATCH_FLOW_ID,
  WATCH_FLOW_TIMEZONE,
} from '../../../src/intelligence/watch-flow.js';

const SOURCE = {
  sourceId: 'fixture',
  kind: 'official-release',
  url: 'https://fixture.example.test/releases',
  format: 'github-release-json',
} as const;

const directories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(
  outcome: WatchCapabilityOutcome = {
    kind: 'completed',
    dryRun: false,
    alertCount: 1,
    suppressedCount: 0,
    issueCount: 0,
    receipts: [],
  },
): {
  readonly program: Command;
  readonly invoke: ReturnType<typeof vi.fn>;
  readonly loadSources: ReturnType<typeof vi.fn>;
  readonly output: string[];
  readonly registry: FlowRegistry;
} {
  const directory = mkdtempSync(join(tmpdir(), 'deckent-intelligence-cli-'));
  directories.push(directory);
  const registry = new FlowRegistry(join(directory, 'flows'));
  const invoke = vi.fn(async () => ({ ok: true as const, value: outcome }));
  const loadSources = vi.fn(async () => [SOURCE]);
  const output: string[] = [];
  const dependencies: IntelligenceCommandDependencies = {
    capabilityRegistry: { invoke },
    flowRegistry: registry,
    loadSources,
    readStatus: () => ({ events: [], lastRun: undefined }),
    write: (message) => output.push(message),
    language: () => 'en',
  };
  const program = new Command().exitOverride();
  registerIntelligence(program, dependencies);
  return { program, invoke, loadSources, output, registry };
}

describe('deckent intelligence', () => {
  it('routes watch run through the scheduled flow capability id and fixture loader', async () => {
    const subject = fixture();
    await subject.program.parseAsync(
      ['intelligence', 'watch', 'run', '--input', 'sources.json'],
      { from: 'user' },
    );

    expect(subject.loadSources).toHaveBeenCalledWith('sources.json');
    expect(subject.invoke).toHaveBeenCalledOnce();
    expect(subject.invoke).toHaveBeenCalledWith({
      capability: WATCH_CAPABILITY_ID,
      args: { sources: [SOURCE], dryRun: false },
    });
    expect(subject.output[0]).toContain('Watch completed');
  });

  it('maps --dry-run to mutation-free capability mode without registering a flow', async () => {
    const subject = fixture({
      kind: 'completed',
      dryRun: true,
      alertCount: 1,
      suppressedCount: 0,
      issueCount: 0,
      receipts: [],
    });
    await subject.program.parseAsync(
      ['intelligence', 'watch', 'run', '--dry-run'],
      { from: 'user' },
    );

    expect(subject.invoke).toHaveBeenCalledWith({
      capability: WATCH_CAPABILITY_ID,
      args: { sources: [SOURCE], dryRun: true },
    });
    expect(subject.registry.listFlows()).toEqual([]);
  });

  it('ensures the canonical flow idempotently through FlowRegistry', async () => {
    const subject = fixture();
    await subject.program.parseAsync(['intelligence', 'schedule'], { from: 'user' });
    await subject.program.parseAsync(['intelligence', 'schedule'], { from: 'user' });

    expect(subject.registry.listFlows()).toHaveLength(1);
    expect(subject.registry.getFlow(WATCH_FLOW_ID)).toMatchObject({
      action: WATCH_CAPABILITY_ID,
      cronExpr: WATCH_FLOW_CRON,
      timezone: WATCH_FLOW_TIMEZONE,
    });
    expect(subject.output[0]).toContain('registered');
    expect(subject.output[1]).toContain('already registered');
  });

  it('renders injected event history and last-run state in Turkish', async () => {
    const subject = fixture();
    const status = subject.program.commands[0]?.commands
      .find((command) => command.name() === 'status');
    expect(status).toBeDefined();

    const output: string[] = [];
    const program = new Command().exitOverride();
    registerIntelligence(program, {
      capabilityRegistry: { invoke: subject.invoke },
      flowRegistry: subject.registry,
      loadSources: subject.loadSources,
      readStatus: () => ({
        events: [{} as never, {} as never],
        lastRun: new Date('2026-08-28T12:00:00.000Z'),
      }),
      write: (message) => output.push(message),
      language: () => 'tr',
    });
    await program.parseAsync(['intelligence', 'status'], { from: 'user' });

    expect(output).toEqual([
      'İzleme durumu: 2 olay; son çalışma: 2026-08-28T12:00:00.000Z.',
    ]);
  });
});
