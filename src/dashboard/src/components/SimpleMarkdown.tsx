import type { ReactNode } from "react";

interface SimpleMarkdownProps {
  content: string;
}

interface ParsedLine {
  type: "h1" | "h2" | "h3" | "li" | "p" | "empty";
  text: string;
}

function parseLine(raw: string): ParsedLine {
  const trimmed = raw.trim();
  if (!trimmed) return { type: "empty", text: "" };
  if (trimmed.startsWith("### ")) return { type: "h3", text: trimmed.slice(4) };
  if (trimmed.startsWith("## ")) return { type: "h2", text: trimmed.slice(3) };
  if (trimmed.startsWith("# ")) return { type: "h1", text: trimmed.slice(2) };
  if (trimmed.startsWith("- ")) return { type: "li", text: trimmed.slice(2) };
  return { type: "p", text: trimmed };
}

function formatInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  // Match **bold** and `code`
  const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={match.index}>{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(
        <code key={match.index} className="rounded bg-zinc-800 px-1 py-0.5 text-sm text-zinc-300">
          {match[3]}
        </code>,
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

export default function SimpleMarkdown({ content }: SimpleMarkdownProps) {
  const lines = content.split("\n");
  const elements: ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++} className="list-disc space-y-1 pl-5 text-zinc-300">
          {listItems.map((item, i) => (
            <li key={i}>{formatInline(item)}</li>
          ))}
        </ul>,
      );
      listItems = [];
    }
  }

  for (const raw of lines) {
    const parsed = parseLine(raw);

    if (parsed.type !== "li") flushList();

    switch (parsed.type) {
      case "h1":
        elements.push(<h1 key={key++} className="mb-2 mt-4 text-xl font-bold text-zinc-100">{formatInline(parsed.text)}</h1>);
        break;
      case "h2":
        elements.push(<h2 key={key++} className="mb-2 mt-3 text-lg font-semibold text-zinc-200">{formatInline(parsed.text)}</h2>);
        break;
      case "h3":
        elements.push(<h3 key={key++} className="mb-1 mt-2 text-base font-semibold text-zinc-300">{formatInline(parsed.text)}</h3>);
        break;
      case "li":
        listItems.push(parsed.text);
        break;
      case "empty":
        elements.push(<div key={key++} className="h-2" />);
        break;
      case "p":
        elements.push(<p key={key++} className="text-sm text-zinc-300">{formatInline(parsed.text)}</p>);
        break;
    }
  }
  flushList();

  return <div className="max-h-[600px] overflow-auto space-y-1">{elements}</div>;
}
