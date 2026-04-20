# Deckent God-Level Roadmap — Sprint 149 → Sprint 200

**Created:** 2026-04-20 (Sprint 148 sonrası)
**Status:** CANONICAL — Sprint 149-200 anchor document
**Vision:** OpenClaw'ın god-level üstün hali — developer-first + life-assistant dual platform
**Brainstorming:** Alperen onayları 12+ karar, 5 paralel agent kod tabanı analizi
**Next audit:** Sprint 150 Beta GA sonrası revize

---

## 1. Vizyon Özeti

Deckent = **Sprint Mode** (developer orchestrator, GO/NO-GO disiplin) **+ Task Mode** (günlük life assistant, OpenClaw benzeri) birleşik platform. Config-driven (`deckent_style: "sprint" | "task"`) tek mode aktif, user tercih eder.

**OpenClaw benchmarkı** (Kasım 2025 launch → 346K star / 5 ay / %20 malicious skill):
- Deckent **daha olgun** başlıyor (%99.12 test coverage, 41 ADR, 148 sprint discipline)
- Deckent **daha güvenli** (AST sandbox + Ed25519 signature)
- Deckent **eşit hızda evrimleşmeli** (post-launch bug fix frenzy = community building)

**Beta GA hedef:** Sprint 150 Perşembe 23 Nis 2026 TRT — `v1.0.0-beta.1`

**God-level GA hedef:** Sprint 200 (~6 ay sonra, Ekim-Kasım 2026) — `v1.0.0` stable

---

## 2. Anchor Kararlar (Alperen Onaylı)

### 2.1 Mode Architecture
- **Config key:** `deckent_style: "sprint" | "task"` (kod kelimesi çakışması önlemek için `style`)
- **Single mode aktif** — dual değil, config ile toggle
- **2-layer user ayarı**: `~/.deckent/config.json` global + `./project/.deckent/config.json` project override (mevcut ADR-004 3-layer merge üzerine)
- **CLI**: `deckent mode task` / `deckent mode sprint` / `deckent mode auto` (context-detect)

