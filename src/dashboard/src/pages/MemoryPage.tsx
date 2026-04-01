import { useApi } from "../hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import DebtTable, { parseDebtMarkdown } from "../components/DebtTable";
import SimpleMarkdown from "../components/SimpleMarkdown";
import { useTranslation } from "../i18n/LanguageProvider";

export default function MemoryPage() {
  const { t } = useTranslation();
  const { data: memoryData, loading: memLoading, error: memError } = useApi<{ content: string }>("/api/memory");
  const { data: debtData, loading: debtLoading, error: debtError } = useApi<{ content: string }>("/api/debt");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-100">{t('memory.title')}</h1>

      <Tabs defaultValue="memory">
        <TabsList>
          <TabsTrigger value="memory">{t('memory.tab_memory')}</TabsTrigger>
          <TabsTrigger value="debt">{t('memory.tab_debt')}</TabsTrigger>
        </TabsList>

        <TabsContent value="memory">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">{t('memory.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              {memLoading && <p className="text-zinc-400">{t('common.loading')}</p>}
              {memError && <p className="text-red-400">{t('common.error')}: {memError}</p>}
              {memoryData && (
                <div className="rounded-md bg-zinc-950 p-4 border border-zinc-800">
                  <SimpleMarkdown content={memoryData.content} />
                </div>
              )}
              {!memLoading && !memError && !memoryData && (
                <p className="text-zinc-500">{t('memory.no_memory')}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="debt">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">{t('memory.technical_debt')}</CardTitle>
            </CardHeader>
            <CardContent>
              {debtLoading && <p className="text-zinc-400">{t('common.loading')}</p>}
              {debtError && <p className="text-red-400">{t('common.error')}: {debtError}</p>}
              {debtData && <DebtTable rows={parseDebtMarkdown(debtData.content)} />}
              {!debtLoading && !debtError && !debtData && (
                <p className="text-zinc-500">{t('memory.no_debt')}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
