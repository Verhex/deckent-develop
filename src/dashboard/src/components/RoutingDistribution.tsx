import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { useTranslation } from "../i18n/LanguageProvider";
import { useApi } from "../hooks/useApi";

export interface RoutingDistributionEntry {
  id: string;
  label: string;
  count: number;
  percentage: number;
}

export interface RoutingDistributionData {
  agents: RoutingDistributionEntry[];
  skills: RoutingDistributionEntry[];
  totalTasks: number;
}

type RawEntry = { id?: string; agentId?: string; skillId?: string; count?: number; percentage?: number };

export function parseDistributionData(raw: {
  agents?: RawEntry[];
  skills?: RawEntry[];
  totalTasks?: number;
}): RoutingDistributionData {
  const mapEntry = (e: RawEntry): RoutingDistributionEntry => ({
    id: e.id ?? e.agentId ?? e.skillId ?? "unknown",
    label: e.id ?? e.agentId ?? e.skillId ?? "unknown",
    count: e.count ?? 0,
    percentage: e.percentage ?? 0,
  });
  return {
    agents: (raw.agents ?? []).map(mapEntry),
    skills: (raw.skills ?? []).map(mapEntry),
    totalTasks: raw.totalTasks ?? 0,
  };
}

export function computeImbalance(entries: RoutingDistributionEntry[]): boolean {
  return entries.some((e) => e.percentage > 80);
}

function barColor(percentage: number): string {
  if (percentage > 80) return "#f87171"; // red — imbalanced
  if (percentage > 50) return "#facc15"; // yellow — borderline
  return "#60a5fa";                      // blue — healthy
}

interface SectionChartProps {
  entries: RoutingDistributionEntry[];
  label: string;
}

function SectionChart({ entries, label }: SectionChartProps) {
  const { t } = useTranslation();
  if (entries.length === 0) {
    return <p className="text-zinc-500 text-xs">{t('chart.no_data')}</p>;
  }
  return (
    <div data-testid={`distribution-chart-${label}`}>
      <p className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wide">{label}</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={entries} layout="vertical" margin={{ top: 0, right: 40, left: 80, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            stroke="#a1a1aa"
            fontSize={10}
            tickFormatter={(v: number) => `${v}%`}
          />
          <YAxis type="category" dataKey="label" stroke="#a1a1aa" fontSize={11} width={75} />
          <Tooltip
            formatter={(value: number) => [`${value}%`, label] as [string, string]}
            contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46" }}
            labelStyle={{ color: "#e4e4e7" }}
            itemStyle={{ color: "#e4e4e7" }}
          />
          <Bar dataKey="percentage" radius={[0, 4, 4, 0]}>
            {entries.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={barColor(entry.percentage)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface RoutingDistributionProps {
  data?: RoutingDistributionData;
  apiUrl?: string;
}

export default function RoutingDistribution({ data: propData, apiUrl = "/api/routing/distribution" }: RoutingDistributionProps) {
  const { t } = useTranslation();
  const { data: fetchedRaw, loading, error } = useApi<{ agents?: RawEntry[]; skills?: RawEntry[]; totalTasks?: number }>(
    propData ? "" : apiUrl,
  );

  const data: RoutingDistributionData | null = propData
    ? propData
    : fetchedRaw
    ? parseDistributionData(fetchedRaw)
    : null;

  const agentImbalance = data ? computeImbalance(data.agents) : false;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-4" data-testid="routing-distribution">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">Agent &amp; Skill Distribution</h3>
        {agentImbalance && (
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-900/40 text-red-400 border border-red-800/50"
            data-testid="imbalance-warning"
          >
            Imbalanced (&gt;80%)
          </span>
        )}
      </div>

      {loading && !propData && (
        <p className="text-zinc-500 text-sm">{t('common.loading')}</p>
      )}

      {error && !propData && (
        <p className="text-zinc-500 text-sm">{t('common.error')}: {error}</p>
      )}

      {data && data.agents.length === 0 && data.skills.length === 0 && (
        <p className="text-zinc-500 text-sm" data-testid="empty-state">{t('chart.no_data')}</p>
      )}

      {data && (data.agents.length > 0 || data.skills.length > 0) && (
        <div className="space-y-4">
          <SectionChart entries={data.agents} label="Agents" />
          {data.skills.length > 0 && (
            <SectionChart entries={data.skills} label="Skills" />
          )}
        </div>
      )}
    </div>
  );
}
