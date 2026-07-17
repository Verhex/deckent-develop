import { Eye } from "lucide-react";
import { useTranslation } from "../i18n/LanguageProvider";
import type { TranslationKey } from "../i18n/en";

interface ReadOnlyNoticeProps {
  /** Which surface's terminal/Desktop equivalent to name (readonly.hint.*). */
  hintKey: TranslationKey;
  className?: string;
}

/**
 * SURF-7 (ADR-G-033 authority cutover) — the ONE notice every former control
 * surface renders in place of its mutation buttons: "the dashboard observes",
 * plus the exact terminal/Desktop equivalent for THIS surface. Deep-link v1
 * is an honest copyable command line, not a custom protocol.
 */
export function ReadOnlyNotice({ hintKey, className }: ReadOnlyNoticeProps) {
  const { t } = useTranslation();
  return (
    <div
      data-testid="readonly-notice"
      className={`flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground ${className ?? ""}`}
    >
      <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p>{t("readonly.control_moved")}</p>
        <code className="mt-1 block font-mono text-xs">{t(hintKey)}</code>
      </div>
    </div>
  );
}
