# DIRECTIVES — Sprint 221: deckent = claude-code (Terminal REPL tam-kapsam + Provider-parity + Local-model + Enterprise-terminal + Sade/Özelleştirilebilir UX)

## Goal: BÜYÜK SPRINT (16 task, 5 dalga, 10 worker). Sprint 220 başardı: `deckent` argümansız REPL GERÇEKTEN konuşuyor (run-verify: "Selam Alperen! 👋", config-driven provider-wire). Şimdi REPL'i **claude-code-kalitesinde tam-kapsamlı** yapıyoruz. Alperen yönü (2026-06-02): "terminalde user VE enterprise tarafında tam-kapsamlı çalışsın, **kullanılmasa da kullanılabilir olsun**, arayüz **karmaşık olmasın**, **özelleştirilebilir** olsun, **/komutları canlı** olsun, **her provider'de doğru** çalışsın; yarın local-model'le deckent-AI geliştirirsek ona da katkı sağlasın." Bulgu (bu sprint plan-analizi DOĞRULADI): yapı taşları VAR ama `runChatNativeLoop`'a BAĞLI DEĞİL — `handleReplCommand` (slash, statik /exit /clear), `classifyAgenticIntent`/`dispatchAgenticIntent` (220-004 carry), `providers/ollama.ts`+`OllamaAdapter` (local), enterprise CLI (audit/rbac/flow/cost) hepsi mevcut ama REPL loop hiçbirini çağırmıyor. **DALGA A:** REPL canlı çekirdek (slash-wire + agentic-wire + canlı-komut-registry + status-line). **DALGA B:** provider-parity (claude/codex/gemini/ollama-local/openai-compat REPL round-trip + fallback). **DALGA C:** enterprise-terminal erişim (REPL'den audit/rbac/flow/cost) + user/enterprise mod + özelleştirilebilir config. **DALGA D:** dashboard claude-code-UX (konuşma-merkezli + streaming + slash). **DALGA E:** hijyen (Smoke-219-016 hotfix + coverage) + ADR + docs. **god-level — MVP ASLA. Sade ≠ eksik: az-ama-tam.**

