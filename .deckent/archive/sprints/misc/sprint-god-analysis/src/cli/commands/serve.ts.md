# Analysis: src/cli/commands/serve.ts
**Task ID:** 142-019 | **Model:** opus | **LoC:** 111 | **Effort:** max

## 1. Amaci
HTTP API sunucusu + SSE destegi ile CLI komutu saglar. `deckent serve` ile API server baslatilir (port 3100). web.ts'nin gelismis versiyonu: port validation, dist dizin kontrolu (build check), `--dev` proxy mode (Vite dev server), `--dev-port` konfigurasyonu. Dashboard static dosyalari serve eder, SSE ile canli veri akisi saglar.

## 2. Public API
- `EXTENDED_MIME_TYPES: Record<string, string>` — Genisletilmis MIME type mapping (HTML, JS, CSS, SVG, JSON, images, fonts, text, XML, map)
- `checkDistDirectory(staticDir: string): { exists: boolean; hasContent: boolean }` — Static dist dizin kontrolu
- `registerServe(program: Command): void` — Commander'a serve komutunu kayit et
- JSDoc: KISMI. `checkDistDirectory` icin inline yorum var. `EXTENDED_MIME_TYPES` icin JSDoc var. registerServe icin EKSIK.

## 3. Ic Bagimliliklar
- `../../api/server.js` — createHttpServer
- `../helpers/process.js` — resolveProjectRoot
- `../helpers/output.js` — print, printError
- Dongusel bagimllik riski: YOK.

## 4. Dis Bagimliliklar
- `node:fs` — existsSync, readdirSync
- `node:path` — join
- `commander` — type import
- ADR-010 uyumu: UYUMLU.

## 5. Complexity
- Fonksiyon sayisi: 3 (3 exported)
- En karmasik fonksiyon: `registerServe` action handler — port validation + dist check + dev mode + server start + signal handling
- Max cyclomatic complexity (rough): ~5
- Genel karmasiklik: DUSUK-ORTA. Acik ve iyi yapilandirilmis.

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Unsafe cast: YOK.
- Genel: MUKEMMEL.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** N/A.
- **ADR-008 (brain import):** Uyumlu.
- **ADR-010 (deps):** Uyumlu.
- **ADR-022 (CLI/MCP parity):** N/A — server baslama MCP kontekstinde anlamli degil.
- **ADR-025 (graceful shutdown):** UYUMLU — SIGINT + SIGTERM handler, `api.close()` graceful shutdown.
- **ADR-033 (product vision):** Uyumlu.

## 8. Test Coverage
- `tests/cli/commands/serve-overhaul.test.ts` — MEVCUT
- Dogrudan `serve.test.ts` YOK ama overhaul versiyonu mevcut.
- Test eslesmesi: KISMI — overhaul test mevcut, `checkDistDirectory` ve `EXTENDED_MIME_TYPES` test edilmis olabilir.

## 9. TODO/FIXME/HACK inventory
Hicbir TODO, FIXME, HACK veya XXX isareti yok.

## 10. Dead Code
- `EXTENDED_MIME_TYPES`: Export ediliyor — baska yerden kullaniliyor mu? Potansiyel dead export. `api/server.ts` kendi MIME type logic'ine sahip olabilir.
- `checkDistDirectory`: Export ediliyor — yalnizca registerServe icinden cagriliyor ama test'ten de cagirilabilir. Export unnecessary olabilir ama zararsiz.
- Genel: Ciddi dead code YOK.

## 11. Security
- Port validation: `isNaN(port) || port < 1 || port > 65535` (satir 65-69). UYGUN.
- DevPort parse: `parseInt(opts.devPort ?? '5173', 10)` — NaN kontrolu YOK ama sadece bilgilendirme amacli print'te kullaniliyor, server'a gecirilmiyor.
- Static file serving: `join(root, 'src', 'dashboard', 'dist')` — sabit path. GUVENLI.
- Graceful shutdown: SIGINT/SIGTERM → api.close(). UYGUN.

## 12. Memory V2 Uyumu
- N/A — Serve komutu Memory V2 ile dogrudan etkilesmiyor.

## 13. i18n
- Mesajlar HARDCODED INGILIZCE: "Warning: Static directory not found", "Run the dashboard build", "Dev proxy mode", "Deckent API server listening" vb.
- `getMessage()` KULLANILMIYOR.
- i18n gap: BUYUK (cok sayida kullanici mesaji).

## 14. Dokumantasyon Tutarliligi
- serve.ts vs web.ts duplikasyonu: Her iki komut da `createHttpServer` cagirir. serve.ts daha kapsamli (port validation, dist check, dev mode). web.ts daha basit.
- Dev proxy mode: Bilgi mesaji veriyor ama aslinda proxy yapilandirmasi `api/server.ts`'de mi yapiliyor? Belirsiz — dev proxy sadece kullaniciya bilgi veriyor, gercek proxy yok.
- DECKENT.md'de `deckent serve` listelenmis mi? HAYIR acikca — CLI komut listesi 40+ diyor ama detay yok.

## 15. Performance
- Sync I/O sayisi: existsSync x1, readdirSync x1 = **2 sync I/O** (sadece dist check'te)
- Hot path mi? HAYIR — tek seferlik baslangic.
- Server runtime'da async — baslangic sync I/O kabul edilebilir.

## 16. Oneriler
- **P1:** web.ts ile serve.ts birlestirilsin veya web.ts → serve.ts alias yapilsin. Duplikasyonu azalt.
- **P2:** Dev proxy mode: Gercek proxy mekanizmasi yoksa, mesaji daha acik yaz ("API-only mode, run Vite separately").
- **P2:** devPort NaN kontrolu ekle (tutarlilik icin).
- **P3:** Mesajlari getMessage'a tasi.
- **P3:** EXTENDED_MIME_TYPES export gerekliligini dogrula.

## Verdict: ANALYZED
