import { useApi } from "../hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import SprintChart, { parseChartData, SuccessRateTrend } from "../components/SprintChart";
import { useTranslation } from "../i18n/LanguageProvider";

interface SprintHistoryRecord {
  id: string;
  sprint: string;
  tasks: string;
  completed: string;
  techDebt: string;
  noGo: string;
  noGoRate: string;
  coverage: string;
  duration: string;
}

function calcSuccessRate(record: SprintHistoryRecord): number {
  const total = parseInt(record.tasks, 10) || 0;
  const done = parseInt(record.completed, 10) || 0;
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

function SuccessChip({ rate }: { rate: number }) {
  let colorClass = "bg-green-900/50 text-green-400";
  if (rate < 80) colorClass = "bg-red-900/50 text-red-400";
  else if (rate < 100) colorClass = "bg-yellow-900/50 text-yellow-400";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
      {rate}%
    </span>
  );
}

function NoGoChip({ noGoRate }: { noGoRate: string }) {
  const value = parseFloat(noGoRate.replace("%", "")) || 0;
  let colorClass = "bg-green-900/50 text-green-400";
  if (value > 20) colorClass = "bg-red-900/50 text-red-400";
  else if (value > 0) colorClass = "bg-yellow-900/50 text-yellow-400";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
      {noGoRate}
    </span>
  );
}

export default function HistoryPage() {
  const { t } = useTranslation();
  const { data, loading, error } = useApi<SprintHistoryRecord[]>("/api/history");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-100">{t('history.title')}</h1>

      {loading && <p className="text-zinc-400">{t('common.loading')}</p>}
      {error && <p className="text-red-400">Error: {error}</p>}

      {data && data.length > 0 && (
        <>
          {/* Trend Chart */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">{t('history.trend')}</CardTitle>
            </CardHeader>
            <CardContent>
              <SprintChart data={parseChartData(data)} />
            </CardContent>
          </Card>

          {/* Success Rate Trend */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">Success Rate Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-zinc-500 mb-3">
                Last 10 sprints — <span className="text-green-400">■</span> 100%&nbsp;
                <span className="text-yellow-400">■</span> ≥80%&nbsp;
                <span className="text-red-400">■</span> &lt;80%
              </p>
              <SuccessRateTrend data={parseChartData(data)} />
            </CardContent>
          </Card>

          {/* History Table */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">All Sprints</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase text-zinc-400 border-b border-zinc-700">
                    <tr>
                      <th className="px-4 py-3">Sprint ID</th>
                      <th className="px-4 py-3">Tasks</th>
                      <th className="px-4 py-3">Done</th>
                      <th className="px-4 py-3">Success %</th>
                      <th className="px-4 py-3">Tech Debt</th>
                      <th className="px-4 py-3">No-Go</th>
                      <th className="px-4 py-3">No-Go %</th>
                      <th className="px-4 py-3">Coverage</th>
                      <th className="px-4 py-3">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((record) => (
                      <tr
                        key={record.id}
                        className="border-b border-zinc-800 hover:bg-zinc-800/50"
                      >
                        <td className="px-4 py-3 font-mono text-blue-400">{record.sprint}</td>
                        <td className="px-4 py-3 text-zinc-200">{record.tasks}</td>
                        <td className="px-4 py-3 text-green-400">{record.completed}</td>
                        <td className="px-4 py-3">
                          <SuccessChip rate={calcSuccessRate(record)} />
                        </td>
                        <td className="px-4 py-3 text-yellow-400">{record.techDebt}</td>
                        <td className="px-4 py-3 text-red-400">{record.noGo}</td>
                        <td className="px-4 py-3">
                          <NoGoChip noGoRate={record.noGoRate} />
                        </td>
                        <td className="px-4 py-3 text-zinc-200">{record.coverage}</td>
                        <td className="px-4 py-3 text-zinc-400">{record.duration}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {data && data.length === 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <p className="text-zinc-500">{t('history.no_history')}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
