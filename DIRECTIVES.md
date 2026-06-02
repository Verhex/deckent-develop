# DIRECTIVES — Sprint 222: Native REPL HIZ + GÖRSEL (claude-code gibi) + Hollow-Wire Gerçek-Bağla + Nervous CANLI/Etkileşimli

## Goal: BÜYÜK SPRINT (13 task, 4 dalga, 10 worker). Sprint 221 başardı (17/17, REPL slash-wire/provider-parity/ollama temeli) AMA cc run-verify + system-debug iki kritik gerçek ortaya çıkardı: (1) **Native REPL ÇOK YAVAŞ** — her mesajda `claude --print` cold-start (4.5s) tekrar, persistent session YOK; görsel feedback yok (donmuş görünür); streaming kısmi. (2) **Sprint 221 REPL özellikleri HOLLOW** — kod dist'te var ama runChatNativeLoop'a bağlı değil (`/help` slash-registry claude'a düşüp 15.9s alıyor, status-line görünmüyor). Ek olarak **nervous panic-gate sessiz spawn-blok** (Sprint 221'de A/B-kanıtlı kök-neden: nervous ON→sprint takılır, OFF→çalışır; şu an geçici OFF). Alperen direktifi: "deckent native terminalde claude-code gibi HIZLI + GÖRSEL-ZENGİN + İNTERAKTİF olmalı; nervous'un sessiz/etkileşimsizliğini TAMAMEN kaldır, terminalde hızlı+etkileşimli bizimle çalışsın." **DALGA A:** REPL hız (persistent claude session — 4.5s→<1s + gerçek streaming + spinner). **DALGA B:** görsel zenginlik (markdown+renk) + Sprint 221 hollow-wire'ları GERÇEK-bağla (slash-registry/status-line/agentic/enterprise run-verify). **DALGA C:** nervous CANLI/etkileşimli/NON-BLOCKING (sessiz panic-gate kaldır + terminal-görünür + dashboard-canlı + güvenli re-enable). **DALGA D:** ADR + docs + Sprint 221 tech-debt gerçek-kapatma. **god-level — MVP ASLA. Run-verify ZORUNLU (perf-ölçüm + gerçek-davranış, kod-grep DEĞİL).**

