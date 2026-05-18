# Analysis: src/cli/commands/sync.ts
**Task ID:** 142-018 | **Model:** opus | **LoC:** 535 | **Effort:** max

## 1. Amacı (detaylı, 3-5 cümle — ne yapar, neden var, kim kullanır)
İki ana fonksiyonu var: (1) Adapter dosyalarını senkronize eder — CLAUDE.md, AGENTS.md, GEMINI.md, .cursor/rules, .codex/AGENTS.md dosyalarına @DECKENT.md referansını ekler. (2) Git tabanlı out-of-band değişiklik tespiti yapar — son sprint'ten bu yana yapılan commit'leri, değişen dosyaları tespit eder ve MEMORY.md'ye yazar. Multi-IDE desteği (Claude, Codex, Gemini, Cursor) sağlar. Brain'in sprint context'ini güncellemek ve multi-IDE ortamlarında tutarlılık sağlamak için kullanılır.

## 2. Public API (her export'un tam signature + JSDoc var mı?)
- `interface SyncResult` — JSDoc YOK ✗
- `getFileGitDate(root: string, filePath: string): number` — JSDoc VAR ✓
- `getLastSprintTimestamp(root: string): { timestamp: string; sprintId: string } | null` — JSDoc VAR ✓
- `isGitRepo(root: string): boolean` — JSDoc VAR ✓
- `getCommitsSince(root: string, since: string): string[]` — JSDoc VAR ✓
- `getChangedFiles(root: string, commitCount: number): Pick<SyncResult, ...>` — JSDoc VAR ✓
- `truncateFileList(files: string[]): string` — JSDoc VAR ✓
- `replaceMemorySection(content: string, sectionHeading: string, newSectionContent: string): string` — JSDoc VAR ✓
- `writeSyncToMemory(root: string, syncResult: SyncResult): void` — JSDoc VAR ✓
- `formatSyncOutput(syncResult: SyncResult): string` — JSDoc VAR ✓
- `runSync(root: string): SyncResult | null` — JSDoc VAR ✓
- `syncGeminiAdapter(root: string, dryRun?: boolean): boolean` — JSDoc VAR ✓
- `syncCursorAdapter(root: string, dryRun?: boolean): boolean` — JSDoc VAR ✓
- `syncCodexAdapter(root: string, dryRun?: boolean): boolean` — JSDoc VAR ✓
- `buildProviderSyncMap(root: string, dryRun?: boolean): Record<string, ...>` — JSDoc VAR ✓
- `syncAdapterFiles(root: string, dryRun?: boolean): string[]` — JSDoc VAR ✓
- `registerSync(program: Command): void` — JSDoc YOK ✗
- **Çok iyi JSDoc coverage** ✓ — 15/17 fonksiyonda mevcut

## 3. İç Bağımlılıklar
- `../../core/constants.js` → DECKENT_FILE, CLAUDE_FILE, AGENTS_FILE, BRAIN_DIR, SPRINTS_DIR, MEMORY_FILE
- `../../core/utils.js` → ensureDeckentImport
- `../helpers/output.js` → print, printError
- `../helpers/process.js` → resolveProjectRoot
- **Döngüsel bağımlılık: YOK** ✓

## 4. Dış Bağımlılıklar
- `commander` — ADR-010 ✓
- `node:fs` — native ✓
- `node:path` — native ✓
- `node:child_process` → spawnSync — **ADR-006 relevant**
- **ADR-010 uyumu: TAM** ✓

## 5. Complexity
- 18 fonksiyon — **en yüksek fonksiyon sayısı bu batch'te** (retro ile birlikte)
- En karmaşık: `replaceMemorySection` (satır 195-228) — regex-based section replacement — cyclomatic ~6
- `registerSync` action (satır 440-533) — gitOnly/adaptersOnly/dryRun/json branching — cyclomatic ~10
- `getLastSprintTimestamp` (satır 62-107) — git date + mtime fallback per file — cyclomatic ~6
- **Yüksek karmaşıklık** — dosya çok fazla sorumluluk barındırıyor (535 LoC)

## 6. Type Safety
- **any: 0** ✓
- **@ts-ignore: 0** ✓
- **@ts-expect-error: 0** ✓
- **non-null !: 0** ✓
- **as unknown: 0** ✓
- **Mükemmel type safety** ✓

