import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { History, CircleCheck, CircleX, Clock, ListFilter, ChevronLeft, ChevronRight } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge, type BadgeProps } from "./ui/badge";
import { Button } from "./ui/button";
import { SkeletonCard } from "./Skeleton";
import EmptyState from "./EmptyState";
import { useTranslation } from "../i18n/LanguageProvider";

// ─── APR-HISTORY (sprint-359 task 359-013, Sıra-71) ────────────────────────
// Read-only, paginated audit trail over ApprovalStore's SETTLED buckets
// (approved/denied/expired) — the history/audit companion to ApprovalsPanel's
// live pending/approved/denied monitor (356-001). Same ADR-G-033/ADR-G-020
// read-only stance: the dashboard observes, it never decides — filters and
// pagination are the only interactive elements, there is NO decide control.
// Polls GET /api/approvals/history (359-013's endpoint module).
//
// ApprovalsPanel.tsx is out of this task's write scope (explicit NO-GO), so
// its private RISK_VARIANT/RISK_LABEL_KEY/formatAge helpers cannot be
// imported — the small risk-badge map below is a deliberate, unavoidable
// re-declaration, not a missed reuse opportunity.
//
// LOCAL_LABELS: this task's write-scope excludes src/dashboard/src/i18n/
// {en,tr}.ts (`TranslationKey = keyof typeof en` is a closed union — a new
// key needs those files). Concepts that already have a catalog key (title
// reuse for approved/denied, channel label/pending, risk labels, error) go
// through `t()` as normal; the handful of panel-only concepts with no
// existing key live in LOCAL_LABELS instead, keyed by `lang` so both
// languages stay covered. docImpact: migrate LOCAL_LABELS into en.ts/tr.ts
// once those files are back in a task's write-scope.

export type ApprovalHistoryCategory = "approved" | "denied" | "expired";
export type ApprovalHistoryStatusFilter = ApprovalHistoryCategory | "all";

export interface ApprovalHistoryEntry {
  id: string;
  summary: string;
  scope: string;
  risk: "none" | "low" | "medium" | "high" | "critical";
  policy: string;
  maskedArgs: Record<string, unknown> | null;
  category: ApprovalHistoryCategory;
  channel: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  reason: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface ApprovalHistoryPagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ApprovalHistoryResponse {
  entries: ApprovalHistoryEntry[];
  pagination: ApprovalHistoryPagination;
}

type Translate = ReturnType<typeof useTranslation>["t"];
type Lang = ReturnType<typeof useTranslation>["lang"];

/** Client-side page size — matches approval-history-endpoint.ts's
 *  APPROVAL_HISTORY_DEFAULT_LIMIT. Two small same-value constants (the
 *  dashboard cannot import a server-side module across the api/dashboard
 *  boundary) — not worth a shared-package abstraction for one number. */
const HISTORY_LIMIT = 20;

interface LocalLabels {
  title: string;
  filterAll: string;
  filterExpired: string;
  emptyTitle: string;
  emptyDescAll: string;
  emptyDescExpired: string;
  decidedByLabel: string;
  policyLabel: string;
  reasonLabel: string;
  prev: string;
  next: string;
  pageInfo: (from: number, to: number, total: number) => string;
}

const LOCAL_LABELS: Record<Lang, LocalLabels> = {
  en: {
    title: "Approval History",
    filterAll: "All",
    filterExpired: "Expired",
    emptyTitle: "No history yet",
    emptyDescAll: "Decided and expired approvals will appear here once they occur.",
    emptyDescExpired: "No approvals have expired.",
    decidedByLabel: "Decided by",
    policyLabel: "Policy",
    reasonLabel: "Reason",
    prev: "Previous",
    next: "Next",
    pageInfo: (from, to, total) => `Showing ${from}-${to} of ${total}`,
  },
  tr: {
    title: "Onay Geçmişi",
    filterAll: "Tümü",
    filterExpired: "Süresi Dolan",
    emptyTitle: "Henüz geçmiş yok",
    emptyDescAll: "Karara bağlanan veya süresi dolan onaylar burada listelenecek.",
    emptyDescExpired: "Süresi dolan onay yok.",
    decidedByLabel: "Karar veren",
    policyLabel: "Politika",
    reasonLabel: "Gerekçe",
    prev: "Önceki",
    next: "Sonraki",
    pageInfo: (from, to, total) => `${total} kayıttan ${from}-${to} arası`,
  },
};

const RISK_VARIANT: Record<ApprovalHistoryEntry["risk"], BadgeProps["variant"]> = {
  none: "secondary",
  low: "info",
  medium: "warning",
  high: "destructive",
  critical: "critical",
};

const RISK_LABEL_KEY: Record<ApprovalHistoryEntry["risk"], Parameters<Translate>[0]> = {
  none: "approvals.risk_none",
  low: "approvals.risk_low",
  medium: "approvals.risk_medium",
  high: "approvals.risk_high",
  critical: "approvals.risk_critical",
};

const CATEGORY_ICON: Record<ApprovalHistoryCategory, LucideIcon> = {
  approved: CircleCheck,
  denied: CircleX,
  expired: Clock,
};

const CATEGORY_BADGE_CLASS: Record<ApprovalHistoryCategory, string> = {
  approved: "bg-green-900 text-green-300",
  denied: "bg-red-900 text-red-300",
  expired: "bg-zinc-700 text-zinc-300",
};

function categoryLabel(category: ApprovalHistoryCategory, t: Translate, l: LocalLabels): string {
  if (category === "approved") return t("approvals.approved_title");
  if (category === "denied") return t("approvals.denied_title");
  return l.filterExpired;
}

/** Absolute locale timestamp — an audit/history view benefits more from a
 *  fixed point in time than ApprovalsPanel's relative "Nm ago" age string
 *  (also: that helper is private to a file this task may not touch). */
function formatTimestamp(iso: string | null, lang: Lang): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleString(lang === "tr" ? "tr-TR" : "en-US");
}

