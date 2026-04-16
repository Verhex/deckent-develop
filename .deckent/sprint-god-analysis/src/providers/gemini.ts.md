# Analysis: src/providers/gemini.ts
**Task ID:** 142-027-fix | **Model:** opus | **LoC:** 566 | **Effort:** max

## 1. Amaci
GeminiAdapter, Google Gemini CLI ve REST API fallback kullanarak worker'lari Google Gemini modelleri uzerinde calistirir. Deckent'in multi-provider stratejisinin (ADR-027) Gemini ayagini olusturur. CLI modu (gemini-cli binary) birincil; REST modu (curl + API key) yedek olarak kullanilir.

## 2. Public API
- `GeminiAdapter` (class, export edilmis) — ProviderAdapter interface implement eder
  - `spawn(task: Task, options: SpawnOptions): Promise<SpawnResult>`
  - `kill(workerId: string): Promise<void>`
  - `getStatus(workerId: string): Promise<WorkerStatus>`
  - `checkAvailability(): Promise<boolean>`
- `GeminiAdapterConfig` (interface, export edilmis) — apiKey, model, maxTokens, restFallback alanlari
- `buildApiScript(task: Task): string` — **@deprecated** (satir ~380)
- `buildStreamingApiScript(task: Task): string` — **@deprecated** (satir ~420)

## 3. Ic Bagimliliklar
- `../core/types.js` — Task, SpawnOptions, SpawnResult, WorkerStatus
- `../core/config.js` — getProjectConfig
- `../core/utils.js` — logger, sleep
- `../core/constants.js` — TASKS_DIR

## 4. Dis Bagimliliklar
- `node:child_process` — spawn, execSync — built-in, ADR-010 compliant
- `node:fs` — readFileSync, writeFileSync, openSync, closeSync — built-in
- `node:path` — built-in
- `node:os` — built-in
Hicbir npm dependency. ADR-010 tam uyumlu.

## 5. Complexity
- Toplam fonksiyon sayisi: ~18
- En karmasik fonksiyon: `spawn()` (satir ~60-230, cyclomatic ~14) — CLI/REST branch + error handling + log FD management
- `buildRestPayload()`: cyclomatic ~5
- Deprecated API script builder'lar: cyclomatic ~6 her biri
- Max cyclomatic rough: 14

## 6. Type Safety
- `any` kullanimi: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 3 (satir ~89, ~178, ~342)
- Unsafe cast: 1 (`response as GeminiResponse` — satir ~290, runtime validation yok, P2)
ISTATISTIKSEL ISTATISTIKSEL KALITELI. Runtime type cast P2.

## 7. ADR Compliance
- **ADR-006 (spawnSync Security):** DIKKAT — `execSync('which gemini-cli', ...)` kullanimi (satir ~45) — availability check icin, kabul edilebilir
- **ADR-008 (Brain Merkezi Import):** UYUMLU — orchestra importu yok
- **ADR-010 (Tek Runtime Dependency):** UYUMLU
- **ADR-027 (Hybrid Spawn Backend):** UYUMLU — Gemini provider ADR-027 kapsaminda

## 8. Test Coverage
- Test dosyasi: `tests/providers/gemini.test.ts`
- Integration test: `tests/integration/gemini-provider.test.ts`
- Test case sayisi: ~90
- BUG-23 (periodic heartbeat): EKSIK — subprocess.ts'te var, gemini.ts'te YOK
- BUG-24 (fallback result): EKSIK — subprocess.ts'te var, gemini.ts'te YOK
- BUG-26 (deferred FD close): EKSIK — subprocess.ts'te var, gemini.ts'te YOK
- Edge case: REST fallback, API key yoksa, CLI timeout

## 9. TODO/FIXME/HACK inventory
- `// TODO: apply BUG-23 periodic heartbeat fix` (satir ~140) — P2, backend parity gap
- `// TODO: apply BUG-24 fallback result fix` (satir ~165) — P2, backend parity gap
- `// @deprecated use CLI mode instead` (satir ~380, ~420) — deprecated fonksiyonlar hala var, P2

## 10. Dead Code
- `buildApiScript()` ve `buildStreamingApiScript()`: @deprecated olarak isaretlenmis, aktif kullanimda degil. ADR-038 kandidati (P2).
- REST fallback branch: nadiren test edilmis, CLI modu yoksa aktif

## 11. Security
- **P2 KRITIK:** API key `curl` komut string'inde geciriliyor (`-H "Authorization: Bearer ${apiKey}"`) — process listing ile key gorunebilir. Environment variable kullanilmali: `GOOGLE_API_KEY` env var + `-H "Authorization: Bearer $GOOGLE_API_KEY"` pattern.
- `closeSync(logFd)` immediately (BUG-26 not applied) — race condition, log data kaybi riski (P2)
- REST response runtime type validation yok (P2)

## 12. Memory V2 Uyumu
N/A — Gemini provider hafiza sistemini kullanmiyor.

## 13. i18n
- Error mesajlari Ingilizce hardcoded — P3
- "Google API key not configured" mesaji —  P3 i18n candidate
- Log mesajlari tutarli Ingilizce

## 14. Dokumantasyon Tutarliligi
- JSDoc coverage: %35 — deprecated fonksiyonlar dokumante edilmis, ana spawn() eksik
- DECKENT.md'de "Gemini (set GOOGLE_API_KEY)" belgelenmis — API key env var gerekliligi dogru
- @deprecated tag'ler mevcut ama removal plan belirtilmemis

## 15. Performance
- `spawn()`: async, hot path degil
- `execSync('which gemini-cli')`: availability check icin sync, her spawn'da cagriliyor (P3 — cache ekle)
- `closeSync(logFd)` immediiate: BUG-26 duzeltmesi uygulanmamis — FD erken kapaniyor (P2 performance + correctness)

## 16. Oneriler
- **P2:** BUG-23 periodic heartbeat: subprocess.ts'teki pattern'i gemini.ts'e uygula
- **P2:** BUG-24 fallback result: sessiz cikista fallback result yazma ekle
- **P2:** BUG-26 deferred FD close: `process.on('exit', () => closeSync(logFd))` kullan
- **P2:** API key security: curl komut string'inden kaldir, environment variable olarak gecir
- **P2:** `buildApiScript/buildStreamingApiScript` @deprecated fonksiyonlarini kaldir (ADR-038)
- **P3:** `execSync('which gemini-cli')` sonucunu cache'le, her spawn'da tekrar etme

## Verdict: ANALYZED
