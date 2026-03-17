import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export interface SprintChartEntry {
  sprintId: string;
  testCount: number;
  coverage: number;
}

interface SprintChartProps {
  data: SprintChartEntry[];
}

function tooltipFormatter(value: number, name: string): [string, string] {
  if (name === "coverage") return [`${value}%`, "Coverage"];
  return [String(value), "Tests"];
}

export function parseChartData(
  history: Array<{ id?: string; sprint?: string; tasks?: string; coverage?: string }>,
): SprintChartEntry[] {
  return history.map((h) => {
    const id = h.id ?? h.sprint ?? "unknown";
    const testCount = parseInt(h.tasks ?? "0", 10) || 0;
    const coverageStr = (h.coverage ?? "0").replace("%", "");
    const coverage = parseFloat(coverageStr) || 0;
    return { sprintId: id, testCount, coverage };
  });
}

export default function SprintChart({ data }: SprintChartProps) {
  if (data.length === 0) {
    return <p className="text-zinc-500">No chart data available.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
        <XAxis dataKey="sprintId" stroke="#a1a1aa" fontSize={12} />
        <YAxis yAxisId="left" stroke="#60a5fa" fontSize={12} />
        <YAxis yAxisId="right" orientation="right" stroke="#4ade80" fontSize={12} domain={[0, 100]} />
        <Tooltip
          formatter={tooltipFormatter}
          contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46" }}
          labelStyle={{ color: "#e4e4e7" }}
          itemStyle={{ color: "#e4e4e7" }}
        />
        <Legend />
        <Line yAxisId="left" type="monotone" dataKey="testCount" stroke="#60a5fa" name="Tests" dot />
        <Line yAxisId="right" type="monotone" dataKey="coverage" stroke="#4ade80" name="Coverage %" dot />
      </LineChart>
    </ResponsiveContainer>
  );
}
