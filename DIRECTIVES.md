# DIRECTIVES — Sprint 224: Native REPL GERÇEKTEN claude-code (input/terminal + agentic-DO + nervous-wire + akış)

## Goal: BÜYÜK SPRINT (13 task, 5 dalga). Sprint 223 REPL wire'ı (layout+spinner+dispatcher+persistent) PR #18 ile main'e indi ve **gerçek terminalde çalışıyor** (kullanıcı doğruladı: `› ...` / `● deckent` / `⠙ düşünüyor…`). AMA Alperen run-verify bulgu defteri (2026-06-02) native-his eksiklerini ortaya koydu: **(🔴) line-editing/history YOK** (↑/→/Del ham escape sızıyor — canonical-mode input, readline keypress kapalı), **prompt çift-görünüm** (readline echo + `renderUserMessage` tekrar basıyor), **2. mesaj gitmiyor + paste satır-satır** (her satır ayrı tur, "düşünüyor"da yazı görünmüyor/silinemiyor), **(🔴) agentic-DO yok** (`deckent1st.md` oluşmadı — Write/Edit/Bash tool izni `--print`/stream-json'da sessiz blok, interaktif yüzey yok), **(🟠) `/nervous` "Unknown command"** (bridge stash'ten kurtarıldı ama wire değil), **(🟡) streaming chunky** (token-token pürüzsüz değil). Alperen direktifi: "Deckent CLI sohbetle çalışan (Copilot gibi) multi-model agentic OSS run system olmalı — claude-code yes/no + skill-tabanlı çoktan-seçmeli interaktif yapı." **DALGA A:** input/terminal native-his (line-edit+history+ok-tuş+prompt-fix+2.-mesaj+paste). **DALGA B:** agentic-DO (Write/Edit/Read/Bash tool katmanı + interaktif y/N **ve multi-select** onay — sessiz-blok bitir). **DALGA C:** nervous wire (kurtarılan `/nervous` bridge + banner + güvenli re-enable). **DALGA D:** streaming token-smooth. **DALGA E:** docs/ADR (stash'ten recover + gerçeklikle eşle) + smoke-harness run-proven. **god-level — MVP ASLA. RUN-VERIFY ZORUNLU: "modül var" YETMEZ — entry.ts gerçekten çağırır + gerçek terminal davranışı ölçülür.**

**BASE BRANCH:** `recover-sprint223-nervous-finalizer` (Sprint 223 kurtarılan WIP: panic-gate/observer/finalizer LIVE + nervous-bridge/banner modülleri DORMANT). Sprint 224 bunun üstünde geliştirilir; tamamlanınca birleşik merge.

