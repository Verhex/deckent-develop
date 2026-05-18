# Analysis: src/providers/sandbox.ts
**Task ID:** 142-027-fix | **Model:** opus | **LoC:** 162 | **Effort:** max

## 1. Amaci
SandboxSpawnBackend, SubprocessSpawnBackend'i extends ederek izolasyon katmani ekler. Memory limitleri, network blocking ve scope enforcement saglamasi beklenir. Guvenlik icin kritik bir modul olmakla birlikte ciddi bir implementasyon boslugu barindirmaktadir.

## 2. Public API
- `SandboxSpawnBackend` (class, export edilmis) — SubprocessSpawnBackend extends
  - `spawn(task: Task, workerCmd: string, env: Record<string,string>): Promise<SpawnResult>` — override
  - `enforceScope(task: Task): void` — scope directory validation (public)
  - `buildSandboxEnv(task: Task): Record<string,string>` — memory/network env vars (protected)
- `SandboxConfig` (interface, export edilmis) — maxMemoryMB, blockNetwork, enforceScope alanlari

## 3. Ic Bagimliliklar
- `./subprocess.js` — SubprocessSpawnBackend (extends)
- `../core/types.js` — Task, SpawnResult
- `../core/errors.js` — ScopeViolationError
- `../core/utils.js` — logger

## 4. Dis Bagimliliklar
- `node:fs` — realpathSync (scope validation icin) — built-in, ADR-010 compliant
- `node:path` — resolve, normalize — built-in, ADR-010 compliant
Hicbir npm dependency. ADR-010 tam uyumlu.

## 5. Complexity
- Toplam fonksiyon sayisi: ~8
- En karmasik fonksiyon: `enforceScope()` (satir ~85-130, cyclomatic ~7) — realpathSync, prefix check, symlink resolution
- `buildSandboxEnv()`: cyclomatic ~3 — env var assembly
- `spawn()` override: cyclomatic ~4 — enforceScope cagirisi + super.spawn
- Max cyclomatic rough: 7

## 6. Type Safety
- `any` kullanimi: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Unsafe cast: 0
EXCELLENT type safety.

## 7. ADR Compliance
- **ADR-006 (spawnSync Security):** UYUMLU — realpathSync kullanimi guvenlik validation icin (I/O degil), kabul edilebilir
- **ADR-008 (Brain Merkezi Import):** UYUMLU — orchestra importu yok
- **ADR-010 (Tek Runtime Dependency):** UYUMLU — 0 npm dependency
- **ADR-027 (Hybrid Spawn Backend):** UYUMLU — sandbox backend ADR-027 sandbox tier'ini implement ediyor
- **Memory V2:** N/A

## 8. Test Coverage
- Test dosyasi: `tests/providers/sandbox.test.ts`
- Test case sayisi: ~40
- Mock kalitesi: ORTA — enforceScope mock'lari saglikli, buildSandboxEnv tam test edilmemis
- Kritik bug (buildEnv not called) test coverage'da EKSIK — P1 bug tests/sandbox.test.ts'de gorunmuyor
- Edge case: symlink traversal, path normalization

## 9. TODO/FIXME/HACK inventory
- `// TODO: actually block network via iptables or unshare` (satir ~55) — P1, Sprint hedefinin gerceklesmemis kismi
- `// TODO: memory limit enforcement via cgroups` (satir ~62) — P1, unimplemented feature

## 10. Dead Code
- `buildSandboxEnv()`: Memory limit ve network blocking env var'lari hazirliyor ama `spawn()` override'i `buildEnv()` (parent) veya `buildSandboxEnv()` degil, bos env geciriyor. Fonksiyon yazilmis ama etkisiz — P1 dead code.

## 11. Security
- **P1 KRITIK BUG:** `spawn()` override'i `buildEnv()` cagrisi YAPMADAN `super.spawn()` cagiriyor. Memory limitleri ve network blocking environment variable'lari worker process'ine GECMEMEKTEDIR. Sandbox guvenlik garantisi kismi olarak ihlal edilmistir.
- `enforceScope()`: realpathSync ile symlink resolution dogru — path traversal koruyor (IYI)
- Network blocking: sadece env var set ediliyor, gercek kernel-level blocking yok (P1 TODO)
- Memory enforcement: env var bazli, OS-level cgroup yok (P1 TODO)

## 12. Memory V2 Uyumu
N/A — sandbox backend hafiza sistemini kullanmiyor.

## 13. i18n
- Error mesajlari Ingilizce: "Scope violation: path outside allowed directories" — P3
- ScopeViolationError mesajlari tutarli

## 14. Dokumantasyon Tutarliligi
- JSDoc coverage: %40 — enforceScope dokumante edilmis, buildSandboxEnv yetersiz
- Security garantileri dokumante edilmemis — kullanicilara yanlis guvenlik izlenimi verebilir (P1)
- DECKENT.md sandbox backend'den bahsetmiyor

## 15. Performance
- `enforceScope()`: realpathSync her spawn'da cagriliyor — sync I/O ama gecici dosya icin (P3)
- Scope check: task.scope.directories icin loop — O(n), kabul edilebilir

## 16. Oneriler
- **P1 KRITIK:** `spawn()` override'ini duzelt — `buildSandboxEnv()` sonucunu `env` parametresine merge et veya `super.spawn(task, workerCmd, { ...env, ...this.buildSandboxEnv(task) })` kullan
- **P1:** Sandbox guvenlik garantilerini (memory limit, network block) JSDoc/README'de dogrulukla dokumante et
- **P1:** `buildEnv not called` bug'ini kapsayan test ekle: worker env'i kontrol et
- **P2:** Network blocking icin gercek implementasyon: unshare/iptables veya Node.js network interception
- **P2:** Memory enforcement icin cgroup v2 entegrasyonu deger-risk analizi

## Verdict: ANALYZED
