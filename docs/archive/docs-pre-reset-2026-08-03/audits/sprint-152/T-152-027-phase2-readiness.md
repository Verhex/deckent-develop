# T-152-027: Roadmap Phase 2 Readiness Gap (Sprint 152-160 Preparatory)

**Auditor:** doc-writer + system-architect (w-152-027)
**Sprint:** 152 (READ-ONLY audit)
**Date:** 2026-04-24
**Scope:** `docs/ROADMAP-GOD-LEVEL.md` §4 Phase 2 — Sprint 153-160 scaffold readiness
**Source map:** `src/connectors/`, `src/core/marketplace/`, `src/nervous/detectors/`, `src/agents/adaptive-agent.ts`, `.deckent/config.json`, `.deckent/skills/`, `package.json@1.0.0-beta.1`

---

## Özet

Phase 2 (Sprint 152-160) 9 sprintlik post-launch dönemidir. Sprint 151 Beta GA cutover sonrası post-launch bug frenzy + messaging ecosystem + hub growth hedefli. Sprint 152 şu an READ-ONLY audit, Sprint 153'ten itibaren feature work yeniden başlayacak.

**Genel hazırlık:** %58 (Phase 1 %71'in altında — çünkü Phase 2 tamamen yeni territory: messaging connectors, hub moderation, routing V4, docs site).

**Kritik blocker özeti (4 P0):**
1. **Slack + Email (IMAP/SMTP) connector'ları sıfırdan** (Sprint 153, mevcut WhatsApp pattern reuse edilebilir).
2. **DeckentHub registry 20 seed skill asla publish edilmedi** (Sprint 151'e plan, Sprint 154'te 50'ye çıkarılacak). Seed skill manifest listesi kod tabanında yok; ROADMAP §2.2 listesi sadece concept.
3. **Routing V4 tanımsız** — mevcut `routing_engine: 'v2'` canlı, V3 bile yok. Sprint 155 V4 heuristic iteration için ADR draft gerekli.
4. **Docs site scaffold yok** (Docusaurus/Astro/MkDocs tercihi ADR ile bağlanmamış, Sprint 160).

**Hazırlıklı bulgular:**
- Ed25519 infra canlı (`src/core/signature.ts`, @noble/ed25519 v2) — Sprint 154/157 hub için hazır
- Discord + Telegram + WhatsApp connector scaffold mevcut (`src/connectors/`) — Sprint 153 messaging aktivasyonu mümkün
- Nervous detector registry: 11 detector dosyası var (`src/nervous/detectors/`), config'de sadece 5 aktif + 5 reserved → Sprint 159 flag flip operasyonu kolay
- Adaptive agent şeleti mevcut (`src/agents/adaptive-agent.ts`) — Sprint 156 runtime wire gap'li
- i18n TR/EN altyapı canlı (`src/dashboard/src/i18n/en.ts`, `tr.ts`, `LanguageProvider.tsx`) — Sprint 160 genişleme
- GitHub issue template 3 adet (`bug_report.md`, `feature_request.md`, `security.md`) — Sprint 155 triage ready

---

## Bulgular

### Sprint 153 — WhatsApp + Slack + Email (IMAP/SMTP) — 12 task

**Readiness:** 🟡 **45%** (connector pattern hazır, 2 connector sıfırdan gerekli)

| Bileşen | Durum | Kanıt |
|---------|-------|-------|
| `src/connectors/` klasörü | ✅ EXISTS | 6 dosya: base-connector, connector-pool, discord, telegram, whatsapp, whatsapp-README, incoming-router, types |
| `BaseConnector` abstract class | ✅ EXISTS | `src/connectors/base-connector.ts` |
| `whatsapp.ts` scaffold | ✅ EXISTS | `throw` ile aktivasyon kapısı (`whatsapp.ts:28-34`) — Business API approval gerektiriyor |
| `slack.ts` connector | ❌ **MISSING** | `ls src/connectors/ \| grep slack` → 0 satır. Sıfırdan yazılacak (~200 LoC tahmini) |
| `email.ts` (IMAP/SMTP) connector | ❌ **MISSING** | `ls src/connectors/ \| grep -iE "email\|imap\|smtp"` → 0 satır. nodemailer + imap-simple (veya imap) paketi eklenmeli |
| `notifications.channel` config enum | 🟡 PARTIAL | `src/core/config.ts:1081` slack/discord/email/webhook listeleniyor AMA sadece webhook URL wire; slack/discord/email adapter runtime wire YOK (NotificationAdapter'lar Sprint 150 H6'da CLI+MCP+File deploy, Slack/Discord/Email outgoing adapter değil) |
| WhatsApp Business API onayı | ❌ **EXTERNAL BLOCKER** | ROADMAP §9 risk matrix: "Scaffold Sprint 149, aktivasyon Sprint 152+" — onay süresi 2-6 hafta, Alperen manuel başvuru gerekli |

**Sprint 153 prep taskları:**
- **P0 prep-A:** Slack connector scaffold (mevcut `discord.ts` pattern'ini clone, slack-api/web kütüphanesi değerlendirmesi, `src/connectors/slack.ts`)
- **P0 prep-B:** Email connector scaffold (`nodemailer` outgoing + `imap` veya `imap-simple` incoming, `src/connectors/email.ts`)
- **P1 prep-C:** `connector-pool.ts` register order güncellemesi — yeni adapter'lar için
- **P1 prep-D:** NotificationAdapter'a Slack + Discord bot outgoing wire (şu an File+CLI+MCP yalnızca, dış kanal yok)
- **P2 prep-E:** WhatsApp Business API başvuru dokümantasyonu — `whatsapp-README.md` genişlet

**Blocker:** WhatsApp onayı dış; Slack+Email tamamen içsel iş — connector pattern olgun, hızlı ilerler.

---

### Sprint 154 — Hub Growth 20 → 50 skill + Moderation CI + Rating — 10 task

**Readiness:** 🔴 **30%** (registry + rating kod hazır, 20 seed skill asla publish edilmedi, moderation CI sıfırdan)

| Bileşen | Durum | Kanıt |
|---------|-------|-------|
| `VerhexIO/deckent-hub` repo | ❌ **UNKNOWN EXTERNAL** | `ls ../deckent-hub` → yok (local clone yok). Sprint 149 plan olarak geçiyor, açılıp açılmadığı Alperen GitHub hesabında kontrol gerekli |
| 20 seed skill publish | ❌ **NOT DONE** | `.deckent/skills/` 21 built-in var (local copies), ROADMAP §2.2 seed list (spotify-control, telegram-bot, calendar-google, email-imap vs.) kodda **hiç yok**. Beta GA Gate #15 hâlâ 🟡 |
| `registry-client.ts` | ✅ EXISTS | `src/core/marketplace/registry-client.ts` HTTP/HTTPS fetch |
| `skill-sandbox.ts` AST | ✅ EXISTS | `src/core/marketplace/skill-sandbox.ts` |
| `rating-system.ts` | ✅ EXISTS | `src/core/marketplace/rating-system.ts` — SkillRatingData, submissions, 0-5 scale |
| `marketplace-auth.ts` | ✅ EXISTS | `src/core/marketplace/marketplace-auth.ts` |
| `dependency-resolver.ts` | ✅ EXISTS | `src/core/marketplace/dependency-resolver.ts` |
| `skill publish` CLI | ✅ EXISTS | `src/cli/commands/skill.ts:650-653` unified publish (sandbox + Ed25519 sign + push) |
| Ed25519 signing | ✅ EXISTS | `src/core/signature.ts` @noble/ed25519 v2, keypair @ `~/.deckent/keys/`, sha512 wire |
| Moderation CI pipeline | ❌ **MISSING** | `.github/workflows/` altında moderation-scan.yml yok. GitHub Actions sandbox scan workflow sıfırdan yazılacak |
| Rating UI | 🟡 PARTIAL | Backend var, Dashboard'da rating widget yok (MemoryPage/SkillsPage i18n'a bağlı) |

**Sprint 154 prep taskları:**
- **P0 prep-A:** 20 seed skill kod tabanında scaffold (`.deckent/skills/seed/` altında minimal manifest + AST-clean kod)
- **P0 prep-B:** Hub repo `VerhexIO/deckent-hub` public status doğrula (Alperen onayı ile)
- **P0 prep-C:** Moderation CI workflow yaml (`.github/workflows/skill-moderation.yml`): AST sandbox scan + Ed25519 verify + malicious pattern deny list
- **P1 prep-D:** Rating Dashboard UI komponenti (Memory/Skills page'de)
- **P1 prep-E:** Skill metadata schema genişletme (category, tags, screenshots, changelog) — registry JSON format

**Blocker:** Hub repo external (Alperen GitHub), seed skill yazımı büyük effort (20 × ortalama 100 LoC = ~2000 LoC hub content). Beta GA Gate #15 bu sprint'te kapanmalı.

---

### Sprint 155 — Feature Request Triage + Routing V4 + Skill Heuristics — 12 task

**Readiness:** 🟡 **50%** (issue template ready, routing V2 canlı, V4 tanımı yok)

| Bileşen | Durum | Kanıt |
|---------|-------|-------|
| GitHub issue template | ✅ EXISTS | `.github/ISSUE_TEMPLATE/` → bug_report.md, feature_request.md, security.md |
| Feature manifest runtime | ✅ EXISTS | Sprint 150 T-029/032 `deckent_feature_query` MCP tool + CLI `features.ts`, 16 active feature listeleniyor |
| Routing engine V2 | ✅ ACTIVE | `src/core/config.ts:568` default `routing_engine: 'v2'`, ADR-028 kabul |
| Routing engine V3 | ❌ **DOES NOT EXIST** | Grep → yalnızca 'v2' validRoutingEngines. V3 atlama plansız |
| Routing engine V4 | ❌ **UNDEFINED** | ROADMAP §4 "routing V4 + skill heuristics" muğlak. ADR yok, spec yok |
| Skill heuristic module | 🟡 PARTIAL | `src/core/activation-engine.ts` var (Layer 2 structured rules) ama "heuristic V4" = ? |
| Issue → feature triage pipeline | ❌ MISSING | GitHub API ile otomasyon worker skeleton yok |

**Sprint 155 prep taskları:**
- **P0 prep-A:** **ADR-043 draft: Routing V4 Spec** — V2'den ne farkı? heuristic ≠ rule ayrımı net olsun
- **P1 prep-B:** Feature request triage pipeline (GitHub API read → feature-query write)
- **P1 prep-C:** Skill heuristic module tasarım doc (skill ranking formula: success rate + coverage + recency)
- **P2 prep-D:** Routing decision traceback UI — Dashboard'da "neden bu agent seçildi" kartı

**Blocker:** V4 tanımı yok; ADR olmadan refactor yapmak ADR-036 (mandatory ADR) ihlali — Sprint 155'ten önce draft ADR gerekli.

---

### Sprint 156 — Adaptive Agent Activation (Analiz + Autonomous Apply) — 10 task

**Readiness:** 🟡 **55%** (adaptive-agent.ts + nervous executor hazır, autonomous apply pipeline kısmi)

| Bileşen | Durum | Kanıt |
|---------|-------|-------|
| `adaptive-agent.ts` | ✅ EXISTS | `src/agents/adaptive-agent.ts` — runtime agent adaptation |
| Nervous `action-registry.ts` | ✅ EXISTS | `src/nervous/action-registry.ts` |
| Nervous `executor.ts` | ✅ EXISTS | `src/nervous/executor.ts` |
| Nervous `proposer.ts` | ✅ EXISTS | `src/nervous/proposer.ts` |
| Nervous `decision-engine.ts` | ✅ EXISTS | `src/nervous/decision-engine.ts` |
| `promotion-pipeline.ts` | ✅ EXISTS | `src/orchestra/promotion-pipeline.ts` — temp→permanent agent/skill promotion |
| Autonomous apply (no checkpoint) | ❌ **GATED** | Nervous safety_floor (`.deckent/config.json:114-123`) "locked_actions" = KILL_LIVE_SPRINT + MANUAL_FILE_DELETE + COST_OVER_THRESHOLD + DESTRUCTIVE_GIT + ADR_DEPRECATE_ACCEPTED. Autonomous apply için `bypass_allowed: false` — Sprint 156'da gevşetme gerekecek mi? Alperen karar |
| Outcome tracker | ✅ EXISTS | `src/orchestra/outcome-tracker.ts` — routing outcome + synergy matrix |
| Rule evolver | ✅ EXISTS | `src/orchestra/rule-evolver.ts` — auto-generate activation rules |

**Sprint 156 prep taskları:**
- **P0 prep-A:** `proposer.ts` → `executor.ts` autonomous loop end-to-end test (şu an checkpoint gate'li)
- **P0 prep-B:** ADR güncellemesi: hangi aksiyonlar `bypass_allowed: true` ile otonom, hangileri değil — güvenlik DNA korunsun
- **P1 prep-C:** Adaptive agent feedback döngüsü — outcome-tracker + rule-evolver canlı entegrasyonu
- **P1 prep-D:** Autonomous apply UI (Dashboard nervous tab) — kullanıcı inceleme

**Blocker:** Safety floor gevşeklik kararı Alperen onayı gerektirir (ADR-033 "ürün değil servis" + ADR-037 RBAC matrix).

---

### Sprint 157 — DeckentHub Moderation Queue + CI Auto-Signature + Ed25519 Rotation — 10 task

**Readiness:** 🔴 **30%** (Ed25519 tekil keypair var, rotation yok; moderation queue yok)

| Bileşen | Durum | Kanıt |
|---------|-------|-------|
| Ed25519 keypair | ✅ EXISTS | `~/.deckent/keys/private.hex` + `public.hex` — loadOrGenerateKeypair |
| Sign/verify infra | ✅ EXISTS | `src/core/signature.ts` signMessage/verifySignature |
| Key rotation infra | ❌ **MISSING** | Tek keypair kullanılıyor, rotation schedule + old-key revocation yok. "Key versioning" file format yok |
| Moderation queue | ❌ **MISSING** | Registry'de `pending_review` state yok. `rating-system.ts` sadece rating, moderation değil |
| CI auto-signature | ❌ **MISSING** | `.github/workflows/skill-auto-sign.yml` yok. Skill publish manuel `deckent skill publish` |
| Signature revocation list | ❌ **MISSING** | Revoke edilen key'ler için blacklist format yok |

**Sprint 157 prep taskları:**
- **P0 prep-A:** Key rotation ADR (ADR-044 önerisi) — key_version field, 90-gün rotation cycle, graceful cutover
- **P0 prep-B:** Moderation queue DB schema (SQLite extend veya `.deckent/hub-moderation.json`)
- **P0 prep-C:** CI auto-signature workflow `.github/workflows/skill-auto-sign.yml`
- **P1 prep-D:** Signature revocation list format + registry-client extend

**Blocker:** Sprint 154 hub repo açık değilse Sprint 157 tamamen gated. Ed25519 rotation production-grade key management — prod hub aktivasyonu gerekir.

---

### Sprint 158 — Messaging Polish + Thread Management + User Context Memory — 10 task

**Readiness:** 🟡 **40%** (mesajlaşma Sprint 153 deploy'ına bağlı; thread mgmt yok; user context memory şeleti Memory V2'de)

| Bileşen | Durum | Kanıt |
|---------|-------|-------|
| Discord/Telegram bot canlı | 🟡 Sprint 151 plan | Beta GA Gate #13 Sprint 151'e atandı — bot credentials Alperen elle |
| Thread state management | ❌ **MISSING** | `src/connectors/` altında "conversation thread" kavramı yok. Her mesaj stateless |
| User context memory | 🟡 PARTIAL | Memory V2 SQLite var, per-user scope yok. "userId" field entry'lere yok |
| Conversation history retrieval | ❌ **MISSING** | Memory FTS5 by user_id filter yok |
| Presence/typing indicators | ❌ **MISSING** | Discord/Telegram API'si destekler ama adapter'da wire yok |

**Sprint 158 prep taskları:**
- **P0 prep-A:** Memory V2 schema extend: `user_id` column + FTS5 facet
- **P0 prep-B:** ConversationThread type + `thread-manager.ts` module tasarımı
- **P1 prep-C:** Presence/typing indicator extension `BaseConnector`

**Blocker:** Sprint 153 messaging kanalları canlı değilse Sprint 158 tamamen bloke. Thread management mesaj hacmi olmadan test edilemez.

---

### Sprint 159 — Nervous 6-10 Detector Activation (Sprint 147 Plan) — 10 task

**Readiness:** 🟢 **80%** (11 detector dosyası var, config'de 5 aktif + 5 reserved + Sprint 151 T-151-015 eklenen 5 kısmen)

| Detector | Kod dosyası | Config enabled | Kaynak |
|----------|-------------|----------------|--------|
| stale_worker | ✅ stale-worker.ts | ✅ true | Active |
| scope_collision | ✅ scope-collision.ts | ✅ true | Active |
| debt_trend | ✅ debt-trend.ts | ✅ true | Active |
| agent_routing | ✅ agent-routing.ts | ✅ true | Active |
| directives_protection | ✅ directives-protection.ts | ✅ true | Active |
| dead_event_stream | ❓ (yok veya farklı isim) | ❌ false (reserve_for: sprint-148) | Reserved |
| cost_threshold | ❓ (yok veya farklı isim) | ❌ false (reserve_for: sprint-148) | Reserved |
| prompt_quality | ❓ (yok veya farklı isim) | ❌ false (reserve_for: sprint-148) | Reserved |
| worker_output_variance | ❓ (yok veya farklı isim) | ❌ false (reserve_for: sprint-148) | Reserved |
| self_modifying_warner | ❓ (yok veya farklı isim) | ❌ false (reserve_for: sprint-148) | Reserved |
| agent-routing-anomaly | ✅ agent-routing-anomaly.ts | ❌ (config'de yok) | Sprint 151 T-151-015 eklendi, config drift |
| build-failure-recurrence | ✅ build-failure-recurrence.ts | ❌ (config'de yok) | Sprint 151 T-151-015 eklendi, config drift |
| notification-delivery-health | ✅ notification-delivery-health.ts | ❌ (config'de yok) | Sprint 151 T-151-015 eklendi, config drift |
| scope-collision-rate | ✅ scope-collision-rate.ts | ❌ (config'de yok) | Sprint 151 T-151-015 eklendi, config drift |
| task-mode-idle | ✅ task-mode-idle.ts | ❌ (config'de yok) | Sprint 151 T-151-015 eklendi, config drift |
| token-spike | ✅ token-spike.ts | ❌ (config'de yok) | Sprint 151 T-151-015 eklendi, config drift |

**Bulgular:**
- **[DRIFT]** Config'de 10 detector listeleniyor (5 active + 5 reserved) ama kod tabanında 11 dosya var. Config key adları ile dosya adları uyuşmuyor: `dead_event_stream` (config) vs `notification-delivery-health.ts` (dosya). **Manual mapping gerekli** — bu Sprint 152 T-152-012 `nervous-11-detectors` audit taskında detaylı incelenmeli.
- **[MISSING]** Config'e 6 yeni detector ekleme (agent-routing-anomaly, build-failure-recurrence, notification-delivery-health, scope-collision-rate, task-mode-idle, token-spike)
- Sprint 147 orijinal planı "6-10 detector activation" → Sprint 151 T-151-015 ile **5 yeni ilave edildi**, Sprint 159'da flag flip mümkün

**Sprint 159 prep taskları:**
- **P0 prep-A:** Config-code detector name reconciliation — `nervous.detectors.*` key'lerini kod isimleri ile eşle
- **P0 prep-B:** 5 reserved_for=sprint-148 detector'u aktif et (enabled: true flag flip) — canlı test sprint'i
- **P1 prep-C:** Yeni 6 detector için config entry yaz (default enabled: false ile başla, tek tek aç)
- **P1 prep-D:** Detector smoke suite — her detector'a unit test (kod varsa test gapi kontrol)

**Blocker:** YOK. Bu sprint en hazır olan. Sadece config reconciliation + flag flip işi.

---

### Sprint 160 — CLI/MCP Parity Audit + i18n TR/EN + Docs Site — 12 task

**Readiness:** 🟡 **55%** (i18n altyapı var, CLI/MCP parity T-152-008 ile başlıyor, docs site sıfırdan)

| Bileşen | Durum | Kanıt |
|---------|-------|-------|
| CLI komut sayısı | ✅ 49+ | `src/cli/commands/` — agent/audit/checkpoint/cleanup vs. 54 dosya (bazıları helper) |
| MCP tool sayısı | ✅ 27 | `src/mcp/tools/` — 27 tool (Sprint 150 T-029/032 yeni 3 + mevcut 24) |
| CLI/MCP parity matrix | 🟡 PARTIAL | ADR-022-v2 kabul, ama tablo ve gap listesi otomasyon yok |
| i18n TR/EN Dashboard | ✅ EXISTS | `src/dashboard/src/i18n/LanguageProvider.tsx`, `en.ts`, `tr.ts` |
| i18n CLI çıktıları | 🟡 PARTIAL | Mesajların çoğu İngilizce (hardcoded), TR/EN toggle CLI'de yok |
| i18n help/doc strings | ❌ MISSING | `--help` çıktıları İngilizce only |
| Docs site (Docusaurus/Astro/MkDocs) | ❌ **MISSING** | `docs/site/`, `docusaurus*`, `website/` yok. Sıfırdan setup |
| `docs/` markdown | ✅ EXISTS | `docs/` altında zengin içerik (ROADMAP, audits, analysis) |

**Sprint 160 prep taskları:**
- **P0 prep-A:** CLI/MCP parity matrix automated generator — `scripts/cli-mcp-parity.mjs` ile audit
- **P0 prep-B:** Docs site ADR draft — Docusaurus 3 (React-Native TS-friendly) vs Astro 4 (statik, hızlı) vs MkDocs (Python-dayanıklı) karşılaştırma
- **P1 prep-C:** i18n CLI message extract — `i18next` gibi frontend pattern'i CLI'ye taşı
- **P1 prep-D:** `docs/` altında structure reorg (Diataxis framework: tutorials/how-to/reference/explanation)

**Blocker:** Docs site framework seçimi ADR-gerektirir. Sprint 160'a dek seçilmezse task paralize olur.

---

## Phase 2 Readiness Consolidated Matrix

| Sprint | Tema | Readiness | Kritik Blocker | Prep Priority |
|--------|------|-----------:|----------------|---------------|
| 153 | Messaging Trio (WhatsApp+Slack+Email) | 🟡 45% | WhatsApp Business API onayı (external); Slack+Email sıfırdan | **P0** |
| 154 | Hub 20→50 skill + moderation CI | 🔴 30% | 20 seed skill asla publish edilmedi; Hub repo external status bilinmiyor | **P0** |
| 155 | Triage + Routing V4 + heuristics | 🟡 50% | Routing V4 spec yok; ADR-043 gerekli | P0 |
| 156 | Adaptive agent autonomous apply | 🟡 55% | Safety floor gevşeklik Alperen kararı; proposer→executor end-to-end | P1 |
| 157 | Hub moderation + Ed25519 rotation | 🔴 30% | Key rotation infra yok; moderation queue yok; Sprint 154 bağımlılığı | P1 |
| 158 | Messaging polish + thread + user memory | 🟡 40% | Sprint 153 bot canlı olması gerekli; Memory V2 user_id schema gap | P2 |
| 159 | Nervous 6-10 detector activation | 🟢 80% | Config-code detector name drift; flag flip kolay | **P0 (quick win)** |
| 160 | CLI/MCP parity + i18n + docs site | 🟡 55% | Docs site framework ADR yok; i18n CLI catalog yok | P1 |

**Ortalama readiness:** 48% (9 sprint ortalaması, Phase 1 %71 vs Phase 2 %48).

---

## Consolidated Blocker Listesi

### P0 — Sprint 153 öncesi açılmalı

1. **BLOCKER-153-A:** Slack connector scaffold (~200 LoC, `discord.ts` clone)
2. **BLOCKER-153-B:** Email connector scaffold (`nodemailer` + `imap-simple`, ~300 LoC)
3. **BLOCKER-153-C:** NotificationAdapter Slack/Discord/Email outgoing wire (Sprint 150 H6 yalnızca File+CLI+MCP deploy etti)
4. **BLOCKER-154-A:** 20 seed skill kod (`.deckent/skills/seed/` altında) — Beta GA Gate #15 kapanması
5. **BLOCKER-154-B:** `VerhexIO/deckent-hub` repo public status doğrulama (Alperen manual)
6. **BLOCKER-154-C:** Moderation CI workflow (`.github/workflows/skill-moderation.yml`)

### P0 — Sprint 155 öncesi

7. **BLOCKER-155-A:** ADR-043 "Routing V4 Spec" draft — V2'den delta net olsun
8. **BLOCKER-159-A:** Detector config-code reconciliation (config'de 10 listeleniyor, kod'da 11 dosya, isim drift)

### P1 — Sprint 156-158 öncesi

9. **BLOCKER-156-A:** Safety floor bypass policy ADR (locked_actions vs autonomous apply çakışması)
10. **BLOCKER-157-A:** Key rotation infra (ADR-044 draft + key_version schema)
11. **BLOCKER-157-B:** Moderation queue storage schema
12. **BLOCKER-158-A:** Memory V2 user_id column migration
13. **BLOCKER-160-A:** Docs site framework ADR (Docusaurus vs Astro vs MkDocs)

### External blockers (Alperen manuel)

14. **EXT-1:** WhatsApp Business API başvuru + onay (2-6 hafta)
15. **EXT-2:** Discord server + Telegram bot credentials (Sprint 151 plan, status belirsiz)
16. **EXT-3:** `VerhexIO/deckent-hub` repo public flip

---

## Sprint 153+ Actionable List

### Sprint 153 Öncesi Preparatory Sprint (152.5 öneri)
- **Sprint 152.5 (opsiyonel):** Connector scaffold completion (BLOCKER-153-A/B/C) — 1 günde ~500 LoC eklenir
- **Sprint 152.5:** 20 seed skill envanter + minimal manifest (BLOCKER-154-A)

### Sprint 153 (Cum 24 Nis)
- [P0] Sprint 153 start-up verification: Discord/Telegram bot canlı mı (Beta GA Gate #13)
- [P0] 12 task estimate doğru mu: WhatsApp aktivasyon blocked ise task count 8-10'a düşecek
- [P1] ADR-043 Routing V4 draft (155 öncesi prep)

### Sprint 154 (Pzt 27 Nis)
- [P0] Hub repo status gate — açık değilse Sprint 154 gecikir veya Sprint 155'e swap
- [P0] 20 seed skill publish flow canlı test (BLOCKER-154-A çözümlü)
- [P1] ADR-044 Key rotation draft (157 öncesi prep)

### Sprint 155 (Sal 28 Nis)
- [P0] Routing V4 implement + migration path (V2→V4)
- [P1] Feature request GitHub webhook + triage automation

### Sprint 156 (Çar 29 Nis)
- [P0] Safety floor policy güncellemesi — Alperen onayı
- [P1] Adaptive agent autonomous apply UI (Dashboard)

### Sprint 157 (Per 30 Nis)
- [P0] Key rotation implement + test
- [P0] Moderation queue + CI auto-signature canlı

### Sprint 158 (Cum 1 May)
- [P0] Memory V2 user_id schema migration
- [P1] Thread management module

### Sprint 159 (Pzt 4 May)
- [P0] **Quick win sprint** — detector name reconciliation + flag flip
- [P0] 11/11 detector aktif + smoke suite

### Sprint 160 (Sal 5 May)
- [P0] Docs site framework seçimi + scaffold
- [P1] CLI/MCP parity matrix otomatik generate
- [P1] i18n CLI message catalog

---

## Sprint 152 Audit Eksikleri (Sprint 153 İçin Follow-Up)

Sprint 152 bu audit dahil 30 task READ-ONLY analiz. Phase 2 readiness değerlendirmesi için **eksik bilgi**:
- Docker worker canlı test (Sprint 146+148+150 HB spiral) — Sprint 152 T-152-014'te ele alınacak
- Brain evaluator 5-in-1 rubric Sprint 151 T-151-012 canlı kanıt — Sprint 152 T-152-022 ile
- Sprint 151 meta-dogfood sayısı (Sprint 150A Hot Fix 13 rekoru sonrası) — Sprint 152 T-152-030
- Dashboard ChatPage production-ready mı (Sprint 151 T-151-003) — Sprint 152 T-152-015

Bu task (T-152-027) diğer 29 audit'in **çıktılarını henüz göremedi** çünkü paralel yürütüyor. Sprint 153 başlangıcında sprint-152 audit report'lar konsolide edilip **Phase 2 readiness %48'den yukarı mı aşağı mı taşındı** yeniden hesaplanmalı.

---

## Meta-Notlar

### ROADMAP ile Sprint 152 DIRECTIVES uyuşmazlığı
- ROADMAP §4 Phase 2 Sprint 152 → "Community Bug Triage Week 1 — P0 fixes" (10-15 task)
- Gerçek Sprint 152 DIRECTIVES → "Post-Migration Comprehensive System Audit" (30 task READ-ONLY)
- **DRIFT:** Sprint 152'nin orijinal rolü community triage idi, sistem taşıma zorunluluğu audit sprint'ine döndürdü. ROADMAP §4 güncellenmeli: Sprint 152 "audit" + Sprint 153 "community triage + messaging" birleşik hale getirilebilir veya Sprint 152 placeholder ile Sprint 153-161 bir sprint kayar.

### Phase 2 risk — Sprint-kayma domino effect
- Sprint 152 audit, Sprint 153 community triage için hazırlık. Eğer Sprint 153'te Slack+Email scaffold gecikirse → Sprint 154 hub growth için messaging olmayacak → Sprint 155+ triage bilgi beslemesi eksik
- Sprint 152.5 mini-prep sprint'i (sadece BLOCKER-153-A/B/C ve BLOCKER-154-A) domino etkisini kırabilir (~1 günlük iş)

### Hot Fix with Claude Subagents (Sprint 150A) pattern'in Phase 2'deki rolü
- Phase 2 post-launch bug frenzy ortamında Hot Fix pattern'i tekrar devreye girebilir
- Özellikle Sprint 153 messaging deploy + Sprint 154 hub moderation CI için **deploy-level hot fix capacity** kritik
- ROADMAP §11.11 pattern spec'i T-152-026 audit ile doğrulanacak — Sprint 153 öncesinde ADR haline getirilmesi önerilir

---

## Kanıt Ekleri

### Komut çıktıları

```bash
# Connector inventory
$ ls src/connectors/
base-connector.ts
connector-pool.ts
discord.ts
incoming-router.ts
telegram.ts
types.ts
whatsapp-README.md
whatsapp.ts

# Marketplace inventory
$ ls src/core/marketplace/
dependency-resolver.ts
marketplace-auth.ts
rating-system.ts
registry-client.ts
skill-sandbox.ts

# Nervous detector inventory (11 files)
$ ls src/nervous/detectors/
agent-routing-anomaly.ts
agent-routing.ts
build-failure-recurrence.ts
debt-trend.ts
directives-protection.ts
notification-delivery-health.ts
scope-collision-rate.ts
scope-collision.ts
stale-worker.ts
task-mode-idle.ts
token-spike.ts

# Seed skill verification
$ ls .deckent/skills/seed 2>&1
ls: cannot access '.deckent/skills/seed': No such file or directory

# Hub repo external
$ ls ../deckent-hub 2>&1
ls: cannot access '../deckent-hub': No such file or directory

# Routing engine versions
$ grep 'validRoutingEngines' src/core/config.ts
# Only 'v1' and 'v2' listed — V3/V4 absent

# Package version
$ grep version package.json
  "version": "1.0.0-beta.1",

# i18n files
$ ls src/dashboard/src/i18n/
LanguageProvider.tsx
en.ts
tr.ts

# Docs site (absent)
$ ls docs/site docusaurus* website* 2>&1
ls: cannot access 'docs/site': No such file or directory
# (all absent)
```

### Config snippets

```json
// .deckent/config.json nervous_system.detectors — 10 listed, 11 files exist
{
  "stale_worker":          { "enabled": true },
  "scope_collision":       { "enabled": true },
  "debt_trend":            { "enabled": true },
  "agent_routing":         { "enabled": true },
  "directives_protection": { "enabled": true },
  "dead_event_stream":         { "enabled": false, "reserve_for": "sprint-148" },
  "cost_threshold":            { "enabled": false, "reserve_for": "sprint-148" },
  "prompt_quality":            { "enabled": false, "reserve_for": "sprint-148" },
  "worker_output_variance":    { "enabled": false, "reserve_for": "sprint-148" },
  "self_modifying_warner":     { "enabled": false, "reserve_for": "sprint-148" }
  // DRIFT: 6 additional files not wired (agent-routing-anomaly, build-failure-recurrence,
  //        notification-delivery-health, scope-collision-rate, task-mode-idle, token-spike)
}
```

### Phase 2 Delta from Phase 1

| Metrik | Phase 1 (Sprint 149-151) | Phase 2 (Sprint 152-160) |
|--------|---------------------------|---------------------------|
| Readiness avg | 71% | 48% |
| P0 blocker count | ~5 | 8 |
| External dependency | 2 (npm publish, public repo) | 5 (WhatsApp API, Hub repo, bot creds, framework choice, Alperen policy) |
| Code new LoC estimate | ~1450 (Sprint 149) | ~3500+ (Slack+Email+seed skills+docs site) |
| ADR drafts needed | 1 (adr-041 already accepted) | 3 (routing V4, key rotation, docs site framework) |
| Sprint re-plan risk | Low (Beta GA disciplined) | **Medium-High** (Hub external, WhatsApp external, docs site choice open) |

---

## Sprint 153+ Actionable Özet

1. **[P0 Sprint 152.5 öneri]** Mini-prep sprint — BLOCKER-153-A/B/C + BLOCKER-154-A tek günde kapanır; Phase 2 domino effect engellenir
2. **[P0 Sprint 153]** WhatsApp Business API başvuru başlatılmalı (2-6 hafta), Slack+Email connector scaffold canlı
3. **[P0 Sprint 154]** `VerhexIO/deckent-hub` repo açık mı kontrol, 20 seed skill publish pipeline canlı
4. **[P0 Sprint 155 prep]** ADR-043 Routing V4 draft Sprint 155 başlamadan önce yazılsın
5. **[P0 Sprint 159 quick win]** Detector config-code reconciliation Sprint 159 öncesi tek günlük prep ile kapanabilir
6. **[P1 Sprint 160 prep]** Docs site framework ADR Sprint 157-158 arası draft olmalı — Sprint 160'a kadar onay
7. **[External]** Alperen: WhatsApp onayı, Hub repo flip, bot credentials — Sprint 153 öncesi handshake
8. **[Meta]** ROADMAP §4 Sprint 152 rolü güncellenmeli — "audit + community triage + Phase 2 prep" birleşik

**Sonuç:** Phase 2 Phase 1'e kıyasla %23 daha az hazırlıklı. 8 P0 blocker + 5 external dependency. Sprint 152.5 mini-prep önerisi domino kırmak için kritik. Sprint 159 tek quick-win (detector flag flip); diğerleri orta-yüksek effort.
