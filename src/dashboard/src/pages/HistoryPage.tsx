import { useApi } from "../hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import SprintChart, { parseChartData } from "../components/SprintChart";

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

export default function HistoryPage() {
  const { data, loading, error } = useApi<SprintHistoryRecord[]>("/api/history");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-100">Sprint History</h1>

      {loading && <p className="text-zinc-400">Loading history…</p>}
      {error && <p className="text-red-400">Error: {error}</p>}

      {data && data.length > 0 && (
        <>
          {/* Trend Chart */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <SprintChart data={parseChartData(data)} />
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
                        <td className="px-4 py-3 text-yellow-400">{record.techDebt}</td>
                        <td className="px-4 py-3 text-red-400">{record.noGo}</td>
                        <td className="px-4 py-3 text-zinc-200">{record.noGoRate}</td>
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
            <p className="text-zinc-500">No sprint history found.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
