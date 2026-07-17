import { useState, useEffect } from "react";
import { FileText, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ReadOnlyNotice } from "./ReadOnlyNotice";
import { fetchJson } from "../lib/api";

interface DirectivesEditorProps {
  onContentChange?: (content: string, hasContent: boolean) => void;
}

/**
 * SURF-7 (ADR-G-033 authority cutover): the DIRECTIVES *editor* became a
 * read-only *viewer* — the dashboard observes; DIRECTIVES.md is edited from
 * the terminal/editor and `deckent do` derives plans from natural language.
 * The empty-warning stays: an empty DIRECTIVES is an observable fact.
 */
export function DirectivesEditor({ onContentChange }: DirectivesEditorProps) {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchJson<{ content: string }>("/api/directives")
      .then((res) => {
        setContent(res.content ?? "");
      })
      .catch(() => {
        // honest empty view on fetch failure
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    onContentChange?.(content, content.trim().length > 0);
  }, [content, onContentChange]);

  const isEmpty = !content.trim();

  return (
    <Card className="border-zinc-800 bg-zinc-900 shadow-lg shadow-zinc-950/50">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-zinc-100">
          <FileText className="h-5 w-5 text-brand-300" />
          DIRECTIVES
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ReadOnlyNotice hintKey="readonly.hint.directives" />
        {isEmpty && !isLoading && (
          <div
            className="flex items-center gap-2 rounded-md border border-amber-700/40 bg-amber-900/30 px-3 py-2 text-sm text-amber-400"
            data-testid="directives-empty-warning"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>DIRECTIVES content is empty — add content before starting a sprint.</span>
          </div>
        )}
        {!isEmpty && (
          <pre
            data-testid="directives-view"
            className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-zinc-800 bg-zinc-950/60 p-3 font-mono text-xs text-zinc-300"
          >
            {content}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
