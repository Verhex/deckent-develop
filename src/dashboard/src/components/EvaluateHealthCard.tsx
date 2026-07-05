// EvaluateHealthCard.tsx — born-484 EVAL-OBS-DASH observability card.
//
// Consumes GET /api/evaluate-health (src/api/evaluate-health-endpoint.ts) —
// 4 counters (EVALUATION_FAULT / EVALUATE_ABORTED / EVALUATE_PREMATURE /
// RESULT_CONTRACT_DRIFT) tallied across the last-N sprint event streams, plus
// the timestamp of the most recent tracked event. Honest about the no-fault
// case: when `clean` is true this renders a single "no faults" state, never
// four zero-value tiles dressed up as an alert. Lucide icons only, zero
// emoji (project-wide guard).
//
// i18n note: this task's scope.filesWrite does not include
// src/dashboard/src/i18n/{en,tr}.ts, so labels below are hardcoded English
// rather than routed through useTranslation — flagged as tech debt in this
// task's .result notes (docImpact) for a follow-up i18n pass. Mirrors the
// same scope-driven exception already recorded in LimitsCard.tsx.

import type { LucideIcon } from "lucide-react";
import { Activity, CheckCircle2, ShieldAlert, XCircle, AlertTriangle, GitBranch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.js";
import { SkeletonCard } from "./Skeleton.js";
import { useApi } from "../hooks/useApi.js";

export type EvaluateHealthChannelKey =
  | "EVALUATION_FAULT"
  | "EVALUATE_ABORTED"
  | "EVALUATE_PREMATURE"
  | "RESULT_CONTRACT_DRIFT";

export type EvaluateHealthCounts = Record<EvaluateHealthChannelKey, number>;

export interface EvaluateHealthResponse {
  counts: EvaluateHealthCounts;
  lastEventAt: string | null;
  sprintsScanned: number;
  clean: boolean;
  generatedAt: string;
}

const ZERO_COUNTS: EvaluateHealthCounts = {
  EVALUATION_FAULT: 0,
  EVALUATE_ABORTED: 0,
  EVALUATE_PREMATURE: 0,
  RESULT_CONTRACT_DRIFT: 0,
};

interface CounterMeta {
  key: EvaluateHealthChannelKey;
  label: string;
  icon: LucideIcon;
}

const COUNTER_META: CounterMeta[] = [
  { key: "EVALUATION_FAULT", label: "Evaluation Fault", icon: ShieldAlert },
  { key: "EVALUATE_ABORTED", label: "Evaluate Aborted", icon: XCircle },
  { key: "EVALUATE_PREMATURE", label: "Evaluate Premature", icon: AlertTriangle },
  { key: "RESULT_CONTRACT_DRIFT", label: "Result Contract Drift", icon: GitBranch },
];

function formatLastEventAt(iso: string | null): string {
  if (!iso) return "No events recorded";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return `Last event: ${iso}`;
  return `Last event: ${date.toLocaleString()}`;
}

function CounterTile({ meta, count }: { meta: CounterMeta; count: number }) {
  const Icon = meta.icon;
  const hasFault = count > 0;
  return (
    <div
      data-testid={`evaluate-health-counter-${meta.key}`}
      className={`flex items-center justify-between rounded-md px-3 py-2 ${
        hasFault ? "bg-red-950/40" : "bg-zinc-800/40"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={`h-4 w-4 shrink-0 ${hasFault ? "text-red-400" : "text-zinc-500"}`} />
        <span className="text-sm font-medium text-zinc-300 truncate">{meta.label}</span>
      </div>
      <span
        data-testid={`evaluate-health-count-${meta.key}`}
        className={`font-mono text-sm font-semibold ${hasFault ? "text-red-300" : "text-zinc-400"}`}
      >
        {count}
      </span>
    </div>
  );
}

export function EvaluateHealthCard() {
  const { data, loading } = useApi<EvaluateHealthResponse>("/api/evaluate-health");

  if (loading) {
    return <SkeletonCard className="h-44" />;
  }

  const counts = data?.counts ?? ZERO_COUNTS;
  const clean = data?.clean ?? true;
  const lastEventAt = data?.lastEventAt ?? null;

  return (
    <Card
      data-testid="evaluate-health-card"
      className="border-zinc-800 bg-zinc-900 shadow-lg shadow-zinc-950/50"
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-zinc-100 text-sm font-semibold uppercase tracking-wide">
          <Activity className="h-4 w-4 text-zinc-400" />
          Evaluate Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        {clean ? (
          <div
            data-testid="evaluate-health-clean"
            className="flex items-center gap-3 rounded-md bg-zinc-800/40 px-4 py-6"
          >
            <CheckCircle2 className="h-6 w-6 shrink-0 text-green-400" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-200">No evaluate-health faults</p>
              <p className="text-xs text-zinc-500">{formatLastEventAt(lastEventAt)}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div data-testid="evaluate-health-counters" className="grid grid-cols-2 gap-2">
              {COUNTER_META.map((meta) => (
                <CounterTile key={meta.key} meta={meta} count={counts[meta.key]} />
              ))}
            </div>
            <p data-testid="evaluate-health-last-event" className="text-xs text-zinc-500">
              {formatLastEventAt(lastEventAt)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default EvaluateHealthCard;
