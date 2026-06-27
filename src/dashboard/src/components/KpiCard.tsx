import { CheckCircle, AlertTriangle, XCircle, HelpCircle, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.js";
import { Badge } from "./ui/badge.js";
import { SkeletonCard } from "./Skeleton.js";
import EmptyState from "./EmptyState.js";
import { useTranslation } from "../i18n/LanguageProvider.js";
import { useApi } from "../hooks/useApi.js";

interface KpiEntry {
  id: string;
  title: { en: string; tr: string };
  value: number | null;
  target: number | null;
  status: string;
  direction: "up" | "down";
  format: string;
  unit: string;
}

interface KpiResponse {
  sprintId: string | null;
  kpis: KpiEntry[];
}

function formatValue(value: number | null, format: string, unit: string): string {
  if (value === null) return "—";
  if (format === "percent") return `${value.toFixed(1)}%`;
  if (format === "currency") return `$${value.toFixed(2)}`;
  if (format === "duration") return `${Math.round(value)}${unit ? ` ${unit}` : ""}`.trim();
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return unit ? `${formatted} ${unit}` : formatted;
}

type StatusVariant = "success" | "warning" | "critical" | "secondary";

function statusVariant(status: string): StatusVariant {
  if (status === "healthy") return "success";
  if (status === "warning") return "warning";
  if (status === "critical") return "critical";
  return "secondary";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "healthy") return <CheckCircle className="h-4 w-4 text-green-400" />;
  if (status === "warning") return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
  if (status === "critical") return <XCircle className="h-4 w-4 text-red-400" />;
  return <HelpCircle className="h-4 w-4 text-zinc-500" />;
}

function DirectionIcon({ direction }: { direction: "up" | "down" }) {
  if (direction === "up") return <TrendingUp className="h-3 w-3 text-zinc-500" />;
  return <TrendingDown className="h-3 w-3 text-zinc-500" />;
}

interface KpiRowProps {
  entry: KpiEntry;
  lang: string;
}

function KpiRow({ entry, lang }: KpiRowProps) {
  const title = lang === "tr" && entry.title.tr ? entry.title.tr : entry.title.en;
  const valueStr = formatValue(entry.value, entry.format, entry.unit);
  const targetStr = entry.target !== null ? formatValue(entry.target, entry.format, entry.unit) : null;

  return (
    <div
      data-testid={`kpi-row-${entry.id}`}
      className="flex items-center justify-between rounded-md bg-zinc-800/40 px-3 py-2"
    >
      <div className="flex items-center gap-2 min-w-0">
        <StatusIcon status={entry.status} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-200 truncate">{title}</p>
          {targetStr && (
            <p className="text-xs text-zinc-500">
              Target: {targetStr}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          data-testid={`kpi-value-${entry.id}`}
          className="font-mono text-sm font-semibold text-zinc-100"
        >
          {valueStr}
        </span>
        <Badge variant={statusVariant(entry.status) as "secondary" | "info" | "warning" | "critical" | "success"}>
          {entry.status}
        </Badge>
        <DirectionIcon direction={entry.direction} />
      </div>
    </div>
  );
}

export function KpiCard() {
  const { t, lang } = useTranslation();
  const { data, loading } = useApi<KpiResponse>("/api/kpi");

  if (loading) {
    return <SkeletonCard className="h-48" />;
  }

  const kpis = data?.kpis ?? [];

  return (
    <Card
      data-testid="kpi-scorecard"
      className="border-zinc-800 bg-zinc-900 shadow-lg shadow-zinc-950/50"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-zinc-100 text-sm font-semibold uppercase tracking-wide">
          {t("kpi.scorecard_title")}
          {data?.sprintId && (
            <span className="ml-2 font-mono text-xs font-normal text-zinc-500">
              {t("kpi.sprint_label")} {data.sprintId.replace("sprint-", "#")}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {kpis.length === 0 ? (
          <EmptyState
            icon={HelpCircle}
            title={t("kpi.no_data_title")}
            description={t("kpi.no_data_desc")}
          />
        ) : (
          <div className="space-y-1">
            {kpis.map((entry) => (
              <KpiRow key={entry.id} entry={entry} lang={lang} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
