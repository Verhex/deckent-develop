# Learned Patterns

## Wave 1 Learnings (Sprint 1, 2026-03-16)

- `@types/node` is required as devDependency for Node.js type declarations (`node:fs`, `node:path`, `structuredClone`)
- `tsconfig.json` needs `"types": ["node"]` for explicit type resolution with `"lib": ["ES2022"]`
- `deepMerge` with strict TypeScript generics requires runtime casts — keep the public API clean, use `Record<string, unknown>` internally
- `structuredClone` is available at runtime in Node 18+ but needs `@types/node` for compile-time types
- Config validation should collect all errors (not fail-fast) for better developer experience
- `memfs` not needed for config tests — `vi.mock('node:fs')` with `mockImplementation` is simpler and sufficient

## Windows Symlink (2026-03-16)

- Windows'ta `git config core.symlinks=false` → `ln -s` kopya oluşturur, gerçek symlink değil
- AGENTS.md güncellendiğinde CLAUDE.md'yi `cp AGENTS.md CLAUDE.md` ile senkronize et
- Linux/macOS'ta gerçek symlink çalışır, senkronizasyon gerekmez

## Wave 2 Learnings (Sprint 1, 2026-03-16)

- `spawnSync('tmux', [...args])` shell injection'a karşı güvenli — shell interpretation yok, argümanlar array olarak geçer
- Auditor resilient olmalı — `readJsonSafe<T>` pattern: parse hatası → null, scan loop devam eder
- Lock dosya isimlendirme: path separator → `__` (çift alt çizgi), nested dizin gerektirmez
- `isWithinScope` trailing separator ile normalize eder — `src/core/` vs `src/core-extra/` prefix overlap koruması
- `SpawnOptions` pattern: `allowedTools` (Blueprint 15) + `autoApprove` (--dangerously-skip-permissions)
- Modüller arası bağımsızlık: auditor, worker scope'larını task JSON'dan okur (worker import etmez)
- `updateTaskStatus` reusable helper: her lifecycle adımında read-modify-write pattern'i merkezi

## Wave 3 Learnings (Sprint 1, 2026-03-16)

- Brain tüm modülleri import eden TEK modül — döngüsel import yasak (brain → tmux/auditor/worker, tersi olmamalı)
- `runSprint` her phase try/catch — sprint asla yarım kalmaz, hata olsa bile COMPLETE'e kadar gider
- `evaluateResult` pure fonksiyon — testsPassed=false → NO_GO override, coverage<90 → GO_WITH_TECH_DEBT override
- `parseDebtTable`/`generateDebtTable` markdown tablo formatını korur — `slice(1,-1)` boş kolon sorununu çözer
- Timeout sonrası eksik task → syntheticResult ile NO_GO olarak değerlendirilir
- `sleepSync(Atomics.wait)` main thread bloklar — brain headless CLI olarak çalıştığı için şu an kabul edilebilir, ileride async geçiş gerekebilir
