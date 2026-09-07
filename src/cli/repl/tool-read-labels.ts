import type { ToolReadKind } from './tool-read-model.js';

/** Required caller-injected strings; the card/parser own no prose defaults. */
export interface ToolReadLabels {
  readonly title: Record<ToolReadKind, string>;
  readonly sectionAuthority: string;
  readonly sectionSummary: string;
  readonly sectionCapture: string;
  readonly sectionExecution: string;
  readonly sectionStderr: string;
  readonly snapshot: string;
  readonly unknownCount: string;
  readonly loading: string;
  readonly empty: string;
  readonly schemaUnknown: string;
  readonly partial: string;
  readonly rawComplete: string;
  readonly unavailable: string;
  readonly executionFailed: string;
  readonly executionSignal: string;
  readonly executionStderr: string;
  readonly detailHint: string;
  readonly listHint: string;
  readonly page: string;
  readonly moreAbove: string;
  readonly moreBelow: string;
  readonly field: (key: string, value: string) => string;
  readonly reason: (code: string) => string;
}
