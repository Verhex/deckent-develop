# Command Log

Bu log exact shell transcript değil, salt-okunur analiz komutlarının denetlenebilir amaç kaydıdır. Full outputs terminal session/tool logs'unda kalır. Hiçbir test/build/lint/Deckent commandı çalıştırılmadı.

## Başarılı salt-okunur komut sınıfları

| Komut/aile | Amaç |
|---|---|
| `git status --short`, `git diff --stat`, `git log -1 --stat`, `git branch -vv`, `git rev-parse HEAD` | Snapshot/worktree/HEAD authority |
| `rg --files`, `rg -n`, `rg -l`, `wc -l`, `find ... -type f` | Inventory, caller/consumer/source discovery |
| `sed -n`, `nl -ba` | Exact source/doc line inspection |
| `node --input-type=module -e ...` read-only JSON parsing | MASTER metrics, failure baseline, catalog counts |
| `better-sqlite3` `{readonly:true,fileMustExist:true}` | Existing provider observation schema/row count; no migration/write |
| `git status --short` repeated | External drift detection ve final scope audit |

## Rapor yazma komutları

- `mkdir -p codex-analysis/appendices` yalnız kullanıcı tarafından istenen output tree'yi oluşturdu.
- Tüm dosya içerikleri `apply_patch` ile ve yalnız `codex-analysis/` altında yazıldı.
- MASTER row audit'i önce readonly Node parser ile stdout'a üretildi, sonra ana ajan tarafından `apply_patch` ile eklendi.

## Başarısız / kullanılmayan denemeler

1. Read-only Node helper içinde child `git` spawn denemesi environment policy tarafından `EPERM` ile reddedildi; output kullanılmadı, doğrudan git komutlarıyla tekrar okundu.
2. `tsx -e` ile `buildProgram()` üzerinden exact CLI count alma denemesi `yoga-layout` top-level-await/CJS transform hatası verdi. Test/build çalıştırılmadı; CLI için source inventory contractı (≥45) kullanıldı.
3. Hiçbir web/network sorgusu yapılmadı.

Final status kontrolünde başlangıçtan sonra `scripts/test-failure-baseline.json` ve üç CLI test file'ında external patch görüldü; readonly diff working baseline'ı 114 dosya/565 failure olarak gösterdi. Bu patch rapor yazarı tarafından üretilmedi veya test edilmedi.

## Açıkça çalıştırılmayanlar

- `npm test`, Vitest, coverage
- `npm run build`, `build:all`, lint commands
- `deckent start/run/goal/mission/flow/autonomous/do/status`
- Provider login/auth/model calls
- DB migration veya config write
- Git commit/push/cleanup/reset/checkout
