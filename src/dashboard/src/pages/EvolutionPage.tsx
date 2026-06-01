import { useApi } from "../hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import { SkeletonCard } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { GitBranch, Archive, TrendingUp } from "lucide-react";

interface GenealogyNode {
  agentId: string;
  parentId: string | null;
  createdAt: string;
  reason: string;
}

interface FamilyTree {
  roots: string[];
  nodes: Record<string, GenealogyNode>;
  edges: Array<{ parent: string; child: string }>;
}

interface RetirementStats {
  successRate: number;
  totalUses: number;
  sprintsParticipated: number;
}

interface RetiredAgentRecord {
  id: string;
  retiredAt: string;
  reason: string;
  stats: RetirementStats;
  source: "builtin" | "user" | "learned";
}

interface PromptMetricsReport {
  agentId: string;
  currentVersion: number;
  totalVersions: number;
  currentSuccessRate: number;
  bestVersion: { version: number; successRate: number };
  worstVersion: { version: number; successRate: number };
  experimentStatus: "none" | "active" | "completed";
  trend: "improving" | "declining" | "stable";
}

function trendBadgeClass(trend: string): string {
  if (trend === "improving") return "bg-green-900 text-green-300";
  if (trend === "declining") return "bg-red-900 text-red-300";
  return "bg-zinc-700 text-zinc-400";
}

function GenealogyTree({ data, loading }: { data: FamilyTree | null; loading: boolean }) {
  if (loading) return <SkeletonCard />;
  if (!data || data.roots.length === 0) {
    return (
      <EmptyState
        icon={GitBranch}
        title="No genealogy data"
        description="Agent lineage will appear here once agents evolve through sprints."
      />
    );
  }

  function renderNode(agentId: string, depth: number): React.ReactNode {
    const node = data!.nodes[agentId];
    const children = data!.edges
      .filter((e) => e.parent === agentId)
      .map((e) => e.child);
    return (
      <div
        key={agentId}
        data-testid={`genealogy-node-${agentId}`}
        style={{ paddingLeft: depth * 20 }}
        className="py-1"
      >
        <div className="flex items-center gap-2">
          <GitBranch className="w-3 h-3 text-blue-400 shrink-0" />
          <span className="font-mono text-sm text-zinc-200">{agentId}</span>
          {node?.reason && (
            <span className="text-xs text-zinc-500 truncate">{node.reason}</span>
          )}
        </div>
        {children.map((childId) => renderNode(childId, depth + 1))}
      </div>
    );
  }

  return (
    <div data-testid="genealogy-tree" className="space-y-1">
      {data.roots.map((rootId) => renderNode(rootId, 0))}
    </div>
  );
}

function RetirementTimeline({ data, loading }: { data: RetiredAgentRecord[] | null; loading: boolean }) {
  if (loading) return <SkeletonCard />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={Archive}
        title="No retired agents"
        description="Agents that are retired due to low performance will appear here."
      />
    );
  }

  const sorted = [...data].sort(
    (a, b) => new Date(b.retiredAt).getTime() - new Date(a.retiredAt).getTime(),
  );

  return (
    <div data-testid="retirement-timeline" className="relative space-y-0">
      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-zinc-700" aria-hidden="true" />
      {sorted.map((record) => (
        <div
          key={record.id}
          data-testid={`retirement-entry-${record.id}`}
          className="relative flex items-start gap-4 pb-5"
        >
          <div className="relative z-10 mt-1 h-[14px] w-[14px] shrink-0 rounded-full bg-zinc-500 ring-2 ring-zinc-900" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-zinc-200">{record.id}</span>
              <Badge className="bg-zinc-700 text-zinc-400 text-xs">{record.source}</Badge>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">{record.reason}</p>
            <p className="text-xs text-zinc-600 mt-0.5">
              {Math.round(record.stats.successRate * 100)}% success · {record.stats.totalUses} uses · {record.retiredAt}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function PromptDiffTable({ data, loading }: { data: PromptMetricsReport[] | null; loading: boolean }) {
  if (loading) return <SkeletonCard />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No prompt metrics"
        description="Prompt evolution metrics will appear here once agents have versioned prompts."
      />
    );
  }

  return (
    <div data-testid="prompt-diff-table" className="overflow-x-auto">
      <table className="w-full text-sm text-zinc-300">
        <thead>
          <tr className="border-b border-zinc-700">
            <th className="text-left py-2 pr-4 text-zinc-400">Agent</th>
            <th className="text-left py-2 pr-4 text-zinc-400">Version</th>
            <th className="text-left py-2 pr-4 text-zinc-400">Success Rate</th>
            <th className="text-left py-2 pr-4 text-zinc-400">Trend</th>
            <th className="text-left py-2 text-zinc-400">Experiment</th>
          </tr>
        </thead>
        <tbody>
          {data.map((report) => (
            <tr
              key={report.agentId}
              data-testid={`prompt-row-${report.agentId}`}
              className="border-b border-zinc-800 hover:bg-zinc-800/40"
            >
              <td className="py-2 pr-4 font-mono text-xs">{report.agentId}</td>
              <td className="py-2 pr-4 text-zinc-400">
                v{report.currentVersion}/{report.totalVersions}
              </td>
              <td className="py-2 pr-4">
                {Math.round(report.currentSuccessRate * 100)}%
              </td>
              <td className="py-2 pr-4">
                <Badge className={trendBadgeClass(report.trend)}>{report.trend}</Badge>
              </td>
              <td className="py-2">
                <Badge className={
                  report.experimentStatus === "active" ? "bg-blue-900 text-blue-300" :
                  report.experimentStatus === "completed" ? "bg-green-900 text-green-300" :
                  "bg-zinc-700 text-zinc-500"
                }>
                  {report.experimentStatus}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function EvolutionPage() {
  const { data: genealogy, loading: genealogyLoading } = useApi<FamilyTree>("/api/evolution/genealogy");
  const { data: retirement, loading: retirementLoading } = useApi<RetiredAgentRecord[]>("/api/evolution/retirement");
  const { data: promptMetrics, loading: promptLoading } = useApi<PromptMetricsReport[]>("/api/evolution/prompt-metrics");

  return (
    <div className="space-y-6" data-testid="evolution-page">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-6 h-6 text-green-400" />
        <h1 className="text-2xl font-bold text-zinc-100">Evolution</h1>
      </div>

      <Tabs defaultValue="genealogy">
        <TabsList>
          <TabsTrigger value="genealogy" data-testid="tab-genealogy">Genealogy</TabsTrigger>
          <TabsTrigger value="retirement" data-testid="tab-retirement">Retirement</TabsTrigger>
          <TabsTrigger value="prompt-diff" data-testid="tab-prompt-diff">Prompt Diff</TabsTrigger>
        </TabsList>

        <TabsContent value="genealogy">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100 flex items-center gap-2">
                <GitBranch className="w-4 h-4" />
                Agent Genealogy Tree
              </CardTitle>
            </CardHeader>
            <CardContent>
              <GenealogyTree data={genealogy} loading={genealogyLoading} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="retirement">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100 flex items-center gap-2">
                <Archive className="w-4 h-4" />
                Retirement Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RetirementTimeline data={retirement} loading={retirementLoading} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompt-diff">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Prompt Evolution Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PromptDiffTable data={promptMetrics} loading={promptLoading} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
