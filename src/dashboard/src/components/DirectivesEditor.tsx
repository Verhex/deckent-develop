import { useState, useEffect, useCallback } from "react";
import { Save, FileText, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { fetchJson, postJson } from "../lib/api";

interface DirectivesEditorProps {
  onContentChange?: (content: string, hasContent: boolean) => void;
}

export function DirectivesEditor({ onContentChange }: DirectivesEditorProps) {
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchJson<{ content: string }>("/api/directives")
      .then((res) => {
        setContent(res.content ?? "");
      })
      .catch(() => {
        // start with empty editor on fetch failure
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    onContentChange?.(content, content.trim().length > 0);
  }, [content, onContentChange]);

  const handleSave = useCallback(async () => {
    if (!content.trim()) return;
    setIsSaving(true);
    setError("");
    setSaved(false);
    try {
      await postJson("/api/directives", { content });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  }, [content]);

  const isEmpty = !content.trim();

  return (
    <Card className="border-zinc-800 bg-zinc-900 shadow-lg shadow-zinc-950/50">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-zinc-100">
          <FileText className="h-5 w-5 text-brand-300" />
          DIRECTIVES Editor
        </CardTitle>
        <Button
          onClick={handleSave}
          disabled={isSaving || isEmpty}
          size="sm"
          className="transition-all duration-200"
          data-testid="directives-save-btn"
        >
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isEmpty && !isLoading && (
          <div
            className="flex items-center gap-2 rounded-md border border-amber-700/40 bg-amber-900/30 px-3 py-2 text-sm text-amber-400"
            data-testid="directives-empty-warning"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>DIRECTIVES content is empty — add content before starting a sprint.</span>
          </div>
        )}
        {error && (
          <p className="text-sm text-red-400" data-testid="directives-error">{error}</p>
        )}
        {saved && (
          <p className="text-sm text-green-400" data-testid="directives-saved">DIRECTIVES saved.</p>
        )}
        <Textarea
          value={content}
          onChange={(e) => { setContent(e.target.value); setSaved(false); }}
          placeholder={"# DIRECTIVES — Sprint NNN: Sprint Title\n\n## Goal: ...\n\n## Task 1: ..."}
          rows={16}
          disabled={isLoading}
          className="resize-y font-mono text-sm"
          data-testid="directives-editor-textarea"
          aria-label="DIRECTIVES editor"
        />
        <p className="text-xs text-zinc-500">
          {isEmpty ? (
            <span className="text-amber-500">⚠ Sprint start is disabled — add DIRECTIVES content first.</span>
          ) : (
            <span>{content.split("\n").length} lines · ready</span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
