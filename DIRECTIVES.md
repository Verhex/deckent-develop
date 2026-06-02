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
