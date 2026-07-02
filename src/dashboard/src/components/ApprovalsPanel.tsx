import type { LucideIcon } from "lucide-react";
import { ClipboardList, ClipboardCheck, ClipboardX } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge, type BadgeProps } from "./ui/badge";
import { SkeletonCard } from "./Skeleton";
import EmptyState from "./EmptyState";
import { useTranslation } from "../i18n/LanguageProvider";

// ─── DASH-APPROVALS (sprint-356 task 356-001, row 213) ─────────────────────
// Read-only monitor over the runtime-wide ApprovalBroker queue — ADR-G-033
// draws the line: dashboard observes, it never decides. There is
// deliberately NO accept/deny/decide control anywhere in this file; a
// decision is only ever made from the terminal or a connector (Telegram) —
// see DASH-1. Polls GET /api/approvals (Task 356-002's endpoint).

export type ApprovalRisk = "none" | "low" | "medium" | "high" | "critical";

/** Flattened, maskedArgs-only view of an ApprovalRequest (+ its ApprovalDecision,
 *  once decided) — never carries a raw args value or rawArgsRef (ADR-G-020 redaction). */
export interface ApprovalListEntry {
  id: string;
  summary: string;
  scope: string;
  risk: ApprovalRisk;
  maskedArgs: Record<string, unknown> | null;
  /** The decision's resolving surface (terminal/telegram/dashboard/api/...). `null` while pending. */
  channel: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface ApprovalsResponse {
  pending: ApprovalListEntry[];
  approved: ApprovalListEntry[];
  denied: ApprovalListEntry[];
}

type Translate = ReturnType<typeof useTranslation>["t"];

/** Poll cadence — matches NervousPage's live-approvals-adjacent view. */
const APPROVALS_POLL_MS = 5000;

const RISK_VARIANT: Record<ApprovalRisk, BadgeProps["variant"]> = {
  none: "secondary",
  low: "info",
  medium: "warning",
  high: "destructive",
  critical: "critical",
};

const RISK_LABEL_KEY: Record<ApprovalRisk, Parameters<Translate>[0]> = {
  none: "approvals.risk_none",
  low: "approvals.risk_low",
  medium: "approvals.risk_medium",
  high: "approvals.risk_high",
  critical: "approvals.risk_critical",
};

/** One-line, length-bounded `key=value …` summary — scannable, no nesting.
 *  Mirrors NervousPage.tsx's `formatRecPayload` pattern. */
function formatMaskedArgsSummary(args: Record<string, unknown> | null): string {
  if (!args) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    if (v === null || typeof v === "object") continue;
    parts.push(`${k}=${String(v)}`);
    if (parts.length >= 3) break;
  }
  const joined = parts.join(" ");
  return joined.length > 80 ? joined.slice(0, 77) + "…" : joined;
}

/** Human-readable, i18n'd age string computed from an ISO timestamp. */
function formatAge(t: Translate, iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 60_000) return t("approvals.age_just_now");
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return t("approvals.age_minutes", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("approvals.age_hours", { n: hours });
  return t("approvals.age_days", { n: Math.floor(hours / 24) });
}

interface ApprovalRowProps {
  entry: ApprovalListEntry;
  t: Translate;
}

function ApprovalRow({ entry, t }: ApprovalRowProps) {
  const summary = formatMaskedArgsSummary(entry.maskedArgs);
  return (
    <div
      key={entry.id}
      data-testid={`approval-row-${entry.id}`}
      className="rounded-md border border-zinc-800 p-4"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="font-medium text-zinc-100 text-sm">{entry.summary}</span>
        <Badge
          data-testid={`risk-badge-${entry.id}`}
          variant={RISK_VARIANT[entry.risk]}
          className="text-xs"
        >
          {t(RISK_LABEL_KEY[entry.risk])}
        </Badge>
      </div>
      {summary && <p className="text-sm text-zinc-400 mb-1 truncate">{summary}</p>}
      <p className="text-xs text-zinc-600">
        {entry.scope} · {t("approvals.channel_label")}: {entry.channel ?? t("approvals.channel_pending")} ·{" "}
        {formatAge(t, entry.createdAt)}
      </p>
    </div>
  );
}

interface ApprovalSectionProps {
  testId: string;
  icon: LucideIcon;
  title: string;
  entries: ApprovalListEntry[];
  loading: boolean;
  emptyDesc: string;
  countBadgeClassName: string;
  t: Translate;
}

function ApprovalSection({
  testId,
  icon: Icon,
  title,
  entries,
  loading,
  emptyDesc,
  countBadgeClassName,
  t,
}: ApprovalSectionProps) {
  return (
    <Card className="bg-zinc-900 border-zinc-800" data-testid={`approvals-section-${testId}`}>
      <CardHeader>
        <CardTitle className="text-zinc-100 flex items-center gap-2">
          <Icon className="w-4 h-4 text-zinc-400" />
          {title}
          {entries.length > 0 && (
            <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${countBadgeClassName}`}>
              {entries.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && <SkeletonCard />}
        {!loading && entries.length > 0 && (
          <div className="space-y-3" data-testid={`approvals-list-${testId}`}>
            {entries.map((entry) => (
              <ApprovalRow key={entry.id} entry={entry} t={t} />
            ))}
          </div>
        )}
        {!loading && entries.length === 0 && (
          <EmptyState icon={Icon} title={t("approvals.empty_title")} description={emptyDesc} />
        )}
      </CardContent>
    </Card>
  );
}

export default function ApprovalsPanel() {
  const { t } = useTranslation();
  const { data, loading, error } = useApi<ApprovalsResponse>("/api/approvals", {
    pollIntervalMs: APPROVALS_POLL_MS,
  });

  const pending = data?.pending ?? [];
  const approved = data?.approved ?? [];
  const denied = data?.denied ?? [];

  return (
    <div className="space-y-6" data-testid="approvals-panel">
      <h1 className="text-2xl font-bold text-zinc-100">{t("approvals.title")}</h1>

      {error && (
        <p className="text-red-400 text-sm" data-testid="approvals-error">
          {t("approvals.error")}: {error}
        </p>
      )}

      <ApprovalSection
        testId="pending"
        icon={ClipboardList}
        title={t("approvals.pending_title")}
        entries={pending}
        loading={loading}
        emptyDesc={t("approvals.pending_empty_desc")}
        countBadgeClassName="bg-yellow-900 text-yellow-300"
        t={t}
      />
      <ApprovalSection
        testId="approved"
        icon={ClipboardCheck}
        title={t("approvals.approved_title")}
        entries={approved}
        loading={loading}
        emptyDesc={t("approvals.approved_empty_desc")}
        countBadgeClassName="bg-green-900 text-green-300"
        t={t}
      />
      <ApprovalSection
        testId="denied"
        icon={ClipboardX}
        title={t("approvals.denied_title")}
        entries={denied}
        loading={loading}
        emptyDesc={t("approvals.denied_empty_desc")}
        countBadgeClassName="bg-red-900 text-red-300"
        t={t}
      />
    </div>
  );
}
