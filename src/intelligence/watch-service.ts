import { formatAlert } from './alert-formatter.js';
import { deriveBaseline, type EvidenceFileReader } from './baseline.js';
import {
  compareSignal,
  type GapDimension,
  type RelativeClassification,
} from './comparison.js';
import {
  deriveEventFingerprint,
  type CompetitorEvent,
  type CompetitorEventInput,
} from './event-history.js';
import { evaluateSignificance } from './significance-gate.js';
import {
  retrieveSources,
  type ConditionalFetchState,
  type SourceDefinition,
  type SourceFetch,
  type SourceRetrievalResult,
} from './source-retrieval.js';
import type { CapabilityStatus, EvidenceRefs } from './types.js';

export interface WatchSignal {
  signalId: string;
  competitor: string;
  eventType: string;
  source: string;
  publicationDate: string;
  affectedCapability: string;
  competitorStatus: CapabilityStatus;
  evidenceRefs: EvidenceRefs;
  dimensions: Partial<Record<GapDimension, string>>;
  previousByDimension: Partial<Record<GapDimension, RelativeClassification>>;
  confidence: number;
  action: string;
  dagCatchUp?: boolean;
  differentApproach?: boolean;
  applicable?: boolean;
}

export interface WatchHistoryStore {
  getEvent(fingerprint: CompetitorEvent['fingerprint']):
    Promise<CompetitorEvent | undefined> | CompetitorEvent | undefined;
  writeEvent(event: CompetitorEvent): Promise<void> | void;
  markReported(
    fingerprint: CompetitorEvent['fingerprint'],
    reportedDate: string,
  ): Promise<void> | void;
  getSourceCursor(sourceId: string):
    Promise<ConditionalFetchState | undefined> | ConditionalFetchState | undefined;
  saveSourceCursor(
    sourceId: string,
    cursor: ConditionalFetchState,
  ): Promise<void> | void;
}

export interface WatchOutbox {
  enqueueOwnerNotification(input: {
    id: string;
    kind: 'intelligence-alert';
    sprintId: string;
    title: string;
    message: string;
    lang: 'tr';
    createdAt: string;
  }): Promise<void> | void;
}

export interface WatchServiceDependencies {
  readEvidence: EvidenceFileReader;
  fetch: SourceFetch;
  store: WatchHistoryStore;
  outbox: WatchOutbox;
  now: () => Date;
  interpretSource: (result: SourceRetrievalResult) => readonly WatchSignal[];
}

export interface WatchServiceInput {
  sources: readonly SourceDefinition[];
  dryRun?: boolean;
}

export interface PlannedAlert {
  id: string;
  fingerprint: CompetitorEvent['fingerprint'];
  text: string;
  state: 'enqueued' | 'would-enqueue';
}

export interface WatchIssue {
  sourceId?: string;
  signalId?: string;
  stage: 'source' | 'baseline' | 'history' | 'outbox';
  message: string;
}

export interface WatchServiceResult {
  dryRun: boolean;
  alerts: readonly PlannedAlert[];
  suppressedSignalIds: readonly string[];
  sourceResults: readonly SourceRetrievalResult[];
  issues: readonly WatchIssue[];
}

/**
 * Run the complete watch pipeline. Durable notification enqueue deliberately
 * precedes `reportedDate`; a replay therefore reuses the same outbox id and can
 * safely finish the history update after a crash.
 */
