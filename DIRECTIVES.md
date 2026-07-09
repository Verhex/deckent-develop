# DIRECTIVES — SPRINT-7: GOV/API-SECURITY + CROSS-PLATFORM + NPM-CONSUMER TAIL (6 task, dogfood-gate)

## Goal
Maraton devam (loop-goal): 6 OPEN born-item (result-file dedup: 79 TRUE-DONE / 15 debt-landed / 39 OPEN → bu 6
temiz+worker-uygun). 1 güvenlik (565 ai-session tool-allowlist) + 1 cross-platform Law#2 (580 provider spawn→
buildCliInvocation) + 2 npm-consumer (576 SDK-exports · 579 doctor-honesty) + 1 robustness (501 EPIPE) + 1 audit
(500 brain-exports, doc). 5 distinct-file paralel + 1 zincir (579→576 package.json serialize). prompt-gate
(G1a/G1d/G1c) plan-time dogfood. git-guard CANLI. SSOT: `.analysis/deckent-marathon-loop-state.md`. Yasa #1/#2/#3.

## 🔒 BAĞLAYICI
- **DISTINCT-FILE (KAPALI):** sprint-planner/result-evaluator/sprint-phases/result-collector/sprint-controller/server.ts/config.ts/routing-engine.ts/adr-selector.ts/prompt-gate.ts. **565 = server.ts TEK-YAZAR** (bu sprint'te başka task server.ts'e dokunmaz).
- **git stash/reset/checkout/clean YASAK** (born-499 guard; salt-oku `git show HEAD:<yol>`).
- Her task kendi testi + hermetik (tmpdir/async spawn/no spawnSync-in-test/no gitignored-state). i18n getMessage.
- `notes` TEK STRING. Self DÜRÜST (LP-10 disk-verify). Surgical minimum-diff. Mevcut testleri bozma.

## Task 1: born-501 — CLI-EPIPE-GRACEFUL — process-level EPIPE handler (P2)
- Model: sonnet
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/cli/entry.ts, tests/cli/epipe-graceful.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: none
### Description
`deckent status | head` gibi pipe-kesme kullanımında stdout/stderr EPIPE fırlıyor → crash-log üretiyor (crash-log'ların ~%80'i bu). FIX: process-seviyesi stdout/stderr `error`-handler ekle — `EPIPE`'te sessizce exit 0 (crash-log YAZMA); diğer hatalar mevcut davranışta kalsın. (Mevcut `process.on('unhandledRejection'/SIGTERM)` handler'larını BOZMA — entry.ts:903/1010 commit'li.)
### goNogo
- goCriteria: stdout/stderr EPIPE → sessiz exit 0, crash-log yok (test: pipe-close simüle → no throw / no crash-log write); EPIPE-dışı stream-error mevcut davranışta.
- nogo: unhandledRejection/signal handler'larını değiştirme; tüm hataları yutma (yalnız EPIPE).
- Smoke: `node dist/cli/entry.js status --json | head -1` → EPIPE crash-log YOK, exit 0.