Bağlam (cc system-debug 2026-06-02, [[project_terminal_dashboard_ux_evolution]] + [[project_nervous_panic_gate_silent_block]]):
- **Ölçüm:** deckent startup 0.188s (hızlı) | ham `claude --print` cold-start **4.5s** | REPL+1 mesaj 4.3s | `/help` (hollow→claude'a düştü) **15.9s**. Kök: per-turn `defaultSubscriptionSpawn(claude, ['--print', prompt])`, persistent session YOK.
- **runProviderTurn ZATEN streaming-aware** (chat-native.ts:240/244 `provider.stream`) ama `claude --print` toplu basıyor (incremental değil) → gerçek token-akış yok. Persistent session altyapısı YOK (sıfırdan kurulacak).
- **Hollow:** `buildSlashRegistry` (chat-slash-registry.ts) + `renderStatusLine` (chat-status-line.ts) dist'te VAR ama runChatNativeLoop ÇAĞIRMIYOR (0-runtime-caller). 221-001 `/clear`/`/exit` (handleReplCommand) çalışıyor; 221-003 `/help`/`/status` + 221-004 status-line HOLLOW.
- **Nervous panic-gate:** A/B-kanıtlı kök-neden (Sprint 221). `.deckent/panic-ipc/pending/` sessiz marker, terminal'e prompt gelmiyor → spawn sonsuz bekler. Kod-yeri orchestra/nervous'ta net değil (DERINLEMESINE BUL). Şu an `nervous_system.enabled: false` (geçici).
- **git-guard aktif** (deckent-dev tree reset koruması). API mode YASAK (subscription). CI yeşil KORUNUR.

---

## Tüm task'lar için ortak kurallar
- **🟢 RUN-VERIFY ZORUNLU ([[feedback_proof_of_function_dod]] + [[feedback_wiring_pct_vs_user_working]]):** user-surface (`src/cli/`/`src/dashboard/`/`src/api/`) `Smoke:` = gerçek-binary + **ölçülebilir beklenti** (perf süresi / gerçek-davranış). Kod-grep "var" YETMEZ — `/help` ANINDA liste dönmeli, 2. mesaj <1s olmalı. Mock-only=GO_WITH_TECH_DEBT.
- **🔌 WIRE-GAP ([[feedback_directive_kanit_letter_vs_goal]]):** mevcut modülü ÇAĞIR; kanıt grep ÇAĞIRAN dosyada (def-dosya DIŞLA), 0-caller→canlı-caller + RUN-VERIFY (çağrı runtime'da gerçekten çalışır).
- **🔴 HERMETIK ([[project_ci_green_root_causes]]):** tmpdir+sandbox HOME, async spawn (spawnSync YASAK), test:ci-sim. CI yeşil KORUNUR.
- **🎨 GÖRSEL + HIZLI:** claude-code kalitesi — markdown/renk/spinner; gecikme yok, donma yok. Subscription mode (API yasak). ADR-010 (yeni runtime-dep dikkat; Node built-in tercih).
- **KÜÇÜK TASK:** tek-dosya odak, ≤200 LoC, effort≤normal, YENİ TEST DOSYASI. ESM `.js`.

---

## DALGA A — REPL HIZ (persistent session + streaming + spinner) (3 task)

## Task 1: 222-001 — [P0] Persistent claude session (per-turn cold-start 4.5s → reuse <1s)
- Model: opus
- Effort: normal
- Skills: anthropic-sdk, typescript-expert
- Files: src/cli/commands/chat-session.ts, tests/cli/chat-session-persistent.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem (cc system-debug):** REPL her mesajda `defaultSubscriptionSpawn(claude, ['--print', prompt])` ile claude CLI'yi SIFIRDAN spawn ediyor → cold-start 4.5s HER mesajda. Ölçüm: startup 0.188s, +1 mesaj 4.3s. claude-code'da bu yok (tek persistent session).
**Çözüm:** `chat-session.ts` — `createPersistentClaudeSession(opts)`: claude CLI'yi **bir kez** başlat (subscription, API-key drop), canlı-tut, sonraki mesajları AYNI sürece gönder (claude'un `--input-format stream-json` / interactive / `--continue` mode'unu ARAŞTIR + kullan). İlk mesaj cold (4.5s), sonrakiler reuse (<1s hedef). ChatProviderAdapter uyumlu (send/stream). Subprocess yaşam-döngüsü (spawn 1x, kill on :exit). entry.ts buildReplProvider claude dalı bunu kullanır (sonraki task wire). Caller bu modül. **DİKKAT:** claude CLI persistent mode mevcut değilse → en azından **process-reuse/warm** (ilk spawn'ı sıcak tut) + net rapor.
**Kanıt:** `grep -c "createPersistentClaudeSession\|stream-json\|continue\|reuse\|spawn" src/cli/commands/chat-session.ts` → ≥3; `npx vitest run tests/cli/chat-session-persistent.test.ts` → 4+ pass
**Test:** ≥4 (session 1x spawn, 2. mesaj reuse-aynı-process, :exit kill, mock-spawn round-trip) — hermetik (spawn mock)
**Smoke (PERF-ÖLÇÜM):** `printf 'selam\nnaber\n/exit\n' | env -u ANTHROPIC_API_KEY deckent 2>&1` çalıştır + `time` ile ölç → **2. mesaj 1. mesajdan belirgin hızlı** (cold-start bir kez); en azından iki yanıt da gerçek döner

## Task 2: 222-002 — Gerçek token-token streaming (claude --print toplu → incremental akış)
- Model: opus
- Effort: normal
- Skills: anthropic-sdk, typescript-expert
- Files: src/cli/entry.ts, tests/cli/repl-streaming.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** `runProviderTurn` streaming-aware (chat-native.ts:240/244 `provider.stream`) AMA entry.ts `buildReplProvider` claude adapter'ı `--print` toplu basıyor → yanıt tek-blok gelir (akış yok, donmuş hisset). claude-code token-token akar.
**Çözüm:** entry.ts buildReplProvider claude/codex/gemini `stream()` — claude streaming çıktısını (`--output-format stream-json` / satır-satır stdout) incremental yield et (toplu değil). 222-001 persistent session ile birleşir (session üzerinden stream). provider.stream chunk'ları gerçekten parça-parça gelsin. Caller entry.ts.
**Kanıt:** `grep -c "stream\|chunk\|yield\|stream-json\|output-format" src/cli/entry.ts` → ≥3; `npx vitest run tests/cli/repl-streaming.test.ts` → 4+ pass
**Test:** ≥4 (stream çok-chunk yield, tek-chunk fallback, boş-stream, done-event) — hermetik (spawn mock chunk'lar)
**Smoke:** `echo "1den 5e say" | env -u ANTHROPIC_API_KEY deckent 2>&1 | head` → yanıt akarak gelir (gerçek cevap)

## Task 3: 222-003 — Spinner/progress feedback (yanıt beklerken görsel, donma hissi bitsin)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat-spinner.ts, tests/cli/chat-spinner.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** Yanıt gelene kadar (cold-start'ta 4.5s) hiçbir görsel feedback yok → kullanıcı donmuş sanıyor. claude-code'da spinner/aktivite göstergesi var.
**Çözüm:** `chat-spinner.ts` — `createSpinner(label)`: stderr'e dönen spinner ("düşünüyor…" + braille frames), `start()/stop()`. Stream ilk chunk gelince durdur. Yeni runtime-dep YOK (Node built-in `process.stderr.write` + interval, ADR-010). REPL loop'a wire (yanıt-bekleme sırasında). TTY-only (pipe'da no-op). Caller bu modül + chat-native loop.
**Kanıt:** `grep -c "createSpinner\|start\|stop\|stderr\|frames\|interval" src/cli/commands/chat-spinner.ts` → ≥3; `npx vitest run tests/cli/chat-spinner.test.ts` → 4+ pass
**Test:** ≥4 (spinner start/stop, frame döngüsü, TTY-yok→no-op, ilk-chunk'ta durur) — hermetik (fake timer)
**Smoke:** `node dist/cli/entry.js 2>&1` interaktif değil — unit yeterli (Tier-1 ama TTY-spinner; mock-test + REPL'de görsel manuel)

---

## DALGA B — Görsel Zenginlik + Sprint 221 Hollow-Wire Gerçek-Bağla (4 task)

## Task 4: 222-004 — Markdown + renk render (claude-code gibi zengin output)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat-render.ts, tests/cli/chat-render.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** REPL düz-metin basıyor — kod-blok/başlık/vurgu render yok (claude-code zengin: renkli kod, **bold**, başlık). Görsel fakir.
**Çözüm:** `chat-render.ts` — `renderMarkdown(text)`: minimal markdown→ANSI (kod-blok gri/renkli, başlık vurgulu, **bold**, liste). Yeni runtime-dep YOK (Node built-in ANSI renk kodları, ADR-010 — chalk/marked EKLEME, manuel minimal renderer). TTY-only (pipe'da düz metin). REPL çıktıya wire. Caller bu modül + chat-native.
**Kanıt:** `grep -c "renderMarkdown\|ANSI\|\\\\x1b\|code.*block\|bold\|color" src/cli/commands/chat-render.ts` → ≥3; `npx vitest run tests/cli/chat-render.test.ts` → 4+ pass
**Test:** ≥4 (kod-blok render, başlık, bold, TTY-yok→düz-metin) — hermetik
**Smoke:** `echo "bir kod örneği ver" | env -u ANTHROPIC_API_KEY deckent 2>&1 | head` → renkli/biçimli çıktı (gerçek cevap)

## Task 5: 222-005 — slash-registry REPL'e GERÇEK-wire (/help anında, 221-003 hollow fix)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat-native.ts, tests/cli/repl-slash-registry-wire.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem (cc run-verify HOLLOW):** `/help` REPL'de slash-registry'ye GİTMİYOR — claude'a düşüp 15.9s alıyor + claude'un kendi cevabını veriyor. `buildSlashRegistry` (chat-slash-registry.ts) dist'te VAR ama `runChatNativeLoop` ÇAĞIRMIYOR (0-runtime-caller). 221-003 TECH_DEBT idi — doğrulama hollow kanıtladı.
**Çözüm:** chat-native.ts runChatNativeLoop — slash-check'i genişlet: `handleReplCommand` (mevcut /clear /exit) + `resolveSlash(line, buildSlashRegistry())` (yeni /help /status /recall). `/help` → registry listesini ANINDA bas (claude'a GİTMEZ). `/status` /recall → agentic-dispatch. Caller chat-native.ts (def chat-slash-registry.ts DIŞLA). 0-runtime-caller → canlı.
**Kanıt:** `grep -c "buildSlashRegistry\|resolveSlash" src/cli/commands/chat-native.ts` → ≥1 (ÇAĞRI); `npx vitest run tests/cli/repl-slash-registry-wire.test.ts` → 4+ pass
**Test:** ≥4 (/help→registry-liste claude'a-gitmez, /status→agentic, bilinmeyen-slash→none, /clear hâlâ çalışır)
**Smoke (RUN-VERIFY):** `printf '/help\n/exit\n' | env -u ANTHROPIC_API_KEY deckent 2>&1 | head -12` → ANINDA slash listesi (<1s, claude-cevabı DEĞİL, 15.9s DEĞİL)

## Task 6: 222-006 — status-line REPL'e GERÇEK-bas (221-004 hollow fix)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/entry.ts, tests/cli/repl-status-line-wire.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem (cc run-verify HOLLOW):** REPL ilk satırı sadece "deckent (claude) — type :exit to quit" — provider/dizin/sprint status-line GÖRÜNMÜYOR. `renderStatusLine` (chat-status-line.ts) dist'te VAR ama entry.ts REPL launch'ı basmıyor. 221-004 TECH_DEBT — hollow.
**Çözüm:** entry.ts native REPL launch — `renderStatusLine(ctx, config)` çağır + REPL başında/promptında bas (provider + dizin + aktif-sprint). config `chat.status_line` ile aç/kapa. Caller entry.ts (def chat-status-line.ts DIŞLA).
**Kanıt:** `grep -c "renderStatusLine" src/cli/entry.ts` → ≥1 (ÇAĞRI); `npx vitest run tests/cli/repl-status-line-wire.test.ts` → 4+ pass
**Test:** ≥4 (status-line basılır, provider yansır, config-kapalı→yok, dizin doğru)
**Smoke (RUN-VERIFY):** `printf '/exit\n' | env -u ANTHROPIC_API_KEY deckent 2>&1 | head -3` → ilk satırlarda provider/dizin status-line GÖRÜNÜR

## Task 7: 222-007 — agentic-dispatch + enterprise-bridge runtime-wire (221-002/008 hollow fix)
- Model: opus
- Effort: normal
- Skills: anthropic-sdk, typescript-expert
- Files: src/cli/commands/chat-native.ts, tests/cli/repl-agentic-enterprise-wire.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** 221-002 (agentic-wire) + 221-008 (enterprise-bridge) TECH_DEBT — muhtemelen hollow (REPL'de "durum ne"/"/cost" gerçek aksiyona gitmiyor). 222-005 slash-registry wire'ı ile birlikte tam-bağla.
**Çözüm:** chat-native.ts runChatNativeLoop — slash-registry'den sonra: agentic intent (`classifyAgenticIntent`) → `dispatchAgenticIntent` (status/recall/history gerçek aksiyon) + enterprise slash (`/cost` /audit → `dispatchEnterpriseSlash`). Sonuç REPL'e basılır, claude'a gitmez. Caller chat-native.ts (def dosyaları DIŞLA). 221-002/008 hollow→canlı + run-verify.
**Kanıt:** `grep -c "classifyAgenticIntent\|dispatchAgenticIntent\|dispatchEnterpriseSlash" src/cli/commands/chat-native.ts` → ≥2 (ÇAĞRI); `npx vitest run tests/cli/repl-agentic-enterprise-wire.test.ts` → 4+ pass
**Test:** ≥4 (durum-ne→dispatch, /cost→enterprise-bridge, sohbet→provider, recall→dispatch)
**Smoke (RUN-VERIFY):** `printf 'durum ne\n/exit\n' | env -u ANTHROPIC_API_KEY deckent 2>&1 | head` → gerçek status çıktısı (genel-claude-sohbeti DEĞİL)

---

## DALGA C — Nervous CANLI / Etkileşimli / NON-BLOCKING (3 task)

## Task 8: 222-008 — [P0] Panic-gate NON-BLOCKING (sessiz spawn-blok TAMAMEN kaldır)
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/nervous/panic-gate.ts, tests/nervous/panic-gate-nonblocking.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
**Problem (A/B-kanıtlı kök-neden, Sprint 221):** nervous `enabled:true` iken sprint SPAWN'da takılıyor — panic-gate `.deckent/panic-ipc/pending/` sessiz marker yazıyor, worker-spawn marker resolve olana kadar busy-poll'da bekliyor (4.5s+ → sonsuz), onay terminal'e GELMİYOR. A/B: nervous OFF→spawn oldu, ON→takıldı. Kök kod-yeri orchestra/nervous'ta net değil — **DERINLEMESINE BUL** (panic-ipc üreten/bekleyen kod; spawn-blok noktası).
**Çözüm:** Kök-yeri bul (panic-gate spawn-blok). `panic-gate.ts` — gate'i **NON-BLOCKING** yap: (a) default **advisory** (spawn'ı BLOKE ETME, sadece bildir/logla), VEYA (b) bloke edecekse **timeout-auto-proceed** (örn. 10s sonra otomatik devam) + **görünür uyarı** (sessiz sonsuz-bekleme YASAK). Worker-spawn kritik-yolu nervous'a bağımlı OLMAMALI. Caller sprint-controller/spawn (kök neredeyse). DİKKAT: safety_floor locked_actions (KILL_LIVE_SPRINT vb.) korunur — sadece spawn-blok kalkar.
**Kanıt:** `grep -c "nonblocking\|advisory\|timeout\|autoProceed\|non-block\|setTimeout" src/nervous/panic-gate.ts` → ≥2; `npx vitest run tests/nervous/panic-gate-nonblocking.test.ts` → 4+ pass
**Test:** ≥4 (gate advisory→spawn beklemez, timeout→auto-proceed, safety_floor locked korunur, marker-yok→normal) — hermetik (mock, gerçek spawn YOK)

## Task 9: 222-009 — Nervous terminal-görünür (REPL'de pending + accept/reject, sessiz-IPC bitsin)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat-nervous-bridge.ts, tests/cli/chat-nervous-bridge.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** Nervous olayları (panic/öneri) `.deckent/panic-ipc/` sessiz dosyada bekliyor — terminal'de GÖRÜNMÜYOR, kullanıcı yakalayamıyor. Alperen: "terminalde hızlı+etkileşimli bizimle çalışsın."
**Çözüm:** `chat-nervous-bridge.ts` — `getPendingNervous()` (pending marker/notification oku) + `renderNervousPrompt()` (REPL'de görünür bildirim) + slash `/nervous` (pending listele + accept/reject). REPL loop'ta pending varsa görünür bas (sessiz değil). Mevcut accept/reject (nervous.ts/nervous-endpoint.ts) çağır. Caller bu modül + chat-native.
**Kanıt:** `grep -c "getPendingNervous\|renderNervousPrompt\|/nervous\|accept\|reject" src/cli/commands/chat-nervous-bridge.ts` → ≥3; `npx vitest run tests/cli/chat-nervous-bridge.test.ts` → 4+ pass
**Test:** ≥4 (pending oku, görünür-render, /nervous accept, /nervous reject, pending-yok→sessiz) — hermetik (tmpdir panic-ipc fixture)
**Smoke:** `printf '/nervous\n/exit\n' | env -u ANTHROPIC_API_KEY deckent 2>&1 | head` → pending nervous listesi (veya "bekleyen yok")

## Task 10: 222-010 — Nervous güvenli re-enable + dashboard-canlı (non-blocking olduktan SONRA)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: .deckent/config.json, tests/config/nervous-reenable-safe.test.ts
- Scope: .deckent/, tests/config/
- Dependencies: 222-008

### Description
**Problem:** Nervous şu an geçici `enabled:false` (panic-gate spawn-blok yüzünden). 222-008 non-blocking yaptıktan SONRA güvenle re-enable.
**Çözüm:** `.deckent/config.json` `nervous_system.enabled: true` (222-008 non-blocking SONRASI güvenli) + mode balanced + panic-gate advisory doğrula. Dashboard NervousPage 222-009 bridge'ten canlı data alır. **DİKKAT:** 222-008 DONE değilse re-enable ETME (spawn-blok nüksetmesin) — bu task 222-008'e bağımlı.
**Kanıt:** `grep -A1 nervous_system .deckent/config.json | grep "enabled.*true"`; `npx vitest run tests/config/nervous-reenable-safe.test.ts` → 3+ pass
**Test:** ≥3 (config enabled, advisory-mode, safety_floor korunur) — hermetik (config fixture)

---

## DALGA D — ADR + Docs + Tech-Debt Kapatma (3 task)

## Task 11: 222-011 — ADR-084 (REPL-Perf Persistent-Session + Nervous-Interactive) + MASTER-PLAN
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: docs/adr/084-repl-perf-nervous-interactive.md, docs/MASTER-PLAN.md, tests/docs/adr-084.test.ts
- Scope: docs/, tests/docs/
- Dependencies: 222-001, 222-008

### Description
**Çözüm:** ADR-084 (native REPL persistent-session + streaming + görsel + nervous non-blocking/interactive, MADR, accepted). Kök-neden: per-turn cold-start 4.5s + panic-gate sessiz-blok. MASTER-PLAN §3/§4 REPL-perf + nervous-canlı + §10 Sprint 222 güncelle.
**Kanıt:** `grep -c "persistent\|session\|nervous\|streaming\|perf" docs/adr/084-*.md` → ≥4; `grep -c "222" docs/MASTER-PLAN.md` → ≥1; `npx vitest run tests/docs/adr-084.test.ts` → 3+ pass
**Test:** ≥3 (ADR-084 MADR, MASTER-PLAN güncel, accepted)

## Task 12: 222-012 — README + blueprint güncel (hızlı native REPL + nervous-canlı)
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: docs/vision/blueprint.md, tests/docs/blueprint-222-sync.test.ts
- Scope: docs/, tests/docs/
- Dependencies: 222-001

### Description
**Çözüm:** blueprint.md güncel — native REPL artık HIZLI (persistent session, <1s/mesaj) + GÖRSEL (markdown/renk/spinner) + nervous CANLI/etkileşimli (sessiz panic-gate kalktı). README native-chat bölümü hız+görsel vurgula.
**Kanıt:** `grep -c "REPL\|hızlı\|persistent\|nervous\|görsel\|streaming" docs/vision/blueprint.md` → ≥4; `npx vitest run tests/docs/blueprint-222-sync.test.ts` → 3+ pass
**Test:** ≥3 (REPL-perf güncel, nervous-canlı, görsel)

## Task 13: 222-013 — Sprint 221 TECH_DEBT gerçek-kapatma (Smoke run-verify, hollow→çalışır)
- Model: sonnet
- Effort: normal
- Skills: ci-testing, typescript-expert
- Files: scripts/repl-smoke-verify.mjs, tests/scripts/repl-smoke-verify.test.ts
- Scope: scripts/, tests/scripts/

### Description
**Problem:** Sprint 221 5 TECH_DEBT (002/003/004/008/014) — çoğu hollow (run-verify'da çalışmadı). Gerçek-koşu smoke harness yok.
**Çözüm:** `repl-smoke-verify.mjs` — gerçek `dist/cli/entry.js` REPL smoke: `/help` anlık-liste (claude'a-gitmez), status-line görünür, "durum ne" agentic, 2-mesaj-perf (<1s reuse). Her biri PASS/FAIL raporla (run-proven). Async spawn, timeout-guard. 222-005/006/007 sonrası bu yeşil olmalı.
**Kanıt:** `grep -c "help\|status-line\|durum\|perf\|entry.js\|spawn" scripts/repl-smoke-verify.mjs` → ≥4; `npx vitest run tests/scripts/repl-smoke-verify.test.ts` → 4+ pass
**Test:** ≥4 (/help anlık, status-line, agentic, perf-reuse) — async spawn hermetik
**Smoke:** `node scripts/repl-smoke-verify.mjs` → tüm REPL özellikleri PASS (hollow değil)

---

## Sprint Sonu Notu

**Beklenen:** 11-13/13 DONE, 0 false-FIX. **Native REPL claude-code gibi:** HIZLI (persistent session, 2. mesaj <1s — 4.5s'den), GÖRSEL (markdown+renk+spinner), token-streaming. Sprint 221 hollow'ları GERÇEK-bağlı (`/help` anlık, status-line görünür, agentic/enterprise çalışır — run-verified). Nervous CANLI/etkileşimli/NON-BLOCKING (sessiz panic-gate kalktı, terminal-görünür, güvenli re-enable). CI yeşil KORUNUR.

**🟢 RUN-VERIFY (cc sprint sonu):** gerçek `dist/cli/entry.js` — `time` ile 2-mesaj perf (2. <1s), `/help` ANINDA liste (15.9s DEĞİL), status-line görünür, "durum ne" agentic, markdown renkli, nervous re-enable sonrası SPRINT TAKILMAZ (panic-gate non-blocking). `node scripts/repl-smoke-verify.mjs` yeşil. Mock-only DONE YOK.

**🔴 NERVOUS DİKKAT:** 222-008 (non-blocking) DONE OLMADAN 222-010 (re-enable) YAPMA — spawn-blok nüksetmesin. Sprint sonu nervous re-enable edilmiş + sprint takılmamış olmalı (A/B doğrula). Şu an config nervous OFF.

**🔑 PERF BEKLENTİSİ:** persistent session en büyük kazanç (4.5s→<1s). claude CLI persistent/stream-json mode araştır; yoksa process-reuse/warm + net rapor.

**Pre-flight:** **build:all + restart + RE-PLAN ŞART.** git-guard aktif. config max_workers=10, **nervous_system.enabled şu an false** (222-010'da non-blocking sonrası açılır). Sprint **CLI'dan** `env -u ANTHROPIC_API_KEY` ile (API mode YASAK — Sprint 221 takılma dersi: env'de API key olmadan başlat). Her wave sonrası `git log -1`.

İlgili memory:
- [[project_terminal_dashboard_ux_evolution]] — REPL-perf + hollow-wire kök-neden (system-debug)
- [[project_nervous_panic_gate_silent_block]] — nervous panic-gate sessiz-blok (A/B kanıt) + Sprint 222 hedef
- [[feedback_directive_kanit_letter_vs_goal]] — wire-gap (def-dosya dışla, çağıran-modül + run-verify)
- [[feedback_proof_of_function_dod]] — run-verify (perf-ölçüm + gerçek-davranış)
- [[feedback_wiring_pct_vs_user_working]] — hollow (kod var ≠ çalışıyor)
- [[feedback_no_minimum_no_mvp_deckent]] — god-level (hızlı + görsel)
- [[feedback_build_mcp_restart_coordination]] — build Alperen + RE-PLAN
- [[feedback_ai_planner_silent_fallback]] — plan AI fail olabilir, structured kullan
