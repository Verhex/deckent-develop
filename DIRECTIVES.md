# DIRECTIVES — Sprint 211: F2 Native Chat Tam Canlı + F4 Enterprise Tamamla + F5 Evrimsel + F7 Dashboard Polish

## Goal: BÜYÜK ÖLÇEK (16 task, 4 dalga, 10 worker). DALGA A: F2 native chat gerçek provider round-trip (mock→canlı subscription CLI, streaming). DALGA B: F4 enterprise tamamla (RBAC enforcement runtime + audit compliance export + rate limit). DALGA C: F5 evrimsel mimari wire (prompt-evolution + adaptive-agent runtime'a bağla). DALGA D: F7 dashboard polish (UI/UX + terminal + canlı bağlantı). Her task TEK dosya/TEK sorumluluk, ≤200 LoC, effort≤normal, YENİ TEST DOSYASI zorunlu.

Bağlam:
- Sprint 207-210: tam-suite YEŞİL (18287 pass / 0 fail), Brain sağlam (0 sahte-FIX), routing CANLI çeşitlilik (refactorer 10 + frontend 3 + api-builder 1 + architect 1 + doc-writer 1). Provider-free %100, konuşulabilir %60, F3 process mode + F4 enterprise iskelet + F7 dashboard başladı.
- F2 native chat (chat-native.ts): tool-use loop + streaming + multi-turn + resume VAR ama provider çağrısı hâlâ mock/adapter-interface (gerçek SDK/CLI round-trip kısmi).
- F4: rbac.ts hierarchy + audit-writer + enterprise-config VAR ama runtime enforcement + compliance export eksik.
- F5: prompt-evolution.ts + adaptive-agent.ts iskelet VAR ama runtime'da çağrılmıyor (0-caller dormant).
- F7: SprintControlPanel + RoutingDistribution + Onboarding + auth fix VAR ama UI/UX polish + terminal güçlendirme eksik.

---

