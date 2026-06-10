import { useCallback, useEffect, useState } from "react";
import { Save, FileText, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { useTranslation } from "../i18n/LanguageProvider";
import { fetchJson, postJson } from "../lib/api";

/** Count "## Task N:" headings — the saved-confirmation surfaces how many
 *  tasks the directives describe (same heading contract as the planner). */
function countTasks(content: string): number {
  return (content.match(/^## Task /gm) ?? []).length;
}

/**
 * Directives page (Sprint 269 Task 269-002) — DIRECTIVES.md as a first-class
 * route: load via GET /api/directives, edit, save via POST /api/directives
 * (the set-directives write path the NewSprintModal/DirectivesEditor flow uses).
 *
 * i18n-clean page version of components/DirectivesEditor.tsx — all user-facing
 * strings come from the en/tr dictionaries. When the read endpoint is
 * unavailable the page stays usable for composing (warning shown, save active).
 */
export default function DirectivesPage() {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedTasks, setSavedTasks] = useState<number | null>(null);

  useEffect(() => {
    fetchJson<{ content: string }>("/api/directives")
      .then((res) => {
        setContent(res.content ?? "");
      })
      .catch(() => {
        // read endpoint unavailable — keep the editor usable for composing
        setLoadFailed(true);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    if (!content.trim()) return;
    setIsSaving(true);
    setError("");
    setSavedTasks(null);
    try {
      await postJson("/api/directives", { content });
      setSavedTasks(countTasks(content));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  }, [content]);

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
        <Button
          onClick={handleSave}
          disabled={isSaving || isEmpty}
          className="transition-all duration-200"
          data-testid="directives-page-save-btn"
        >
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? t("directives.saving") : t("directives.save")}
        </Button>
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
          {error && (
            <p className="text-sm text-red-400" data-testid="directives-page-error">{error}</p>
          )}
          {savedTasks !== null && (
            <p className="text-sm text-green-400" data-testid="directives-page-saved">
              {t("directives.saved", { n: savedTasks })}
            </p>
          )}
          <Textarea
            value={content}
            onChange={(e) => { setContent(e.target.value); setSavedTasks(null); }}
            placeholder={"# DIRECTIVES — Sprint NNN: Sprint Title\n\n## Goal: ...\n\n## Task 1: ..."}
            rows={24}
            disabled={isLoading}
            className="resize-y font-mono text-sm"
            data-testid="directives-page-textarea"
            aria-label={t("nav.directives")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
