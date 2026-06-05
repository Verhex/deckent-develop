import { useState } from "react";
import { AlertTriangle, Filter, Search } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { SkeletonTable } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";

interface DebtEntry {
  id: string;
  title: string;
  severity: string;
  sprint: string;
  status: "active" | "resolved";
}

type SeverityFilter = "all" | "critical" | "high" | "normal" | "low";
type StatusFilter = "all" | "active" | "resolved";

function parseDebtEntries(content: string): DebtEntry[] {
  const entries: DebtEntry[] = [];
  const lines = content.split("\n");
  let currentStatus: "active" | "resolved" = "active";

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes("active technical debt")) {
      currentStatus = "active";
      continue;
    }
    if (lower.includes("resolved technical debt")) {
      currentStatus = "resolved";
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || trimmed.startsWith("| ID") || trimmed.startsWith("|---")) {
      continue;
    }
    const cols = trimmed.split("|").map((c) => c.trim()).filter(Boolean);
    if (cols.length < 4) continue;
    const [id, title, priority, sprint] = cols;
    if (!id || id === "ID") continue;
    entries.push({
      id,
      title: title ?? "",
      severity: (priority ?? "normal").toLowerCase(),
      sprint: sprint ?? "",
      status: currentStatus,
    });
  }

  return entries;
}

function severityBadgeClass(severity: string): string {
  const s = severity.toLowerCase();
  if (s === "critical") return "bg-red-900 text-red-200";
  if (s === "high") return "bg-orange-900 text-orange-200";
  if (s === "normal") return "bg-zinc-700 text-zinc-300";
  if (s === "low") return "bg-brand-bg text-brand-fg";
  return "bg-zinc-700 text-zinc-400";
}

function statusBadgeClass(status: string): string {
  return status === "active"
    ? "bg-yellow-900 text-yellow-200"
    : "bg-green-900 text-green-200";
}

export default function DebtPage() {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [sprintFilter, setSprintFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data, loading, error } = useApi<{ content: string }>("/api/debt");

  const allEntries = data?.content ? parseDebtEntries(data.content) : [];

  const sprints = Array.from(new Set(allEntries.map((e) => e.sprint).filter(Boolean))).sort().reverse();

  const filtered = allEntries.filter((entry) => {
    if (statusFilter !== "all" && entry.status !== statusFilter) return false;
    if (severityFilter !== "all" && entry.severity !== severityFilter) return false;
    if (sprintFilter !== "all" && entry.sprint !== sprintFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!entry.id.toLowerCase().includes(q) && !entry.title.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div data-testid="debt-page" className="space-y-6">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-6 h-6 text-yellow-400" />
        <h1 className="text-2xl font-bold text-zinc-100">Technical Debt</h1>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-zinc-100 flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filters
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative flex items-center">
                <Search className="absolute left-2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                <input
                  data-testid="debt-search"
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-7 pr-3 py-1 text-sm bg-zinc-800 border border-zinc-700 text-zinc-200 rounded focus:outline-none focus:ring-1 focus:ring-ring w-40"
                  aria-label="Search debt entries"
                />
              </div>
              {/* Severity filter */}
              <select
                data-testid="debt-severity-filter"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label="Filter by severity"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
              {/* Status filter */}
              <select
                data-testid="debt-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label="Filter by status"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="resolved">Resolved</option>
              </select>
              {/* Sprint filter */}
              <select
                data-testid="debt-sprint-filter"
                value={sprintFilter}
                onChange={(e) => setSprintFilter(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label="Filter by sprint"
              >
                <option value="all">All Sprints</option>
                {sprints.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && (
            <div aria-label="loading debt">
              <SkeletonTable rows={5} cols={5} />
            </div>
          )}
          {error && (
            <p className="text-red-400 text-sm">Error loading debt data: {error}</p>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div data-testid="debt-empty">
              <EmptyState
                icon={AlertTriangle}
                title="No debt entries"
                description={allEntries.length > 0 ? "No entries match the current filters." : "No technical debt recorded."}
              />
            </div>
          )}
          {!loading && !error && filtered.length > 0 && (
            <div className="overflow-x-auto" data-testid="debt-table">
              <table className="w-full text-sm text-zinc-300">
                <thead>
                  <tr className="border-b border-zinc-700">
                    <th className="text-left py-2 pr-4 text-zinc-400 font-medium">ID</th>
                    <th className="text-left py-2 pr-4 text-zinc-400 font-medium">Title</th>
                    <th className="text-left py-2 pr-4 text-zinc-400 font-medium">Severity</th>
                    <th className="text-left py-2 pr-4 text-zinc-400 font-medium">Sprint</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => (
                    <tr
                      key={entry.id}
                      data-testid={`debt-row-${entry.id}`}
                      className="border-b border-zinc-800 hover:bg-zinc-800/40"
                    >
                      <td className="py-2 pr-4 font-mono text-xs text-zinc-400">{entry.id}</td>
                      <td className="py-2 pr-4 max-w-xs truncate" title={entry.title}>{entry.title}</td>
                      <td className="py-2 pr-4">
                        <Badge className={severityBadgeClass(entry.severity)}>
                          {entry.severity}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-zinc-400">{entry.sprint}</td>
                      <td className="py-2">
                        <Badge className={statusBadgeClass(entry.status)}>
                          {entry.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-zinc-600 mt-3">
                Showing {filtered.length} of {allEntries.length} entries
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
