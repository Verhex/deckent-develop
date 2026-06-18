import { useState } from "react";
import { FileText, AlertTriangle } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { useTranslation } from "../i18n/LanguageProvider";

interface DocRow { doc_rank: number; state: string; priority_score: number; path: string; }
interface HeatCell { bucket: string; state: string; count: number; }
interface HealthResponse { rows: DocRow[]; heatmap: HeatCell[]; generatedAt: string; }

const BUCKETS = ["0", "1-10", "11-50", "51-94", "95+"];
const STATES = ["FRESH", "DRIFT", "STALE", "CRITICAL_STALE", "EXEMPT"];

const stateColor: Record<string, string> = {
  FRESH: "bg-emerald-900/40 text-emerald-300",
  DRIFT: "bg-amber-900/30 text-amber-300",
  STALE: "bg-orange-900/40 text-orange-300",
  CRITICAL_STALE: "bg-red-900/50 text-red-300",
  EXEMPT: "bg-zinc-800/40 text-zinc-400",
};

function bucketOf(rank: number): string {
  if (rank <= 0) return "0";
  if (rank <= 10) return "1-10";
  if (rank <= 50) return "11-50";
  if (rank <= 94) return "51-94";
  return "95+";
}

export default function DocsHealthPage() {
  const { t } = useTranslation();
  const { data, loading, error } = useApi<HealthResponse>("/api/docs/health");
  const [filter, setFilter] = useState<{ bucket: string; state: string } | null>(null);

  if (error) return <div className="p-6 text-red-400">{t("docs_health.error")}: {error}</div>;
  if (loading || !data) return <div className="p-6 text-zinc-400">{t("docs_health.loading")}</div>;

  const cellCount = (bucket: string, state: string) =>
    data.heatmap.find((c) => c.bucket === bucket && c.state === state)?.count ?? 0;

  const rows = filter
    ? data.rows.filter((r) => bucketOf(r.doc_rank) === filter.bucket && r.state === filter.state)
    : data.rows;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <FileText className="w-5 h-5 text-zinc-300" />
        <h1 className="text-xl font-semibold">{t("docs_health.title")}</h1>
        <span className="text-sm text-zinc-500">{t("docs_health.docs_count", { count: data.rows.length })}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="text-sm border-collapse" data-testid="docs-heatmap">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left text-zinc-400">{t("docs_health.heatmap_corner")}</th>
              {STATES.map((s) => <th key={s} className="px-2 py-1 text-zinc-400">{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {BUCKETS.map((b) => (
              <tr key={b}>
                <td className="px-2 py-1 text-zinc-400">{b}</td>
                {STATES.map((s) => {
                  const n = cellCount(b, s);
                  return (
                    <td key={s} className="px-1 py-1 text-center">
                      <button
                        type="button"
                        data-testid={`cell-${b}-${s}`}
                        onClick={() => setFilter({ bucket: b, state: s })}
                        className={`w-12 h-8 rounded ${n > 0 ? stateColor[s] : "bg-zinc-900/30 text-zinc-600"}`}
                      >
                        {n}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filter && (
        <button type="button" onClick={() => setFilter(null)} className="text-sm text-blue-400">
          {t("docs_health.clear_filter")} ({filter.bucket} / {filter.state})
        </button>
      )}

      <table className="w-full text-sm" data-testid="docs-table">
        <thead>
          <tr className="text-left text-zinc-400">
            <th className="px-2 py-1">{t("docs_health.col_rank")}</th>
            <th className="px-2 py-1">{t("docs_health.col_state")}</th>
            <th className="px-2 py-1">{t("docs_health.col_score")}</th>
            <th className="px-2 py-1">{t("docs_health.col_path")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.path} className="border-t border-zinc-800">
              <td className="px-2 py-1">{r.doc_rank}</td>
              <td className={`px-2 py-1 ${stateColor[r.state] ?? ""}`}>
                {r.state === "CRITICAL_STALE" && <AlertTriangle className="inline w-3 h-3 mr-1" />}
                {r.state}
              </td>
              <td className="px-2 py-1">{Math.round(r.priority_score)}</td>
              <td className="px-2 py-1 font-mono text-xs">{r.path}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
