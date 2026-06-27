import { useState } from "react";
import { BarChart2, TrendingUp, TrendingDown, HelpCircle, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Badge } from "../components/ui/badge.js";
import { SkeletonCard } from "../components/Skeleton.js";
import EmptyState from "../components/EmptyState.js";
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

interface KpiListResponse {
  sprintId: string | null;
  kpis: KpiEntry[];
}

interface TrendPoint {
  periodKey: string;
  value: number;
  status: string;
}

interface TrendResponse {
  kpiId: string;
  series: TrendPoint[];
}

function statusBadgeVariant(status: string): "success" | "warning" | "critical" | "secondary" {
  if (status === "healthy") return "success";
  if (status === "warning") return "warning";
  if (status === "critical") return "critical";
  return "secondary";
}

function TrendStatusIcon({ status }: { status: string }) {
  if (status === "healthy") return <CheckCircle className="h-3 w-3 text-green-400 shrink-0" />;
  if (status === "warning") return <AlertTriangle className="h-3 w-3 text-yellow-400 shrink-0" />;
  if (status === "critical") return <XCircle className="h-3 w-3 text-red-400 shrink-0" />;
  return <HelpCircle className="h-3 w-3 text-zinc-500 shrink-0" />;
}

function TrendBar({ value, max, status }: { value: number; max: number; status: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const colorClass =
    status === "healthy" ? "bg-green-500" :
    status === "warning" ? "bg-yellow-500" :
    status === "critical" ? "bg-red-500" :
    "bg-zinc-500";
  return (
    <div className="w-24 h-2 rounded-full bg-zinc-700 shrink-0">
      <div
        className={`h-2 rounded-full ${colorClass} transition-all duration-300`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function KpiTrendPage() {
  const { t, lang } = useTranslation();
  const [selectedKpiId, setSelectedKpiId] = useState("");

  const { data: kpiList, loading: listLoading } = useApi<KpiListResponse>("/api/kpi");
  const trendUrl = selectedKpiId
    ? `/api/kpi/trend?kpiId=${encodeURIComponent(selectedKpiId)}`
    : "/api/kpi/trend?kpiId=";
  const { data: trendData, loading: trendLoading } = useApi<TrendResponse>(trendUrl);

  const kpis = kpiList?.kpis ?? [];
  const series = trendData?.series ?? [];

  const maxValue = series.length > 0 ? Math.max(...series.map((p) => p.value)) : 0;

  const selectedKpi = kpis.find((k) => k.id === selectedKpiId);
  const selectedTitle = selectedKpi
    ? (lang === "tr" && selectedKpi.title.tr ? selectedKpi.title.tr : selectedKpi.title.en)
    : selectedKpiId;

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedKpiId(e.target.value);
  }

  return (
    <div data-testid="kpi-trend-page" className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-[-0.03em] text-zinc-100">
          {t("kpi.trend_title")}
        </h1>
      </div>

      {/* KPI selector */}
      <Card className="border-zinc-800 bg-zinc-900 shadow-lg shadow-zinc-950/50">
        <CardContent className="pt-4">
          {listLoading ? (
            <SkeletonCard className="h-10" />
          ) : (
            <select
              data-testid="kpi-selector"
              value={selectedKpiId}
              onChange={handleSelect}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              aria-label={t("kpi.select_kpi")}
            >
              <option value="">{t("kpi.select_kpi")}</option>
              {kpis.map((kpi) => {
                const label = lang === "tr" && kpi.title.tr ? kpi.title.tr : kpi.title.en;
                return (
                  <option key={kpi.id} value={kpi.id}>
                    {label}
                  </option>
                );
              })}
            </select>
          )}
        </CardContent>
      </Card>

      {/* Trend series */}
      <Card className="border-zinc-800 bg-zinc-900 shadow-lg shadow-zinc-950/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-zinc-100">
            <BarChart2 className="h-4 w-4 text-brand-300" />
            {selectedTitle || t("kpi.trend_title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <SkeletonCard className="h-32" />
          ) : series.length === 0 ? (
            <EmptyState
              icon={BarChart2}
              title={t("kpi.empty_series_title")}
              description={t("kpi.empty_series_desc")}
            />
          ) : (
            <div data-testid="kpi-trend-series" className="space-y-2">
              {series.map((point) => (
                <div
                  key={point.periodKey}
                  data-testid={`trend-point-${point.periodKey}`}
                  className="flex items-center gap-3 rounded-md bg-zinc-800/40 px-3 py-2"
                >
                  <TrendStatusIcon status={point.status} />
                  <span className="font-mono text-xs text-zinc-400 w-28 shrink-0 truncate">
                    {point.periodKey}
                  </span>
                  <TrendBar value={point.value} max={maxValue} status={point.status} />
                  <div className="flex items-center gap-2 ml-auto">
                    <span
                      data-testid={`trend-value-${point.periodKey}`}
                      className="font-mono text-sm font-semibold text-zinc-100"
                    >
                      {point.value}
                    </span>
                    <Badge variant={statusBadgeVariant(point.status) as "secondary" | "info" | "warning" | "critical" | "success"}>
                      {point.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Direction legend */}
      {selectedKpi && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          {selectedKpi.direction === "up"
            ? <TrendingUp className="h-3 w-3" />
            : <TrendingDown className="h-3 w-3" />
          }
          <span>
            {selectedKpi.direction === "up" ? t("kpi.direction_up") : t("kpi.direction_down")}
          </span>
        </div>
      )}
    </div>
  );
}