## 7. ADR Compliance
- **ADR-006 spawnSync:** `spawnSync('git', ...)` — satır 38, 75, 113, 126, 147. Tüm spawnSync çağrıları `timeout` parametresi ile sınırlı (5000-10000ms). **ADR-006 UYUMLU** ✓ — git komutu güvenli, timeout mevcut.
- **ADR-022 CLI/MCP parity:** MCP karşılığı `src/mcp/tools/sync.ts` MEVCUT ✓. CLI: --git-only, --adapters-only, --dry-run, --json. **Parity: İYİ** — muhtemelen benzer parametreler.
- **ADR-008:** Brain import yok ✓
- **ADR-010:** commander + native ✓
- **Memory V2 DB-first:** `writeSyncToMemory` MEMORY.md dosyasına yazıyor (satır 233-263) — **GAP: DB-first değil, dosya tabanlı yazım**

## 8. Test Coverage
- `tests/cli/commands/sync.test.ts` — MEVCUT ✓
- `tests/cli/commands/sync-onboard-upgrade-overhaul.test.ts` — MEVCUT ✓
- **Kapsam: İYİ** — 2 test dosyası

## 9. TODO/FIXME/HACK inventory
- **YOK** ✓

## 10. Dead Code
- `runSync` fonksiyonu — registerSync action'dan çağrılmıyor, inline logic kullanılıyor. **Potansiyel dead code** — başka modüller import ediyor mu kontrol gerekli.
- `buildProviderSyncMap` — registerSync'de kullanılmıyor, başka modüllerden import ediliyor olabilir. **Potansiyel dead code**.
- `getFileGitDate` — modül içinde kullanılmıyor. **Potansiyel dead code**.

## 11. Security
- `spawnSync('git', [...])` — **ADR-006 uyumlu**. Argümanlar array olarak geçiriliyor (injection koruması) ✓
- Timeout parametreleri mevcut — DoS koruması ✓
- `writeFileSync` sadece MEMORY.md'ye — sınırlı yazma alanı ✓
- `ensureDeckentImport` — dosya içerik değişikliği, adapter dosyalarına yazma
- **Güvenlik: İYİ** ✓

## 12. Memory V2 Uyumu
- **writeSyncToMemory:** MEMORY.md dosyasına doğrudan yazıyor — **DB-first DEĞİL**
- `replaceMemorySection` — MEMORY.md'deki section'ı regex ile değiştiriyor
- **P2: Memory V2 geçişi eksik** — Sync sonuçları DB'ye `store.insert({ type: 'memory', ... })` ile yazılmalı

## 13. i18n
- Mesajlar İngilizce hardcoded: "No changes since last sprint", "Warning: Not a git repository", "DECKENT.md not found"
- `messages.ts` kullanılmıyor — **GAP: i18n desteği yok**
- MEMORY.md section başlığı "Out-of-band Changes" — İngilizce hardcoded

## 14. Dokümantasyon Tutarlılığı
- **Çok iyi JSDoc** ✓ — 15/17 fonksiyonda mevcut
- `(B)`, `(C)` comment tag'leri — internal reference
- DECKENT.md'de `deckent_sync`: "Konfigürasyon ve manifest'leri senkronize et" — doğru ✓

## 15. Performance
- `spawnSync` × 5+ çağrı (git log, git diff, rev-parse) — **sync I/O yoğun**
- `getLastSprintTimestamp` — her sprint dosyası için ayrı spawnSync — O(N) spawnSync!
- `readdirSync` + dosya okuma loop'ları
- **P2: getLastSprintTimestamp N adet spawnSync çağırıyor** — çok sayıda sprint dosyası varsa yavaş

## 16. Öneriler
1. **P2:** Memory V2 DB-first — writeSyncToMemory'yi DB üzerinden yap
2. **P2:** getLastSprintTimestamp — N adet spawnSync yerine `git log -N --format=%aI -- .brain/sprints/` tek çağrı ile optimize et
3. **P2:** Dead code temizliği — runSync, buildProviderSyncMap, getFileGitDate kullanım durumunu doğrula
4. **P3:** i18n desteği — messages.ts entegrasyonu
5. **P3:** SRP — 535 LoC dosya bölünebilir: sync-git.ts, sync-adapters.ts, sync-memory.ts

## Verdict: ANALYZED
