# Analysis: src/providers/subprocess.ts
**Task ID:** 141-005-fix | **LoC:** 327

## 1. Amacı
tmux gerektirmeden subprocess olarak worker spawn eden backend. Windows (non-WSL2) desteği için tasarlanmış. Stdin üzerinden prompt iletimi, log dosyası stdout/stderr yönlendirmesi, fallback result yazma.

## 2. Public API (export listesi)
- `SubprocessProviderConfig` interface, `CLAUDE_SUBPROCESS_CONFIG` const
- `SubprocessSpawnBackend` class
- `createSubprocessBackend` factory

## 3. İç + Dış Bağımlılıklar
- `core/types.js`, `core/provider.js`, `core/constants.js`
- `node:child_process` — spawn
- `node:fs` — writeFileSync, mkdirSync, existsSync, openSync, closeSync
- `node:path` — join

## 4. Complexity
- Orta — process lifecycle, timeout, heartbeat interval, exit handler

## 5. Type Safety
- `any` yok
- `code === 0 ? 'GO_WITH_TECH_DEBT' : 'NO_GO'` — fallback result heuristic: exit code 0 = GO_WITH_TECH_DEBT değil DONE olmalı mıydı?

## 6. ADR Compliance
- ADR-006: `spawn(cliCommand, args, opts)` — array args ✓

## 7. Test Coverage
- `tests/providers/subprocess.test.ts` bekleniyor

## 8. TODO/FIXME/HACK inventory
- `// BUG-19`, `// BUG-23`, `// BUG-24`, `// BUG-26` — numbered bug fixes, takip sistemi var mı?
- "Sprint 139 E2E test 19 sprint gap" — dokümanlarda belirtilmiş.

## 9. Dead Code Candidates
- `CLAUDE_SUBPROCESS_CONFIG.buildCommandString` — `buildCommand` çağrıldığında kullanılıyor. OK.

## 10. Security Findings
- Fallback result: `code === 0 ? 'GO_WITH_TECH_DEBT' : 'NO_GO'` — bu çıktı Brain'in GO/NO_GO kararını etkiler. Exit code 0 ile biten ama hatalı çalışan işlemler 'GO_WITH_TECH_DEBT' alır → kabul edilebilir.
- stdin üzerinden prompt iletimi — prompt kullanıcı tarafından oluşturulduğu için injection riski teorik.
- Windows `shell: true` — platform bayrağına bağlı ✓

## 11. Memory V2 Uyumu - İlgisiz.

## 12. Öneriler
- BUG-# comment'lerini gerçek issue tracker'a taşı.
- Exit code 0 = GO_WITH_TECH_DEBT yerine DONE olabilir (eğer result dosyası yoksa).

## 13. Verdict: ANALYZED
