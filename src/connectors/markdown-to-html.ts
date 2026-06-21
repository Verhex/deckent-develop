// src/connectors/markdown-to-html.ts
// Convert standard Markdown (the chat model's output) into the Telegram-supported
// HTML subset (<b> <i> <s> <code> <pre> <a>). Dependency-free + best-effort:
// unbalanced markdown stays literal (escaped) rather than producing broken HTML,
// so a Telegram parse-error never results from a partial construct. NEVER formats
// inside code; ALWAYS escapes &<> first (no HTML injection from model output).

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Convert one chunk of Markdown to Telegram HTML. Order matters: code is pulled out
 *  first (so its content is neither formatted nor double-escaped), then text is
 *  escaped, then inline formatting is applied, then code is re-inserted. */
export function markdownToTelegramHtml(md: string): string {
  const codeBlocks: string[] = [];
  const inlineCode: string[] = [];

  // 1. Pull out fenced code blocks ```lang\n…``` → <pre> (drop the language label).
  let s = md.replace(/```[a-zA-Z0-9]*\n?([\s\S]*?)```/g, (_m, code: string) => {
    codeBlocks.push(`<pre>${escapeHtml(code.replace(/\n$/, ''))}</pre>`);
    return ` C${codeBlocks.length - 1} `;
  });
  // 2. Pull out inline code `…` → <code>.
  s = s.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    inlineCode.push(`<code>${escapeHtml(code)}</code>`);
    return ` I${inlineCode.length - 1} `;
  });

  // 3. Escape the remaining (non-code) text so model HTML can't inject.
  s = escapeHtml(s);

  // 4. Links [text](url) — escape both; url already escaped by step 3.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => `<a href="${url}">${text}</a>`);
  // 5. Bold (** or __), italic (* or _), strikethrough (~~). Non-greedy, no newline span.
  s = s.replace(/\*\*([^\n*]+?)\*\*/g, '<b>$1</b>').replace(/__([^\n_]+?)__/g, '<b>$1</b>');
  s = s.replace(/(^|[^*])\*([^\n*]+?)\*(?!\*)/g, '$1<i>$2</i>').replace(/(^|[^_])_([^\n_]+?)_(?!_)/g, '$1<i>$2</i>');
  s = s.replace(/~~([^\n~]+?)~~/g, '<s>$1</s>');
  // 6. Headings → bold; unordered list markers → bullets (Telegram HTML has neither).
  s = s.replace(/^#{1,6}\s+(.*)$/gm, '<b>$1</b>').replace(/^[-*]\s+/gm, '• ');

  // 7. Re-insert code placeholders.
  s = s.replace(/ C(\d+) /g, (_m, i: string) => codeBlocks[Number(i)]!);
  s = s.replace(/ I(\d+) /g, (_m, i: string) => inlineCode[Number(i)]!);
  return s;
}
