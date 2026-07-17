import { useEffect, useState } from "react";
import { FileText, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { ReadOnlyNotice } from "../components/ReadOnlyNotice";
import { useTranslation } from "../i18n/LanguageProvider";
import { fetchJson } from "../lib/api";

/**
 * Directives page — SURF-7 (ADR-G-033 authority cutover): DIRECTIVES.md as a
 * first-class READ-ONLY route. The dashboard observes the file; editing lives
 * in the terminal/editor (the POST /api/directives write path is behind the
 * default-off `api.control_mutations` ratchet server-side).
 */
export default function DirectivesPage() {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    fetchJson<{ content: string }>("/api/directives")
      .then((res) => {
        setContent(res.content ?? "");
      })
      .catch(() => {
        setLoadFailed(true);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const isEmpty = !content.trim();

  return (
    <div className="space-y-6" data-testid="directives-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-[-0.03em] text-zinc-100">
            <FileText className="h-6 w-6 text-brand-300" />
            {t("nav.directives")}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">{t("directives.subtitle")}</p>
        </div>
        <ReadOnlyNotice hintKey="readonly.hint.directives" />
      </div>

      <Card className="border-zinc-800 bg-zinc-900 shadow-lg shadow-zinc-950/50">
        <CardContent className="space-y-3 pt-6">
          {loadFailed && (
            <div
              className="flex items-center gap-2 rounded-md border border-amber-700/40 bg-amber-900/30 px-3 py-2 text-sm text-amber-400"
              data-testid="directives-load-warning"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{t("directives.load_warning")}</span>
            </div>
          )}
          {isEmpty && !isLoading && (
            <div
              className="flex items-center gap-2 rounded-md border border-amber-700/40 bg-amber-900/30 px-3 py-2 text-sm text-amber-400"
              data-testid="directives-page-empty-warning"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{t("directives.empty_warning")}</span>
            </div>
          )}
          {!isEmpty && (
            <pre
              data-testid="directives-page-view"
              className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-md border border-zinc-800 bg-zinc-950/60 p-3 font-mono text-sm text-zinc-300"
            >
              {content}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
