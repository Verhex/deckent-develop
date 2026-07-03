// LimitsCard.tsx — subscription-window usage card (DASH-LIMITS-CARD).
//
// Consumes GET /api/limits (src/api/limits-endpoint.ts) — 3 window bars
// (session / week (all models) / week (Fable)) with reset times, colored by
// verdict (ok/warn/block). Honest about probe unavailability: never renders
// fabricated 0% bars when the probe fails — shows an explicit empty-state
// instead. Lucide icons only, zero emoji (project-wide guard).
//
// i18n note: scope.filesWrite for this task does not include
// src/dashboard/src/i18n/{en,tr}.ts, so the labels below are hardcoded
// English rather than routed through useTranslation — flagged as tech debt
// in this task's .result notes (docImpact) for a follow-up i18n pass.

import { AlertTriangle, Gauge } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.js";
import { SkeletonCard } from "./Skeleton.js";
import EmptyState from "./EmptyState.js";
import { useTranslation } from "../i18n/LanguageProvider.js";
import { useApi } from "../hooks/useApi.js";

export type LimitsWindowName = "session" | "week_all" | "week_fable";
export type LimitsVerdict = "ok" | "warn" | "block";

export interface LimitsResetAt {
  text: string;
  timezone: string | null;
}

export interface LimitsWindowView {
  name: LimitsWindowName;
  pct: number;
  resetAt: LimitsResetAt | null;
  verdict: LimitsVerdict;
}

export interface LimitsResponse {
  unavailable: boolean;
  reason: string | null;
  windows: LimitsWindowView[];
}

const WINDOW_LABELS: Record<LimitsWindowName, string> = {
  session: "Session",
  week_all: "Week (all models)",
  week_fable: "Week (Fable)",
};

const VERDICT_BAR_COLOR: Record<LimitsVerdict, string> = {
  ok: "bg-blue-400",
  warn: "bg-yellow-400",
  block: "bg-red-500",
};

function formatResetAt(resetAt: LimitsResetAt | null): string {
  if (!resetAt) return "No reset time reported";
  return resetAt.timezone ? `Resets ${resetAt.text} (${resetAt.timezone})` : `Resets ${resetAt.text}`;
}

function WindowBar({ window }: { window: LimitsWindowView }) {
  const pctClamped = Math.min(100, Math.max(0, window.pct));
  return (
    <div data-testid={`limits-window-${window.name}`} className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-zinc-300">{WINDOW_LABELS[window.name]}</span>
        <span className="font-mono text-zinc-400" data-testid={`limits-pct-${window.name}`}>
          {window.pct}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all ${VERDICT_BAR_COLOR[window.verdict]}`}
          style={{ width: `${pctClamped}%` }}
        />
      </div>
      <p className="text-[11px] text-zinc-500">{formatResetAt(window.resetAt)}</p>
    </div>
  );
}

export function LimitsCard() {
  const { t } = useTranslation();
  const { data, loading } = useApi<LimitsResponse>("/api/limits");

  if (loading) {
    return <SkeletonCard className="h-44" />;
  }

  const unavailable = data?.unavailable ?? true;
  const windows = data?.windows ?? [];

  return (
    <Card
      data-testid="limits-card"
      className="border-zinc-800 bg-zinc-900 shadow-lg shadow-zinc-950/50"
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-zinc-100 text-sm font-semibold uppercase tracking-wide">
          <Gauge className="h-4 w-4 text-zinc-400" />
          Subscription Limits
        </CardTitle>
      </CardHeader>
      <CardContent>
        {unavailable ? (
          <EmptyState
            icon={AlertTriangle}
            title="Limit probe unavailable"
            description={data?.reason ?? t("common.error")}
          />
        ) : (
          <div className="space-y-3" data-testid="limits-windows">
            {windows.map((w) => (
              <WindowBar key={w.name} window={w} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default LimitsCard;
