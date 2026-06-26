// Worker Output Contract — structured result panel (spec §1.2 / Task 326-011)
//
// Renders every field group from the TaskResultV1 schema (task-result-schema.ts):
//   • Assessment header   (selfAssessment verdict + provenance)
//   • Timing             (durationMs, spawnedAt → completedAt)
//   • Tokens & Cost      (provider-agnostic; source badge; local=$0 indicator)
//   • Files changed      (git-authoritative; path/status/lines table)
//   • Tests & TSC        (passed/failed/total/coverage + tsc clean)
//   • Go-criteria        (met/not-met checklist from worker)
//   • Notes              (bounded prose)
//   • Auditor validation (second-layer status)
//
// All fields are optional — a null result renders a skeleton loading state.
// No hardcoded Turkish strings; label injection via `labels` prop (i18n-ready).

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Code2,
  FileCode2,
  FlaskConical,
  Info,
  Layers,
  MinusCircle,
  Server,
  Zap,
} from "lucide-react";
import { cn } from "../lib/utils";

// ─── Local type (mirrors TaskResultV1 from src/core/task-result-schema.ts) ──
//   The dashboard bundle cannot import from ../../core/; use a matching interface.

export interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted";
  linesAdded: number;
  linesRemoved: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  totalTokens: number;
  source?: "provider-adapter" | "tokenizer-fallback";
}

export interface CostInfo {
  usd: number;
  currency?: string;
  pricingSource?: string;
  isLocal?: boolean;
}

export interface TestsInfo {
  passed: number;
  failed: number;
  total: number;
  coverage?: number | null;
  command?: string | null;
  orchestratorVerified?: boolean;
}

export interface TscInfo {
  clean: boolean;
  errors: number;
}

export interface GoCriterion {
  id: string;
  description: string;
  met: boolean;
  evidence?: string | null;
}

export interface AuditorValidation {
  status: "OK" | "INCOMPLETE";
  checkedAt: string;
  missingFields?: string[];
}

export type SelfAssessment = "DONE" | "GO_WITH_TECH_DEBT" | "NO_GO";

/** Partial shape of TaskResultV1 — only what the panel renders. */
export interface PartialTaskResult {
  taskId?: string;
  sprintId?: string;
  workerId?: string;
  provider?: string;
  model?: string;
  modelEffort?: string;
  agent?: string | null;
  skills?: string[];
  attempt?: number;
  spawnedAt?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  filesChanged?: FileChange[];
  totalLinesAdded?: number;
  totalLinesRemoved?: number;
  diskVerified?: boolean;
  tokenUsage?: TokenUsage;
  cost?: CostInfo;
  tests?: TestsInfo;
  tsc?: TscInfo;
  selfAssessment?: SelfAssessment;
  goCriteria?: GoCriterion[];
  notes?: string;
  brainEvaluation?: SelfAssessment | null;
  honestGate?: { flagged?: boolean; violation?: string | null };
  auditorValidation?: AuditorValidation | null;
}

// ─── Label injection ──────────────────────────────────────────────────────────

export interface ResultPanelLabels {
  title: string;
  loading: string;
  sections: {
    assessment: string;
    timing: string;
    tokens: string;
    cost: string;
    files: string;
    tests: string;
    tsc: string;
    goCriteria: string;
    notes: string;
    auditor: string;
  };
  verdicts: Record<SelfAssessment, string>;
  fileStatus: Record<FileChange["status"], string>;
  tokenSource: Record<"provider-adapter" | "tokenizer-fallback", string>;
  fields: {
    duration: string;
    input: string;
    output: string;
    cacheRead: string;
    total: string;
    source: string;
    usd: string;
    local: string;
    pricingSource: string;
    passed: string;
    failed: string;
    coverage: string;
    command: string;
    clean: string;
    errors: string;
    orchestratorVerified: string;
    diskVerified: string;
    linesAdded: string;
    linesRemoved: string;
  };
}