Bağlam (Alperen+cc run-verify 2026-06-02, [[project_terminal_dashboard_ux_evolution]] + bulgu defteri):
- **Çalışan (KORUNUR):** persistent reuse (2. mesaj <1s), streaming (chunk-chunk, truncate yok), layout (`›`/`● deckent`), spinner, `/status`+`/recall`+`/plan`(y/N gated) dispatcher.
- **🔴 Input:** `entry.ts` `readStdin` → `createInterface({input: process.stdin})` — `output`/`terminal:true` YOK → canonical mode. Ok tuşları/Del ham escape (`^[[A`), history yok, line-edit yok.
- **🔴 Prompt çift:** TTY readline yazdığını gösterir + `renderUserMessage` `› ...` tekrar → çift görünüm.
- **🔴 Agentic:** loop'ta tool_use plumbing var (`stopReason:'tool_use'`→dispatcher) ama deckent tool seti (Write/Edit/Bash) YOK + izin onayı sessiz blok.
- **🟠 nervous-bridge:** `chat-nervous-bridge.ts` (getPendingNervous/renderNervousPrompt) kurtarıldı, chat-native'e wire DEĞİL → `/nervous` "Unknown command".
- **git-guard aktif. API mode YASAK (subscription, `env -u`). CI yeşil KORUNUR. nervous OFF kalsın (C3'e kadar).**

---

## Tüm task'lar için ortak kurallar
- **🟢 RUN-VERIFY ZORUNLU ([[feedback_wiring_pct_vs_user_working]] + [[feedback_proof_of_function_dod]]):** kanıt: (a) wire grep ÇAĞIRAN dosyada (def-dosya DIŞLA), (b) `Smoke:` ölçülebilir (gerçek `dist/cli/entry.js` davranışı). "modül var" = GO_WITH_TECH_DEBT; "wire+çalışıyor" = DONE. Mock-only = GO_WITH_TECH_DEBT.
- **🔌 WIRE-GAP ([[feedback_directive_kanit_letter_vs_goal]]):** 0-caller→canlı-caller; entry.ts/runChatNativeLoop GERÇEKTEN çağırır.
- **🔴 HERMETIK ([[project_ci_green_root_causes]]):** tmpdir+sandbox HOME, async spawn (spawnSync YASAK), `test:ci-sim`. CI yeşil KORUNUR.
- **🎨 TTY-only görsel** (pipe düz). ADR-010 (Node built-in, yeni-dep YOK). Subscription (API yasak).
- **KÜÇÜK TASK:** tek-dosya odak, ≤200 LoC, effort≤normal hedef, YENİ TEST DOSYASI. ESM `.js`.

---

## DALGA A — Input/Terminal native-his (4 task)

## Task 1: 224-001 — [P0] REPL terminal-mode input: line-editing + history + ok-tuşları (ham escape bitir)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/entry.ts, tests/cli/repl-input-terminal.test.ts
- Scope: src/cli/, tests/cli/
### Description
**Problem (run-verify KANITLI):** `readStdin` → `createInterface({input: process.stdin})` — `output`/`terminal:true` yok → canonical mode. ↑/→/Del ham escape (`^[[A`) sızıyor, ↑/↓ history yok, ←/→ cursor-move + backspace line-edit yok.
**Çözüm:** `createInterface({ input: process.stdin, output: process.stdout, terminal: true, historySize: 100 })` (TTY ise) — readline keypress/line-editing devreye girer, ↑/↓ history, ←/→ cursor, Del/backspace çalışır, ham escape sızmaz. Non-TTY/pipe'ta mevcut davranış korunur (terminal:false). entry.ts `launchDefaultRepl`/`readStdin`. Caller entry.ts.
**Kanıt:** `grep -c "terminal: true\|historySize\|output:" src/cli/entry.ts` → ≥2; `npx vitest run tests/cli/repl-input-terminal.test.ts` → 4+ pass
**Test:** ≥4 (TTY→terminal:true seçilir, non-TTY→terminal:false, history wire, output bağlı) — hermetik (fake stream isTTY mock)
**Smoke (GERÇEK TTY):** `deckent` aç → ↑ son mesajı geri getirir, ←/→ cursor hareket, Del siler, `^[[A` ham escape GÖRÜNMEZ.

## Task 2: 224-002 — [P0] Prompt çift-görünüm fix: `› ` input prompt + ayrı echo kaldır (TTY)
- Model: opus
- Effort: normal
- Skills: typescript-expert, frontend-design
- Files: src/cli/commands/chat-native.ts, tests/cli/repl-prompt-echo.test.ts
- Scope: src/cli/, tests/cli/
### Description
**Problem:** TTY'de readline kullanıcının yazdığını zaten ekranda gösterir; sonra `renderUserMessage` `› <text>` TEKRAR basar → çift görünüm ("prompt tekrar gidiyor").
**Çözüm:** TTY'de readline prompt'unu `› ` yap (kullanıcı prefix'li yazar, claude-code gibi) + loop'ta `layoutOn && TTY` iken ayrı `renderUserMessage` echo'sunu **KALDIR** (zaten readline gösterdi). Non-TTY/pipe'ta echo KORUNUR (orada readline echo yok — testler+HTTP bozulmaz). chat-native.ts `emitLayout` user-echo'yu TTY-guard'la. Caller chat-native.ts.
**Kanıt:** `grep -c "isTTY\|process.stdout.isTTY\|prompt" src/cli/commands/chat-native.ts` → ≥2; `npx vitest run tests/cli/repl-prompt-echo.test.ts` → 4+ pass
**Test:** ≥4 (TTY→user echo basılmaz, non-TTY→basılır, prompt `›`, assistant header korunur) — hermetik
**Smoke (GERÇEK TTY):** `deckent` → `selam` yaz → kullanıcı satırı **tek** görünür (çift değil), `› selam` prefix'li.

## Task 3: 224-003 — [P0] "2. mesaj gitmiyor" + multi-turn akıcı (persistent per-turn stream reset)
- Model: opus
- Effort: high
- Skills: typescript-expert, anthropic-sdk
- Files: src/cli/commands/chat-session.ts, tests/cli/persistent-multiturn-wire.test.ts
- Scope: src/cli/, tests/cli/
### Description
**Problem (run-verify):** İlk mesaj cevaplanıyor ama **2. mesaj gitmiyor** (loop takılıyor/yanıt beklemiyor); art-arda prompt native-his vermiyor. Kök şüphe: persistent session NDJSON stdout async-iterator'ı ilk turda tüketilip 2. tur için reset edilmiyor (veya `done` marker güvenilir emit edilmiyor).
**Çözüm:** Kök-neden bul (chat-session.ts `stream()`/`runTurn` per-turn NDJSON okuma). Her tur: tek mesaj yaz → delta'lar → `done` → bir sonraki tura HAZIR (reader bloke kalmaz). 2. mesaj 1. ile aynı akıcılıkta. **RUN-VERIFY: 2-mesaj art-arda gerçekten cevaplanır.**
**Kanıt:** `grep -c "done\|reset\|nextTurn\|yield\|turn" src/cli/commands/chat-session.ts` → ≥3; `npx vitest run tests/cli/persistent-multiturn-wire.test.ts` → 4+ pass
**Test:** ≥4 (1. mesaj cevap, 2. mesaj cevap, 3. mesaj cevap reuse, done-marker her tur) — hermetik (mock NDJSON spawn, çok-tur)
**Smoke (GERÇEK TTY):** `printf 'kısaca selam\nkısaca naber\nkısaca eyvallah\n/exit\n' | deckent` → **3 mesaj da** ayrı cevap (2./3. takılmaz).

## Task 4: 224-004 — Paste çok-satır tek-mesaj (satır-satır ayrı-tur bitir)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/entry.ts, tests/cli/repl-paste-multiline.test.ts
- Scope: src/cli/, tests/cli/
### Description
**Problem:** Çok-satırlı metin yapıştırınca her satır ayrı `line` → ayrı tur → ayrı cevap bekler (kopyala-yapıştır kırık).
**Çözüm:** Paste-burst tespiti (kısa pencerede art-arda gelen satırları biriktir — readline `line` event'leri arası <Xms ise tek mesaj olarak birleştir, pencere bitince gönder). 224-001 terminal-mode ile uyumlu. Caller entry.ts. Basit-tut (YAGNI — karmaşık bracketed-paste şart değilse zamanlama-pencere yeterli).
**Kanıt:** `grep -c "paste\|buffer\|flush\|setTimeout\|burst" src/cli/entry.ts` → ≥2; `npx vitest run tests/cli/repl-paste-multiline.test.ts` → 4+ pass
**Test:** ≥4 (3-satır paste→tek mesaj, tek satır→tek mesaj, pencere-bitince flush, /slash paste değil) — hermetik (fake timer + stream)
**Smoke:** çok-satırlı blok yapıştır → **tek** cevap (satır-satır değil).

---

## DALGA B — Agentic-DO: tool katmanı + interaktif onay (3 task)

## Task 5: 224-005 — [P0] deckent tool-exec katmanı: Write/Edit/Read/Bash (REPL gerçekten DO yapsın)
- Model: opus
- Effort: high
- Skills: typescript-expert, anthropic-sdk
- Files: src/cli/commands/chat-tool-exec.ts, tests/cli/chat-tool-exec.test.ts
- Scope: src/cli/, tests/cli/
### Description
**Problem (run-verify KANITLI):** `deckent1st.md` oluşmadı — native REPL dosya yazamıyor. Loop'ta tool_use plumbing var (`runChatNativeLoop` `stopReason:'tool_use'`→`dispatcher.dispatch`) ama deckent'in kendi aksiyon tool seti YOK (sadece status/recall/history slash-bridge).
**Çözüm:** `chat-tool-exec.ts` — `createToolExecDispatcher()`: `deckent_write_file`(path,content), `deckent_read_file`(path), `deckent_edit_file`(path,old,new), `deckent_bash`(cmd) tool'larını `McpToolDispatcher` arayüzüyle gerçek fs/spawn'a bağlar. Scope-guard (cwd dışına yazma engeli). dispatch ASLA throw etmez ([mcp-error] string). 224-006 onay-gate'inden geçer. Caller bu modül (entry.ts/chat-native 006'da wire). "Agentic OSS run system" temeli.
**Kanıt:** `grep -c "write\|read\|edit\|bash\|McpToolDispatcher\|writeFileSync\|spawn" src/cli/commands/chat-tool-exec.ts` → ≥4; `npx vitest run tests/cli/chat-tool-exec.test.ts` → 5+ pass
**Test:** ≥5 (write→dosya, read→içerik, edit→değişir, bash→çıktı, scope-dışı→mcp-error) — hermetik (tmpdir fixture, gerçek cwd YAZMA yok)

## Task 6: 224-006 — [P0] İnteraktif onay: y/N + multi-select (sessiz-blok bitir, tool-exec wire)
- Model: opus
- Effort: high
- Skills: typescript-expert, frontend-design
- Files: src/cli/commands/agentic-confirm.ts, tests/cli/agentic-confirm-select.test.ts
- Scope: src/cli/, tests/cli/
### Description
**Problem (🔴 bulgu #1):** Yan-etkili tool izni **sessiz blok** — Write/Edit/Bash onayı kullanıcıya gitmiyor. claude-code gücü: y/N + skill-tabanlı **çoktan-seçmeli** interaktif onay.
**Çözüm:** `agentic-confirm.ts` — mevcut `requireConfirmIfRisky` (y/N) + YENİ `selectOption(question, choices[])`: TTY'de numaralı çoktan-seçmeli (↑/↓ veya 1-N + Enter), seçileni döner; non-TTY→ilk/default. 224-005 tool-exec'i loop'ta wire et: tool_use (write/edit/bash) → GÖRÜNÜR onay (y/N risky, multi-select gerekirse) → onaylıysa exec, değilse iptal. Sessiz-blok biter. node:readline (ADR-010, dep-yok). Caller agentic-confirm.ts + chat-native.ts.
**Kanıt:** `grep -c "selectOption\|choices\|select\|y/N\|tool_use" src/cli/commands/agentic-confirm.ts` → ≥2; `grep -c "selectOption\|createToolExecDispatcher" src/cli/commands/chat-native.ts` → ≥1 (wire); `npx vitest run tests/cli/agentic-confirm-select.test.ts` → 5+ pass
**Test:** ≥5 (y/N onay, multi-select seçim, non-TTY default, iptal, risky→prompt) — hermetik (mock input/output)
**Smoke (GERÇEK TTY):** `deckent` → "deckent1st.md yaz içine merhaba" → onay sorusu GÖRÜNÜR → "y" → **dosya oluşur** (`ls deckent1st.md`).

## Task 7: 224-007 — Agentic-DO E2E doğrulama harness (dosya gerçekten oluşur)
- Model: sonnet
- Effort: normal
- Skills: ci-testing, typescript-expert
- Files: scripts/agentic-do-verify.mjs, tests/scripts/agentic-do-verify.test.ts
- Scope: scripts/, tests/scripts/
### Description
**Problem:** 224-005/006 agentic-DO için run-proven harness yok (modül-var ≠ dosya-oluşur).
**Çözüm:** `agentic-do-verify.mjs` — gerçek `dist/cli/entry.js`: tmpdir'de "X.md yaz" → onay-auto → dosya OLUŞTU mu (içerik doğru mu) PASS/FAIL. Async spawn, timeout-guard, tmpdir-izole (gerçek repo'ya yazmaz). 224-005/006 sonrası yeşil olmalı.
**Kanıt:** `grep -c "write\|verify\|entry.js\|spawn\|tmpdir\|exists" scripts/agentic-do-verify.mjs` → ≥4; `npx vitest run tests/scripts/agentic-do-verify.test.ts` → 4+ pass
**Test:** ≥4 (write-verify PASS, dosya-yok FAIL, tmpdir-izole, dist-yok skip) — async hermetik

---

## DALGA C — Nervous wire + güvenli re-enable (kurtarılan modüller) (3 task)

## Task 8: 224-008 — [P0] `/nervous` slash wire (kurtarılan bridge → chat-native caller)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat-native.ts, tests/cli/repl-nervous-wire.test.ts
- Scope: src/cli/, tests/cli/
### Description
**Problem (🟠 bulgu #2):** `/nervous` → "Unknown command". `chat-nervous-bridge.ts` (getPendingNervous/renderNervousPrompt — base branch'te kurtarıldı) chat-native slash-handler'a wire DEĞİL.
**Çözüm:** chat-native.ts slash-handler — `/nervous` → `getPendingNervous()` (chat-nervous-bridge.ts) → `renderNervousPrompt()` görünür bas + accept/reject. resolveSlash/registry'ye `/nervous` ekle. Caller chat-native.ts (def chat-nervous-bridge.ts DIŞLA — base branch'te var).
**Kanıt:** `grep -c "getPendingNervous\|renderNervousPrompt\|nervous" src/cli/commands/chat-native.ts` → ≥2 (ÇAĞRI); `npx vitest run tests/cli/repl-nervous-wire.test.ts` → 4+ pass
**Test:** ≥4 (/nervous pending listele, görünür-render, accept, reject, pending-yok→sessiz) — hermetik (tmpdir panic-ipc fixture)
**Smoke:** `printf '/nervous\n/exit\n' | env -u ANTHROPIC_API_KEY deckent` → pending listesi (veya "bekleyen yok") — "Unknown command" DEĞİL.

## Task 9: 224-009 — Banner wire (kurtarılan chat-banner → entry.ts REPL açılış)
- Model: sonnet
- Effort: low
- Skills: frontend-design, typescript-expert
- Files: src/cli/entry.ts, tests/cli/repl-banner-wire.test.ts
- Scope: src/cli/, tests/cli/
### Description
**Problem:** `chat-banner.ts` `renderBanner` (base branch'te kurtarıldı) 0-caller — REPL açılışı hâlâ sade.
**Çözüm:** entry.ts `launchDefaultRepl` başında `renderBanner(ctx)` bas (status-line ile uyumlu, TTY-only). Caller entry.ts (def chat-banner.ts DIŞLA).
**Kanıt:** `grep -c "renderBanner" src/cli/entry.ts` → ≥1 (ÇAĞRI); `npx vitest run tests/cli/repl-banner-wire.test.ts` → 3+ pass
**Test:** ≥3 (banner basılır, TTY-only, provider yansır) — hermetik
**Smoke:** `printf '/exit\n' | env -u ANTHROPIC_API_KEY deckent | head -5` → şık karşılama + ipucu.

## Task 10: 224-010 — Nervous güvenli re-enable + A/B doğrula (223-009 carry, panic-gate non-blocking sayesinde)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: .deckent/config.json, tests/config/nervous-reenable-safe.test.ts
- Scope: .deckent/, tests/config/
- Dependencies: 224-008
### Description
**Problem:** nervous `enabled:false`. Base branch'te `panic-gate.ts` non-blocking + `observer.ts` resource-opt LIVE → artık güvenle açılabilir.
**Çözüm:** `.deckent/config.json` `nervous_system.enabled:true` + mode balanced + scan-interval optimize. **A/B ZORUNLU:** nervous ON ile küçük sprint SPAWN'da TAKILMAZ (panic-gate advisory) — kanıtla. 224-008 (/nervous görünür) DONE olmadan açma.
**Kanıt:** `grep -A1 nervous_system .deckent/config.json | grep "enabled.*true"`; `npx vitest run tests/config/nervous-reenable-safe.test.ts` → 3+ pass
**Test:** ≥3 (config enabled, advisory-mode, safety_floor korunur) — hermetik (fixture)

---

## DALGA D — Streaming token-smooth (1 task)

## Task 11: 224-011 — Streaming pürüzsüz token-token (chunky → smooth)
- Model: opus
- Effort: normal
- Skills: typescript-expert, anthropic-sdk
- Files: src/cli/commands/chat-session.ts, tests/cli/streaming-smooth.test.ts
- Scope: src/cli/, tests/cli/
### Description
**Problem (🟡 bulgu):** Streaming çalışıyor (truncate yok) ama **chunky** — token-token pürüzsüz değil. Kök: stream-json delta granülaritesi / buffer toplama.
**Çözüm:** chat-session.ts `stream()` — NDJSON `content_block_delta`'ları olduğu gibi (toplamadan) yield et; pürüzsüz akış. Gerekirse küçük delta-flush. Caller chat-session.ts. 224-003 ile uyumlu (regresyon-yok).
**Kanıt:** `grep -c "delta\|yield\|flush\|chunk" src/cli/commands/chat-session.ts` → ≥3; `npx vitest run tests/cli/streaming-smooth.test.ts` → 4+ pass
**Test:** ≥4 (delta-token yield, çok-delta sıra, done-sonrası, boş-delta atla) — hermetik (mock NDJSON çok-delta)
**Smoke:** uzun cevap iste → akış pürüzsüz token-token görünür (blok-blok değil).

---

## DALGA E — Docs + ADR + smoke-harness (2 task)

## Task 12: 224-012 — ADR-086 (Native REPL input/agentic/nervous-wire) + ADR-085 reconcile + MASTER-PLAN
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: docs/adr/086-repl-input-agentic.md, docs/MASTER-PLAN.md, tests/docs/adr-086.test.ts
- Scope: docs/, tests/docs/
- Dependencies: 224-001, 224-005, 224-008
### Description
**Çözüm:** ADR-086 (terminal-mode input + agentic tool-exec + interaktif multi-select + nervous-wire, MADR, accepted). Stash'teki ADR-085'i **gerçeklikle eşle** (persistent+layout LIVE, nervous artık wired). MASTER-PLAN §3/§4 native-REPL + §10 Sprint 224 güncelle.
**Kanıt:** `grep -c "input\|agentic\|tool-exec\|nervous\|multi-select" docs/adr/086-*.md` → ≥4; `grep -c "224" docs/MASTER-PLAN.md` → ≥1; `npx vitest run tests/docs/adr-086.test.ts` → 3+ pass
**Test:** ≥3 (ADR-086 MADR, MASTER-PLAN güncel, accepted)

## Task 13: 224-013 — repl-smoke-verify harness genişlet (input+agentic+nervous run-proven)
- Model: sonnet
- Effort: normal
- Skills: ci-testing, typescript-expert
- Files: scripts/repl-smoke-verify.mjs, tests/scripts/repl-smoke-verify.test.ts
- Scope: scripts/, tests/scripts/
### Description
**Çözüm:** Base branch'teki `repl-smoke-verify.mjs`'i genişlet — Sprint 224 özellikleri run-proven: terminal-mode (testlenebilir kısım), prompt-tek-görünüm, agentic-write (tmpdir), `/nervous` görünür, streaming-smooth. Her biri PASS/FAIL. Async spawn, timeout-guard.
**Kanıt:** `grep -c "history\|agentic\|nervous\|prompt\|smooth\|entry.js" scripts/repl-smoke-verify.mjs` → ≥4; `npx vitest run tests/scripts/repl-smoke-verify.test.ts` → 4+ pass
**Test:** ≥4 (yeni özellikler PASS-path, dist-yok skip) — async hermetik
**Smoke:** `node scripts/repl-smoke-verify.mjs` → Sprint 224 özellikleri PASS (run-proven).

---

## DALGA F — Ekleme (oturum-2 Alperen direktifi) (2 task)

## Task 14: 224-014 — [P0] Sabit alt-prompt penceresi (claude-code: input altta sabit, output üste akar, korunan buffer + art-arda kuyruk)
- Model: opus
- Effort: high
- Skills: typescript-expert, frontend-design
- Files: src/cli/commands/chat-render-region.ts, src/cli/entry.ts, tests/cli/repl-render-region.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: 224-001, 224-003
### Description
**Problem (Alperen direktifi):** claude-code'daki gibi **sabit alt-prompt penceresi** yok — input altta pinli durmuyor, cevap akarken yazdığın korunmuyor, art-arda mesaj iletilemiyor, gönderilen mesajlar scrollback'e (üste) düzgün kaymıyor.
**Çözüm (ADR-010 — yeni-dep YOK, Node readline+ANSI):** 224-001 `terminal:true` readline üstüne **render-disiplini**: YENİ `chat-render-region.ts` — `writeAbovePrompt(rl, text)`: `rl.line`+cursor sakla → `readline.clearLine/cursorTo` → çıktıyı prompt'un ÜSTÜNE bas → `rl.prompt(true)` ile korunan buffer'ı yeniden çiz (kullanıcı yazdığı KAYBOLMAZ). entry.ts: stream/cevap çıktısı bu helper'dan; **input-queue** (tur işlenirken gelen satırlar kuyruğa, sırayla işlenir → art-arda). Caller entry.ts.
**Kanıt:** `grep -c "writeAbovePrompt\|clearLine\|cursorTo\|prompt(true)\|queue" src/cli/commands/chat-render-region.ts src/cli/entry.ts` → ≥3; `npx vitest run tests/cli/repl-render-region.test.ts` → 4+ pass
**Test:** ≥4 (buffer-korunur, output-üste, queue-sıralı, non-TTY→düz) — hermetik (fake rl/stream)
**Smoke (GERÇEK TTY):** cevap akarken yaz → yazdığın korunur + çıktı üste akar; art-arda 2 mesaj → ikisi sırayla cevaplanır; input hep altta sabit.

## Task 15: 224-015 — AI plan mode fix (dürüst hata + gerçekten-çalışır, sessiz-structured-fallback bitir)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/planner.ts, src/orchestra/sprint-planner.ts, src/cli/commands/plan.ts, tests/orchestra/ai-planner-honest-fallback.test.ts
- Scope: src/orchestra/, src/cli/, tests/orchestra/
### Description
**Problem (Explore + [[feedback_ai_planner_silent_fallback]]):** `callBrainPlanner()` (planner.ts:375-395) tüm hata türlerini tek `null`'a indirger (spawn/timeout/parse/validation ayırt edilemez); `spawnSync`+10s timeout gerçek plan üretimini aşabilir; CLI bootstrap (plan.ts:40-49) sessizce structured'a düşer (sebep gizli). throw/fallback (sprint-planner.ts:278-294) Sprint 221-017'de zaten doğru.
**Çözüm:** `callBrainPlanner()` → **discriminant union** (`{ok:true,data}` | `{ok:false,reason,message}`); `resolveAdapter` ProviderError→`no_providers`. `planSprint()` discriminant tüket: ai+fail→BrainError **detaylı**, auto+fail→console.error detaylı+structured. CLI bootstrap→provider+gerçek-hata logla (sessiz DEĞİL). Timeout config'lenebilir (`brain_plan_timeout_ms` artır). Not: structured deckent-dev için mükemmel — AI mode user-project kritik.
**Kanıt:** `grep -c "ok:\s*false\|reason\|discriminant\|no_providers\|brain_plan_timeout" src/orchestra/planner.ts` → ≥2; `npx vitest run tests/orchestra/ai-planner-honest-fallback.test.ts` → 4+ pass
**Test:** ≥4 (ai+fail→detaylı-throw, auto+fail→detaylı-log+structured, no-provider→reason, discriminant ok-path) — hermetik (mock spawn)
**Smoke:** `deckent plan --mode ai` fail→**dürüst sebep** (sessiz structured DEĞİL); başarılıysa AI task üretir.

---

## DALGA G — Oturum-3 ekleme (Alperen direktifi: izin/menü/polish)

- **224-016 ✅ İzin hafızası:** `.deckent/settings.local.json` `permissions.allow` (claude-code uyumlu); 3-yollu onay (y/a/N), "hep izin ver" kalıcı + bir daha sormaz. (gitignore'lu)
- **224-017 ✅ `/` komut menüsü:** readline completer — Tab ile slash komut listesi/tamamlama.
- **224-018 Polish batch (kısmen):**
  - ✅ `● deckent` **kraken marka renginde** (teal `●` + gold `deckent`, splash.ts ile uyumlu).
  - ✅ Düşünme fiili **prompt başına SABİT** (rastgele tek fiil seçilir, sürekli değişmez; sadece braille noktası döner).
  - 🔜 **Markdown `**bold**` / `` `code` `` streaming render** (token-token akışla uyumlu stateful renderer — `**` literal görünmesin).
  - 🔜 **Token sayacı + süre** (claude `result` event `usage` + tur süresi → cevap sonrası dim footer `⏱ 3.2s · 1.2k tok`). Loop turn-start/end + usage capture gerekir.
  - 🔜 **Türkçe karakter şekil-bozukluğu** (somut repro lazım — UTF-8 çıkış yolu denetimi).
  - 🔜 **Tıklanır dosya yolları** (VSCode terminal otomatik linkler; düz-yol bas + gerekirse osc-8 link).

---

## DALGA H — Native CLI Parity (F11, deckent DOGFOOD koşar) — claude-code/codex/gemini kalitesi

> **Base:** `recover-sprint223-nervous-finalizer` main'e merge edildikten SONRA, deckent bu dalgayı dogfood'lar. Hepsi `src/cli/commands/` + `src/cli/entry.ts` user-surface → **Tier-1, Smoke ZORUNLU** (gerçek TTY davranışı). Mock-only = GO_WITH_TECH_DEBT.

## Task 19: 224-019 — [P0] Pinned input bar (prompt ALTTA SABİT, token'lar ÜSTÜNE akar — claude-code render loop)
- Model: opus
- Effort: high
- Skills: typescript-expert, frontend-design
- Files: src/cli/commands/chat-render-region.ts, src/cli/entry.ts, tests/cli/repl-pinned-bar.test.ts
- Scope: src/cli/, tests/cli/
### Description
**Problem (Alperen run-verify):** Token-token yazarken `› ` prompt bar KAYBOLUYOR — çıktı en alt satıra yazıyor, prompt sabit kalmıyor. claude-code'da input bar **her zaman altta sabit**, cevap token'ları **üstüne** akar.
**Çözüm:** Render loop — tur sırasında prompt'u alt satırda PİNLİ tut; her streamed token gelince: cursor'u response bölgesine al (prompt'un üstü), token'ı oraya **inline** yaz, prompt satırını koru/yeniden çiz. ANSI cursor save/restore (`\x1b7`/`\x1b8`) + clearLine + satır-bütçesi. Kullanıcı yazdığı korunur (rl.line). Smooth streaming (224-011) bozulmadan. Non-TTY düz.
**Kanıt:** `grep -c "pin\|save\|restore\|cursorTo\|prompt(true)\|\\\\x1b7" src/cli/commands/chat-render-region.ts src/cli/entry.ts` → ≥4; `npx vitest run tests/cli/repl-pinned-bar.test.ts` → 4+ pass
**Test:** ≥4 (token→üste yazar, prompt→altta kalır, buffer korunur, non-TTY düz) — hermetik (fake rl/out)
**Smoke (GERÇEK TTY):** cevap token-token akarken `› ` prompt bar **altta sabit kalır** (kaybolmaz), token'lar üstte akar.

## Task 20: 224-020 — [P0] İnteraktif `/` menü (yazarken canlı popup — Tab değil)
- Model: opus
- Effort: high
- Skills: typescript-expert, frontend-design
- Files: src/cli/commands/chat-slash-menu.ts, src/cli/entry.ts, tests/cli/repl-slash-menu.test.ts
- Scope: src/cli/, tests/cli/
### Description
**Problem:** `/` basınca aktif/etkileşimli bir bar görünmüyor (sadece Tab-completion var). claude-code'da `/` yazınca anında **canlı menü** açılır, yazdıkça filtrelenir, ↑/↓ + Enter seçilir.
**Çözüm:** `chat-slash-menu.ts` — keypress-driven: input `/` ile başlayınca prompt'un üstünde canlı komut menüsü render et (buildSlashRegistry'den), her tuşta filtrele, ↑/↓ vurgu, Enter seç/çalıştır, Esc kapat. readline keypress events (`rl.input.on('keypress')` veya raw-mode). Non-TTY → no-op (completer fallback).
**Kanıt:** `grep -c "keypress\|menu\|filter\|highlight\|/" src/cli/commands/chat-slash-menu.ts` → ≥3; `npx vitest run tests/cli/repl-slash-menu.test.ts` → 4+ pass
**Test:** ≥4 (/ açar, filtre, ↑/↓ seçim, Esc kapat) — hermetik (keypress mock)
**Smoke (GERÇEK TTY):** `/` yazınca canlı menü görünür + filtrelenir.

## Task 21: 224-021 — Token sayacı + süre (her tur sonu `⏱ 3.2s · 1.2k tok`)
- Model: opus
- Effort: normal
- Skills: typescript-expert, anthropic-sdk
- Files: src/cli/commands/chat-session.ts, src/cli/commands/chat-native.ts, tests/cli/turn-stats.test.ts
- Scope: src/cli/, tests/cli/
### Description
**Problem:** Token sayacı YOK, süre YOK. claude-code her cevap sonu token+süre gösterir.
**Çözüm:** chat-session.ts — claude `result` event'inden `usage` (input/output tokens) yakala, ProviderResponse'a ekle. chat-native.ts — tur başı/sonu süre ölç; tur sonu dim footer `⏱ <süre>s · <tok> tok` bas (TTY). Non-TTY/test sessiz.
**Kanıt:** `grep -c "usage\|tokens\|elapsed\|duration\|⏱" src/cli/commands/chat-session.ts src/cli/commands/chat-native.ts` → ≥3; `npx vitest run tests/cli/turn-stats.test.ts` → 4+ pass
**Test:** ≥4 (usage parse, süre ölçüm, footer format, usage-yok→sessiz) — hermetik
**Smoke:** cevap sonu `⏱ … · … tok` görünür.

## Task 22: 224-022 — Canlı aktivite görünümü (beklerken NE yaptığını göster)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat-render-region.ts, src/cli/commands/chat-native.ts, tests/cli/activity-view.test.ts
- Scope: src/cli/, tests/cli/
### Description
**Problem (Alperen):** Anlık beklerken deckent'in NE yaptığı görünmüyor (sadece "düşünüyor"). claude-code tool çağrılarını/adımları gösterir.
**Çözüm:** tool_use dispatch sırasında "🔧 <tool> çalışıyor: <özet>" gibi canlı satır göster (thinking region'da). Tur içi adımlar görünür. Non-TTY düz.
**Kanıt:** `grep -c "activity\|tool\|🔧\|step\|running" src/cli/commands/chat-render-region.ts src/cli/commands/chat-native.ts` → ≥2; `npx vitest run tests/cli/activity-view.test.ts` → 4+ pass
**Test:** ≥4 (tool-aktivite görünür, çok-adım, biter→temizlenir, non-TTY) — hermetik

## Task 23: 224-023 — Markdown streaming render (`**bold**`/`` `code` ``/liste — literal `**` görünmesin)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/cli/commands/chat-render.ts, src/cli/entry.ts, tests/cli/stream-markdown.test.ts
- Scope: src/cli/, tests/cli/
### Description
**Problem:** `**` arası metin literal görünüyor (Model C raw stream → markdown render edilmiyor).
**Çözüm:** chat-render.ts `createStreamMarkdown()` — stateful streaming transform: chunk-chunk gelirken `**bold**` → BOLD, `` `code` `` → DIM, satır-başı `- ` → `• `. Chunk sınırında bölünen marker'ı tampona al. entry.ts TTY output bu transform'dan geçsin; tur sonu flush. Smooth streaming (224-011) korunur.
**Kanıt:** `grep -c "createStreamMarkdown\|feed\|flush\|bold\|\\*\\*" src/cli/commands/chat-render.ts` → ≥3; `npx vitest run tests/cli/stream-markdown.test.ts` → 5+ pass
**Test:** ≥5 (bold render, code render, chunk-bölünmüş marker, liste, non-TTY düz) — hermetik
**Smoke:** markdownlu cevap → `**` görünmez, kalın render olur.

## Task 24: 224-024 — UTF-8 / Türkçe karakter doğruluğu (şekil-bozukluğu fix)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat-render-region.ts, tests/cli/utf8-render.test.ts
- Scope: src/cli/, tests/cli/
### Description
**Problem (Alperen):** Türkçe karakter şekil-bozuklukları. Render/encoding yolunda UTF-8 bütünlüğü denetlenmeli (stdout encoding, byte-bölme, çok-byte karakter).
**Çözüm:** Çıkış yollarının UTF-8 (setEncoding/Buffer) bütünlüğünü doğrula; çok-byte karakter chunk sınırında bölünmesin. Türkçe (ı/ş/ğ/ç/ö/ü) test fixture.
**Kanıt:** `npx vitest run tests/cli/utf8-render.test.ts` → 4+ pass
**Test:** ≥4 (Türkçe render bütün, byte-bölme yok, emoji/braille, non-TTY) — hermetik

## Task 25: 224-025 — Tıklanır dosya yolları (VSCode osc-8)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/cli/commands/chat-render.ts, tests/cli/clickable-paths.test.ts
- Scope: src/cli/, tests/cli/
### Description
**Çözüm:** Cevaptaki dosya yollarını osc-8 hyperlink (`\x1b]8;;file://...\x1b\\`) ile sar (TTY), VSCode terminal tıklanır. Düz-yol fallback.
**Kanıt:** `grep -c "osc\|8;;\|file://\|link" src/cli/commands/chat-render.ts` → ≥2; `npx vitest run tests/cli/clickable-paths.test.ts` → 3+ pass
**Test:** ≥3 (path→osc8 link, non-path dokunma, non-TTY düz)

## Task 26: 224-026 — Multi-provider native parity (codex/gemini de persistent+agentic+akış)
- Model: opus
- Effort: high
- Skills: typescript-expert, anthropic-sdk
- Files: src/cli/entry.ts, src/cli/commands/chat-provider-parity.ts, tests/cli/provider-parity-native.test.ts
- Scope: src/cli/, tests/cli/
### Description
**Problem:** Sadece claude persistent+agentic; codex/gemini per-turn (yavaş, agentic yok). Multi-provider native parity şart.
**Çözüm:** codex/gemini için de warm-session + streaming + agentic tool-use (provider-agnostik `<deckent_tool>` zaten var). Her provider aynı REPL kalitesi.
**Kanıt:** `grep -c "codex\|gemini\|persistent\|stream\|parity" src/cli/commands/chat-provider-parity.ts` → ≥3; `npx vitest run tests/cli/provider-parity-native.test.ts` → 4+ pass
**Test:** ≥4 (codex warm+stream, gemini warm+stream, agentic parity, fallback) — hermetik (mock spawn)

---

**Beklenen:** 11-13/13 DONE, 0 false-FIX. **Native REPL GERÇEKTEN claude-code gibi:** line-editing+history+ok-tuş (224-001), tek-görünüm prompt (224-002), akıcı multi-turn (224-003) + paste-tek-mesaj (224-004), **gerçekten dosya yazar/aksiyon alır** (224-005/006/007 — interaktif y/N+multi-select onayla), `/nervous` görünür (224-008) + banner (224-009) + nervous güvenli açık (224-010), pürüzsüz streaming (224-011). CI yeşil KORUNUR.

**🟢 RUN-VERIFY (cc sprint sonu):** gerçek `dist/cli/entry.js` GERÇEK TTY'de — ↑ history + ←/→ + Del (ham escape yok), kullanıcı satırı tek-görünüm, 2./3. mesaj cevaplanır, paste tek-mesaj, "X.md yaz" → onay → **dosya OLUŞUR**, `/nervous` pending, akış pürüzsüz. `node scripts/repl-smoke-verify.mjs` + `agentic-do-verify.mjs` yeşil. Mock-only DONE YOK.

**🔴 NERVOUS GÜVENLİK:** 224-008 (/nervous görünür) DONE olmadan 224-010 (re-enable) YAPMA. Re-enable sonrası A/B: nervous ON → sprint SPAWN'da takılmaz (panic-gate non-blocking, base branch'te LIVE).

**Pre-flight:** **base = `recover-sprint223-nervous-finalizer`** (panic-gate/observer/finalizer LIVE, nervous-bridge/banner DORMANT — C dalgası wire eder). build:all + restart + RE-PLAN ŞART. git-guard aktif. Sprint CLI'dan `env -u ANTHROPIC_API_KEY`. Her wave sonrası `git log -1`.

İlgili memory:
- [[project_terminal_dashboard_ux_evolution]] — REPL native-his + bulgu defteri (Sprint 224 P0)
- [[feedback_wiring_pct_vs_user_working]] — modül-var ≠ çalışıyor
- [[feedback_directive_kanit_letter_vs_goal]] — wire (def-dosya dışla, çağıran + run-verify)
- [[feedback_proof_of_function_dod]] — user-surface task = gerçek-binary koşu kanıtı
- [[feedback_no_minimum_no_mvp_deckent]] — god-level
- [[project_nervous_panic_gate_silent_block]] — nervous panic-gate + re-enable
- [[feedback_build_mcp_restart_coordination]] — build Alperen + RE-PLAN
