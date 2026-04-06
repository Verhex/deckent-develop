import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useTranslation } from "../i18n/LanguageProvider";

export interface SprintChartEntry {
  sprintId: string;
  taskCount: number;
  coverage: number;
  successRate: number;
}

interface SprintChartProps {
  data: SprintChartEntry[];
}

function tooltipFormatter(value: number, name: string, coverageLabel: string, tasksLabel: string): [string, string] {
  if (name === "coverage") return [`${value}%`, coverageLabel];
  return [String(value), tasksLabel];
}

function getSuccessColor(rate: number): string {
  if (rate >= 100) return "#4ade80"; // green
  if (rate >= 80) return "#facc15";  // yellow
  return "#f87171";                  // red
}

export function parseChartData(
  history: Array<{ id?: string; sprint?: string; tasks?: string; coverage?: string; completed?: string }>,
): SprintChartEntry[] {
  return history.map((h) => {
    const id = h.id ?? h.sprint ?? "unknown";
    const taskCount = parseInt(h.tasks ?? "0", 10) || 0;
    const coverageStr = (h.coverage ?? "0").replace("%", "");
    const coverage = parseFloat(coverageStr) || 0;
    const completed = parseInt(h.completed ?? "0", 10) || 0;
    const successRate = taskCount > 0 ? Math.round((completed / taskCount) * 100) : 0;
    return { sprintId: id, taskCount, coverage, successRate };
  });
}

interface SuccessRateTrendProps {
  data: SprintChartEntry[];
}

export function SuccessRateTrend({ data }: SuccessRateTrendProps) {
  const { t } = useTranslation();
  const last10 = data.slice(-10);

  if (last10.length === 0) {
    return <p className="text-zinc-500">{t('chart.no_data')}</p>;
  }

  const successRateLabel = t('chart.success_rate');

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={last10} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
        <XAxis dataKey="sprintId" stroke="#a1a1aa" fontSize={11} />
        <YAxis
          stroke="#a1a1aa"
          fontSize={11}
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          formatter={(value: number) => [`${value}%`, successRateLabel] as [string, string]}
          contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46" }}
          labelStyle={{ color: "#e4e4e7" }}
          itemStyle={{ color: "#e4e4e7" }}
        />
        <Bar dataKey="successRate" name={successRateLabel} radius={[4, 4, 0, 0]}>
          {last10.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={getSuccessColor(entry.successRate)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function SprintChart({ data }: SprintChartProps) {
  const { t } = useTranslation();

  if (data.length === 0) {
    return <p className="text-zinc-500">{t('chart.no_chart_data')}</p>;
  }

  const coverageLabel = t('chart.coverage');
  const tasksLabel = t('chart.tasks');
  const coveragePctLabel = t('chart.coverage_pct');

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
        <XAxis dataKey="sprintId" stroke="#a1a1aa" fontSize={12} />
        <YAxis yAxisId="left" stroke="#60a5fa" fontSize={12} />
        <YAxis yAxisId="right" orientation="right" stroke="#4ade80" fontSize={12} domain={[0, 100]} />
        <Tooltip
          formatter={(value: number, name: string) => tooltipFormatter(value, name, coverageLabel, tasksLabel)}
          contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46" }}
          labelStyle={{ color: "#e4e4e7" }}
          itemStyle={{ color: "#e4e4e7" }}
        />
        <Legend />
        <Line yAxisId="left" type="monotone" dataKey="taskCount" stroke="#60a5fa" name={tasksLabel} dot />
        <Line yAxisId="right" type="monotone" dataKey="coverage" stroke="#4ade80" name={coveragePctLabel} dot />
      </LineChart>
    </ResponsiveContainer>
  );
}
