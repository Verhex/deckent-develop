import { useState } from "react";
import { Brain, BookOpen, AlertTriangle, Search, X } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Input } from "./ui/input";
import SimpleMarkdown from "./SimpleMarkdown";
import DebtTable, { parseDebtMarkdown } from "./DebtTable";
import EmptyState from "./EmptyState";
import { SkeletonText, SkeletonTable } from "./Skeleton";
import { useTranslation } from "../i18n/LanguageProvider";

export interface AdrEntry {
  id: string;
  title: string;
  status: string;
  sprint?: string;
}

export function parseAdrEntries(content: string): AdrEntry[] {
  const entries: AdrEntry[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    // Match lines with ADR-NNN pattern in a markdown table or list
    const tableMatch = line.match(/\|\s*(adr-\d+)\s*\|\s*([^|]+)\s*\|\s*(\w+)/i);
    if (tableMatch) {
      entries.push({
        id: tableMatch[1].toLowerCase(),
        title: tableMatch[2].trim(),
        status: tableMatch[3].trim().toLowerCase(),
      });
      continue;
    }

    // Match "| adr-NNN | Title | Status |" in summary-style tables
    const headerMatch = line.match(/\|\s*(ADR-\d+)\s*\|\s*(.+?)\s*\|\s*(\w+)/i);
    if (headerMatch && !line.includes("---")) {
      entries.push({
        id: headerMatch[1].toLowerCase(),
        title: headerMatch[2].trim(),
        status: headerMatch[3].trim().toLowerCase(),
      });
    }
  }

  // Deduplicate by id
  const seen = new Set<string>();
  return entries.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

export function filterMemoryContent(content: string, query: string): string {
  if (!query.trim()) return content;
  const lower = query.toLowerCase();
  const lines = content.split("\n");
  const filtered = lines.filter((line) => line.toLowerCase().includes(lower));
  return filtered.join("\n");
}

interface MemoryExplorerProps {
  /** Optional override data for testing */
  memoryContent?: string;
  debtContent?: string;
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "accepted") return "bg-green-900 text-green-200";
  if (s === "proposed") return "bg-brand-bg text-brand-fg";
  if (s === "deprecated") return "bg-zinc-700 text-zinc-400";
  if (s === "rejected") return "bg-red-900 text-red-200";
  return "bg-zinc-700 text-zinc-300";
}

export default function MemoryExplorer({ memoryContent, debtContent }: MemoryExplorerProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: memApi, loading: memLoading, error: memError } = useApi<{ content: string }>(
    memoryContent !== undefined ? "" : "/api/memory",
  );
  const { data: debtApi, loading: debtLoading, error: debtError } = useApi<{ content: string }>(
    debtContent !== undefined ? "" : "/api/debt",
  );

  const rawMemory = memoryContent ?? memApi?.content ?? "";
  const rawDebt = debtContent ?? debtApi?.content ?? "";

  const filteredMemory = filterMemoryContent(rawMemory, searchQuery);
  const adrEntries = parseAdrEntries(rawMemory);
  const debtRows = parseDebtMarkdown(rawDebt);

  const isMemoryLoading = memoryContent === undefined && memLoading;
  const isDebtLoading = debtContent === undefined && debtLoading;
  const memoryFetchError = memoryContent === undefined ? memError : null;
  const debtFetchError = debtContent === undefined ? debtError : null;

  return (
    <div data-testid="memory-explorer" className="space-y-4">
      <Tabs defaultValue="search">
        <TabsList>
          <TabsTrigger value="search" data-testid="tab-search">
            <Search className="w-4 h-4 mr-1" />
            {t("memory.tab_memory")}
          </TabsTrigger>
          <TabsTrigger value="adr" data-testid="tab-adr">
            <BookOpen className="w-4 h-4 mr-1" />
            ADR
          </TabsTrigger>
          <TabsTrigger value="debt" data-testid="tab-debt">
            <AlertTriangle className="w-4 h-4 mr-1" />
            {t("memory.tab_debt")}
          </TabsTrigger>
        </TabsList>

        {/* Memory / Search Tab */}
        <TabsContent value="search">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-zinc-100 flex items-center gap-2">
                <Brain className="w-5 h-5" />
                {t("memory.title")}
              </CardTitle>
              <div className="relative mt-2" data-testid="search-container">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  data-testid="search-input"
                  placeholder="Search memory (FTS)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9 bg-zinc-800 border-zinc-700 text-zinc-200 placeholder:text-zinc-500"
                />
                {searchQuery && (
                  <button
                    data-testid="search-clear"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isMemoryLoading && (
                <div aria-label={t("common.loading")}>
                  <SkeletonText lines={8} />
                </div>
              )}
              {memoryFetchError && (
                <p className="text-red-400">{t("common.error")}: {memoryFetchError}</p>
              )}
              {!isMemoryLoading && !memoryFetchError && rawMemory && (
                <div
                  data-testid="memory-content"
                  className="rounded-md bg-zinc-950 p-4 border border-zinc-800 max-h-[500px] overflow-auto"
                >
                  {filteredMemory.trim() ? (
                    <SimpleMarkdown content={filteredMemory} />
                  ) : (
                    <p data-testid="search-no-results" className="text-zinc-500 text-sm">
                      No results for &quot;{searchQuery}&quot;
                    </p>
                  )}
                </div>
              )}
              {!isMemoryLoading && !memoryFetchError && !rawMemory && (
                <div data-testid="memory-empty">
                  <EmptyState
                    icon={Brain}
                    title={t("memory.no_memory_title")}
                    description={t("memory.no_memory_desc")}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ADR Tab */}
        <TabsContent value="adr">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100 flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Architecture Decision Records
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isMemoryLoading && (
                <div aria-label={t("common.loading")}>
                  <SkeletonTable rows={5} cols={3} />
                </div>
              )}
              {memoryFetchError && (
                <p className="text-red-400">{t("common.error")}: {memoryFetchError}</p>
              )}
              {!isMemoryLoading && !memoryFetchError && adrEntries.length > 0 && (
                <div data-testid="adr-list" className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs uppercase text-zinc-400 border-b border-zinc-700">
                      <tr>
                        <th className="px-4 py-3">ID</th>
                        <th className="px-4 py-3">Title</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adrEntries.map((adr) => (
                        <tr
                          key={adr.id}
                          data-testid={`adr-row-${adr.id}`}
                          className="border-b border-zinc-800 hover:bg-zinc-800/50"
                        >
                          <td className="px-4 py-3 font-mono text-zinc-300 whitespace-nowrap">
                            {adr.id.toUpperCase()}
                          </td>
                          <td className="px-4 py-3 text-zinc-200">{adr.title}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusBadgeClass(adr.status)}`}
                            >
                              {adr.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!isMemoryLoading && !memoryFetchError && adrEntries.length === 0 && (
                <div data-testid="adr-empty">
                  <EmptyState
                    icon={BookOpen}
                    title="No ADRs Found"
                    description="Architecture Decision Records will appear here once memory is populated."
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Debt Tab */}
        <TabsContent value="debt">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                {t("memory.technical_debt")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isDebtLoading && (
                <div aria-label={t("common.loading")}>
                  <SkeletonTable rows={4} cols={5} />
                </div>
              )}
              {debtFetchError && (
                <p className="text-red-400">{t("common.error")}: {debtFetchError}</p>
              )}
              {!isDebtLoading && !debtFetchError && (
                <div data-testid="debt-table-container">
                  <DebtTable rows={debtRows} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