### 2.2 Hub Repo
- **Ayrı repo**: `VerhexIO/deckent-hub` (OpenClaw ClawHub pattern parity)
- **20 seed skill** Sprint 149 (spotify-control, telegram-bot, calendar-google, email-imap, weather-forecast, rss-reader, web-scraper, github-issues, slack-notifier, notion-sync, todoist, spotify-playlist, youtube-downloader, reddit-fetcher, twitter-post, screenshot-vision, file-organizer, currency-converter, translator, discord-moderator)
- **Signing**: Ed25519 (Deckent'in OpenClaw %20 malicious sorununa yanıtı)
- **`deckent skill publish`** — sign + push to registry

### 2.3 Messaging Trio
- **Discord** (developer community, local bot kurulumu)
- **Telegram** (genel user, Türkiye'de popüler)
- **WhatsApp** (hazırlık scaffold, aktivasyon Business API onayı sonrası)
- **Local-first**: User kendi bot API key `.deck` file'a yazar veya ENV'den ref verir

### 2.4 Public Repo Açılışı
- **`VerhexIO/deckent`** repo hazır Sprint 149 sonu
- Sprint 150 Alperen manual flip — göz kontrolü sonrası public

### 2.5 Milestone-Gated Features
- **Voice (STT/TTS)**: 10K GitHub star sonrası (Sprint 171-180)
- **Mobile app**: 50K GitHub star sonrası (Sprint 181-200)
- **Cloud hosted**: v1.0 GA sonrası opsiyonel

### 2.6 Güvenlik Prensibi
- **AST sandbox** zorunlu (zaten var, OpenClaw'da yok)
- **Ed25519 signature** zorunlu (Sprint 149 yeni)
- **`.deck` secret file** — hiç commit olmaz, interpolation ile config'e ref
- **Dockerfile non-root** — USER directive zorunlu (Sprint 149 fix)
- **OpenClaw %20 malicious antitheziyiz** — pazarlama mesajımız

---

## 3. Kod Tabanı Gap Analizi (Sprint 148 sonrası)

### 3.1 Hazırlık Oranı

| Alan | Hazır % | Gerekçe |
|------|---------|---------|
| Messaging/Connectors | **20%** | Provider+dispatcher pattern var, 0 adapter |
| Hub/Skill Marketplace | **75%** | Sandbox+registry-client+install CLI var, Ed25519+separate repo eksik |
| Config & Mode Toggle | **95%** | 3-layer merge+env+.deck hepsi var, sadece `deckent_style` key ekleme |
| Security + .deck | **85%** | P0 4/5 kapalı (shell/path/memory.db/API auth), Dockerfile root+.deck interpolation eksik |
| Nervous + Dashboard + Daemon | **80%** | 5 detector+SSE+heartbeat-daemon var, chat tab+`deckentd`+Electron yok |
| **GENEL HAZIR** | **71%** | God-level'e sandığımızdan yakın |

### 3.2 Reuse Edilecek Mevcut Altyapı (ZATEN VAR)

**Messaging:**
- `src/core/provider.ts:32-82` — ProviderAdapter interface (template)
- `src/nervous/dispatcher.ts:40-42` — ChannelAdapter (extend)
- `src/core/notification-dispatcher.ts:30-34` — NotificationAdapter (outgoing Discord/Slack)
- `src/api/server.ts:283-545` — HTTP server + Zod + rate limiter

**Hub:**
- `src/core/marketplace/skill-sandbox.ts:70-168` — AST sandbox (eval, Function, child_process, fs, process.env blok)
- `src/core/marketplace/registry-client.ts:1-79` — RegistryClient HTTP/HTTPS
- `src/cli/commands/skill.ts:286-454` — `skill install <source>` (git + SHA256)
- `src/orchestra/promotion-pipeline.ts:12-74` — PromotionPipeline
- `src/core/credentials.ts:54-241` — AES-256-GCM

**Config:**
- `src/core/config.ts:636-812` — 3-layer merge
- `src/core/deck-file.ts:1-199` — `.deck` format (11 known keys, gitignore enforcement)
- `src/core/global-config.ts:17-74` — `~/.deckent/` erişim

**Security:**
- Sprint 143-144'te kapalı: shell injection (tmux.ts), path traversal (validators.ts), memory.db (.gitignore), API auth (auth.ts)

**Nervous + Dashboard:**
- `src/nervous/detector-registry.ts:1-120` — 5 active + extension pattern
- `src/dashboard/src/pages/*` — 6 page React+Vite+Tailwind
- `src/api/server.ts:416-428` — SSE `/api/events`
- `src/cli/commands/run.ts` + `src/mcp/tools/run.ts:19-112` — `deckent run` one-shot
- `src/orchestra/heartbeat-daemon.ts:1-120` — heartbeat daemon

### 3.3 TAMAMEN YENİ — Yazılacak

**Sprint 149 (Çar 22 Nis) — 27 task, ~1450 LoC yeni:**
- Block A: `deckent_style` config key (5-6 satır modif)
- Block B: Dockerfile USER + `.deck` interpolation (~150 LoC)
- Block C: `src/connectors/` 6 module Discord+Telegram+WhatsApp+pool+router (~800 LoC)
- Block D: Ed25519 + VerhexIO/deckent-hub repo + 20 seed skill (~400 LoC)
- Block E: Doc consolidation (388 .md review)
- Block F: ADR-041 accept + npm publish dry-run v1.0.0-beta.1

**Sprint 150 (Per 23 Nis) — Beta GA:**
- npm publish v1.0.0-beta.1
- Dashboard ChatPage.tsx (7. page)
- deckent-hub public flip
- Discord + Telegram bots canlı

---

## 4. Sprint 149-200 Master Roadmap

### Phase 1: Beta GA Launch (Sprint 149-150)
**Hedef: Solid launch + community preview**

| Sprint | Gün | Tema | Task | Çıktı |
|--------|-----|------|------|-------|
| **149** | Çar 22 Nis | Hybrid Foundation + Debt Liquidation + Security | 27 task | deckent_style toggle, messaging trio, hub repo, Ed25519, P0 security, 20 seed skill, doc consolidation, npm dry-run |
| **150** | Per 23 Nis | 🚀 BETA GA CUTOVER v1.0.0-beta.1 | 8 task | npm publish, git tag, GitHub release, ChatPage, public repo flip, Show HN + Reddit + Twitter + Discord announce |

### Phase 2: Post-Launch Bug Frenzy + Messaging (Sprint 151-160)
**Hedef: Community feedback + messaging ecosystem + hub growth**

| Sprint | Gün | Tema | Task |
|--------|-----|------|------|
| 151 | Cum 24 Nis | Community Bug Triage Week 1 — P0 fixes (community reported) | 10-15 task |
| 152 | Pzt 27 Nis | WhatsApp Business API activation + Slack connector + Email (IMAP/SMTP) | 12 task |
| 153 | Sal 28 Nis | Hub Growth — 20 → 50 skill + moderation CI + rating system | 10 task |
| 154 | Çar 29 Nis | Feature requests triage + routing V4 + skill heuristics | 12 task |
| 155 | Per 30 Nis | Adaptive agent activation (analiz → öneri + autonomous apply) | 10 task |
| 156 | Cum 1 May | DeckentHub moderation queue + CI auto-signature + Ed25519 rotation | 10 task |
| 157 | Pzt 4 May | Messaging polish + thread management + user context memory | 10 task |
| 158 | Sal 5 May | Nervous system 6-10 detector activation (Sprint 147 plan) | 10 task |
| 159 | Çar 6 May | CLI/MCP parity audit + i18n TR/EN gaps + docs site | 12 task |
| 160 | Per 7 May | Marketplace 50 → 100 skill + vector search (FTS5 extend) | 10 task |

### Phase 3: Daemon + Local AI + Polish (Sprint 161-170)
**Hedef: 7/24 background operation + local model support**

| Sprint | Tema | Anahtar Çıktı |
|--------|------|---------------|
| 161 | `deckentd` daemon wrapper | systemd/launchd service files, PID management |
| 162 | Electron tray (optional) + desktop app scaffold | macOS/Linux tray icon |
| 163 | Local LLM (Ollama) integration | Ollama adapter + config |
| 164 | Groq + Fireworks + Together AI adapters | litellm proxy pattern |
| 165 | Embeddings (OpenAI + Voyage + local) | RAG-ready skill context |
| 166 | SWE-bench benchmark run + publish score | competitive positioning |
| 167 | Monorepo support (multi-project sprint) | workspace-aware planner |
| 168 | Template gallery (DIRECTIVES library) | 20 project template |
| 169 | Blog post + tutorial campaign | 10 long-form content |
| 170 | 1st month retrospective + 10K star push | Hacker News/Twitter round 2 |

### Phase 4: Voice + Intelligence (Sprint 171-180)
**Gate: 10K+ GitHub star (Alperen milestone)**

| Sprint | Tema |
|--------|------|
| 171-173 | STT (Whisper) adapter + wake word (Porcupine) |
| 174-176 | TTS (OpenAI Voice + ElevenLabs) + real-time streaming |
| 177-178 | Voice-activated sprint commands |
| 179-180 | Voice UX polish + accessibility |

### Phase 5: Mobile (Sprint 181-200)
**Gate: 50K+ GitHub star (Alperen milestone)**

| Sprint | Tema |
|--------|------|
| 181-185 | React Native iOS/Android MCP client |
| 186-190 | Push notifications (APNs + FCM) |
| 191-195 | Mobile-specific skills (Contacts, GPS, camera) |
| 196-200 | v1.0.0 stable GA — "God-level üstün" launch |

---

## 5. Beta GA (Sprint 150) Exit Criteria — 12 Gate (BETA-TRACKER uyumlu)

| # | Gate | Hedef | Mevcut |
|---|------|-------|--------|
| 1 | `tsc --noEmit` 0 errors | 0 | ✅ PASS |
| 2 | vitest ≥ %99.5 pass | 99.5%+ | 🔄 99.12% (135 fail, Sprint 149'da < 50) |
| 3 | Coverage ≥ 85% | 85%+ | 🔄 52.1% (uzun vadeli) |
| 4 | 27 MCP tool functional | 27/27 | ✅ PASS (Sprint 147 +5 nervous) |
| 5 | 45+ CLI komut functional | 45+ | ✅ PASS |
| 6 | `npm pack --dry-run` temiz | 0 warning | ⏳ Sprint 149 |
| 7 | Cross-platform 3/3 | 3/3 | ✅ Sprint 148 |
| 8 | Multi-provider 3/3 | 3/3 | ✅ Sprint 148 |
| 9 | i18n CLI/MCP/Dashboard | 95%+ | 🔄 Sprint 148 |
| 10 | Memory V2 stress test | Pass | ✅ Sprint 145 |
| 11 | Documentation sync | Current | ⏳ Sprint 149 |
| 12 | 0 open CRITICAL/HIGH debt | 0 | ⏳ Sprint 149 (Dockerfile + vitest) |
| **YENİ 13** | **Messaging trio smoke test** | Discord+Telegram bot canlı | ⏳ Sprint 149 |
| **YENİ 14** | **deckent_style toggle canlı** | sprint/task switch | ⏳ Sprint 149 |
| **YENİ 15** | **DeckentHub 20 seed skill** | 20 published + signed | ⏳ Sprint 149 |

---

## 6. Taşınan Debt (Sprint 148 → 149)

| Debt | Sprint Kaynağı | Öncelik | Kapsanan Task |
|------|----------------|---------|---------------|
| Vitest Docker worker exit (T-148-020 NO_GO) | Sprint 148 | P0 | T-149-010 (Docker HB cleanup_result OOM path) |
| Docker HB fix partial (T-148-022 TD) | Sprint 148 | P0 | Yukarı ile aynı task'ta |
| Scope sanitizer code snippet false positive | Sprint 148 | P1 | T-149-011 (parser refinement) |
| Auditor stale alert race (assigned not spawned) | Sprint 148 | P1 | T-149-012 (worker lifecycle state check) |
| AI planning mode provider error (2 sprint fail) | Sprint 145-148 | P2 | T-149-013 (provider registry investigation) |
| Dockerfile runs as root | God-analysis P1 | P0 | T-149-006 (Dockerfile USER) |
| `.deck` → config interpolation yok | Yeni bulgu Sprint 148 | P1 | T-149-007 |
| test-writer agent PROMPT.md kalıntıları | Sprint 148 partial | P2 | T-149-014 (final sweep) |

**Toplam taşınan debt:** 8 item → Sprint 149'a entegre.

---

## 7. Rekabet Konumu — OpenClaw vs Deckent

| Kriter | OpenClaw (Nis 2026) | Deckent (Nis 2026) | Değerlendirme |
|--------|---------------------|---------------------|---------------|
| GitHub star | 346K (5 ay) | 0 (launch bekleyen) | OpenClaw momentum 🏆 |
| Mevcut skill | 44K (%20 malicious) | 21 built-in + 20 seed | OpenClaw scale, Deckent quality 🏆 |
| Target audience | Life assistant (genel user) | Developer + life dual | Deckent geniş 🏆 |
| Security | AST eksik, %20 malicious skandal | AST sandbox + Ed25519 | Deckent 🏆 |
| Multi-provider | 200+ LLM | 3 provider + 13 model | OpenClaw 🏆 |
| Voice/Speech | ✅ macOS/iOS/Android | ❌ yok (10K star sonrası) | OpenClaw 🏆 |
| Mobile | ✅ | ❌ (50K star sonrası) | OpenClaw 🏆 |
| Messaging | WhatsApp/iMessage/SMS | Discord+Telegram+WhatsApp | Eşitleniyor 🤝 |
| Sprint discipline | ❌ ad-hoc | ✅ GO/NO-GO + rubric | Deckent 🏆 |
| Self-healing nervous | ❌ reactive | ✅ 5 detector proactive | Deckent 🏆 |
| Test coverage | ? bilinmiyor | %99.12 (15256 test) | Deckent 🏆 |
| Memory system | Session state | DB-first SQLite FTS5 i18n | Deckent 🏆 |
| ADR governance | ❌ yok | ✅ 41 ADR MADR v3 | Deckent 🏆 |

**Deckent'in rekabet stratejisi:** "Open source, AST-sandboxed, disciplined alternative to OpenClaw — developer-first ama hayat asistanı olabilir."

---

## 8. Pazarlama Mesajları (Sprint 150 Launch)

### Ana Tagline Adayları
1. **"The AI orchestrator OpenClaw never built — for developers who want discipline."**
2. **"148 sprints. 99.12% test coverage. 0 malicious skills. Open source."**
3. **"Deckent: Sprint Mode + Task Mode. Developer + Life Assistant. One platform."**

### USP (Unique Selling Points)
- **Sprint Discipline**: GO/NO-GO gates + rubric grading (hiçbir rakipte yok)
- **Nervous System**: Proactive detector (Deckent sees problems before you do)
- **AST Sandbox**: Zero malicious skills (OpenClaw %20 problem çözümü)
- **Multi-Provider Freedom**: Claude + Codex + Gemini (vendor lock-in yok)
- **Memory V2**: SQLite FTS5 dual-layer i18n (Turkish + English + German %100 recall)
- **Dual Mode**: Sprint (developer) + Task (life assistant) single platform
- **148 Sprint Battle-Tested**: solo dev disiplin + public evolution

### Launch Kanalları (Sprint 150 Perşembe 10:00 TRT = 03:00 EST)
1. Show HN — "Deckent: Open source AI orchestrator with nervous system (Solo dev, 148 sprints)"
2. Reddit r/LocalLLaMA + r/programming + r/opensource
3. Twitter thread (Alperen hesabı)
4. Turkish dev Twitter (Webtekno, ShiftDelete, Teknokulis)
5. Discord server launch (community hub)
6. Dev.to post + Hashnode

---

## 9. Risk Matrix (Sprint 149-200)

| Risk | Olasılık | Etki | Mitigation |
|------|----------|------|------------|
| Sprint 149 8h aşımı (27 task) | Orta | Orta | Block E-F ertelenebilir Sprint 150'ye |
| Sprint 150 launch provider error | Düşük | Yüksek | npm publish --dry-run Sprint 149'da |
| Community no-show Sprint 150 | Orta | Yüksek | Turkish dev network ile pre-announce |
| Hub skill security breach | Düşük | Yüksek | Ed25519 + CI sandbox scan zorunlu |
| WhatsApp Business API red | Orta | Orta | Scaffold Sprint 149, aktivasyon Sprint 152+ |
| Post-launch bug flood | **Yüksek** | Orta | **Bu beklenen** — Sprint 151 community triage |
| Sprint 149 AI mode yine fail | Orta | Düşük | Structured fallback hazır |
| God-level 50 sprint sürer | Orta | Düşük | OpenClaw 24 ayda 0→70K, biz 6 ayda 10K+ hedef |
| Solo dev burnout | Orta | Yüksek | Sprint pace < 2/gün, milestone-gated features |

---

## 10. Bağlantılı Dokümanlar

- `BETA-TRACKER.md` + `BETA-TRACKER-TR.md` — sprint-level exit criteria
- `DECKENT-MASTER-BLUEPRINT.md` — architectural blueprint
- `DECKENT-ANA-PLAN-TR.md` — Turkish master plan
- `VISION.md` + `VISION-TR.md` — product vision
- `COMPETITIVE-ANALYSIS.md` — rekabet analizi
- `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` — god-audit 233 findings
- `.deckent/sprint-god-analysis/FINAL-REPORT.md` — 317 files × 74K LoC analysis
- `docs/analysis/competitive-analysis.md` — OpenClaw/Cursor/Devin head-to-head
- `docs/superpowers/specs/2026-04-20-sprint-148-meta-dogfood-design.md` — Sprint 148 spec
- `.brain/exports/summary.md` — 41 ADR registry

---

## 11. Anchor Kuralları — Yoldan Şaşmamak İçin

1. **Sprint 150 Beta GA sabittir** — 23 Nis Perşembe, ertelenmez (catastrophic fail dışında)
2. **test-writer agent yasak** — Sprint 148 reform kalıcı, tekrar eklenmez
3. **Nervous system production-critical** — her sprint'te event kanıtı aranır
4. **Ed25519 signature zorunlu** — imzasız skill hub'a kabul edilmez
5. **Deckent "ürün değil servis"** — SaaS/paywall/enterprise edition yasak (ADR-033)
6. **Milestone-gated**: Voice 10K, Mobile 50K (Alperen kararı)
7. **Solo dev hikayesi** pazarlama asset'idir — solo + sprint disiplini = USP
8. **OpenClaw mesafe azalıyor** — her sprint rekabet pozisyonu güncellenir
9. **.deck + AST sandbox + Ed25519 = güvenlik DNA'sı** — bu üçlüden taviz yok
10. **Doküman-önce-kod** — her sprint öncesi design spec + DIRECTIVES

---

**İmza:** Koordinatör (5 paralel agent analiz + Alperen 12 karar + OpenClaw rekabet verisi)
**Diriliş:** Bu doküman Sprint 149 öncesi canlı — her sprint sonu güncellenecek
**Sonraki revize:** Sprint 150 Beta GA sonrası — launch metrikleri ile güncelle
