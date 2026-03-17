import { useApi } from "../hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import DebtTable, { parseDebtMarkdown } from "../components/DebtTable";

export default function MemoryPage() {
  const { data: memoryData, loading: memLoading, error: memError } = useApi<{ content: string }>("/api/memory");
  const { data: debtData, loading: debtLoading, error: debtError } = useApi<{ content: string }>("/api/debt");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-100">Memory & Debt</h1>

      <Tabs defaultValue="memory">
        <TabsList>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="debt">Debt</TabsTrigger>
        </TabsList>

        <TabsContent value="memory">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">Brain Memory</CardTitle>
            </CardHeader>
            <CardContent>
              {memLoading && <p className="text-zinc-400">Loading memory…</p>}
              {memError && <p className="text-red-400">Error: {memError}</p>}
              {memoryData && (
                <pre className="max-h-[600px] overflow-auto rounded-md bg-zinc-950 p-4 text-sm text-zinc-300 whitespace-pre-wrap border border-zinc-800">
                  {memoryData.content}
                </pre>
              )}
              {!memLoading && !memError && !memoryData && (
                <p className="text-zinc-500">No memory content found.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="debt">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">Technical Debt</CardTitle>
            </CardHeader>
            <CardContent>
              {debtLoading && <p className="text-zinc-400">Loading debt…</p>}
              {debtError && <p className="text-red-400">Error: {debtError}</p>}
              {debtData && <DebtTable rows={parseDebtMarkdown(debtData.content)} />}
              {!debtLoading && !debtError && !debtData && (
                <p className="text-zinc-500">No debt data found.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
