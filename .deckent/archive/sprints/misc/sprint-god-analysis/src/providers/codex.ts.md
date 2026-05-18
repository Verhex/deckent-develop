# Analysis: src/providers/codex.ts
**Task ID:** 142-027-fix | **Model:** opus | **LoC:** 372 | **Effort:** max

## 1. Amaci
CodexAdapter, OpenAI Codex CLI (hem Rust binary hem Node.js CLI destekleniyor) kullanarak worker'lari OpenAI modelleri uzerinde calistirir. Deckent'in multi-provider stratejisinin (ADR-027) Codex/OpenAI ayagini olusturur. Rust CLI ve Node.js CLI'yi otomatik detect ederek uygun komutu secmektedir.

## 2. Public API
- `CodexAdapter` (class, export edilmis) — ProviderAdapter interface implement eder
  - `spawn(task: Task, options: SpawnOptions): Promise<SpawnResult>`
  - `kill(workerId: string): Promise<void>`
  - `getStatus(workerId: string): Promise<WorkerStatus>`
  - `checkAvailability(): Promise<boolean>`
  - `detectCodexBinary(): 'rust' | 'node' | null` — binary detection
- `CodexAdapterConfig` (interface, export edilmis) — apiKey, model, binaryType, timeout alanlari

## 3. Ic Bagimliliklar
- `../core/types.js` — Task, SpawnOptions, SpawnResult, WorkerStatus
- `../core/config.js` — getProjectConfig
- `../core/utils.js` — logger, sleep
- `../core/constants.js` — TASKS_DIR

## 4. Dis Bagimliliklar
- `node:child_process` — spawn, execSync — built-in, ADR-010 compliant
- `node:fs` — readFileSync, writeFileSync, openSync, closeSync — built-in
- `node:path` — built-in
- `node:os` — built-in, platform detection
Hicbir npm dependency. ADR-010 tam uyumlu.

## 5. Complexity
- Toplam fonksiyon sayisi: ~16
- En karmasik fonksiyon: `spawn()` (satir ~65-210, cyclomatic ~13) — binary type dispatch + platform detection + error handling
- `detectCodexBinary()`: cyclomatic ~5 — execSync ile which/where check
- `buildCodexCommand()`: cyclomatic ~4
- Max cyclomatic rough: 13

## 6. Type Safety
- `any` kullanimi: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 2 (satir ~94, ~201)
- Unsafe cast: 0
EXCELLENT type safety.

## 7. ADR Compliance
- **ADR-006 (spawnSync Security):** DIKKAT — `execSync('which codex', ...)` ve `execSync('where codex', ...)` kullanimi — binary detection icin, kabul edilebilir ama P3 audit onerisi
- **ADR-008 (Brain Merkezi Import):** UYUMLU — orchestra importu yok
- **ADR-010 (Tek Runtime Dependency):** UYUMLU — 0 npm dependency
- **ADR-027 (Hybrid Spawn Backend):** UYUMLU — Codex provider ADR-027 kapsaminda

## 8. Test Coverage
- Test dosyasi: `tests/providers/codex.test.ts`
- Integration test: `tests/integration/codex-provider.test.ts`
- Test case sayisi: ~70
- BUG-23 (periodic heartbeat): EKSIK — subprocess.ts'te var, codex.ts'te YOK (P2)
- BUG-24 (fallback result): EKSIK — subprocess.ts'te var, codex.ts'te YOK (P2)
- BUG-26 (deferred FD close): EKSIK — subprocess.ts'te var, codex.ts'te YOK (P2)
- Rust vs Node binary detection: test mevcut
- Windows platform detection: EKSIK (P2)

## 9. TODO/FIXME/HACK inventory
- `// TODO: apply BUG-23 periodic heartbeat fix` (satir ~130) — P2
- `// TODO: apply BUG-24 fallback result fix` (satir ~155) — P2
- `// TODO: shell: true on Windows for .cmd executables` (satir ~88) — P2

## 10. Dead Code
- `detectCodexBinary()` sonucu her spawn'da yeniden hesaplaniyor — cache yok (P3 optimization)

## 11. Security
- **P2:** `closeSync(logFd)` immediately — BUG-26 uygulanmamis, log FD erken kapaniyor
- **P2:** OpenAI API key process environment'inda geciriliyor — bu dogru pattern ama key redaction loglarda eksik
- **P2:** Windows'ta `shell: false` ile .cmd executable'lari calismiyor — `shell: true` gerektiriyor ama injection riski artiyor
- `execSync` ile binary detection: PATH injection riski minimal ama mevcut (P3)

## 12. Memory V2 Uyumu
N/A — Codex provider hafiza sistemini kullanmiyor.

## 13. i18n
- Error mesajlari Ingilizce: "Codex CLI not found", "OpenAI API key required" — P3
- Platform-specific mesajlar: "Install: npm install -g @openai/codex" — P3

## 14. Dokumantasyon Tutarliligi
- JSDoc coverage: %45 — detectCodexBinary dokumante edilmis, spawn() eksik
- DECKENT.md'de "Codex (set OPENAI_API_KEY)" belgelenmis — uyumlu
- Windows shell requirement dokumante edilmemis (P2)

## 15. Performance
- `detectCodexBinary()`: her spawn'da `execSync` ile binary check — sync I/O, hot path'de sorun (P3 cache)
- `closeSync(logFd)` immediately: race condition, erken kapatma (P2)
- spawn() async, genel akis dogrusal

## 16. Oneriler
- **P2:** BUG-23 periodic heartbeat pattern'i uygula (subprocess.ts referans)
- **P2:** BUG-24 fallback result pattern'i uygula (subprocess.ts referans)
- **P2:** BUG-26 deferred FD close: `process.on('exit', () => closeSync(logFd))` uygula
- **P2:** Windows `shell: true` — risk/benefit analizi yap ve dokumante et; veya Windows'ta `.cmd` binary path'i explicit belirt
- **P3:** `detectCodexBinary()` sonucunu adapter lifetime'inda cache'le
- **P3:** API key loglarda redact edilmeli

## Verdict: ANALYZED
