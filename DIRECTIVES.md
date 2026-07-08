# DIRECTIVES — SPRINT-4: BÜYÜK-KESİT REPL/AGENT/SECURITY/CORE (27 task, dep-graph'lı)

## Goal
Dogfood maratonunun ölçek-turu: 27 DISTINCT-FILE born-item (OPEN, dedup'lı — 26 DONE'a karşı
kesişim ∅). REPL/native-agent/provider/agent-runtime/security/core kesiti. Dependency-graph ile
app.tsx/run.tsx hub-yazarları serialize (Task 1-4 zinciri), kalan 23 singleton tam-paralel.
git-guard CANLI (scatter-güvenli). born-backlog SSOT: `.analysis/deckent-marathon-loop-state.md`.
Yasa #1 (çift-bakış+ölçek) · #2 (cross-platform) · #3 (no-MVP/god-level).

## 🔒 BAĞLAYICI
- **DISTINCT-FILE (KAPALI — dokunma):** sprint-planner / result-evaluator / sprint-phases /
  result-collector / sprint-controller / server.ts / config.ts / routing-engine.ts / adr-selector.ts.
  (Son ikisi CC el-kodluyor — paralel akış, çakışma yok.)
- **git stash/reset/checkout/clean YASAK** (born-499 runtime-guard'lı; salt-okuma için `git show HEAD:<yol>`).
- Her task **kendi test dosyası** + **hermetik**: tüm I/O tmpdir/`os.tmpdir()`, async `spawn` (spawnSync YOK),
  gitignored-state okuma YOK (`.deckent/config.json`/`.brain/memory.db`/`~/.deckent`/`.deck`).
- **i18n-FIRST:** kullanıcıya görünen string ASLA hardcode değil → `getMessage(key, lang)` (`src/cli/helpers/messages.ts`, en/tr).
- `notes` alanı **TEK STRING**. Self-assessment DÜRÜST (DONE = goCriteria kanıtlı; LP-10 host-side
  `filesChanged`/`linesAdded` disk-verify eder — boş `filesChanged` + DONE = false-DONE sayılır).
- **Surgical:** yalnız `Files:` listesindeki dosyalara yaz; minimum-diff; scope-dışı reformat YOK; mevcut testleri bozma.
- **Dependency:** aksi belirtilmedikçe `Dependencies: none`. Zincir = Task 1→2→3, Task 1→4 (app.tsx/run.tsx serialize).

---

## Task 1: born-492 — W1-EXPERIENCE-ON — repl_surface i18n flip'i tamamla (P0)
- Model: sonnet
- Effort: high
- Agent: terminal-ux-engineer
- Skills: typescript-expert, ink-tui, testing-expert
- Files: src/cli/repl/run.tsx, src/cli/repl/app.tsx, src/agent/identity.ts, src/cli/helpers/messages.ts, tests/cli/repl-i18n-flip.test.ts
- Scope: src/cli/repl/, src/cli/helpers/, src/agent/, tests/cli/
- Dependencies: none
### Description
repl_surface/tool_surface/simple_mode/question_bridge default-flip'inin i18n ipliği eksik. FIX:
run.tsx (~425-446) `ReplLabels`'in mode/resume/busy-control alanlarını `getMessage`'dan doldur
(şu an /ask·/run·/control, /queue·/interrupt·/steer, resume-picker hardcode İngilizce); approvalLabels'ı
ApprovalCard/mode-indicator'a thread'le; messages.ts'e eksik resume-picker/busy-control key'lerini ekle
(en/tr); `composeSystemPrompt()` (identity.ts:42) kabul ettiği `lang` opsiyonunu GERÇEKTEN okusun;
`native.switch.no-transport` key'inin messages.ts'te var olduğunu doğrula.
### goNogo
- goCriteria: lang=tr ile bare `deckent` → /ask·/run·/control + resume-picker + ApprovalCard hepsi Türkçe render (test); yeni key'ler messages.ts'te (en+tr) grep'le görünür.
- nogo: default-flip'i geri-alma; İngilizce default davranışını bozma.

## Task 2: born-493 — W2-WIRE — native-engine'i slash-dispatcher'a köprüle (24/37 komut sessiz-düşüyor) (P0)
- Model: sonnet
- Effort: high
- Agent: terminal-ux-engineer
- Skills: typescript-expert, ink-tui, testing-expert
- Files: src/cli/repl/app.tsx, src/cli/repl/native-agent-bridge.ts, src/cli/repl/native-tool-registry.ts, src/cli/commands/chat-slash-registry.ts, src/cli/commands/chat-native.ts, src/agent/session.ts, tests/cli/native-slash-bridge.test.ts
- Scope: src/cli/repl/, src/cli/commands/, src/agent/, tests/cli/
- Dependencies: Task 1
### Description
Default native-engine'de menü 37 komut gösteriyor ama handleSubmit ~15'ini özel-case'liyor; kalan ~24
(/help /kill /cleanup /recover /nervous /interrogate /mcp dahil) app.tsx plain-text enqueue'ya sessizce
düşüyor (no-op). FIX: native-agent-bridge.ts turn-loop'unu chat-native.ts `resolveSlash` dispatcher'a
köprüle VEYA her agenticTool-taşıyan SLASH_CATALOG girişi için native-tool kaydet; /help native-engine'de
trust-badge'li katalog render etsin; native-engine chat-history'yi persist et (/resume için); session.ts
`setApprovalMode` (0-caller ölü) /approve <mode>'dan erişilebilir olsun (false 'onay modu ayarlandı' düzelt);
chat-slash-registry.ts:199-296 bayat "guaranteed pre-registry interception" yorumlarını güncelle.
### goNogo
- goCriteria: `printf '/help\n' | node dist/cli/entry.js` (bare, --native'siz) tam katalog render eder, düz-metin değil (test); /kill gerçek confirm-gated yola gider; /approve full-auto sonrası confirm-tier tool y/n atlar.
- nogo: legacy chat yolunu bozma; komut yüzeyini daraltma.

## Task 3: born-551 — REPL-TURN-EXCEPTION-SURFACE — turn-loop istisnaları yutulmuyor (P1)
- Model: sonnet
- Effort: normal
- Agent: terminal-ux-engineer
- Skills: typescript-expert, ink-tui, testing-expert
- Files: src/cli/repl/app.tsx, tests/cli/repl-turn-exception.test.ts
- Scope: src/cli/repl/, tests/cli/
- Dependencies: Task 2
### Description
app.tsx turn-loop'unda fırlatılan istisnalar sessizce yutulup kullanıcıya hiçbir sinyal vermiyor
(donmuş-gibi görünüyor). FIX: turn-loop exception'ını yakala → kullanıcıya görünür i18n hata-satırı
(getMessage) render et + transcript tutarlı kalsın; sessiz-yut YOK.
### goNogo
- goCriteria: turn-loop'ta istisna fırlatan bir senaryo kur → REPL görünür hata gösterir, sessiz-donma değil (test); normal-tur bozulmaz.
- nogo: istisnayı process-crash'e çevirme (graceful kal).

## Task 4: born-549 — SIGTERM-TEARDOWN — sinyal-temizliği eksik (warm-child/MCP/Windows) (P1)
- Model: sonnet
- Effort: high
- Agent: terminal-ux-engineer
- Skills: typescript-expert, sh-portability, testing-expert
- Files: src/cli/entry.ts, src/cli/repl/run.tsx, tests/cli/sigterm-teardown.test.ts
- Scope: src/cli/, src/cli/repl/, tests/cli/
- Dependencies: Task 1
### Description
SIGTERM/SIGINT'te warm-child process, MCP broker ve terminal-state düzgün teardown edilmiyor →
orphan-process + Windows'ta bozuk-terminal. FIX: entry.ts + run.tsx'e sinyal-handler ekle: warm-child
kill (process-group), MCP broker dispose, terminal-restore; cross-platform (Law #2 — POSIX signal + Windows
`SIGINT`/`SIGBREAK` eşdeğeri, platform-adapter'lı, unsupported honest-fail).
### goNogo
- goCriteria: REPL'e SIGTERM gönder → warm-child + MCP broker temizlenir, orphan kalmaz (test, async spawn ile); Windows-yolu honest kod-yolu taşır (spawnSync YOK).
- nogo: normal-exit yolunu bozma.

## Task 5: born-563 — MEMORY-TENANT-ISOLATION — tenant izolasyonu default-ON (P1)
- Model: sonnet
- Effort: high
- Agent: security-auditor
- Skills: typescript-expert, security-specialist, testing-expert
- Files: src/core/memory-store.ts, tests/core/memory-tenant-isolation.test.ts
- Scope: src/core/, tests/core/
- Dependencies: none
### Description
memory-store tenant-izolasyonu default-ON değil + NULL-tenant sorgu cross-tenant eşleşebiliyor
(multi-tenant sızıntı riski — Yasa #1 milyon-proje). FIX: tenant-filter default-ON; NULL/eksik tenant →
cross-tenant match YOK (fail-closed); mevcut single-tenant yol korunur.
### goNogo
- goCriteria: tenant-A insert + tenant-B sorgu → A'nın kaydı GÖRÜNMEZ (test); NULL-tenant sorgu tüm-tenant getirmez; mevcut memory-query testleri yeşil.
- nogo: FTS5/query şemasını yeniden-yazma; single-tenant perf'i bozma.

## Task 6: born-564 — PANIC-GATE-FAILCLOSED — fail-closed marker yanlış yorumlanıyor (P1)
- Model: sonnet
- Effort: normal
- Agent: security-auditor
- Skills: typescript-expert, security-specialist, testing-expert
- Files: src/nervous/panic-gate.ts, tests/nervous/panic-gate-failclosed.test.ts
- Scope: src/nervous/, tests/nervous/
- Dependencies: none
### Description
panic-gate fail-closed marker'ını yanlış yorumluyor → panic durumunda fail-OPEN riskine düşebilir.
FIX: marker-yokluğunu/belirsizliğini fail-CLOSED (güvenli) yorumla; yalnız açık-güvenli-marker fail-open'a izin versin.
### goNogo
- goCriteria: marker eksik/belirsiz → gate KAPALI (test, güvenli-taraf); açık-güvenli marker → normal geçiş.
- nogo: panic-gate'in meşru-açık yolunu bozma.

## Task 7: born-567 — SPAWN-SAFETY-WIRE — assertSpawnSafe her spawn call-site'ına (P1)
- Model: sonnet
- Effort: normal
- Agent: security-auditor
- Skills: typescript-expert, security-specialist, testing-expert
- Files: src/core/spawn-safety.ts, tests/core/spawn-safety-wire.test.ts
- Scope: src/core/, tests/core/
- Dependencies: none
### Description
`assertSpawnSafe` var ama her spawn call-site'ından çağrılmıyor (kısmi-koruma). FIX: spawn-safety.ts'i
merkezî-doğrulama olarak sağlamlaştır + eksik call-site'ları kapsayan API sun (call-site'lar başka
dosyalarda ise burada re-export edilebilir guard + test). Mevcut davranış korunur, kapsam genişler.
### goNogo
- goCriteria: unsafe-spawn argümanı assertSpawnSafe tarafından reddedilir (test); safe-spawn geçer; export edilen guard call-site'lardan çağrılabilir.
- nogo: spawn semantiğini değiştirme (yalnız doğrulama-katmanı).

## Task 8: born-568 — PROCESS-GROUP-KILL — 6 adapter'da SIGTERM→SIGKILL process-group (P1)
- Model: sonnet
- Effort: high
- Agent: security-auditor
- Skills: typescript-expert, provider-cli-matrix, testing-expert
- Files: src/providers/subprocess.ts, src/providers/codex.ts, src/providers/gemini.ts, tests/providers/process-group-kill.test.ts
- Scope: src/providers/, tests/providers/
- Dependencies: none
### Description
Provider adapter'ları child'ı öldürürken process-GROUP'u öldürmüyor → orphan grandchild + escalation yok.
FIX: subprocess/codex/gemini (ve paylaşılan yol üzerinden 6 adapter) için process-group kill +
SIGTERM→(grace)→SIGKILL escalation; cross-platform (Law #2 — POSIX `-pid` group / Windows taskkill /T).
### goNogo
- goCriteria: uzun-koşan child spawn → teardown grandchild dahil process-group'u öldürür, orphan kalmaz (test, async); SIGTERM sonrası grace-timeout içinde SIGKILL.
- nogo: normal-exit path'i bozma; claude tmux-default yolunu bu task'ta değiştirme.

## Task 9: born-571 — FLOW-EVENT-DISPATCH — flow approve reader + `flow approve` komutu (P1)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/flow.ts, src/core/flow-runtime.ts, src/core/event-trigger.ts, tests/core/flow-event-dispatch.test.ts
- Scope: src/cli/commands/, src/core/, tests/core/
- Dependencies: none
### Description
flow event-trigger dispatch yolu eksik: approveDispatch reader yok + `flow approve` komutu yok →
event-tetiklemeli flow onay bekleyip ilerleyemiyor. FIX: flow-runtime approveDispatch reader'ı wire et +
event-trigger dispatch'i bağla + `flow approve <id>` CLI komutu ekle (i18n çıktı).
### goNogo
- goCriteria: event-tetiklemeli flow onay-bekler → `flow approve <id>` gerçekten dispatch eder + flow ilerler (test); onaysız ilerlemez.
- nogo: flow şemasını yeniden-tasarlama.

## Task 10: born-83 — TOOL-CU — computer-use wire + navigate/region-screenshot + injection-harden (P2)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, sh-portability, testing-expert
- Files: src/core/computer-use-exec.ts, tests/core/computer-use-exec.test.ts
- Scope: src/core/, tests/core/
- Dependencies: none
### Description
`executeComputerUseAction` 0-caller (cu-status dışında); `navigate` + region-screenshot kalıcı-unimplemented;
AppleScript/PowerShell string-injection el-yapımı escaping'e dayanıyor. FIX: executeComputerUseAction'ı
gerçek call-site'a wire et; navigate + region-screenshot impl; injection yüzeyini parametrize-invocation'a
taşı (string-concat YOK). Cross-platform (Law #2 — en az bir platformda gerçek round-trip, diğerleri honest-fail).
### goNogo
- goCriteria: crafted-arg injection testi güvenli-fail eder (test); executeComputerUseAction gerçek-caller'dan erişilir; navigate+screenshot en az bir platformda round-trip.
- nogo: injection'ı el-escaping'le "yamamak" (parametrize ŞART).

## Task 11: born-203 — ONB-2 — rich doctor: Windows-native profil + auth-state probe (P1)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, sh-portability, testing-expert
- Files: src/cli/commands/doctor.ts, src/cli/commands/doctor-checks.ts, tests/cli/doctor-windows-profile.test.ts
- Scope: src/cli/commands/, tests/cli/
- Dependencies: none
### Description
doctor'un KALAN'ı: tam Windows-native profil kapsaması + auth-state probe derinliği (mevcut 3-state
kontrolün ötesi). FIX: Windows-native profil per-check honest-state + auth-state probe derinleştir (Law #2).
### goNogo
- goCriteria: simüle Windows-native profilde `deckent doctor --fix` → per-check honest-state raporu (test); auth-state 3-state'ten derin.
- nogo: mevcut POSIX doctor davranışını bozma.

## Task 12: born-503 — HUB-P0 — Ed25519 signing + sandbox-on-install + BUILTIN_TRUSTED_SKILLS id fix (P2)
- Model: sonnet
- Effort: high
- Agent: security-auditor
- Skills: typescript-expert, secure-coding, testing-expert
- Files: src/core/signature.ts, src/core/marketplace/skill-sandbox.ts, tests/core/skill-signing-sandbox.test.ts
- Scope: src/core/, src/core/marketplace/, tests/core/
- Dependencies: none
### Description
Gerçek Ed25519 keygen+signing eksik; `skill install` sandbox zorlamıyor (yalnız publish);
skill-sandbox.ts:197 4 yanlış BUILTIN_TRUSTED_SKILLS id. FIX: Ed25519 keygen+sign+verify (node:crypto);
`skill install`'ı sandbox-required yap; BUILTIN_TRUSTED_SKILLS id'lerini gerçek skill-id'lere düzelt.
### goNogo
- goCriteria: install (yalnız publish değil) sandbox zorlar (test); BUILTIN_TRUSTED_SKILLS id'leri gerçek skill'lerle eşleşir; Ed25519 sign→verify round-trip geçer.
- nogo: yeni crypto-dependency ekleme (node:crypto yeterli).

## Task 13: born-522 — MCP-CLIENT-GATE — mcp_client_enabled ölü-gate: wire ya da kaldır (P2)
- Model: sonnet
- Effort: normal
- Agent: terminal-ux-engineer
- Skills: typescript-expert, testing-expert
- Files: src/cli/repl/mcp-bridge.ts, tests/cli/mcp-client-gate.test.ts
- Scope: src/cli/repl/, tests/cli/
- Dependencies: none
### Description
Belgelenmiş opt-in `mcp_client_enabled` gate'i ölü-kod — gerçek default-yol (run.tsx) onu tamamen
bypass ediyor (yanıltıcı config-flag). FIX: mcp_client_enabled gerçek wiring'i gate'lesin, VEYA flag'i
config-şema+doc'tan kaldır (yanıltıcı kullanıcı-kontrolü ima etmesin). Karar goCriteria'da kanıtlanır.
### goNogo
- goCriteria: mcp_client_enabled=off → MCP-bridging gerçekten kapalı (test), VEYA flag config-şema+doc'tan kalkar (grep 0-match).
- nogo: flag'i hem tutup hem inert bırakma (ikisinden biri).

## Task 14: born-523 — AGENTIC-CONFIRM-HARDEN — readline reuse + SAFE-before-RISKY sıralama (P2)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/agentic-confirm.ts, tests/cli/agentic-confirm-harden.test.ts
- Scope: src/cli/commands/, tests/cli/
- Dependencies: none
### Description
`confirmAction()` caller'ın aktif readline.Interface'i varken aynı stdin/stdout'ta İKİNCİ bir
interface açıyor (keystroke-çakışma); ayrıca SAFE-substring RISKY'den önce kontrol edildiği için
SAFE-substring içeren riskli-aksiyon yanlış-güvenli sınıflanabiliyor. FIX: caller'ın mevcut
readline.Interface'ini reuse et; SAFE-before-RISKY sıralamasını düzelt (RISKY kazanır).
### goNogo
- goCriteria: caller-owned readline aktifken confirmAction → stdin-çakışma yok (test); SAFE+RISKY substring'li aksiyon → RISKY sınıflanır.
- nogo: confirm UX-metnini değiştirme.

## Task 15: born-524 — TOOL-PERM-TIER — deckent_start/run/process explicit tier (P2)
- Model: sonnet
- Effort: normal
- Agent: security-auditor
- Skills: typescript-expert, security-specialist, testing-expert
- Files: src/cli/repl/tool-permissions.ts, tests/cli/tool-permission-tier.test.ts
- Scope: src/cli/repl/, tests/cli/
- Dependencies: none
### Description
`classifyTool()` catch-all 'read' default'u deckent_start/run/process'i özel-case'lemiyor → bu güçlü
tool'lar en-zayıf izin-tier'ını alıyor. FIX: deckent_start/run/process için explicit tier girişleri ekle
(generic read catch-all'a düşmesinler).
### goNogo
- goCriteria: classifyTool(deckent_start|run|process) → her biri kendi doğru tier'ını alır, generic read değil (test); diğer tool'ların tier'ı bozulmaz.
- nogo: tier-şemasını yeniden-tasarlama.

## Task 16: born-525 — CHAT-RENDER-MARKDOWN — inline-reset bleed + link paren truncation (P2)
- Model: sonnet
- Effort: normal
- Agent: terminal-ux-engineer
- Skills: typescript-expert, ink-tui, testing-expert
- Files: src/cli/commands/chat-render.ts, tests/cli/chat-render-markdown.test.ts
- Scope: src/cli/commands/, tests/cli/
- Dependencies: none
### Description
renderMarkdown: iç inline-code/link RESET'i satırın geri kalanı için dış heading/bold stilini erken
sonlandırıyor; markdown link-regex'i dengeli-parantezli URL'de ilk ')'de truncate ediyor (kaçak ')').
FIX: iç RESET dış-stili bozmasın; link-regex dengeli-parantezli URL'i truncate etmesin.
### goNogo
- goCriteria: `**bold `code` sonrası metin**` satırı → inline-code sonrası stil devam eder (test); parantezli URL (Wikipedia-tarzı) truncate/leak olmaz.
- nogo: markdown grameri genişletme (yalnız iki bug).

## Task 17: born-534 — APPROVAL-CHANNEL-DISPOSE — dispose() decisionHandler null'lamıyor (P2)
- Model: sonnet
- Effort: low
- Agent: terminal-ux-engineer
- Skills: typescript-expert, testing-expert
- Files: src/cli/repl/approval-terminal-channel.ts, tests/cli/approval-channel-dispose.test.ts
- Scope: src/cli/repl/, tests/cli/
- Dependencies: none
### Description
`dispose()` decisionHandler'ı null'lamıyor → dispose sonrası dangling-handler / leak. FIX: dispose'da
decisionHandler = null (+ ilgili listener temizliği).
### goNogo
- goCriteria: dispose() sonrası decisionHandler null + sonraki decision no-op (test).
- nogo: dispose imzasını değiştirme.

## Task 18: born-538 — TOOL-BRIDGE-ERR-CLASS — permission-denied vs runtime-error ayır (P3)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/chat-tool-bridge.ts, tests/cli/tool-bridge-err-class.test.ts
- Scope: src/cli/commands/, tests/cli/
- Dependencies: none
### Description
chat-tool-bridge permission-denied ile gerçek runtime-error'ı aynı-şekilde raporluyor → kullanıcı
"neden başarısız" ayırt edemiyor. FIX: iki sınıfı ayır (denied → i18n permission-mesajı; runtime →
hata-detayı). (509 chat-tool-bridge error-listener'ını BOZMA — commit'li.)
### goNogo
- goCriteria: permission-denied → "izin reddedildi" sınıfı; runtime-error → "çalışma hatası" sınıfı, ayrı (test).
- nogo: 509'un eklediği 'error' listener'ını kaldırma.

## Task 19: born-539 — CHAT-PERM-CONCURRENCY — read-merge-write concurrent grant kaybı (P2)
- Model: sonnet
- Effort: normal
- Agent: security-auditor
- Skills: typescript-expert, security-specialist, testing-expert
- Files: src/cli/commands/chat-permissions.ts, tests/cli/chat-perm-concurrency.test.ts
- Scope: src/cli/commands/, tests/cli/
- Dependencies: none
### Description
chat-permissions read-merge-write eşzamanlı grant'lerde son-yazan-kazanır → grant kaybı. FIX: atomik
read-merge-write (mevcut 555 permission-store deseniyle tutarlı — o commit'li); eşzamanlı grant'ler kaybolmaz.
### goNogo
- goCriteria: iki eşzamanlı grant → ikisi de kalıcı (test, kayıp yok); mevcut permission testleri yeşil.
- nogo: 555 permission-store read-merge-write davranışını bozma.

## Task 20: born-543 — AGENT-LOOP-CANCEL — cancel() in-flight interrupt + orphan tool_use yok (P2)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/agent/loop.ts, tests/agent/loop-cancel.test.ts
- Scope: src/agent/, tests/agent/
- Dependencies: none
### Description
agent/loop `cancel()` in-flight handler'ı interrupt etmiyor + iptal orphan tool_use bırakabiliyor
(sonraki provider-call reject). FIX: cancel() in-flight'ı düzgün interrupt etsin; orphan tool_use bırakmasın
(pairing koru/ikisini düş). (519 primaryResource cmd-key fix'ini BOZMA — commit'li.)
### goNogo
- goCriteria: in-flight turda cancel() → handler durur, orphan tool_use kalmaz, sonraki call temiz (test).
- nogo: 519'un cmd-key düzeltmesini geri-alma.

## Task 21: born-544 — OPENAI-TOOLCALL-ID — tool-call ID benzersizliği (P2)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/agent/provider-tooluse/openai.ts, tests/agent/openai-toolcall-id.test.ts
- Scope: src/agent/provider-tooluse/, tests/agent/
- Dependencies: none
### Description
openai provider-tooluse tool-call ID benzersizliğini garanti etmiyor → çakışan ID'ler yanlış eşleşme.
FIX: tool-call ID'lerini benzersiz üret/doğrula.
### goNogo
- goCriteria: aynı-turda çok tool-call → hepsi benzersiz ID (test); tool_result eşleşmesi doğru.
- nogo: anthropic/ollama adapter'ına dokunma.

## Task 22: born-545 — ANTHROPIC-ERR-BODY — hata gövdesini yanıta dahil et (P3)
- Model: sonnet
- Effort: low
- Skills: typescript-expert, anthropic-sdk, testing-expert
- Files: src/agent/provider-tooluse/anthropic.ts, tests/agent/anthropic-err-body.test.ts
- Scope: src/agent/provider-tooluse/, tests/agent/
- Dependencies: none
### Description
anthropic provider-tooluse hata durumunda response-body'yi hata mesajına dahil etmiyor → debug-kör.
FIX: hata-yolunda response body'yi hata mesajına ekle. (532 parallel-toolresult birleştirmeyi BOZMA — commit'li.)
### goNogo
- goCriteria: anthropic hata-yanıtı → fırlatılan hata response-body içerir (test); başarı-yolu bozulmaz.
- nogo: 532'nin sibling-tool_result birleştirmesini geri-alma.

## Task 23: born-546 — TRANSCRIPT-EVICTION — truncation/eviction politikası (P2)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/agent/transcript.ts, tests/agent/transcript-eviction.test.ts
- Scope: src/agent/, tests/agent/
- Dependencies: none
### Description
transcript truncation/eviction politikası eksik/tutarsız → sınırsız-büyüme ya da keyfi-kesim.
FIX: net truncation/eviction politikası (yaş/boyut-tabanlı; tool-pairing koruyarak — 510 deseniyle tutarlı).
### goNogo
- goCriteria: transcript sınırı aşınca eviction politikası uygulanır, tool-pairing korunur (test); küçük-transcript bozulmaz.
- nogo: 510 orphan-tool_result korumasını ihlal etme.

## Task 24: born-553 — MCP-BRIDGE-DROP-WARN — görünür drop-warning + double-audit fix (P2)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/chat-mcp-bridge.ts, tests/cli/mcp-bridge-drop-warn.test.ts
- Scope: src/cli/commands/, tests/cli/
- Dependencies: none
### Description
chat-mcp-bridge tool sessizce düşürüyor (görünür-uyarı yok) + aynı çağrıyı iki-kez audit'liyor. FIX:
drop'ta görünür i18n-uyarı; double-audit'i tek-audit'e indir.
### goNogo
- goCriteria: tool drop → görünür uyarı (test); audit tek-kayıt (çift değil).
- nogo: audit-şemasını değiştirme.

## Task 25: born-554 — TERM-SHELL-FALLBACK — platform-aware shell fallback (P2)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, sh-portability, testing-expert
- Files: src/api/terminal/session-manager.ts, tests/api/terminal-shell-fallback.test.ts
- Scope: src/api/terminal/, tests/api/
- Dependencies: none
### Description
terminal session-manager shell-seçimini platform-aware fallback'siz yapıyor → Windows/eksik-shell'de
kırılıyor. FIX: platform-aware shell fallback (POSIX $SHELL→sh; Windows cmd/powershell; honest-fail). (Law #2)
### goNogo
- goCriteria: shell env-var yok/Windows → uygun platform-shell'e fallback (test); mevcut POSIX yolu korunur.
- nogo: server.ts'e dokunma (session-manager kapsamı).

## Task 26: born-577 — AUTONOMOUS-START-HONEST — action=start ya loop spawn ya honest-rename (P2)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/mcp/tools/autonomous.ts, tests/mcp/autonomous-start-honest.test.ts
- Scope: src/mcp/tools/, tests/mcp/
- Dependencies: none
### Description
mcp autonomous action=start gerçekten loop spawn etmiyor ama "start" der (yanıltıcı). FIX: ya gerçek
loop-spawn yap ya action'ı dürüstçe yeniden-adlandır (no-false-success). (`feedback_zero_hardcode_live_data`).
### goNogo
- goCriteria: action=start → gerçek loop spawn eder VEYA honest-adla dürüst-durum döner (test); false-success YOK.
- nogo: MCP tool-şemasını sessizce bozma (kayıtlıysa geriye-uyum notu).

## Task 27: born-581 — ESM-IMPORT-FIX — require('fs')→ESM import (P2)
- Model: sonnet
- Effort: low
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/promotion-pipeline.ts, tests/orchestra/promotion-esm-import.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
promotion-pipeline.ts CommonJS `require('fs')` kullanıyor (ESM/Node16 ihlali — gotcha). FIX: `import` (ESM)
+ `.js` uzantısı; require kaldır.
### goNogo
- goCriteria: `require('fs')` kalkar, ESM `import` gelir (grep 0-match require); `npx tsc` temiz; promotion testleri yeşil.
- nogo: promotion mantığını değiştirme (yalnız import-form).
