import { useState } from "react";
import { Brain, BookOpen, GitBranch, AlertTriangle, Filter } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import MemoryExplorer, { parseAdrEntries, type AdrEntry } from "../components/MemoryExplorer";
import { SkeletonText } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { useTranslation } from "../i18n/LanguageProvider";

type StatusFilter = "all" | "accepted" | "proposed" | "deprecated" | "rejected";

function timelineDotClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "accepted") return "bg-green-500";
  if (s === "proposed") return "bg-blue-500";
  if (s === "deprecated") return "bg-zinc-500";
  if (s === "rejected") return "bg-red-500";
  return "bg-zinc-400";
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "accepted") return "bg-green-900 text-green-200";
  if (s === "proposed") return "bg-blue-900 text-blue-200";
  if (s === "deprecated") return "bg-zinc-700 text-zinc-400";
  if (s === "rejected") return "bg-red-900 text-red-200";
  return "bg-zinc-700 text-zinc-300";
}

interface AdrTimelineProps {
  entries: AdrEntry[];
  loading: boolean;
  statusFilter: StatusFilter;
  t: ReturnType<typeof useTranslation>['t'];
}

function AdrTimeline({ entries, loading, statusFilter, t }: AdrTimelineProps) {
  const filtered = statusFilter === "all"
    ? entries
    : entries.filter((e) => e.status.toLowerCase() === statusFilter);

  if (loading) {
    return <div aria-label="Loading ADR timeline"><SkeletonText lines={6} /></div>;
  }

  if (entries.length === 0) {
    return (
      <div data-testid="adr-timeline-empty">
        <EmptyState
          icon={BookOpen}
          title={t('memory_explorer.adr_empty_title')}
          description={t('memory_explorer.adr_empty_desc')}
        />
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <p data-testid="adr-timeline-filtered-empty" className="text-zinc-500 text-sm py-4">
        {t('memory_explorer.adr_filtered_empty')}
      </p>
    );
  }

  return (
    <div data-testid="adr-timeline" className="relative space-y-0">
      {/* vertical line */}
      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-zinc-700" aria-hidden="true" />
      {filtered.map((adr, idx) => (
        <div
          key={adr.id}
          data-testid={`timeline-entry-${adr.id}`}
          className="relative flex items-start gap-4 pb-5"
        >
          <div
            className={`relative z-10 mt-1 h-[14px] w-[14px] shrink-0 rounded-full ${timelineDotClass(adr.status)} ring-2 ring-zinc-900`}
          />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-zinc-400">{adr.id.toUpperCase()}</span>
              <span
                className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${statusBadgeClass(adr.status)}`}
              >
                {adr.status}
              </span>
            </div>
            <p className="text-sm text-zinc-200 mt-0.5">{adr.title}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MemoryExplorerPage() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data: memoryData, loading: memLoading } = useApi<{ content: string }>("/api/memory");

  const adrEntries = memoryData?.content ? parseAdrEntries(memoryData.content) : [];

  return (
    <div data-testid="memory-explorer-page" className="space-y-6">
      <div className="flex items-center gap-2">
        <Brain className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-bold text-zinc-100">{t('memory_explorer.title')}</h1>
      </div>

      {/* Main explorer: search/fts + adr table + debt */}
      <MemoryExplorer />

      {/* ADR Timeline */}
      <Card className="bg-zinc-900 border-zinc-800" data-testid="adr-timeline-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-zinc-100 flex items-center gap-2">
              <GitBranch className="w-5 h-5" />
              {t('memory_explorer.adr_timeline_title')}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-zinc-500" />
              <select
                data-testid="timeline-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                aria-label="Filter ADRs by status"
              >
                <option value="all">{t('memory_explorer.filter_all')}</option>
                <option value="accepted">{t('memory_explorer.filter_accepted')}</option>
                <option value="proposed">{t('memory_explorer.filter_proposed')}</option>
                <option value="deprecated">{t('memory_explorer.filter_deprecated')}</option>
                <option value="rejected">{t('memory_explorer.filter_rejected')}</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <AdrTimeline
            entries={adrEntries}
            loading={memLoading}
            statusFilter={statusFilter}
            t={t}
          />
        </CardContent>
      </Card>

      {/* Debt summary badge */}
      <div className="flex items-center gap-2 text-xs text-zinc-500" data-testid="debt-fts-note">
        <AlertTriangle className="w-3 h-3" />
        <span>{t('memory_explorer.debt_note')}</span>
      </div>
    </div>
  );
}