const DEFAULT_LABELS: ResultPanelLabels = {
  title: "Task Result",
  loading: "Loading result...",
  sections: {
    assessment: "Assessment",
    timing: "Timing",
    tokens: "Tokens",
    cost: "Cost",
    files: "Files Changed",
    tests: "Tests",
    tsc: "TypeScript",
    goCriteria: "Go Criteria",
    notes: "Notes",
    auditor: "Auditor",
  },
  verdicts: {
    DONE: "Done",
    GO_WITH_TECH_DEBT: "Tech Debt",
    NO_GO: "No-Go",
  },
  fileStatus: {
    added: "added",
    modified: "modified",
    deleted: "deleted",
  },
  tokenSource: {
    "provider-adapter": "provider",
    "tokenizer-fallback": "estimated",
  },
  fields: {
    duration: "Duration",
    input: "Input",
    output: "Output",
    cacheRead: "Cache read",
    total: "Total",
    source: "Source",
    usd: "Cost (USD)",
    local: "Local",
    pricingSource: "Pricing",
    passed: "Passed",
    failed: "Failed",
    coverage: "Coverage",
    command: "Command",
    clean: "Clean",
    errors: "Errors",
    orchestratorVerified: "Orch. verified",
    diskVerified: "Disk verified",
    linesAdded: "+Lines",
    linesRemoved: "-Lines",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function formatTs(iso: string | undefined): string {
  if (!iso) return "—";
  return iso.slice(11, 19);
}

function formatUsd(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.001) return `$${usd.toFixed(6)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(4)}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, label }: { icon: React.FC<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Icon className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{label}</span>
    </div>
  );
}

function SkeletonRow() {
  return <div className="h-4 bg-zinc-800 rounded animate-pulse w-full" />;
}

function AssessmentBadge({ verdict, labels }: { verdict: SelfAssessment; labels: ResultPanelLabels }) {
  const cfg: Record<SelfAssessment, { cls: string; Icon: typeof CheckCircle2 }> = {
    DONE: { cls: "border-green-700 bg-green-900/40 text-green-300", Icon: CheckCircle2 },
    GO_WITH_TECH_DEBT: { cls: "border-amber-700 bg-amber-900/40 text-amber-300", Icon: AlertTriangle },
    NO_GO: { cls: "border-red-700 bg-red-900/40 text-red-300", Icon: AlertCircle },
  };
  const { cls, Icon } = cfg[verdict];
  return (
    <span
      className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold", cls)}
      data-testid="verdict-badge"
    >
      <Icon className="h-3 w-3" aria-hidden />
      {labels.verdicts[verdict]}
    </span>
  );
}

function FileStatusBadge({ status, labels }: { status: FileChange["status"]; labels: ResultPanelLabels }) {
  const cls: Record<FileChange["status"], string> = {
    added: "bg-green-900/50 text-green-400",
    modified: "bg-blue-900/50 text-blue-400",
    deleted: "bg-red-900/50 text-red-400",
  };
  return (
    <span className={cn("text-xs px-1.5 py-0.5 rounded font-mono", cls[status])}>
      {labels.fileStatus[status]}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface ResultPanelProps {
  /** The task result to display. `null` renders a skeleton loading state. */
  result: PartialTaskResult | null | undefined;
  /** Label overrides for i18n. Pass t(key) strings from the caller. */
  labels?: Partial<ResultPanelLabels>;
  className?: string;
}

export function ResultPanel({ result, labels: labelOverrides, className }: ResultPanelProps) {
  const labels: ResultPanelLabels = {
    ...DEFAULT_LABELS,
    ...labelOverrides,
    sections: { ...DEFAULT_LABELS.sections, ...labelOverrides?.sections },
    verdicts: { ...DEFAULT_LABELS.verdicts, ...labelOverrides?.verdicts },
    fileStatus: { ...DEFAULT_LABELS.fileStatus, ...labelOverrides?.fileStatus },
    tokenSource: { ...DEFAULT_LABELS.tokenSource, ...labelOverrides?.tokenSource },
    fields: { ...DEFAULT_LABELS.fields, ...labelOverrides?.fields },
  };

  if (result === null || result === undefined) {
    return (
      <div
        className={cn(
          "rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 space-y-3",
          className,
        )}
        data-testid="result-panel-loading"
      >
        <div className="flex items-center gap-2 mb-2">
          <Layers className="h-4 w-4 text-zinc-600" aria-hidden />
          <span className="text-sm font-semibold text-zinc-500">{labels.loading}</span>
        </div>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <div className="h-4 bg-zinc-800 rounded animate-pulse w-2/3" />
      </div>
    );
  }

  const hasVerdict = !!result.selfAssessment;
  const hasBrainVerdict = result.brainEvaluation !== null && result.brainEvaluation !== undefined;
  const hasTokens = !!result.tokenUsage;
  const hasCost = !!result.cost;
  const hasFiles = (result.filesChanged?.length ?? 0) > 0;
  const hasTests = !!result.tests;
  const hasTsc = !!result.tsc;
  const hasGoCriteria = (result.goCriteria?.length ?? 0) > 0;
  const hasNotes = !!result.notes?.trim();
  const hasAuditor = !!result.auditorValidation;

  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-800 bg-zinc-900/80 divide-y divide-zinc-800/60",
        className,
      )}
      data-testid="result-panel"
    >
      {/* ── Assessment ─────────────────────────────────────────────────────── */}
      {hasVerdict && (
        <section className="p-3 space-y-2" data-testid="section-assessment">
          <SectionHeader icon={Layers} label={labels.sections.assessment} />
          <div className="flex flex-wrap items-center gap-2">
            <AssessmentBadge verdict={result.selfAssessment!} labels={labels} />
            {hasBrainVerdict && (
              <span className="text-xs text-zinc-500">
                Brain: <AssessmentBadge verdict={result.brainEvaluation!} labels={labels} />
              </span>
            )}
          </div>

          {/* Provenance: provider / model / agent */}
          {(result.provider || result.model || result.agent) && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500 mt-1">
              {result.provider && (
                <span>
                  <Server className="h-3 w-3 inline mr-0.5" aria-hidden />
                  {result.provider}
                </span>
              )}
              {result.model && <span>{result.model}</span>}
              {result.modelEffort && <span>({result.modelEffort})</span>}
              {result.agent && <span>agent: {result.agent}</span>}
              {result.attempt !== undefined && result.attempt > 1 && (
                <span>attempt #{result.attempt}</span>
              )}
              {result.diskVerified && (
                <span
                  className="text-green-500"
                  title={labels.fields.diskVerified}
                >
                  {labels.fields.diskVerified}
                </span>
              )}
            </div>
          )}
          {result.honestGate?.flagged && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400 mt-1">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              <span>Honest gate: {result.honestGate.violation ?? "flagged"}</span>
            </div>
          )}
        </section>
      )}

      {/* ── Timing ─────────────────────────────────────────────────────────── */}
      {(result.durationMs !== undefined || result.completedAt) && (
        <section className="p-3 space-y-1" data-testid="section-timing">
          <SectionHeader icon={Clock} label={labels.sections.timing} />
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            {result.durationMs !== undefined && (
              <>
                <span className="text-zinc-500">{labels.fields.duration}</span>
                <span className="font-mono text-zinc-300">{formatMs(result.durationMs)}</span>
              </>
            )}
            {result.spawnedAt && (
              <>
                <span className="text-zinc-500">Start</span>
                <span className="font-mono text-zinc-400">{formatTs(result.startedAt ?? result.spawnedAt)}</span>
              </>
            )}
            {result.completedAt && (
              <>
                <span className="text-zinc-500">End</span>
                <span className="font-mono text-zinc-400">{formatTs(result.completedAt)}</span>
              </>
            )}
          </div>
        </section>
      )}

      {/* ── Tokens ─────────────────────────────────────────────────────────── */}
      {hasTokens && (
        <section className="p-3 space-y-1" data-testid="section-tokens">
          <SectionHeader icon={Zap} label={labels.sections.tokens} />
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <span className="text-zinc-500">{labels.fields.input}</span>
            <span className="font-mono text-zinc-300">{result.tokenUsage!.inputTokens.toLocaleString()}</span>

            <span className="text-zinc-500">{labels.fields.output}</span>
            <span className="font-mono text-zinc-300">{result.tokenUsage!.outputTokens.toLocaleString()}</span>

            {(result.tokenUsage!.cacheReadTokens ?? 0) > 0 && (
              <>
                <span className="text-zinc-500">{labels.fields.cacheRead}</span>
                <span className="font-mono text-zinc-400">{(result.tokenUsage!.cacheReadTokens ?? 0).toLocaleString()}</span>
              </>
            )}

            <span className="text-zinc-500">{labels.fields.total}</span>
            <span className="font-mono text-zinc-200 font-semibold">{result.tokenUsage!.totalTokens.toLocaleString()}</span>

            {result.tokenUsage!.source && (
              <>
                <span className="text-zinc-500">{labels.fields.source}</span>
                <span className={cn(
                  "text-xs px-1 rounded",
                  result.tokenUsage!.source === "provider-adapter"
                    ? "bg-green-900/40 text-green-400"
                    : "bg-amber-900/40 text-amber-400",
                )}>
                  {labels.tokenSource[result.tokenUsage!.source]}
                </span>
              </>
            )}
          </div>
        </section>
      )}

      {/* ── Cost ───────────────────────────────────────────────────────────── */}
      {hasCost && (
        <section className="p-3 space-y-1" data-testid="section-cost">
          <SectionHeader icon={Info} label={labels.sections.cost} />
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <span className="text-zinc-500">{labels.fields.usd}</span>
            <span className={cn("font-mono", result.cost!.isLocal ? "text-zinc-500" : "text-zinc-300")}>
              {result.cost!.isLocal ? (
                <span title={labels.fields.local}>{labels.fields.local} ($0)</span>
              ) : (
                formatUsd(result.cost!.usd)
              )}
            </span>

            {result.cost!.pricingSource && (
              <>
                <span className="text-zinc-500">{labels.fields.pricingSource}</span>
                <span className="text-zinc-400">{result.cost!.pricingSource}</span>
              </>
            )}
          </div>
        </section>
      )}

      {/* ── Files Changed ──────────────────────────────────────────────────── */}
      {hasFiles && (
        <section className="p-3 space-y-2" data-testid="section-files">
          <SectionHeader icon={FileCode2} label={`${labels.sections.files} (${result.filesChanged!.length})`} />
          <div className="space-y-1">
            {result.filesChanged!.map((f) => (
              <div
                key={f.path}
                className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center text-xs"
                data-testid="file-row"
              >
                <span className="font-mono text-zinc-300 truncate" title={f.path}>
                  {f.path.split("/").pop() ?? f.path}
                </span>
                <FileStatusBadge status={f.status} labels={labels} />
                <span className="text-green-500 font-mono">+{f.linesAdded}</span>
                <span className="text-red-500 font-mono">-{f.linesRemoved}</span>
              </div>
            ))}
            {(result.totalLinesAdded !== undefined || result.totalLinesRemoved !== undefined) && (
              <div className="flex gap-3 text-xs mt-1 pt-1 border-t border-zinc-800/60">
                {result.totalLinesAdded !== undefined && (
                  <span className="text-green-500 font-mono">
                    {labels.fields.linesAdded}: +{result.totalLinesAdded}
                  </span>
                )}
                {result.totalLinesRemoved !== undefined && (
                  <span className="text-red-500 font-mono">
                    {labels.fields.linesRemoved}: -{result.totalLinesRemoved}
                  </span>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Tests ──────────────────────────────────────────────────────────── */}
      {hasTests && (
        <section className="p-3 space-y-1" data-testid="section-tests">
          <SectionHeader icon={FlaskConical} label={labels.sections.tests} />
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <span className="text-zinc-500">{labels.fields.passed}</span>
            <span className="font-mono text-green-400">{result.tests!.passed}</span>

            <span className="text-zinc-500">{labels.fields.failed}</span>
            <span className={cn("font-mono", result.tests!.failed > 0 ? "text-red-400" : "text-zinc-500")}>
              {result.tests!.failed}
            </span>

            <span className="text-zinc-500">Total</span>
            <span className="font-mono text-zinc-300">{result.tests!.total}</span>

            {result.tests!.coverage !== null && result.tests!.coverage !== undefined && (
              <>
                <span className="text-zinc-500">{labels.fields.coverage}</span>
                <span className="font-mono text-zinc-300">{result.tests!.coverage.toFixed(1)}%</span>
              </>
            )}

            {result.tests!.command && (
              <>
                <span className="text-zinc-500">{labels.fields.command}</span>
                <span className="font-mono text-zinc-400 text-xs truncate" title={result.tests!.command}>
                  {result.tests!.command}
                </span>
              </>
            )}
          </div>
        </section>
      )}

      {/* ── TSC ────────────────────────────────────────────────────────────── */}
      {hasTsc && (
        <section className="p-3 space-y-1" data-testid="section-tsc">
          <SectionHeader icon={Code2} label={labels.sections.tsc} />
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <span className="text-zinc-500">{labels.fields.clean}</span>
            <span className={result.tsc!.clean ? "text-green-400" : "text-red-400"}>
              {result.tsc!.clean ? "yes" : "no"}
            </span>
            {!result.tsc!.clean && (
              <>
                <span className="text-zinc-500">{labels.fields.errors}</span>
                <span className="font-mono text-red-400">{result.tsc!.errors}</span>
              </>
            )}
          </div>
        </section>
      )}

      {/* ── Go Criteria ────────────────────────────────────────────────────── */}
      {hasGoCriteria && (
        <section className="p-3 space-y-1.5" data-testid="section-go-criteria">
          <SectionHeader icon={CheckCircle2} label={labels.sections.goCriteria} />
          <ul className="space-y-1">
            {result.goCriteria!.map((c) => (
              <li key={c.id} className="flex items-start gap-1.5 text-xs">
                {c.met ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" aria-hidden />
                ) : (
                  <MinusCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" aria-hidden />
                )}
                <span className={c.met ? "text-zinc-300" : "text-zinc-500"}>{c.description}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Notes ──────────────────────────────────────────────────────────── */}
      {hasNotes && (
        <section className="p-3" data-testid="section-notes">
          <SectionHeader icon={Info} label={labels.sections.notes} />
          <p className="text-xs text-zinc-400 whitespace-pre-wrap break-words leading-5">
            {result.notes}
          </p>
        </section>
      )}

      {/* ── Auditor ────────────────────────────────────────────────────────── */}
      {hasAuditor && (
        <section className="p-3 space-y-1" data-testid="section-auditor">
          <SectionHeader icon={AlertCircle} label={labels.sections.auditor} />
          <div className="flex items-center gap-2 text-xs">
            <span
              className={cn(
                "px-1.5 py-0.5 rounded font-semibold",
                result.auditorValidation!.status === "OK"
                  ? "bg-green-900/40 text-green-400"
                  : "bg-amber-900/40 text-amber-400",
              )}
            >
              {result.auditorValidation!.status}
            </span>
            <span className="text-zinc-500">{formatTs(result.auditorValidation!.checkedAt)}</span>
          </div>
          {(result.auditorValidation!.missingFields?.length ?? 0) > 0 && (
            <ul className="space-y-0.5 mt-1">
              {result.auditorValidation!.missingFields!.map((f) => (
                <li key={f} className="font-mono text-xs text-amber-400">
                  {f}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