Bağlam:
- **Native REPL gerçek konuşuyor** (220-001 run-proven) ama loop sade: slash sadece /exit /clear (chat-repl-ux.ts:63), agentic-dispatch bağlı değil (220-004 tech-debt), status-line yok, sadece resolved-provider (ollama REPL'de değil).
- **Yapı taşları hazır:** `handleReplCommand`/`createSigintTracker`/`createMultiLineAccumulator`/`createReplLines` (chat-repl-ux.ts), `classifyAgenticIntent`/`dispatchAgenticIntent` (chat-agentic-dispatch.ts), `OllamaAdapter`+`OLLAMA_BUILTIN_MODELS` (core/ollama-models.ts), `providers/ollama.ts`+`openai-compatible.ts`, enterprise CLI (audit/audit-verify/rbac/flow/cost.ts). **Bu sprint = WIRE, yeniden-yazma DEĞİL.**
- **Kanıt-prensibi ([[feedback_directive_kanit_letter_vs_goal]]):** grep DEF-dosyasını DIŞLA, wire ÇAĞIRAN modülü ölç. `runChatNativeLoop` (chat-native.ts) gerçekten `handleReplCommand`/`dispatchAgenticIntent` çağırmalı (0-caller→canlı-caller).
- **CLI-kurulum bulgusu (2026-06-02):** dogfood'da global `deckent`/`npx deckent serve` terminalde SESSİZ (çıktı yok). `node dist/cli/entry.js` ÇALIŞIYOR. 221-000 (P0-hijyen) bu kurulum/komut-çıktı sorununu çözer — bkz Task 13'e bitişik.
- **git-guard aktif** (deckent-dev tree reset koruması). CI yeşil KORUNUR (19005/0).

---

## Tüm task'lar için ortak kurallar
- **🟢 PROOF-OF-FUNCTION ([[feedback_proof_of_function_dod]]):** user-surface (`src/cli/`/`src/dashboard/`/`src/api/`) ZORUNLU `Smoke:` (gerçek-binary + beklenen çıktı). Mock-only=GO_WITH_TECH_DEBT. **Run-verify dersi ([[project_dashboard_realrun_findings]], [[feedback_wiring_pct_vs_user_working]]):** "wired" yetmez — REPL'de gerçek çalışmalı.
- **🔴 HERMETIK ([[project_ci_green_root_causes]]):** gitignored state okuma, tmpdir+sandbox HOME, async spawn. test:ci-sim. CI yeşil KORUNUR (19005/0).
- **🔌 WIRE-GAP ([[feedback_directive_kanit_letter_vs_goal]]):** mevcut yapı taşını ÇAĞIR (yeniden yazma); kanıt grep ÇAĞIRAN dosyada (def-dosyası DIŞLANIR), 0-caller→canlı-caller.
- **🎨 SADE-AMA-TAM:** arayüz karmaşık DEĞİL ama yetenek eksik DEĞİL; "kullanılmasa da kullanılabilir". Özelleştirilebilir (config-driven, hard-code yasak — [[feedback_zero_hardcode_live_data]]).
- **🌐 PROVIDER-AGNOSTİK:** claude bias YOK; claude/codex/gemini/ollama-local/openai-compat eşit. Local-model (ollama, zero-API) birinci-sınıf — "yarın deckent-AI" altyapısı.
- **KÜÇÜK TASK:** tek-dosya, ≤200 LoC, effort≤normal, YENİ TEST DOSYASI. ESM `.js`. Subscription mode (API yasak). ADR-010.

---

## DALGA A — REPL Canlı Çekirdek (slash + agentic + canlı-registry + status-line) (4 task)

## Task 1: 221-001 — [P0] runChatNativeLoop → handleReplCommand canlı slash-wire
- Model: opus
- Effort: normal
- Skills: typescript-expert, anthropic-sdk
- Files: src/cli/commands/chat-native.ts, tests/cli/repl-slash-wire.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem (plan-analizi):** `runChatNativeLoop` (chat-native.ts:282 `for await (const rawLine of input)`) slash-komut işlemiyor — `handleReplCommand` (chat-repl-ux.ts:63) VAR ama loop ÇAĞIRMIYOR. `/clear` yazınca provider'a gidiyor (saçma cevap), `/help` yok.
**Çözüm:** loop başında her satırı önce `handleReplCommand(line)`'a ver: `action:'exit'`→break, `action:'clear'`→transcript temizle+devam, `action:'none'`→mevcut akış (agentic/provider). Caller `chat-native.ts` (def `chat-repl-ux.ts` DIŞLANIR). Yeniden yazma yok — mevcut handler'ı çağır.
**Kanıt:** `grep -c "handleReplCommand" src/cli/commands/chat-native.ts` → ≥1 (ÇAĞRI, def değil); `npx vitest run tests/cli/repl-slash-wire.test.ts` → 4+ pass
**Test:** ≥4 (/exit→break, /clear→transcript boşalır, /quit→break, normal-satır→provider'a düşer)
**Smoke:** `printf '/clear\nselam\n/exit\n' | env -u ANTHROPIC_API_KEY node dist/cli/entry.js 2>&1 | head -8` → /clear sessiz işlenir, selam gerçek cevap, /exit çıkar (slash provider'a GİTMEZ)

## Task 2: 221-002 — [P0] runChatNativeLoop → agentic dispatch canlı-wire (220-004 carry, doğal dil→aksiyon)
- Model: opus
- Effort: normal
- Skills: anthropic-sdk, typescript-expert
- Files: src/cli/commands/chat-native.ts, tests/cli/repl-agentic-wire.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem (220-004 GO_WITH_TECH_DEBT):** `classifyAgenticIntent`/`dispatchAgenticIntent` (chat-agentic-dispatch.ts) VAR ama `runChatNativeLoop` çağırmıyor — REPL'de "durum ne" → gerçek `deckent_status` çalışmıyor, provider'a gidiyor.
**Çözüm:** slash-check'ten sonra (221-001'le sıralı): `classifyAgenticIntent(line)` → agentic intent (status/recall/history) ise riskli-onay sonrası `dispatchAgenticIntent` + sonucu output'a bas; değilse provider turn. Caller `chat-native.ts` (def `chat-agentic-dispatch.ts` DIŞLANIR). 220-003 kısmen yaptıysa TAMAMLA + canlı doğrula.
**Kanıt:** `grep -c "classifyAgenticIntent\|dispatchAgenticIntent" src/cli/commands/chat-native.ts` → ≥2 (ÇAĞRI); `npx vitest run tests/cli/repl-agentic-wire.test.ts` → 4+ pass
**Test:** ≥4 (status-intent→dispatch çağrılır, sohbet→provider, recall-intent→dispatch, riskli→onay-gate)
**Smoke:** `echo "sprint durumu ne" | env -u ANTHROPIC_API_KEY node dist/cli/entry.js 2>&1 | head` → gerçek status çıktısı (genel-sohbet DEĞİL)

## Task 3: 221-003 — Canlı slash-registry (/help /status /recall /plan dinamik, hard-code değil) + sade liste
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat-slash-registry.ts, tests/cli/chat-slash-registry.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** `handleReplCommand` statik (sadece /exit /clear). Alperen: "/komutları CANLI olsun" — komut listesi dinamik (deckent yetenek kataloğundan türetilir, hard-code değil [[feedback_zero_hardcode_live_data]]).
**Çözüm:** `chat-slash-registry.ts` — `buildSlashRegistry()`: canlı komut listesi döndürür ({name, desc, agenticIntent?}) — `/help`(listeyi sade bas), `/status` `/recall` `/plan` `/sprint`(agentic-intent'e map), `/exit` `/clear`. `/help` az-ama-tam (karmaşık değil). `resolveSlash(line, registry)`. 221-001/002 bu registry'yi tüketir (sonraki wire). Caller bu modül (saf, test-edilebilir).
**Kanıt:** `grep -c "buildSlashRegistry\|resolveSlash\|/help\|/status" src/cli/commands/chat-slash-registry.ts` → ≥3; `npx vitest run tests/cli/chat-slash-registry.test.ts` → 4+ pass
**Test:** ≥4 (registry komut listesi, /help sade-çıktı, /status→agentic-map, bilinmeyen-slash→none)
**Smoke:** `printf '/help\n/exit\n' | env -u ANTHROPIC_API_KEY node dist/cli/entry.js 2>&1 | head -12` → canlı komut listesi basılır (statik değil)

## Task 4: 221-004 — REPL status-line (provider/sprint/dizin) + özelleştirilebilir (config-driven)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat-status-line.ts, tests/cli/chat-status-line.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** REPL'de alt-bilgi yok (hangi provider, hangi sprint, hangi dizin). claude-code status-line gibi sade-bilgi istenir; özelleştirilebilir.
**Çözüm:** `chat-status-line.ts` — `renderStatusLine(ctx, config)`: provider + aktif-sprint + dizin (+opsiyonel maliyet). config `chat.status_line` (bool/alanlar) ile özelleştirilebilir (kapatılabilir → sade). Hard-code yok. entry.ts REPL başında bas (saf-render + minimal entry çağrısı).
**Kanıt:** `grep -c "renderStatusLine\|provider\|sprint\|status_line" src/cli/commands/chat-status-line.ts` → ≥2; `npx vitest run tests/cli/chat-status-line.test.ts` → 4+ pass
**Test:** ≥4 (status-line render, config-kapalı→boş, provider-yansır, sprint-yok→sade) — hermetik
**Smoke:** `echo "/exit" | env -u ANTHROPIC_API_KEY node dist/cli/entry.js 2>&1 | head -3` → ilk satırda provider/dizin status-line görünür

---

## DALGA B — Provider-Parity (her provider doğru + local-model birinci-sınıf) (3 task)

## Task 5: 221-005 — [P0] Provider-resolve genişlet: ollama-local + openai-compat REPL round-trip (zero-API)
- Model: opus
- Effort: normal
- Skills: typescript-expert, anthropic-sdk
- Files: src/cli/entry.ts, tests/cli/repl-provider-resolve.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** 220-001 provider-resolve (chat_provider→brain_provider→claude) claude/codex/gemini CLI spawn yapıyor ama `OllamaAdapter` (core/ollama-models.ts) + `providers/ollama.ts` (local, zero-API) REPL'e bağlı DEĞİL. Alperen: "her provider'de doğru çalışsın; yarın local-model'le deckent-AI" — ollama-local birinci-sınıf olmalı.
**Çözüm:** entry.ts REPL provider-resolve'a `ollama` (+ `openai-compatible`) dalı ekle: `chat_provider==='ollama'` → `OllamaAdapter`/`providers/ollama.ts` ile local round-trip (localhost:11434, API-key YOK). Mevcut createSubscriptionChatAdapter pattern'i genişlet (yeniden yazma değil). Caller entry.ts.
**Kanıt:** `grep -c "ollama\|Ollama\|openai-compat\|adapter" src/cli/entry.ts` → ≥2; `npx vitest run tests/cli/repl-provider-resolve.test.ts` → 4+ pass
**Test:** ≥4 (chat_provider=ollama→ollama-adapter, claude→subscription, openai-compat→adapter, ollama round-trip mock localhost:11434)
**Smoke:** `DECKENT_CHAT_PROVIDER=ollama echo "x" | node dist/cli/entry.js 2>&1 | head -4` → ollama-yolu seçilir (claude-spawn DEĞİL; ollama yoksa NET hata "ollama localhost:11434 erişilemedi", skeleton değil)

## Task 6: 221-006 — Provider-parity test matrisi (5 provider REPL round-trip eşitliği)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: tests/cli/repl-provider-parity.test.ts, src/cli/commands/chat-provider-parity.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** Hangi provider'lerin REPL'de gerçekten round-trip yaptığı belirsiz (claude bias riski). Parity garantisi yok.
**Çözüm:** `chat-provider-parity.ts` — `resolveChatAdapter(provider, config)`: tek-giriş tüm provider'ları (claude/codex/gemini/ollama/openai-compatible) eşit-yolla adapter'a map eder (220-001+221-005 mantığını tek-noktaya toplar, entry.ts bunu çağırır — collapse). Parity test: 5 provider için aynı sözleşme (sendMessage→response). Caller bu modül + entry.ts gelecekte.
**Kanıt:** `grep -c "resolveChatAdapter\|claude\|codex\|gemini\|ollama" src/cli/commands/chat-provider-parity.ts` → ≥4; `npx vitest run tests/cli/repl-provider-parity.test.ts` → 5+ pass
**Test:** ≥5 (her provider→adapter döner, aynı sözleşme, bilinmeyen→hata, ollama-zero-API, fallback) — mock (hermetik)

## Task 7: 221-007 — Provider fallback chain + yoklukta net hata (skeleton-yasak)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/config.ts, tests/core/chat-provider-fallback.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** Provider yoksa/erişilemezse davranış belirsiz (220 run-verify'da "skeleton" riski). Fallback zinciri config-katmanında net olmalı.
**Çözüm:** config.ts — `resolveChatProvider(config)`: `chat_provider ?? brain_provider ?? 'claude'` + opsiyonel local-fallback (config `chat.local_fallback:'ollama'`). Net-hata sözleşmesi (provider erişilemez→açık mesaj, skeleton DEĞİL). Tier-0 (core, internal).
**Kanıt:** `grep -c "resolveChatProvider\|chat_provider\|brain_provider\|fallback" src/core/config.ts` → ≥2; `npx vitest run tests/core/chat-provider-fallback.test.ts` → 4+ pass
**Test:** ≥4 (chat_provider öncelik, brain_provider fallback, claude default, local_fallback ollama) — hermetik

---

## DALGA C — Enterprise-Terminal Erişim + User/Enterprise Mod + Özelleştirme (3 task)

## Task 8: 221-008 — REPL'den enterprise komut köprüsü (/audit /rbac /flow /cost → mevcut CLI)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat-enterprise-bridge.ts, tests/cli/chat-enterprise-bridge.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** Enterprise CLI (audit/audit-verify/rbac/flow/cost.ts) VAR ama REPL'den erişilemiyor. Alperen: "user VE enterprise tarafında tam-kapsamlı; kullanılmasa da kullanılabilir."
**Çözüm:** `chat-enterprise-bridge.ts` — `dispatchEnterpriseSlash(cmd, args)`: `/audit` `/rbac` `/flow` `/cost` slash'larını mevcut CLI komut-handler'larına köprüler (yeni iş yapmaz, çağırır). Slash-registry'ye (221-003) enterprise grubu olarak eklenir (user-mode'da gizli ama erişilebilir — "kullanılmasa da kullanılabilir"). Caller bu modül (def CLI komutları DIŞLANIR).
**Kanıt:** `grep -c "dispatchEnterpriseSlash\|audit\|rbac\|flow\|cost" src/cli/commands/chat-enterprise-bridge.ts` → ≥4; `npx vitest run tests/cli/chat-enterprise-bridge.test.ts` → 4+ pass
**Test:** ≥4 (/audit→audit-handler, /rbac→rbac, /cost→cost, bilinmeyen→none) — mock
**Smoke:** `printf '/cost\n/exit\n' | env -u ANTHROPIC_API_KEY node dist/cli/entry.js 2>&1 | head -8` → cost özeti basılır (enterprise komut REPL'den çalışır)

## Task 9: 221-009 — User/Enterprise mod (sade-default, enterprise opt-in, config-driven)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat-mode.ts, tests/cli/chat-mode.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** Tek-tip arayüz; enterprise yetenekleri (rbac/audit) bireysel-user'a karmaşık görünür. Alperen: "arayüz karmaşık olmasın" + "enterprise tam-kapsamlı".
**Çözüm:** `chat-mode.ts` — `resolveChatMode(config)`: `user` (default, sade — sadece sohbet+status/recall slash) | `enterprise` (audit/rbac/flow/cost slash görünür). config `chat.mode`. Mod, slash-registry görünürlüğünü filtreler (yetenek hep VAR — "kullanılmasa da kullanılabilir" — sadece /help listesi sadeleşir). Hard-code yok.
**Kanıt:** `grep -c "resolveChatMode\|user\|enterprise\|chat.mode\|mode" src/cli/commands/chat-mode.ts` → ≥3; `npx vitest run tests/cli/chat-mode.test.ts` → 4+ pass
**Test:** ≥4 (user-mode sade-liste, enterprise-mode tam-liste, default=user, enterprise-slash user'da gizli-ama-çalışır) — hermetik
**Smoke:** `printf '/help\n/exit\n' | DECKENT_CHAT_MODE=enterprise env -u ANTHROPIC_API_KEY node dist/cli/entry.js 2>&1 | head -14` → enterprise komutları /help'te görünür

## Task 10: 221-010 — Özelleştirilebilir chat config (schema + default) — provider/mod/status-line/slash
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/config.ts, tests/core/chat-config-schema.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** chat ayarları dağınık (chat_provider tek-key). Alperen: "özelleştirilebilir olsun" — tek `chat` config bölümü.
**Çözüm:** config.ts — `CHAT_CONFIG_SCHEMA` (Zod): `chat: { provider?, mode?: 'user'|'enterprise', status_line?: bool|fields, local_fallback?, slash_extra? }` + 3-katman merge + sade default (hepsi opsiyonel, yoksa sade-davranış). 221-004/007/009 bu şemayı tüketir. Tier-0 (core).
**Kanıt:** `grep -c "CHAT_CONFIG_SCHEMA\|chat\|mode\|status_line\|provider" src/core/config.ts` → ≥3; `npx vitest run tests/core/chat-config-schema.test.ts` → 4+ pass
**Test:** ≥4 (schema parse, default sade, merge 3-katman, geçersiz-mod reddedilir) — hermetik

---

## DALGA D — Dashboard claude-code-UX (konuşma-merkezli) (2 task)

## Task 11: 221-011 — Dashboard ChatPage streaming + slash-komut UI (terminal-paritesi)
- Model: opus
- Effort: normal
- Skills: react-specialist, typescript-expert
- Files: src/dashboard/src/pages/ChatPage.tsx, tests/dashboard/chatpage-slash-stream.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem ([[project_dashboard_realrun_findings]]):** Dashboard Chat hâlâ sade; terminal REPL'deki slash/agentic (221-001/002/003) dashboard'da yok. claude.ai/code gibi konuşma-merkezli olmalı.
**Çözüm:** ChatPage.tsx — `/api/chat` (220-007 backend) gerçek round-trip + akan cevap (chat-stream client) + slash-komut girişi (/status /recall → backend agentic). Bearer token. Terminal ile parite (aynı slash seti).
**Kanıt:** `grep -c "api/chat\|stream\|slash\|/status\|Authorization" src/dashboard/src/pages/ChatPage.tsx` → ≥3; `npm run test:dashboard -- chatpage-slash-stream` → 4+ pass
**Test:** ≥4 (mesaj→akan cevap, /status slash→agentic render, error, boş)
**Smoke:** `npm run test:dashboard -- chatpage-slash-stream` → slash + stream round-trip render PASS

## Task 12: 221-012 — Dashboard konuşma-merkezli layout (chat öne, sade bilgi mimarisi)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/components/Layout.tsx, tests/dashboard/layout-chat-first.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem:** Dashboard sprint-tablo-merkezli; claude-code konuşma-merkezli (chat ana giriş). Alperen: "arayüz karmaşık olmasın."
**Çözüm:** Layout.tsx — chat'i öne-çıkar (varsayılan/üst nav), sade bilgi mimarisi (gruplu nav: Konuş / İzle / Yönet). Mevcut 10-sayfa korunur, sadeleştirilir (karmaşık değil). Görsel tutarlılık.
**Kanıt:** `grep -c "chat\|nav\|group\|Layout" src/dashboard/src/components/Layout.tsx` → ≥2; `npm run test:dashboard -- layout-chat-first` → 4+ pass
**Test:** ≥4 (chat-nav öne, gruplu nav render, 10-sayfa korunur, aktif-link)
**Smoke:** `npm run test:dashboard -- layout-chat-first` → chat-first + 10-nav PASS

---

## DALGA E — Hijyen + Carry + ADR + Docs (4 task)

## Task 13: 221-013 — [P0] CLI kurulum/komut-çıktı fix (`deckent`/`npx deckent serve` terminalde sessiz → çalışsın)
- Model: opus
- Effort: normal
- Skills: typescript-expert, ci-testing
- Files: src/cli/entry.ts, tests/cli/cli-bin-invocation.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem (Alperen 2026-06-02, gerçek terminal):** `npx deckent serve`, `deckent help`, `deckent serve` → **SESSİZ çıktı yok** (prompt'a düşüyor). `node dist/cli/entry.js` ÇALIŞIYOR. Yani bin-entry (`deckent` global / `npx deckent`) komut-routing veya shebang/exit sorunu — entry.ts argümanlı çağrıda (serve/help) çıktı üretmiyor olabilir (sadece argümansız REPL dalı çalışıyor).
**Çözüm:** entry.ts bin-entry argüman-routing'i DOĞRULA: argümansız→REPL, argümanlı (serve/help/status...)→commander program.parse. `deckent help`/`deckent serve` argümanlı dalda commander'a düşmeli (REPL'e değil). Eksik/yanlış routing'i düzelt. Async exit (process hang/erken-exit yok). Caller entry.ts.
**Kanıt:** `grep -c "parse\|argv\|serve\|help\|process.argv" src/cli/entry.ts` → ≥2; `npx vitest run tests/cli/cli-bin-invocation.test.ts` → 4+ pass
**Test:** ≥4 (argümansız→REPL dalı, `help` arg→commander, `serve` arg→serve-route, bilinmeyen-arg→hata-mesajı) — async spawn hermetik
**Smoke:** `node dist/cli/entry.js help 2>&1 | head -5` → komut listesi basılır (SESSİZ DEĞİL); `node dist/cli/entry.js --version 2>&1 | head -1` → sürüm basılır

## Task 14: 221-014 — Smoke-219-016 hotfix (plannerTaskToParams smoke-field gate'e geçsin)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/task-builder.ts, tests/orchestra/smoke-field-flow.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
**Problem (219-016 + 220 carry):** `extractSmoke` task-builder'da VAR (ParsedDirectiveTask.smoke) ama plan→task JSON→gate akışında smoke-field DÜŞÜYOR — post-sprint-smoke gate input'u boş (Smoke=0). Proof-of-Function gate'in çekirdek girdisi.
**Çözüm:** task-builder.ts — parse edilen `smoke` alanının task JSON'a (`task.smoke`) yazıldığını ve gate'in (post-sprint-smoke) okuduğunu uçtan-uca DOĞRULA + eksik wire'ı tamamla. Tier-1 task'ta smoke dolu olmalı.
**Kanıt:** `grep -c "smoke" src/orchestra/task-builder.ts` → ≥3 (parse→task yazımı); `npx vitest run tests/orchestra/smoke-field-flow.test.ts` → 4+ pass
**Test:** ≥4 (Smoke: satırı→task.smoke dolu, structured-parse, bullet-parse, smoke-yok→undefined) — hermetik

## Task 15: 221-015 — ADR-083 (REPL-UX-Evolution + Provider-Parity + Local-Model-Foundation) + MASTER-PLAN
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: docs/adr/083-repl-ux-provider-parity-local-model.md, docs/MASTER-PLAN.md, tests/docs/adr-083.test.ts
- Scope: docs/, tests/docs/
- Dependencies: 221-001, 221-005

### Description
**Çözüm:** ADR-083 (REPL canlı-slash+agentic-wire, provider-parity 5-fleet, ollama-local birinci-sınıf = "yarın deckent-AI" foundation, user/enterprise mod, MADR, accepted). MASTER-PLAN §3/§4 native-REPL-tam-kapsam + local-model-foundation + §10 Sprint 221 güncelle.
**Kanıt:** `grep -c "REPL\|provider\|parity\|local\|ollama" docs/adr/083-*.md` → ≥4; `grep -c "221" docs/MASTER-PLAN.md` → ≥1; `npx vitest run tests/docs/adr-083.test.ts` → 3+ pass
**Test:** ≥3 (ADR-083 MADR, MASTER-PLAN güncel, accepted)

## Task 16: 221-016 — README + blueprint güncel (native-REPL tam-kapsam + local-model + provider-parity)
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: docs/vision/blueprint.md, tests/docs/blueprint-221-sync.test.ts
- Scope: docs/, tests/docs/
- Dependencies: 221-001

### Description
**Çözüm:** blueprint.md güncel — native REPL artık tam-kapsamlı (canlı slash + agentic + provider-parity + ollama-local + user/enterprise mod + özelleştirilebilir). README chat/native bölümü: her provider eşit, local-model (ollama zero-API) birinci-sınıf, slash-komut canlı. Provider-neutral korunur.
**Kanıt:** `grep -c "REPL\|slash\|provider\|ollama\|local\|enterprise" docs/vision/blueprint.md` → ≥4; `npx vitest run tests/docs/blueprint-221-sync.test.ts` → 3+ pass
**Test:** ≥3 (native tam-kapsam güncel, local-model var, provider-parity var)

---

## Sprint Sonu Notu

**Beklenen:** 14-16/16 DONE, 0 false-FIX. **`deckent` REPL tam-kapsamlı** (canlı slash-komut + doğal-dil→aksiyon + status-line + her-provider doğru + ollama-local + user/enterprise mod + özelleştirilebilir), `deckent help`/`deckent serve` terminalde ÇALIŞIR (sessiz değil), dashboard konuşma-merkezli (slash+stream). Sade-ama-tam (karmaşık değil, eksik değil). CI yeşil KORUNUR (19005/0), tam-suite 0 fail. Smoke gate gerçek-input (219-016 hotfix).

**🟢 RUN-VERIFY (cc sprint sonu):** gerçek `dist/cli/entry.js` — `help`/`serve` argümanlı çalışır, `/help` canlı liste, `/status` gerçek-status, "durum ne" agentic-dispatch, `DECKENT_CHAT_PROVIDER=ollama` ollama-yolu (claude-spawn değil), `/cost` enterprise-köprü, status-line görünür. Mock-only DONE kabul YOK.

**🌐 LOCAL-MODEL HEDEFİ:** ollama-local (zero-API, localhost:11434) REPL'de birinci-sınıf → "yarın local-model'le deckent-AI" altyapısı bu sprintte atılır (221-005/006 + ADR-083 foundation).

**🔑 ROUTING/SMOKE BEKLENTİSİ:** surface task'lar (cli/dashboard) doğru agent (api-builder/frontend-designer), refactorer-collapse YOK + Smoke parse olmalı (219-016 hotfix bu sprint → Tier-1 smoke dolu). Plan analizinde DOĞRULA.

**Pre-flight:** **build:all + restart + RE-PLAN ŞART.** git-guard aktif. config max_workers=10. Sprint **CLI'dan** (`env -u`, dashboard'dan değil). Her wave sonrası `git log -1`.

İlgili memory:
- [[project_terminal_dashboard_ux_evolution]] — Sprint 221 yönü (claude-code-UX evrim)
- [[feedback_directive_kanit_letter_vs_goal]] — wire-gap (def-dosya dışla, çağıran-modül ölç)
- [[feedback_proof_of_function_dod]] — Smoke gate (gerçek-koşu)
- [[feedback_wiring_pct_vs_user_working]] — wired≠çalışıyor
- [[feedback_zero_hardcode_live_data]] — canlı/özelleştirilebilir (hard-code yasak)
- [[feedback_agent_routing_imbalance]] — routing-fix (refactorer-collapse bitmeli)
- [[project_deckent_everyone_everywhere]] — user+enterprise tam-kapsam + local-model
- [[feedback_no_minimum_no_mvp_deckent]] — god-level (sade-ama-tam)
- [[feedback_build_mcp_restart_coordination]] — build Alperen + RE-PLAN