## Task 2: born-565 — AI-SESSION-TOOL-ALLOWLIST — kind==='ai' client-tool validation (P1, güvenlik)
- Model: sonnet
- Agent: api-builder
- Skills: typescript-expert, secure-coding, testing-expert
- Files: src/api/server.ts, tests/api/ai-session-tool-allowlist.test.ts
- Scope: src/api/, tests/api/
- Dependencies: none
### Description
`POST /api/terminal/sessions` — `kind==='shell'` için config-gate var (server.ts:1961) ama `kind==='ai'` için client-supplied `input.tool` string'i allowlist/deny-list doğrulaması OLMADAN `terminalMgr.create({ tool: input.tool })`'e ulaşıyor → keyfi tool spawn riski. FIX: `kind==='shell'`'e uygulanan aynı tool-allowlist/deny-list doğrulamasını `kind==='ai'` (ve genel olarak tüm kind) için de uygula — doğrulanmamış client-tool string'i ASLA `spawn()`'a ulaşmasın; reddedince 400/403 + net hata. (357-009 shell-kind config-gate'ini BOZMA — commit'li.)
### goNogo
- goCriteria: `kind==='ai'` + allowlist-dışı `tool` → 400/403 reddi (test, gerçek HTTP round-trip veya handler-invoke); allowlist-içi tool normal geçer; shell-kind gate bozulmaz.
- nogo: terminal session şemasını yeniden-tasarlama; server.ts'in başka bölümüne dokunma (tek-yazar).
- Smoke: `POST /api/terminal/sessions {kind:'ai', tool:'<disallowed>'}` → reddedilir (spawn'a ulaşmaz).

## Task 3: born-576 — SDK-PACKAGE-EXPORTS — publish embeddable SDK entry in package.json (P2)
- Model: sonnet
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: package.json, tests/sdk/package-exports.test.ts
- Scope: ./, tests/sdk/
- Dependencies: none
### Description
Gömülebilir SDK kod-tam ama package.json `exports` haritası public entry-point'i YAYINLAMIYOR → dış npm-tüketici `import { createDeckentClient } from 'deckent'` yapamaz (yalnız in-repo CLI/test çalışır). FIX: SDK'nın public entry-point'ini `exports` map'e ekle (mevcut `"main": "./dist/index.js"` + `"exports"` bloğu ile tutarlı; alt-path gerekiyorsa `"./sdk"` veya uygun subpath). Var olan export'ları BOZMA. (SDK giriş-noktasını `src/`de doğrula — spec code-complete diyor; yanlış-path verme.)
### goNogo
- goCriteria: package.json `exports` SDK-entry içerir (test: `exports` map'ten SDK subpath çözülür + hedef dosya var); mevcut CLI/bin export'ları korunur; JSON geçerli.
- nogo: mevcut export/bin/main girişlerini kaldırma; olmayan bir entry-point uydurma (önce dosyayı doğrula).
- Smoke: `node -e "require('./package.json').exports"` → SDK-entry görünür; hedef dist-dosyası mevcut.

## Task 4: born-579 — DOCTOR-PREFLIGHT-HONESTY — pre-flight npm-install honesty (P2)
- Model: sonnet
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/doctor.ts, package.json, tests/cli/doctor-preflight-honesty.test.ts
- Scope: src/cli/commands/, ./, tests/cli/
- Dependencies: Task 3
### Description
`doctor --pre-flight` (doctor.ts:2260) npm-kurulu setup'larda sessizce devre-dışı (gereken `scripts/` yayınlanmıyor). FIX: ya `scripts/`'i package.json `files`'a ekleyip npm-tüketicide pre-flight çalışsın, YA da doctor --pre-flight bu install-modunda "check bu kurulumda mevcut değil" diye DÜRÜSTÇE raporlasın (sessizce skip ETME). Dürüst-rapor yolu tercih (minimum-diff, davranış-korur). (package.json'a 576 SDK-exports'undan SONRA dokun — zincir; `files`/`exports` çakışmasın. Mevcut doctor çıktılarını BOZMA — doctor.ts:630.)
### goNogo
- goCriteria: npm-install-modunda `doctor --pre-flight` ya çalışır ya "unavailable in this install mode" DÜRÜST raporlar (test: script-yokluğu simüle → honest-message, sessiz-skip yok); dev-modda mevcut davranış korunur.
- nogo: 576'nın exports değişikliğini geri-alma (package.json zincir); doctor'un diğer alt-komutlarını değiştirme.
- Smoke: `node dist/cli/entry.js doctor --pre-flight` → çalışır VEYA net "unavailable in npm-install" mesajı (sessiz-skip yok).

## Task 5: born-580 — PROVIDER-SPAWN-SAFE — bare spawn() → buildCliInvocation (P1, cross-platform Law#2)
- Model: sonnet
- Agent: bug-fixer
- Skills: typescript-expert, provider-cli-matrix, testing-expert
- Files: src/providers/codex.ts, src/providers/gemini.ts, src/providers/ollama.ts, src/providers/openai-compatible.ts, src/providers/openrouter.ts, tests/providers/spawn-safe-crossplatform.test.ts
- Scope: src/providers/, tests/providers/
- Dependencies: none
### Description
Windows-native kırılma kümesi (Law #2): provider adapter'ları çıplak `spawn('codex'/'gemini'/'ollama', …)` kullanıyor (codex.ts:191, gemini.ts:304, ollama.ts:243 + openai-compatible/openrouter) → Windows-native'de `.cmd`/PATH-resolution kırılır. FIX: her çıplak `spawn(<bin>, …)`'ı `src/core/provider.ts`'teki mevcut+doğru `buildCliInvocation()` deseniyle değiştir (shell-safe, cross-platform CLI-invocation; başka yerlerde zaten kullanılıyor). Davranışı KORU — yalnız invocation-katmanı cross-platform-güvenli olsun. (Orchestra spawn-site'ları — sprint-job-runner/sprint-finalizer — bu task'ta DEĞİL, loop-machinery; ayrı el-inceleme.)
### goNogo
- goCriteria: 5 provider'daki çıplak spawn → buildCliInvocation (test: invocation Windows-path/`.cmd` deseninde güvenli çözülür; mevcut arg-geçişi korunur); Linux/macOS davranışı bozulmaz.
- nogo: orchestra spawn-site'larına (sprint-job-runner.ts/sprint-finalizer.ts) dokunma; provider protokol/arg-semantiğini değiştirme.
- Smoke: `node -e "import('./dist/providers/codex.js')"` → import temiz; buildCliInvocation refere edilir (grep).

## Task 6: born-500 — BRAIN-EXPORTS-FORMAT-AUDIT — format+consumer+size analizi (P1, doc)
- Model: haiku
- Agent: documentation-writer
- Skills: documentation-writer
- Files: .analysis/brain-exports-format-audit-2026-07-09.md
- Scope: .analysis/
- Dependencies: none
### Description
`.brain/exports/` (decisions.md **488KB**, memory.md 223KB, debt.md 20KB, summary.md 7.5KB) format+fonksiyon+per-consumer-gereklilik+size/truncation-politikası+DB↔FS-sync-kontratı analizi. Tüketiciler (doctor + adr-validator/memory-import + CLAUDE.md-include + bot + goal-planner) doğrulanmış → **dosyalar SİLİNMEZ**. Deliverable: `.analysis/brain-exports-format-audit-2026-07-09.md` — her dosyanın (a) formatı (b) hangi tüketici okur (c) size/truncation önerisi (özellikle 488KB decisions.md) (d) DB↔FS sync-kontratı. Yalnız ANALİZ + öneri; kod/dosya değişikliği YOK.
### goNogo
- goCriteria: audit-md 4 export-dosyasını kapsar (format+consumer+size-öneri+sync-kontrat); decisions.md 488KB için somut truncation/pagination önerisi içerir; hiçbir export-dosyası silinmez/değişmez.
- nogo: `.brain/exports/` veya `.brain/memory.db`'ye dokunma; kod değiştirme (salt-doc).
