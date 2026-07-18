/**
 * 589/P16 — NEHİR insan-projeksiyonu (Alperen: "böyle insansı değil — güzel
 * metinler akmalı, dil-tercihine göre").
 *
 * Sunucunun `[tip] içerik` insan-satırları hâlâ makine-kokuyor: usage/
 * lifecycle telemetrisi, ham tool_result-JSON'u, markdown-duvarı text'ler.
 * Bu SAF katman nehre girecek son-hâli üretir:
 *   - gürültü DÜŞER (usage · lifecycle · tool_result · boş-text) — nabız/
 *     kıvılcım yine atar (çağıran karar verir), ama satır akmaz;
 *   - tool_use → yerelleştirilmiş fiil-satırı ("araç: Bash · node -e …");
 *   - text → markdown-soyulmuş, tek-nefes cümle (kelime-sınırlı cap).
 * Etiketler ENJEKTE edilir (i18n çağıranda) — modül string-free. Pinli.
 */

export interface RiverProjectionLabels {
  /** "araç" / "tool" — tool_use fiil-öneki. */
  tool: string;
}

export type ProjectedRiverLine =
  | { kind: 'drop' }
  | { kind: 'line'; text: string };

const LINE_CAP = 160;
const ARG_CAP = 64;

/** Markdown-duvarını akış-cümlesine soy: vurgu/kod-imleri, başlık-#'ları,
 *  madde-imleri gider; boşluk tek-nefese iner; kelime-sınırlı cap. */
export function stripToProse(text: string, cap = LINE_CAP): string {
  const flat = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/__([^_]*)__/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat.length <= cap) return flat;
  const cut = flat.slice(0, cap);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > cap * 0.6 ? lastSpace : cap)}…`;
}

/** tool_use gövdesinden (`Name {json}`) ilk anlamlı argümanı kısalt. */
function firstToolArg(jsonish: string): string | null {
  const start = jsonish.indexOf('{');
  if (start < 0) return null;
  try {
    const parsed = JSON.parse(jsonish.slice(start)) as Record<string, unknown>;
    for (const value of Object.values(parsed)) {
      if (typeof value === 'string' && value.trim().length > 0) {
        const flat = value.replace(/\s+/g, ' ').trim();
        return flat.length > ARG_CAP ? `${flat.slice(0, ARG_CAP - 1)}…` : flat;
      }
    }
  } catch { /* kırpık-JSON — ada düş */ }
  return null;
}

export function projectRiverLine(raw: string, labels: RiverProjectionLabels): ProjectedRiverLine {
  const match = /^\[(\w+)\]\s*([\s\S]*)$/.exec(raw.trim());
  if (!match) {
    const prose = stripToProse(raw);
    return prose.length === 0 ? { kind: 'drop' } : { kind: 'line', text: prose };
  }
  const type = (match[1] as string).toLowerCase();
  const rest = (match[2] as string).trim();

  // Gürültü-sınıfları: telemetri/iskelet-frame'leri nehre girmez.
  if (type === 'usage' || type === 'lifecycle' || type === 'tool_result') return { kind: 'drop' };
  if (rest.length === 0 || rest === '(empty)') return { kind: 'drop' };

  if (type === 'tool_use' || type === 'tool') {
    const name = (rest.split(/[\s{]/)[0] ?? '').trim();
    if (name.length === 0) return { kind: 'drop' };
    const arg = firstToolArg(rest);
    return { kind: 'line', text: arg !== null ? `${labels.tool}: ${name} · ${arg}` : `${labels.tool}: ${name}` };
  }

  // text ve diğer anlatı-tipleri → düz-yazı
  const prose = stripToProse(rest);
  return prose.length === 0 ? { kind: 'drop' } : { kind: 'line', text: prose };
}
