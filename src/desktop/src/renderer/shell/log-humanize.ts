/**
 * P11 (KABUL Gün-1, Alperen canlı-feedback): "outputlar JSON — bunu böyle
 * görmenin app'te anlamı yok." — İnsan-projeksiyon katmanı (587 yön-beyanı:
 * "AI yazar · insan denetler"; her akış insan-okur projeksiyonla gelir).
 *
 * PURE helpers: bir log-satırını / bir .result nesnesini insan-okur biçime
 * indirger. Ham-veri asla kaybolmaz — çağıran ham'ı «raw» katlanır-bölümde
 * tutar; bu modül yalnız ÖN-yüzü üretir. Hermetik-pinli.
 */

/** Bir canlı-log satırının insan-okur hâli. `render=human` sunucuda çoğunu
 *  halleder; buradan geçen HAM-JSON satırları (parse-edilemeyen LogEvent'ler,
 *  sarmalayıcı-JSONL) ikinci-şansla indirgeriz: tanıdık alan-adlarından ilk
 *  dolu-metin seçilir; JSON-değilse satır olduğu gibi döner. */
const LINE_PREVIEW_CAP = 200;

/** Sağlayıcı-zarfı kazıcısı: iç-içe {content:{message:{content:[{text}]}}},
 *  {delta:{text}}, {result}, tool_use adı gibi TANIDIK yuvalardan ilk dolu
 *  insan-metni çıkarır (derinlik-sınırlı, döngüsüz). P12b: sunucunun
 *  "[text] (empty)" sınıfı burada gerçek cümleye döner. */
function digText(value: unknown, depth = 0): string | null {
  if (depth > 6 || value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = digText(item, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // tool_use: adı en-anlamlı özet
    if (typeof obj['name'] === 'string' && obj['type'] === 'tool_use') {
      const input = obj['input'];
      const arg = typeof input === 'object' && input !== null
        ? digText(Object.values(input as Record<string, unknown>)[0], depth + 1)
        : null;
      return arg !== null ? `${obj['name']}(${arg})` : String(obj['name']);
    }
    for (const key of ['text', 'summary', 'message', 'result', 'content', 'delta', 'line', 'detail', 'thinking']) {
      const found = digText(obj[key], depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

export function humanizeLogLine(line: string): string {
  // Sunucunun kendi insan-satırı "(empty)" ile bitiyorsa zarfı kazıyamamıştır
  // — ham-JSON'a benzemese de olduğu gibi bırakılır (ikinci-şans yalnız
  // JSON-satırlara uygulanır).
  const trimmed = line.trim();
  if (!(trimmed.startsWith('{') && trimmed.endsWith('}'))) return line;
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    const type = typeof obj['type'] === 'string' ? obj['type'] : undefined;
    const dug = digText(obj);
    if (dug !== null) {
      const preview = dug.length > LINE_PREVIEW_CAP ? `${dug.slice(0, LINE_PREVIEW_CAP - 1)}…` : dug;
      const flat = preview.replace(/\s+/g, ' ');
      return type !== undefined ? `[${type}] ${flat}` : flat;
    }
    return type !== undefined ? `[${type}]` : line;
  } catch {
    return line;
  }
}

/** .result nesnesinin insan-okur alan-özeti (Sonuç-sekmesi). Bilinen alanlar
 *  ayıklanır; gerisi «raw»da kalır. */
export interface HumanResult {
  selfAssessment?: string;
  notes?: string;
  filesChanged: string[];
  testsPassed?: boolean;
  coverage?: number | string;
  linesAdded?: number;
  linesRemoved?: number;
}

export function humanizeResult(result: Record<string, unknown> | null): HumanResult {
  const out: HumanResult = { filesChanged: [] };
  if (result === null) return out;
  if (typeof result['selfAssessment'] === 'string') out.selfAssessment = result['selfAssessment'];
  if (typeof result['notes'] === 'string' && result['notes'].trim().length > 0) out.notes = result['notes'];
  const files = result['filesChanged'] ?? result['files_changed'];
  if (Array.isArray(files)) {
    out.filesChanged = files
      .map((f) => (typeof f === 'string' ? f : typeof (f as { path?: unknown })?.path === 'string' ? (f as { path: string }).path : null))
      .filter((f): f is string => f !== null);
  }
  if (typeof result['testsPassed'] === 'boolean') out.testsPassed = result['testsPassed'];
  const coverage = result['coverage'];
  if (typeof coverage === 'number' || typeof coverage === 'string') out.coverage = coverage;
  const added = result['linesAdded'] ?? result['lines_added'];
  const removed = result['linesRemoved'] ?? result['lines_removed'];
  if (typeof added === 'number') out.linesAdded = added;
  if (typeof removed === 'number') out.linesRemoved = removed;
  return out;
}
