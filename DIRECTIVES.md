# DIRECTIVES — SPRINT-6: REPL/CLI/API TAIL KESİTİ (7 task, dogfood-gate)

## Goal
Maraton (b): 7 OPEN born-item (dedup ∅ — 66 DONE'a karşı). REPL/CLI/api-governance polish kesiti.
6 distinct-file paralel + 1 zincir (575→583 enterprise-endpoint serialize). prompt-gate (G1a/G1d/G1c)
plan-time dogfood. git-guard CANLI. SSOT: `.analysis/deckent-marathon-loop-state.md`. Yasa #1/#2/#3.

## 🔒 BAĞLAYICI
- **DISTINCT-FILE (KAPALI):** sprint-planner/result-evaluator/sprint-phases/result-collector/sprint-controller/server.ts/config.ts/routing-engine.ts/adr-selector.ts/prompt-gate.ts.
- **git stash/reset/checkout/clean YASAK** (born-499 guard; salt-oku `git show HEAD:<yol>`).
- Her task kendi testi + hermetik (tmpdir/async spawn/no spawnSync/no gitignored-state). i18n getMessage.
- `notes` TEK STRING. Self DÜRÜST (LP-10 disk-verify). Surgical minimum-diff. Mevcut testleri bozma.

## Task 1: born-529 — REPL-ERRORBOUNDARY-I18N — ReplErrorBoundary label prop (P3)
- Model: sonnet
- Skills: typescript-expert, ink-tui, testing-expert
- Files: src/cli/repl/run.tsx, tests/cli/repl-errorboundary-i18n.test.ts
- Scope: src/cli/repl/, tests/cli/
- Dependencies: none
### Description
ReplErrorBoundary kullanıcıya-görünen label'ı hardcode (i18n-ihlali). FIX: label'ı prop olarak enjekte et, caller `getMessage(key, lang)`'dan doldursun; mekanizma string-free kalsın (İngilizce default).
### goNogo
- goCriteria: ReplErrorBoundary label prop'tan gelir, hardcode string kalmaz (test); lang=tr → Türkçe render.
- nogo: error-boundary davranışını (catch/fallback) değiştirme.

## Task 2: born-530 — REPL-CLEAR-ANSI — /clear gerçek ANSI-clear + in-flight stream cancel (P2)
- Model: sonnet
- Skills: typescript-expert, ink-tui, testing-expert
- Files: src/cli/repl/app.tsx, tests/cli/repl-clear-ansi.test.ts
- Scope: src/cli/repl/, tests/cli/
- Dependencies: none
### Description
/clear yalnız JS-transcript'i temizliyor; gerçek terminal ANSI-clear yok + in-flight stream iptal edilmiyor. FIX: /clear gerçek ANSI screen-clear yapsın + devam-eden stream'i iptal etsin. (513 /clear warm-child context fix'ini BOZMA — commit'li.)
### goNogo
- goCriteria: /clear → ekran ANSI-temizlenir + in-flight stream durur (test); normal-tur bozulmaz.
- nogo: 513'ün warm-child context-reset'ini geri-alma.

## Task 3: born-537 — EDIT-FILE-UNIQUE — edit_file unique-match/replace-all + empty-old error (P2)
- Model: sonnet
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/chat-tool-exec.ts, tests/cli/edit-file-unique.test.ts
- Scope: src/cli/commands/, tests/cli/
- Dependencies: none
### Description
edit_file: (a) old_string birden çok eşleşince sessizce ilkini değiştiriyor (belirsizlik) · (b) replace-all yok · (c) boş old_string hata vermiyor. FIX: çoklu-eşleşmede hata (unique-ŞART) veya replace-all opsiyonu; boş old_string → açık hata. (536 symlink-resolution'ı BOZMA — commit'li.)
### goNogo
- goCriteria: çoklu-eşleşmeli old_string → hata/replace-all (test); boş old_string → açık hata; tek-eşleşme normal.
- nogo: 536'nın fs.realpath scope-kontrolünü geri-alma.

## Task 4: born-541 — RENDER-REGION-SAFEPROMPT — safePrompt narrow catch (P3)
- Model: sonnet
- Skills: typescript-expert, ink-tui, testing-expert
- Files: src/cli/commands/chat-render-region.ts, tests/cli/render-region-safeprompt.test.ts
- Scope: src/cli/commands/, tests/cli/
- Dependencies: none
### Description
`safePrompt` geniş catch-all ile tüm hatayı yutuyor (gerçek-hata gizleniyor). FIX: catch'i daralt — yalnız beklenen prompt-hatasını yut, beklenmeyen hatayı yeniden-fırlat/logla. (540 writeAbove full-clear'ı BOZMA — commit'li.)
### goNogo
- goCriteria: beklenmeyen hata safePrompt tarafından yutulmaz (test, re-throw/log); beklenen prompt-abort normal ele alınır.
- nogo: 540'ın writeAbove clear'ını geri-alma.

## Task 5: born-548 — CRED-RESOLUTION — Gemini env + deepseek/qwen/glm .deck cred (P2)
- Model: sonnet
- Skills: typescript-expert, provider-cli-matrix, testing-expert
- Files: src/cli/entry.ts, src/cli/repl/native-transport.ts, tests/cli/cred-resolution.test.ts
- Scope: src/cli/, src/cli/repl/, tests/cli/
- Dependencies: none
### Description
Cred-resolution eksik: Gemini env-var yolu + deepseek/qwen/glm için `.deck` secret çözümü kapsanmıyor. FIX: bu provider'lar için cred-resolution'ı `.deck`→env deseniyle tamamla (mevcut applyDeckSecretsToEnv deseni). (547 NDJSON-fallback'i BOZMA — commit'li.)
### goNogo
- goCriteria: deepseek/qwen/glm `.deck` secret'ları env'e çözülür (test); Gemini env-var yolu çalışır; mevcut provider'lar bozulmaz.
- nogo: secret'ları log'a yazma (scrub koru).

## Task 6: born-575 — ENT-RBAC-ROUNDTRIP — enterprise RBAC/rate write-then-read round-trip (P2)
- Model: sonnet
- Agent: api-builder
- Skills: typescript-expert, secure-coding, testing-expert
- Files: src/api/enterprise-endpoint.ts, tests/api/ent-rbac-roundtrip.test.ts
- Scope: src/api/, tests/api/
- Dependencies: none
### Description
enterprise-endpoint RBAC/rate write-then-read round-trip'i eksik/tutarsız (yazılan rol/limit geri-okunmuyor). FIX: RBAC-rol + rate-limit write→read round-trip'i tutarlı yap (yazılan hemen okunur).
### goNogo
- goCriteria: RBAC-rol write → read aynı-değeri döner (test, round-trip); rate-limit aynı; server.ts'e dokunma.
- nogo: enterprise şemasını yeniden-tasarlama.

## Task 7: born-583 — GOV-MINORS — plugin-sig + opaque-bearer + deny-list loopback (P2)
- Model: sonnet
- Agent: api-builder
- Skills: typescript-expert, secure-coding, testing-expert
- Files: src/api/enterprise-endpoint.ts, tests/api/gov-minors.test.ts
- Scope: src/api/, tests/api/
- Dependencies: Task 6
### Description
enterprise-endpoint governance minör-küme: (a) plugin-signature doğrulama gap · (b) opaque-bearer token karşılaştırma timing-unsafe (`===`) · (c) deny-list loopback (127.0.0.1/::1) bypass. FIX: her birini kapat — plugin-sig doğrula, opaque-bearer `crypto.timingSafeEqual`, loopback'i deny-list'e dahil et. (575 RBAC round-trip'i BOZMA — aynı dosya, zincir.) [Not: bot SAFE/RISKY connectors-parçası ayrı-born'a bırakıldı — dosya-belirsizliği/orphan-risk.]
### goNogo
- goCriteria: opaque-bearer `timingSafeEqual` kullanır (test); loopback deny-list bypass edilemez; plugin-sig doğrulanır; server.ts'e dokunma.
- nogo: 575'in RBAC round-trip'ini geri-alma.
