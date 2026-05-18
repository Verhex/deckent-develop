# Analysis: src/providers/claude.ts
**Task ID:** 142-027-fix | **Model:** opus | **LoC:** 230 | **Effort:** max

## 1. Amaci
ClaudeAdapter, Claude CLI ile entegrasyon saglar ve tmux, subprocess ve mcp (stub) backendlerini destekler. Sprint orchestration sisteminin Claude modeline erisim noktasini olusturur. Deckent worker'larini Claude Code CLI uzerinden calistirarak task yurutme, heartbeat yonetimi ve sonuc toplama islemlerini koordine eder.

## 2. Public API
- `ClaudeAdapter` (class, export edilmis) — ProviderAdapter interface'ini implement eder
  - `constructor(config: ClaudeAdapterConfig)` — JSDoc eksik (P3)
  - `spawn(task: Task, options: SpawnOptions): Promise<SpawnResult>` — JSDoc eksik
  - `kill(workerId: string): Promise<void>` — JSDoc eksik
  - `getStatus(workerId: string): Promise<WorkerStatus>` — JSDoc mevcut
- `ClaudeAdapterConfig` (interface, export edilmis) — backend, sessionName, timeout alanlari

## 3. Ic Bagimliliklar
- `../core/types.js` — Task, SpawnOptions, SpawnResult, WorkerStatus
- `../core/config.js` — getProjectConfig
- `../orchestra/tmux.js` — TmuxManager (ADR-008 borderline: provider tmux'u import ediyor)
- `../orchestra/spawn-backend.js` — SubprocessSpawnBackend
- `../core/utils.js` — logger, sleep

## 4. Dis Bagimliliklar
- `node:path` — built-in, ADR-010 compliant
- `node:fs/promises` — built-in, ADR-010 compliant
- `node:child_process` — built-in, ADR-010 compliant
Hicbir npm dependency yok. ADR-010 tam uyumlu.

## 5. Complexity
- Toplam fonksiyon sayisi: ~12
- En karmasik fonksiyon: `spawn()` (satir ~45-130, cyclomatic ~8) — backend dispatch + error handling
- MCP stub branch (satir ~100-115): ulasilamaz kod
- Max cyclomatic rough: 8

## 6. Type Safety
- `any` kullanimi: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 2 (satir ~88, ~134 — config?.sessionName! ve workerId! kullanimi, P3)
- Unsafe cast: 0
EXCELLENT type safety.

## 7. ADR Compliance
- **ADR-006 (spawnSync Security):** UYUMLU — spawnSync kullanilmiyor, async spawn tercih edilmis
- **ADR-008 (Brain Merkezi Import):** BORDERLINE — `../orchestra/tmux.js` import provider katmaninda, brain disinda. Teknik ihlal riski dusuk ancak bagimlilk yonu yanlis (P3)
- **ADR-010 (Tek Runtime Dependency):** UYUMLU — 0 npm dependency
- **ADR-027 (Hybrid Spawn Backend):** UYUMLU — tmux + subprocess backend destekli
- **Memory V2:** N/A — provider katmani hafiza sistemini kullanmiyor

## 8. Test Coverage
- Test dosyasi: `tests/providers/claude.test.ts`
- Test case sayisi: ~70
- Mock kalitesi: ISTATISTIKSEL KALITELI — tmux/subprocess mock'lari saglikli
- Edge case coverage: timeout, kill, status sorgusu, backend dispatch
- Zayif nokta: MCP stub branch test edilmiyor (unreachable)

## 9. TODO/FIXME/HACK inventory
- `// TODO(Sprint 048): MCP backend implement edilecek` (satir ~102) — P2, 92 sprint stale
- `// STUB: mcp backend not yet implemented` (satir ~105) — P2

## 10. Dead Code
- MCP backend branch (satir ~100-115): Sprint 048'den beri stub, hicbir zaman implement edilmemis. ADR-038 dead code kandidati (P2).

## 11. Security
- Claude CLI path injection riski: task.id ve workerId parametreleri CLI komutuna geciriliyor, sanitization kontrol edilmeli (P2)
- Session name tahmin edilebilir format: `deckent-{taskId}` — tmux session hijacking riski dusuk ama mevcut (P3)
- Hassas bilgi log'a dusmemesi kontrol edilmis (P3 riski yok)

## 12. Memory V2 Uyumu
N/A — Providers katmani memory sistemini kullanmiyor. Sprint context'i worker prompt'unda geliyor.

## 13. i18n
- Error mesajlari Ingilizce hardcoded: "Claude CLI spawn failed", "Worker not found" — P3
- Log mesajlari karis Ingilizce/kismisi TR: tutarsizlik
- Locale-aware degil, turkishNormalize kullanimi yok (beklenmemis)

## 14. Dokumantasyon Tutarliligi
- JSDoc coverage: %20 (sadece getStatus icin)
- Class-level JSDoc mevcut degil (P3)
- DECKENT.md'de "Claude (tmux backend, session auth)" olarak belgelenmis — gerceklikle uyumlu
- MCP stub durumu DECKENT.md'de belirtilmemis — tutarsizlik (P3)

## 15. Performance
- `spawn()`: async, hot path degil, kabul edilebilir
- `getStatus()`: fs.readFile ile heartbeat dosyasi okunuyor — hot path ise disk I/O sorunu (P3)
- Sync I/O: 0 (readFileSync yok)

## 16. Oneriler
- **P2:** MCP stub branch'i kaldir (Sprint 048'den beri dead code, ADR-038 uyumu)
- **P2:** Claude CLI path injection icin input sanitization ekle (task.id, workerId)
- **P3:** ADR-008 borderline — tmux import'u provider'dan kaldir, dependency injection kullan
- **P3:** JSDoc eksikligini gider (constructor, spawn, kill metodlari)
- **P3:** `name` field duzelt: subprocess backend icin 'claude-tmux' yanlis; 'claude-subprocess' olmali

## Verdict: ANALYZED
