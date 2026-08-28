import type { Command } from 'commander';

import type { CapabilityRegistry } from '../../core/capability-broker.js';
import type { FlowRegistry } from '../../core/flow-registry.js';
import type { CompetitorEvent } from '../../intelligence/event-history.js';
import type { SourceDefinition } from '../../intelligence/source-retrieval.js';
import {
  WATCH_CAPABILITY_ID,
  type WatchCapabilityOutcome,
} from '../../intelligence/watch-capability.js';
import {
  registerWatchFlow,
  WATCH_FLOW_ID,
} from '../../intelligence/watch-flow.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

export interface IntelligenceStatus {
  readonly events: readonly CompetitorEvent[];
  readonly lastRun: Date | undefined;
}

export interface IntelligenceCommandDependencies {
  readonly capabilityRegistry: Pick<CapabilityRegistry, 'invoke'>;
  readonly flowRegistry: FlowRegistry;
  readonly loadSources: (fixture: string | undefined) =>
    Promise<readonly SourceDefinition[]>;
  readonly readStatus: () => Promise<IntelligenceStatus> | IntelligenceStatus;
  readonly write: (message: string) => void;
  readonly language?: () => string;
}

interface WatchRunOptions {
  readonly dryRun?: boolean;
  readonly input?: string;
}

/**
 * Register the presentation boundary. Dependencies own I/O and persistence;
 * this module only selects canonical intelligence capabilities and localizes
 * labels and result prose.
 */
export function registerIntelligence(
  program: Command,
  dependencies: IntelligenceCommandDependencies,
): void {
  const language = dependencies.language ?? (() => getLanguage(undefined));
  const intelligence = program
    .command('intelligence')
    .description(getMessage('cli.intelligence.desc', language()));

  const watch = intelligence
    .command('watch')
    .description(getMessage('cli.intelligence.watch.desc', language()));

  watch
    .command('run')
    .description(getMessage('cli.intelligence.watch.run.desc', language()))
    .option(
      '--dry-run',
      getMessage('cli.intelligence.watch.run.opt.dry_run', language()),
    )
    .option(
      '--input <fixture>',
      getMessage('cli.intelligence.watch.run.opt.input', language()),
    )
    .action(async (options: WatchRunOptions) => {
      try {
        const sources = await dependencies.loadSources(options.input);
        const invocation = await dependencies.capabilityRegistry.invoke({
          capability: WATCH_CAPABILITY_ID,
          args: { sources, dryRun: options.dryRun === true },
        });
        if (!invocation.ok) throw new Error(invocation.error);

        const outcome = invocation.value as WatchCapabilityOutcome;
        if (outcome.kind !== 'completed') {
          dependencies.write(getMessage(
            'cli.intelligence.watch.run.not_completed',
            language(),
            { kind: outcome.kind },
          ));
          return;
        }

        dependencies.write(getMessage(
          'cli.intelligence.watch.run.completed',
          language(),
          {
            alertCount: String(outcome.alertCount),
            issueCount: String(outcome.issueCount),
            dryRun: String(outcome.dryRun),
          },
        ));
      } catch (error: unknown) {
        writeFailure(dependencies, language(), error);
      }
    });

  intelligence
    .command('schedule')
    .description(getMessage('cli.intelligence.schedule.desc', language()))
    .action(() => {
      try {
        const existed = dependencies.flowRegistry.getFlow(WATCH_FLOW_ID) !== undefined;
        const flow = registerWatchFlow(dependencies.flowRegistry);
        dependencies.write(getMessage(
          existed
            ? 'cli.intelligence.schedule.existing'
            : 'cli.intelligence.schedule.registered',
          language(),
          {
            id: flow.id,
            cron: flow.cronExpr,
            timezone: flow.timezone ?? '',
          },
        ));
      } catch (error: unknown) {
        writeFailure(dependencies, language(), error);
      }
    });

  intelligence
    .command('status')
    .description(getMessage('cli.intelligence.status.desc', language()))
    .action(async () => {
      try {
        const status = await dependencies.readStatus();
        dependencies.write(getMessage(
          'cli.intelligence.status.summary',
          language(),
          {
            eventCount: String(status.events.length),
            lastRun: status.lastRun?.toISOString()
              ?? getMessage('cli.intelligence.status.never', language()),
          },
        ));
      } catch (error: unknown) {
        writeFailure(dependencies, language(), error);
      }
    });
}

function writeFailure(
  dependencies: IntelligenceCommandDependencies,
  language: string,
  error: unknown,
): void {
  dependencies.write(getMessage('cli.intelligence.error', language, {
    message: error instanceof Error ? error.message : String(error),
  }));
}