export async function runWatchService(
  input: WatchServiceInput,
  dependencies: WatchServiceDependencies,
): Promise<WatchServiceResult> {
  const dryRun = input.dryRun === true;
  const occurredAt = dependencies.now().toISOString();
  const baseline = await deriveBaseline(undefined, dependencies.readEvidence);
  const sourcesWithCursors = await Promise.all(input.sources.map(async (source) => ({
    ...source,
    conditional: await dependencies.store.getSourceCursor(source.sourceId)
      ?? source.conditional,
  })));
  const sourceResults = await retrieveSources(sourcesWithCursors, dependencies.fetch);
  const alerts: PlannedAlert[] = [];
  const suppressedSignalIds: string[] = [];
  const issues: WatchIssue[] = [];

  for (const result of sourceResults) {
    if (result.status === 'hold') {
      issues.push({
        sourceId: result.source.sourceId,
        stage: 'source',
        message: result.reason,
      });
      continue;
    }

    if (!dryRun) {
      await dependencies.store.saveSourceCursor(
        result.source.sourceId,
        result.conditional,
      );
    }
    if (result.status !== 'ok') continue;

    for (const signal of dependencies.interpretSource(result)) {
      const baselineEntry = baseline.entries.find(
        (entry) => entry.capabilityId === signal.affectedCapability
          || entry.domain === signal.affectedCapability,
      );
      if (baselineEntry === undefined) {
        issues.push({
          signalId: signal.signalId,
          stage: 'baseline',
          message: `Baseline entry missing: ${signal.affectedCapability}`,
        });
        continue;
      }

      const comparison = compareSignal({
        signalId: signal.signalId,
        baselineStatus: baselineEntry.status,
        competitorStatus: signal.competitorStatus,
        evidenceRefs: signal.evidenceRefs,
        dimensions: signal.dimensions,
        ...(signal.differentApproach === undefined
          ? {} : { differentApproach: signal.differentApproach }),
        ...(signal.applicable === undefined ? {} : { applicable: signal.applicable }),
      });
      const significance = evaluateSignificance({
        comparison,
        previousByDimension: signal.previousByDimension,
        baselineStatus: baselineEntry.status,
        ...(signal.dagCatchUp === undefined ? {} : { dagCatchUp: signal.dagCatchUp }),
      });
      if (significance.kind === 'suppressed') {
        suppressedSignalIds.push(signal.signalId);
        continue;
      }

      const eventInput: CompetitorEventInput = {
        competitor: signal.competitor,
        eventType: signal.eventType,
        source: signal.source,
        publicationDate: signal.publicationDate,
        detectionDate: occurredAt,
        reportedDate: '',
        affectedCapability: signal.affectedCapability,
        previousClassification: comparison.classification,
        confidence: signal.confidence,
      };
      const fingerprint = deriveEventFingerprint(eventInput);
      const existing = await dependencies.store.getEvent(fingerprint);
      if (existing?.reportedDate) {
        suppressedSignalIds.push(signal.signalId);
        continue;
      }
      const event: CompetitorEvent = existing ?? { ...eventInput, fingerprint };
      const formatted = formatAlert({
        occurredAt,
        event,
        baseline: baselineEntry,
        comparison,
        action: signal.action,
      });
      if (!formatted.ok) {
        issues.push({
          signalId: signal.signalId,
          stage: 'baseline',
          message: formatted.error.message,
        });
        continue;
      }

      const notificationId = `competitor-watch:${fingerprint.slice('sha256:'.length)}`;
      if (dryRun) {
        alerts.push({
          id: notificationId,
          fingerprint,
          text: formatted.text,
          state: 'would-enqueue',
        });
        continue;
      }

      try {
        if (existing === undefined) await dependencies.store.writeEvent(event);
        await dependencies.outbox.enqueueOwnerNotification({
          id: notificationId,
          kind: 'intelligence-alert',
          sprintId: 'competitor-watch',
          title: `Rakip alarmı: ${signal.competitor}`,
          message: formatted.text,
          lang: 'tr',
          createdAt: occurredAt,
        });
        await dependencies.store.markReported(fingerprint, occurredAt);
        alerts.push({
          id: notificationId,
          fingerprint,
          text: formatted.text,
          state: 'enqueued',
        });
      } catch (error: unknown) {
        issues.push({
          signalId: signal.signalId,
          stage: existing === undefined ? 'history' : 'outbox',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return { dryRun, alerts, suppressedSignalIds, sourceResults, issues };
}