## Tüm task'lar için ortak kurallar
- **Subscription mode ZORUNLU** — `env -u ANTHROPIC_API_KEY -u DECKENT_CLAUDE_API_KEY`. API mode YASAK ([[project_api_mode_deferred_post_beta]]).
- Worker yalnızca scope.filesWrite. Host-facing'e `/workspace` YAZMA, `$CLAUDE_PROJECT_DIR`.
- **KÜÇÜK TASK:** tek-dosya/tek-sorumluluk, ≤200 LoC, effort≤normal. high YASAK.
- **Her kod task'ı YENİ TEST DOSYASI** (min 4 test) — Brain coverage muafiyeti buna bağlı ([[feedback_brain_rubric_bridge_broken]]).
- **Dishonest YASAK** — gerçekten ölç, +0/-0 tuzağı yok. Modül-seviye çöp throw/placeholder BIRAKMA ([[feedback_fix_prompt_quality]]). CLI komutları index.ts'e WIRE et (registerX import+çağrı — 209/210'da unutuldu).
- **Test dosyası doğru dizinde:** dashboard testleri `tests/dashboard/`, diğerleri `tests/<modül>/` (210'da scope-dışı test yazımı boundary-violation oldu).
- ESM `.js` suffix. ADR-010. Hedef: tam-suite 0 fail KORUNUR, regresyon yok.

---

## DALGA A — F2 Native Chat Tam Canlı (4 task)

## Task 1: 211-001 — chat-native gerçek ProviderAdapter round-trip (subscription CLI)
- Model: opus
- Effort: normal
- Skills: typescript-expert, anthropic-sdk
- Files: src/cli/commands/chat-native.ts, tests/cli/chat-native-roundtrip.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** chat-native.ts tool-use loop var ama provider çağrısı mock/iskelet. Gerçek subscription CLI (claude -p) round-trip eksik.
**Çözüm:** chat-native loop'u gerçek ProviderAdapter'a bağla (provider.ts registry resolve → subscription CLI spawn path, API DEĞİL). Mock yerine canlı adapter; test mock-adapter ile (gerçek spawn değil) round-trip doğrula.
**Kanıt:** `grep -c "ProviderAdapter\|providerRegistry\|adapter.send\|spawn.*claude" src/cli/commands/chat-native.ts` → ≥2; `npx vitest run tests/cli/chat-native-roundtrip.test.ts` → 4+ pass
**Test:** ≥4 (adapter resolve, round-trip mock, subscription path, hata)

## Task 2: 211-002 — chat-native tool dispatch gerçek MCP tool çağrısı
- Model: opus
- Effort: normal
- Skills: typescript-expert, anthropic-sdk
- Files: src/cli/commands/chat-native.ts, tests/cli/chat-native-tooldispatch.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: 211-001

### Description
**Problem:** tool-use loop tool-call parse ediyor ama MCP tool dispatch mock. Gerçek deckent MCP tool registry'sine bağlanmalı.
**Çözüm:** tool-call → MCP tool registry dispatch (deckent_status/memory_query gibi read-only tool'lar). Sonuç loop'a geri. Test mock tool registry ile.
**Kanıt:** `grep -c "mcp.*dispatch\|toolRegistry\|callTool\|MCP_TOOLS" src/cli/commands/chat-native.ts` → ≥1; `npx vitest run tests/cli/chat-native-tooldispatch.test.ts` → 4+ pass
**Test:** ≥4 (tool dispatch, sonuç geri, bilinmeyen tool, çoklu tool)

## Task 3: 211-003 — chat session persist + resume (memory.db chat entry)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat-native.ts, tests/cli/chat-native-persist.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: 211-001

### Description
**Problem:** chat appendChatTurn var ama tam session persist + resume (son N turn memory.db'den) kısmi.
**Çözüm:** Her turn memory.db chat entry'ye yaz, `--resume` son oturumu yükle, multi-turn context window. MemoryStore.appendChatTurn + getChatHistory kullan.
**Kanıt:** `grep -c "appendChatTurn\|getChatHistory\|resume\|sessionId" src/cli/commands/chat-native.ts` → ≥2; `npx vitest run tests/cli/chat-native-persist.test.ts` → 4+ pass
**Test:** ≥4 (turn persist, resume yükle, boş history, window truncate)

## Task 4: 211-004 — chat CLI canlı smoke (deckent chat --native end-to-end)
- Model: sonnet
- Effort: normal
- Skills: ci-testing, typescript-expert
- Files: scripts/chat-native-smoke.mjs, tests/scripts/chat-native-smoke.test.ts
- Scope: scripts/, tests/scripts/
- Dependencies: 211-001, 211-002

### Description
**Problem:** chat-native end-to-end smoke yok — gerçek akış doğrulanmıyor.
**Çözüm:** `chat-native-smoke.mjs` — chat-native loop'u mock-provider + mock-tool ile uçtan-uca simüle (gerçek spawn değil): user input → adapter → tool → response → persist. Routing/akış doğrulaması.
**Kanıt:** `node scripts/chat-native-smoke.mjs` → PASS; `npx vitest run tests/scripts/chat-native-smoke.test.ts` → 4+ pass
**Test:** ≥4 (akış simüle, tool round-trip, persist, exit)

---

## DALGA B — F4 Enterprise Tamamla (4 task)

## Task 5: 211-005 — RBAC runtime enforcement wire (sprint komutlarına gate)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, security-specialist
- Files: src/core/rbac.ts, tests/core/rbac-runtime-enforce.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** rbac.ts can()/hierarchy var ama runtime'da sprint/flow komutlarına gate uygulanmıyor (enterprise-config.rbac.enabled true iken).
**Çözüm:** `enforceRbac(role, action, tenantId)` helper — config.rbac.enabled ise can() çağır, false ise NO_OP (geriye uyumlu). Sprint/flow giriş noktalarına wire için export. İskelet→enforce.
**Kanıt:** `grep -c "enforceRbac\|rbac.enabled\|NO_OP\|bypass" src/core/rbac.ts` → ≥1; `npx vitest run tests/core/rbac-runtime-enforce.test.ts` → 4+ pass
**Test:** ≥4 (enabled+izin var, enabled+reddi, disabled NO_OP, tenant)

## Task 6: 211-006 — Audit compliance export (SOC2/GDPR JSON/CSV)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, security-specialist
- Files: src/core/audit-export.ts, tests/core/audit-export.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** audit-query + audit-writer var ama compliance export (denetlenebilir JSON/CSV rapor) yok. ROADMAP F4-002.
**Çözüm:** `audit-export.ts` — `exportAuditLog(format, filter)` JSON + CSV (tenant/action/time-range), HMAC chain doğrulama dahil. audit-query okuma kullan.
**Kanıt:** `grep -c "exportAuditLog\|csv\|json\|compliance" src/core/audit-export.ts` → ≥2; `npx vitest run tests/core/audit-export.test.ts` → 4+ pass
**Test:** ≥4 (JSON export, CSV export, filtre, HMAC doğrula)

## Task 7: 211-007 — Rate/resource limit guard (enterprise hardening)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, security-specialist
- Files: src/core/rate-limiter.ts, tests/core/rate-limiter.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** ROADMAP F4-003 — rate/resource limit yok (multi-tenant abuse koruması).
**Çözüm:** `rate-limiter.ts` — token-bucket veya sliding-window per-tenant rate limit (`checkLimit(tenantId, action)`). enterprise-config.flow.maxConcurrent ile entegre. İskelet, gerçek throttle değil — limit kontrol.
**Kanıt:** `grep -c "checkLimit\|RateLimiter\|tokenBucket\|tenant" src/core/rate-limiter.ts` → ≥2; `npx vitest run tests/core/rate-limiter.test.ts` → 4+ pass
**Test:** ≥4 (limit altı izin, limit üstü red, reset, tenant izolasyon)

## Task 8: 211-008 — RBAC CLI grant/revoke tamamla
- Model: sonnet
- Effort: low
- Skills: typescript-expert, security-specialist
- Files: src/cli/commands/rbac.ts, tests/cli/rbac-grant.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** rbac CLI (210-014) check/roles var ama grant/revoke (rol atama) eksik.
**Çözüm:** `deckent rbac grant <user> <role>` + `revoke` komutu — rol atamasını config/store'a yaz. Mevcut register pattern. (CLI zaten index.ts'e wire'lı — 211-hijyen).
**Kanıt:** `grep -c "grant\|revoke" src/cli/commands/rbac.ts` → ≥2; `npx vitest run tests/cli/rbac-grant.test.ts` → 3+ pass
**Test:** ≥3 (grant, revoke, geçersiz rol)

---

## DALGA C — F5 Evrimsel Mimari Wire (4 task)

## Task 9: 211-009 — prompt-evolution outcome-tracker wire (dormant→canlı)
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/orchestra/prompt-evolution.ts, tests/orchestra/prompt-evolution-wire.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
**Problem:** prompt-evolution.ts evolvePrompt var ama 0-caller (dormant). outcome-tracker'dan beslenmeli.
**Çözüm:** prompt-evolution'ı outcome-tracker'a bağla — sprint sonu outcome pattern'lerini oku, prompt iyileştirme önerisi üret (kural-temelli, LLM değil). Caller wire + öneri çıktısı (uygulamaz, önerir).
**Kanıt:** `grep -rc "evolvePrompt\|promptEvolution" src/orchestra/ | grep -v test` → caller ≥1; `npx vitest run tests/orchestra/prompt-evolution-wire.test.ts` → 4+ pass
**Test:** ≥4 (outcome→öneri, başarı pattern, başarısızlık pattern, boş)

## Task 10: 211-010 — adaptive-agent runtime adaptation wire
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/agents/adaptive-agent.ts, tests/agents/adaptive-agent-runtime.test.ts
- Scope: src/agents/, tests/agents/

### Description
**Problem:** adaptive-agent.ts iskelet, runtime'da agent adaptation aktif değil (209/208'de wire denendi, tam değil).
**Çözüm:** adaptive-agent'ı routing/outcome'a bağla — agent başarı oranına göre runtime adaptation (skill ekleme/çıkarma önerisi). Caller doğrula veya wire et. Honest: zaten wire'lıysa "verified" + caller kanıtı.
**Kanıt:** `grep -rc "adaptAgent\|AdaptiveAgent\|adaptive-agent" src/ | grep -v test` → caller ≥1; `npx vitest run tests/agents/adaptive-agent-runtime.test.ts` → 4+ pass
**Test:** ≥4 (adaptation tetik, no-op, outcome entegrasyon, idempotent)

## Task 11: 211-011 — cross-sprint analyzer (evrim trend)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/cross-sprint-analyzer.ts, tests/orchestra/cross-sprint-analyzer.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
**Problem:** F5 evrim için sprint'ler arası trend analizi yok (hangi pattern iyileşiyor/kötüleşiyor).
**Çözüm:** `cross-sprint-analyzer.ts` — son N sprint outcome'larından trend (agent başarı trendi, skill etkinliği, NO_GO pattern'leri). Rapor üretir. memory.db sprint entry'lerini okur.
**Kanıt:** `grep -c "analyzeTrend\|CrossSprint\|trend" src/orchestra/cross-sprint-analyzer.ts` → ≥2; `npx vitest run tests/orchestra/cross-sprint-analyzer.test.ts` → 4+ pass
**Test:** ≥4 (trend hesap, iyileşme, kötüleşme, boş veri)

## Task 12: 211-012 — Evrim CLI (deckent evolve report iskelet)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/cli/commands/evolve.ts, tests/cli/evolve-command.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: 211-011

### Description
**Problem:** Evrim analizine CLI erişimi yok.
**Çözüm:** `deckent evolve report` — cross-sprint-analyzer + prompt-evolution önerilerini göster. register pattern + **index.ts'e WIRE et** (registerEvolve import+çağrı, 209/210 gap önlemi).
**Kanıt:** `grep -c "registerEvolve" src/cli/index.ts` → ≥1; `grep -c "evolve\|analyzeTrend" src/cli/commands/evolve.ts` → ≥2; `npx vitest run tests/cli/evolve-command.test.ts` → 3+ pass
**Test:** ≥3 (report komut, wire teyit, boş veri)

---

## DALGA D — F7 Dashboard Polish (4 task)

## Task 13: 211-013 — Dashboard UI/UX polish (responsive + dark/light tutarlılık)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/components/Layout.tsx, tests/dashboard/Layout.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem:** ([[project_dashboard_control_plane]] F7-003) Dashboard UI/UX tutarsız — responsive + dark/light + bilgi mimarisi polish gerek.
**Çözüm:** Layout.tsx polish — responsive grid, dark/light tutarlılık (ThemeProvider), sidebar/header düzen. Mevcut component'leri koru, görsel tutarlılık. Test tests/dashboard/'da.
**Kanıt:** `grep -c "responsive\|dark\|theme\|grid" src/dashboard/src/components/Layout.tsx` → ≥2; `npm run test:dashboard -- Layout` → 4+ pass
**Test:** ≥4 (render, theme toggle, responsive, sidebar)

## Task 14: 211-014 — Dashboard terminal güçlendirme (çok-oturum + geçmiş)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, typescript-expert
- Files: src/dashboard/src/lib/terminal-api.ts, tests/dashboard/terminal-api.test.ts
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem:** ([[project_dashboard_control_plane]] F7-004) Embedded terminal zayıf — çok-oturum + geçmiş + kopyala/yapıştır eksik.
**Çözüm:** terminal-api.ts güçlendir — çok-oturum yönetimi (session list), komut geçmişi (up/down), buffer. ws-gateway (ADR-062) ile uyumlu. Test tests/dashboard/.
**Kanıt:** `grep -c "session\|history\|buffer\|multiSession" src/dashboard/src/lib/terminal-api.ts` → ≥2; `npm run test:dashboard -- terminal-api` → 4+ pass
**Test:** ≥4 (session aç, geçmiş, çoklu session, buffer)

## Task 15: 211-015 — Dashboard memory/ADR explorer (FTS5 arama görünüm)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/components/MemoryExplorer.tsx, tests/dashboard/MemoryExplorer.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem:** ([[project_dashboard_control_plane]] F7-007) Memory/ADR/debt explorer yok — FTS5 arama + ADR timeline görünümü.
**Çözüm:** `MemoryExplorer.tsx` — memory.db arama (FTS5 endpoint), ADR listesi, debt tablosu. useApi ile veri. SimpleMarkdown render. Test tests/dashboard/.
**Kanıt:** `ls src/dashboard/src/components/MemoryExplorer.tsx`; `grep -c "search\|memory\|adr\|fts" src/dashboard/src/components/MemoryExplorer.tsx` → ≥2; `npm run test:dashboard -- MemoryExplorer` → 4+ pass
**Test:** ≥4 (arama render, ADR liste, debt tablo, boş sonuç)

## Task 16: 211-016 — ADR-074 (F2 canlı + F4 enterprise + F5 evrim) + ROADMAP
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: docs/adr/074-native-chat-enterprise-evolution.md, docs/ROADMAP-GOD-LEVEL.md, tests/docs/adr-074.test.ts
- Scope: docs/, tests/docs/

### Description
**Problem:** F2 canlı + F4 enterprise tamamlama + F5 evrim wire kararları ADR/ROADMAP'e geçmemiş.
**Çözüm:** ADR-074 (native chat real round-trip + enterprise RBAC/audit/rate + F5 evolution wire, MADR, accepted). ROADMAP §EXECUTION TRACKER: F2 %80, F4 tamamlandı, F5 başladı; yüzde güncelle.
**Kanıt:** `grep -c "native chat\|enterprise\|evolution\|rate" docs/adr/074-native-chat-enterprise-evolution.md` → ≥2; `npx vitest run tests/docs/adr-074.test.ts` → 3+ pass
**Test:** ≥3 (ADR-074 MADR, F2/F4/F5 bölüm, ROADMAP güncel)

---

## Sprint Sonu Notu

**Beklenen:** 14-16/16 DONE, 0 false-FIX. F2 native chat gerçek round-trip (konuşulabilir %80), F4 enterprise tamamlandı (RBAC enforce + audit export + rate limit), F5 evrimsel wire (prompt-evolution + adaptive-agent canlı), F7 dashboard polish. tam-suite 0 fail KORUNUR.

**Sprint sonrası:** F2 streaming canlı + F5 evrim tam runtime + beta GA hazırlık. ROADMAP §EXECUTION TRACKER.

**Pre-flight:** subscription env temiz, creds canlı, **build+restart + RE-PLAN YAPILDI** (routing canlı), config max_workers=10. Sprint start Alperen manuel.

İlgili memory:
- [[feedback_brain_rubric_bridge_broken]] — Brain sağlam, yeni test şart
- [[feedback_agent_routing_imbalance]] — routing canlı (çözüldü), çeşitlilik korunmalı
- [[feedback_fix_prompt_quality]] — FIX prompt enrichment + CLI index.ts wire
- [[feedback_scale_up_autonomous]] — büyük ölçek + otonom mod
- [[project_dashboard_control_plane]] — F7 dashboard god-level
- [[feedback_trust_brain_eval_not_worker]] — disk-verify ground truth
- [[feedback_build_mcp_restart_coordination]] — build Alperen + RE-PLAN şart
- [[project_api_mode_deferred_post_beta]] — API mode yasak (F2 subscription CLI)
