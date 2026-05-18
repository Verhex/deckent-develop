# Analysis: src/providers/codex.ts
**Task ID:** 141-005-fix | **LoC:** 371

## 1. Amacı
OpenAI Codex CLI için ProviderAdapter implementasyonu. Worker'ları `child_process.spawn` ile başlatır, stdout/stderr log dosyasına yönlendirir. Rust ve Node.js CLI variant tespiti, auth mode detection.

## 2. Public API (export listesi)
- `CODEX_TIER_MODELS` (deprecated), `CodexAuthMode`, `CodexCliVariant`
- `CodexAdapter` class (spawn, kill, listWorkers, isAvailable, detectCliVariant, detectAuthMode, buildCommand, buildPlannerCommand, getModelForTier)
- `createCodexAdapter` factory

## 3. İç + Dış Bağımlılıklar
- `core/types.js`, `core/provider.js`, `core/constants.js`
- `core/model-equivalence.js` — getModelForProviderTier
- `node:child_process` — spawn, spawnSync
- `node:fs` — writeFileSync, mkdirSync, existsSync, openSync, closeSync
- `node:path` — join

## 4. Complexity
- Orta — worker entry map, timeout management, auth detection

## 5. Type Safety
- `any` yok
- `(result.stdout ?? '').trim()` — null safety ✓

## 6. ADR Compliance
- **ADR-006 KONTROL:** `spawnSync('codex', ['--version'], ...)` — array args ✓. `spawnSync('codex', ['auth', 'status'], ...)` — array args ✓. UYUMLU.
- `spawn('codex', args, spawnOpts)` — array args ✓. UYUMLU.

## 7. Test Coverage
- `tests/providers/codex.test.ts` bekleniyor

## 8. TODO/FIXME/HACK inventory
- `CODEX_TIER_MODELS` — `@deprecated` işaretli, ne zaman silinecek?
- Env key: `DECKENT_OPENAI_API_KEY` (custom) veya `OPENAI_API_KEY` — belgelenmeli.

## 9. Dead Code Candidates
- `CODEX_TIER_MODELS` deprecated object — kaldırılabilir.
- `buildStreamingApiScript` yok ama benzer pattern codex'te yok, OK.

## 10. Security Findings
- API key env var injection: `OPENAI_API_KEY` ortam değişkeninden alınıyor — process.env erişimi güvenli ✓
- Log file descriptor: `openSync(logPath, 'a')` — append mode, path traversal yok ✓

## 11. Memory V2 Uyumu - İlgisiz.

## 12. Öneriler
- `CODEX_TIER_MODELS` deprecated export temizle.

## 13. Verdict: ANALYZED
