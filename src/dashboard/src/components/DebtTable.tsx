import { useTranslation } from "../i18n/LanguageProvider";

export interface DebtRow {
  id: string;
  description: string;
  priority: string;
  sprint: string;
  status: string;
}

function priorityBadgeClass(priority: string): string {
  const p = priority.toLowerCase();
  if (p === "high" || p === "critical") return "bg-red-900 text-red-200";
  if (p === "medium") return "bg-amber-900 text-amber-200";
  if (p === "low") return "bg-green-900 text-green-200";
  return "bg-zinc-700 text-zinc-300";
}

export function parseDebtMarkdown(content: string): DebtRow[] {
  const lines = content.split("\n").filter((l) => l.trim().startsWith("|"));

  // Need at least header + separator + 1 data row
  if (lines.length < 3) return [];

  // Skip header (index 0) and separator (index 1)
  const dataLines = lines.slice(2);

  return dataLines
    .map((line) => {
      const cols = line
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);

      if (cols.length < 4) return null;

      return {
        id: cols[0] ?? "",
        description: cols[1] ?? "",
        priority: cols[2] ?? "",
        sprint: cols[3] ?? "",
        status: cols[4] ?? "",
      };
    })
    .filter((r): r is DebtRow => r !== null);
}

interface DebtTableProps {
  rows: DebtRow[];
}

export default function DebtTable({ rows }: DebtTableProps) {
  const { t } = useTranslation();

  if (rows.length === 0) {
    return <p className="text-zinc-500">{t('debt.no_entries')}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs uppercase text-zinc-400 border-b border-zinc-700">
          <tr>
            <th className="px-4 py-3">{t('debt.col_id')}</th>
            <th className="px-4 py-3">{t('debt.col_description')}</th>
            <th className="px-4 py-3">{t('debt.col_priority')}</th>
            <th className="px-4 py-3">{t('debt.col_sprint')}</th>
            <th className="px-4 py-3">{t('debt.col_status')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.id}-${i}`} className="border-b border-zinc-800 hover:bg-zinc-800/50">
              <td className="px-4 py-3 font-mono text-zinc-300">{row.id}</td>
              <td className="px-4 py-3 text-zinc-200">{row.description}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${priorityBadgeClass(row.priority)}`}
                >
                  {row.priority}
                </span>
              </td>
              <td className="px-4 py-3 text-zinc-400">{row.sprint}</td>
              <td className="px-4 py-3 text-zinc-400">{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