interface HistoryRowProps {
  entry: ApprovalHistoryEntry;
  t: Translate;
  lang: Lang;
  l: LocalLabels;
}

function HistoryRow({ entry, t, lang, l }: HistoryRowProps) {
  const Icon = CATEGORY_ICON[entry.category];
  return (
    <div
      key={entry.id}
      data-testid={`history-row-${entry.id}`}
      className="rounded-md border border-zinc-800 p-4"
    >
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <Icon className="w-4 h-4 text-zinc-400" />
        <span className="font-medium text-zinc-100 text-sm">{entry.summary}</span>
        <span
          data-testid={`category-badge-${entry.id}`}
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${CATEGORY_BADGE_CLASS[entry.category]}`}
        >
          {categoryLabel(entry.category, t, l)}
        </span>
        <Badge data-testid={`risk-badge-${entry.id}`} variant={RISK_VARIANT[entry.risk]} className="text-xs">
          {t(RISK_LABEL_KEY[entry.risk])}
        </Badge>
      </div>
      <p className="text-xs text-zinc-500 mb-1">
        {entry.scope} · {l.policyLabel}: {entry.policy}
      </p>
      <p className="text-xs text-zinc-600">
        {t("approvals.channel_label")}: {entry.channel ?? t("approvals.channel_pending")}
        {entry.decidedBy && (
          <>
            {" · "}
            {l.decidedByLabel}: {entry.decidedBy}
          </>
        )}
        {entry.decidedAt && (
          <>
            {" · "}
            {formatTimestamp(entry.decidedAt, lang)}
          </>
        )}
      </p>
      {entry.reason && (
        <p className="text-xs text-zinc-500 mt-1 truncate">
          {l.reasonLabel}: {entry.reason}
        </p>
      )}
    </div>
  );
}

interface FilterButtonProps {
  active: boolean;
  icon: LucideIcon;
  label: string;
  testId: string;
  onClick: () => void;
}

function FilterButton({ active, icon: Icon, label, testId, onClick }: FilterButtonProps) {
  return (
    <Button
      data-testid={testId}
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className="gap-1.5"
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </Button>
  );
}

export default function ApprovalHistoryPanel() {
  const { t, lang } = useTranslation();
  const l = LOCAL_LABELS[lang];
  const [status, setStatus] = useState<ApprovalHistoryStatusFilter>("all");
  const [offset, setOffset] = useState(0);

  const query = new URLSearchParams({ status, limit: String(HISTORY_LIMIT), offset: String(offset) });
  const { data, loading, error } = useApi<ApprovalHistoryResponse>(
    `/api/approvals/history?${query.toString()}`,
  );

  const entries = data?.entries ?? [];
  const pagination: ApprovalHistoryPagination =
    data?.pagination ?? { total: 0, limit: HISTORY_LIMIT, offset, hasMore: false };

  function selectStatus(next: ApprovalHistoryStatusFilter): void {
    setStatus(next);
    setOffset(0);
  }

  const emptyDesc =
    status === "all"
      ? l.emptyDescAll
      : status === "approved"
        ? t("approvals.approved_empty_desc")
        : status === "denied"
          ? t("approvals.denied_empty_desc")
          : l.emptyDescExpired;

  const from = pagination.total === 0 ? 0 : pagination.offset + 1;
  const to = Math.min(pagination.offset + pagination.limit, pagination.total);

  return (
    <div className="space-y-4" data-testid="approval-history-panel">
      <div className="flex items-center gap-2">
        <History className="w-5 h-5 text-zinc-400" />
        <h1 className="text-2xl font-bold text-zinc-100">{l.title}</h1>
      </div>

      {error && (
        <p className="text-red-400 text-sm" data-testid="approval-history-error">
          {t("approvals.error")}: {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2" data-testid="approval-history-filters">
        <FilterButton
          active={status === "all"}
          icon={ListFilter}
          label={l.filterAll}
          testId="filter-all"
          onClick={() => selectStatus("all")}
        />
        <FilterButton
          active={status === "approved"}
          icon={CircleCheck}
          label={t("approvals.approved_title")}
          testId="filter-approved"
          onClick={() => selectStatus("approved")}
        />
        <FilterButton
          active={status === "denied"}
          icon={CircleX}
          label={t("approvals.denied_title")}
          testId="filter-denied"
          onClick={() => selectStatus("denied")}
        />
        <FilterButton
          active={status === "expired"}
          icon={Clock}
          label={l.filterExpired}
          testId="filter-expired"
          onClick={() => selectStatus("expired")}
        />
      </div>

      <Card className="bg-zinc-900 border-zinc-800" data-testid="approval-history-card">
        <CardHeader>
          <CardTitle className="text-zinc-100 text-base">{l.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <SkeletonCard />}
          {!loading && entries.length > 0 && (
            <div className="space-y-3" data-testid="approval-history-list">
              {entries.map((entry) => (
                <HistoryRow key={entry.id} entry={entry} t={t} lang={lang} l={l} />
              ))}
            </div>
          )}
          {!loading && entries.length === 0 && (
            <EmptyState icon={History} title={l.emptyTitle} description={emptyDesc} />
          )}
        </CardContent>
      </Card>

      {!loading && pagination.total > 0 && (
        <div className="flex items-center justify-between" data-testid="approval-history-pagination">
          <span className="text-xs text-zinc-500">{l.pageInfo(from, to, pagination.total)}</span>
          <div className="flex gap-2">
            <Button
              data-testid="pagination-prev"
              type="button"
              variant="outline"
              size="sm"
              disabled={pagination.offset === 0}
              onClick={() => setOffset(Math.max(0, offset - HISTORY_LIMIT))}
              className="gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              {l.prev}
            </Button>
            <Button
              data-testid="pagination-next"
              type="button"
              variant="outline"
              size="sm"
              disabled={!pagination.hasMore}
              onClick={() => setOffset(offset + HISTORY_LIMIT)}
              className="gap-1"
            >
              {l.next}
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
