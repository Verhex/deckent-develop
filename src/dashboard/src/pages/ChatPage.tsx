import { MessageSquare } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { ReadOnlyNotice } from "../components/ReadOnlyNotice";
import { useTranslation } from "../i18n/LanguageProvider";

/**
 * Chat page — SURF-7 (ADR-G-033 authority cutover): conversational interaction
 * graduated OFF the web dashboard. The primary chat surfaces are the native
 * terminal (`deckent`) and the Desktop app; the old POST /api/chat +
 * GET /api/chat/stream write paths sit behind the default-off
 * `api.control_mutations` ratchet server-side. This page stays as an honest
 * signpost so the route/nav entry never dead-ends.
 */
export default function ChatPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6" data-testid="chat-page">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-[-0.03em] text-zinc-100">
          <MessageSquare className="h-6 w-6 text-brand-300" />
          {t("nav.group.talk")}
        </h1>
      </div>
      <Card className="border-zinc-800 bg-zinc-900 shadow-lg shadow-zinc-950/50">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-16">
          <img src="/decko-mascot.png" alt="Decko" className="h-12 w-12 object-contain" />
          <ReadOnlyNotice hintKey="readonly.hint.chat" />
        </CardContent>
      </Card>
    </div>
  );
}
