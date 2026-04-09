<!-- Dil: TR | Teknik terimler EN -->
# Deckent Beta Tracker

**Son güncelleme:** 2026-04-09 | **Sprint:** 122+ | **Test:** 12,193+ | **Versiyon:** 0.4.0-beta.1

---

## Mevcut Durum
| Metrik | Değer |
|--------|-------|
| Version | 0.4.0-beta.1 |
| Sprint | sprint-123 |
| MCP Tools | 20 |
| MCP Resources | 8 |
| CLI Commands | 35+ |
| Dashboard Pages | 6 |
| Agents | 16 built-in |
| Skills | 21 built-in |
| Providers | 3 (Claude, Codex, Gemini) |

## Genel Bakış

122+ sprint, 12,193+ test, 250+ TypeScript modülü. Üç spawn backend doğrulandı: tmux (en hızlı, 2dk55sn), subprocess (çalışıyor, 6dk53sn), Docker (canlı doğrulandı — Sprint 119-122). Self-dogfooding aktif — Deckent kendi test regresyonlarını ve dokümantasyonunu sprint'lerle düzeltiyor. Dokümantasyon konsolide edildi: BETA-TRACKER (EN+TR), docs.json 7 dokümanı otomatik güncelliyor.

**Strateji:** npm paketle → kendi projelerinde dogfood → feedback → düzelt → public repo (VerhexIO/deckent)

**Mevcut Durum:** v0.4.0-beta.1 — Üç backend canlı doğrulandı. Docker backend E2E sprint testi yapıldı (Sprint 119-122): CLI exit 0, MCP reconnect doğrulandı, smoke dosyaları oluşturuldu. CI coverage fix uygulandı (Docker e2e, Docker olmayan ortamlarda skip). 10 Docker e2e test, lokal'de hepsi geçiyor.

---

## Faz Planı

### Faz 1: "Kendin Kullan" — TAMAMLANDI ✅
### Faz 1.5: "Init UX + Onboarding" — TAMAMLANDI ✅ (Sprint 070-071)

### Faz 2: "Genel Kullanılabilirlik" — AKTİF

**Sprint 072 — TAMAMLANDI (2026-03-27):**
- [x] P1-7: Plan tier'ları → performance/balanced/economic + backward compat
- [x] P1-8: Init wizard → genel provider seçimi, $ kaldırıldı
- [x] P1-9: MODEL_API_IDS mapping + resolveApiModelId()
- [x] P2-13: README.md → 12,192+ test, 86+ sprint, Windows full, 19 MCP tools
- [x] P5-31: sprint-controller.ts → 7 phase fonksiyonu sprint-phases.ts'ye extract

**Sprint 073 — TAMAMLANDI (2026-03-30) — Self Dogfooding:**
- [x] 100 test regresyonu düzeltildi (43+16+9+23+3 = 100 fail → 0 fail)
- [x] test-writer agent 5/5 task DONE, 17m 41s

**Sprint 074 — TAMAMLANDI (2026-03-30) — Docs + Debt:**
- [x] P2-13: README.md sayılar güncellendi (12,176+ test, 73+ sprint)
- [x] P2-16: CHANGELOG + SPRINT-LOG Sprint 072-073 entry'leri
- [x] .brain/ tutarlılık (PROJECT-IDENTITY, DECISIONS)
- [x] CLAUDE.md + DECKENT.md modül sayıları düzeltildi (orchestra 47, core 49, MCP 19)
- [x] debt-069-005 (TempAgent) + debt-069-006 (scope parser) kapandı
- [x] doc-writer agent 5/5 + bug-fixer 2/2, 7m 29s

**Sprint 075 — TAMAMLANDI (2026-03-30) — Dil Tutarlılığı + Vizyonu:**
- [x] P2-14: docs/CHANGELOG.md Türkçeleştirildi — 300+ EN → TR çevirisi
- [x] P2-18: VISION.md oluşturuldu — 7 bölüm, rakip analizi (5 tablo), roadmap
- [x] P2-19: docs/ link audit — 4 broken link tespit ve düzeltildi
- [x] P4-29: .detect-secrets v1.5.0 kuruldu — .pre-commit-config.yaml
- [x] P5-31: God object split Faz 2 — sprint-controller.ts → result-collector.ts extract

**Sprint 076 — TAMAMLANDI (2026-03-31):**
- [x] P3-20: Stale heartbeat root cause fix — finalizeHeartbeat + auditor DONE skip
- [x] P3-22: Dashboard API entegrasyon testi — 10 yeni test, 6 describe block
- [x] P6-40: Graceful shutdown — SIGINT → interruptActiveSprint + killAllSessions
- [x] P5-31: God object split Faz 3 — result-collector.ts extract (233 satır)

**Sprint 077 — TAMAMLANDI (2026-03-31) — Docs:**
- [x] CHANGELOG + SPRINT-LOG Sprint 076 entry'leri
- [x] .brain/ güncelleme (PROJECT-IDENTITY, DECISIONS)
- [x] CLAUDE.md + DECKENT.md modül sayıları güncellendi

**Sprint 078 — TAMAMLANDI (2026-04-01), 6m 57s:**
- [x] Blueprint senkronizasyonu, i18n altyapısı, TR/EN docs, /api/tasks
- [x] CHANGELOG + SPRINT-LOG catch-up, HistoryPage success rate trend

**Sprint 079 — TAMAMLANDI (2026-04-01), ~15m:**
- [x] README-TR fix, dashboard kontrol butonları, init dil-ilk, /api/cleanup

**Sprint 080 — TAMAMLANDI (2026-04-01), 9m 06s:**
- [x] Dashboard UX Overhaul: WorkerCard, SprintPhaseTimeline, ActivityFeed

**Sprint 081 — TAMAMLANDI (2026-04-01), 12m 38s:**
- [x] Settings+Config birleştirme, i18n tam kapsam (44 key), terminal logları

**Sprint 082 — TAMAMLANDI (2026-04-02):**
- [x] MCP/CLI parity: 19 tool, 33 CLI, ADR-022
- [x] Usage card kaldırma, v0.3.0-beta.1, init test fix
- [x] Dashboard Faz B: skeleton loading, AgentDetail zenginleştirme, EmptyState, polish

**Sonraki Planlar:**
- [ ] Dashboard gerçek sprint ile test (P3-22) — bir sonraki sprint
- [ ] P1-10..12: Multi-provider test (BLOCKED — API key gerekli)
- [ ] Windows Codex CLI dogfooding

### Faz 3: "Dokümantasyon"
TR+EN çift dil, VISION, link audit, config dashboard

### Faz 4: "Public Repo"
.detect-secrets, VerhexIO/deckent'e taşıma, CI/CD, npm publish

---

## Öncelik Matrisi (P0-P6)

### P0 — npm Paketleme + Dogfooding — TAMAMLANDI ✅

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 1 | npm publish test | **DONE** | 518KB, 479 dosya, local install çalışıyor |
| 2 | `deckent init` gerçek proje testi | **DONE** | Windows'ta Vizetron (Python/FastAPI) test edildi |
| 3 | `deckent doctor` dış ortam | **DONE** | WSL2 + Windows, SKIP/OK/FAIL, healthScore fix |
| 4 | Shebang + bin entry | **DONE** | `deckent` + `deckent-mcp` çalışıyor |
| 5 | İlk sprint UX | **DONE** | Vizetron'da sprint-002 başarıyla tamamlandı |
| 6 | Windows native desteği | **DONE** | 7 dosyada shell:true, heartbeat periodic, log capture |

### P1 — Provider & Tier Generalizasyonu

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 7 | Plan tier'ları Claude-specific | **DONE** | performance/balanced/economic + backward compat (Sprint 072) |
| 8 | Claude subscription bağımlılığı | **DONE** | Init wizard provider-agnostic, $ kaldırıldı (Sprint 072) |
| 9 | Model isimleri güncelliği | **DONE** | MODEL_API_IDS + resolveApiModelId() (Sprint 072) |
| 10 | Multi-provider aynı anda test | **YAPILACAK** | Claude + Codex + Gemini aynı sprint'te hiç test edilmedi |
| 11 | API + Subscription birlikte | **YAPILACAK** | API key ile subscription aynı anda çalışıyor mu? |
| 12 | Codex/Gemini CLI binary check | **YAPILACAK** | Gerçek CLI binary'leri doğrulama |

### P2 — Dokümantasyon

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 13 | README.md eski veriler | **DONE** | Badge + sayılar güncellendi (Sprint 074) |
| 14 | Dil tutarsızlığı | **DONE** | docs/CHANGELOG.md Türkçeleştirildi (Sprint 075) |
| 15 | TR+EN çift dil | **KISMEN** | .deckent/docs/ TR/EN desteği eklendi |
| 16 | CHANGELOG.md boş | **DONE** | docs/CHANGELOG.md 1159 satır, Sprint 1-073 (Sprint 074) |
| 17 | Config referans eksik | **DONE** | .deckent/docs/config-reference.md |
| 18 | VISION.md eksik | **DONE** | VISION.md oluşturuldu — vizyon, rakip analizi, roadmap (Sprint 075) |
| 19 | docs/ link kontrolü | **DONE** | 4 broken link tespit edildi ve düzeltildi (Sprint 075) |

### P3 — UX & Dashboard

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 20 | Dashboard veri doğruluğu | **DONE** | Idle state + son sprint özeti, /api/status artık 404 dönmüyor |
| 21 | Dashboard config arayüzü | **DONE** | 13 kategori, 50+ alan, API üzerinden okuma/yazma, tam fonksiyonel |
| 22 | Dashboard gerçek test | **DONE** | 7+ gerçek sprint kaydı, 429 dashboard test geçiyor, API entegrasyonu test edildi |
| 23 | Config.json karmaşıklığı | **KISMEN** | config-reference.md var, dashboard'dan seçim eksik |
| 24 | İlk kullanım deneyimi | **DONE** | quick-start.md, directives-guide.md, workflow rehberi |

### P4 — Platform & Altyapı

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 25 | Windows native | **DONE** | Tam destek: spawn, heartbeat, log, encoding, ps guard |
| 26 | Node >= 18 neden? | **YAPILACAK** | OpenClaw Node 22+, ES2022+ feature check |
| 27 | Docker/Sandbox | **TAMAMLANDI** | Sprint 119-122 canlı doğrulandı: CLI+MCP, 10 e2e test, CI skip guard |
| 28 | CI/CD billing | **YAPILACAK** | Public repo ile çözülür |
| 29 | .detect-secrets | **DONE** | .pre-commit-config.yaml kuruldu, detect-secrets v1.5.0 (Sprint 075) |

### P5 — Kod Kalitesi

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 30 | .gitignore runtime state | **DONE** | |
| 31 | God objects | **DONE** | Faz 1 (Sprint 072), Faz 2 (Sprint 075), Faz 3 (Sprint 076) — result-collector.ts extract tamamlandı |
| 32 | V2 routing test-writer bias | **KISMEN** | Exclude kuralı yazıldı |

### P6 — Kullanıcı Deneyimi İyileştirmeleri

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 33 | Error messages kullanıcı-dostu değil | **DONE** | DeckentError + suggestion + howToFix (53 error kodu) |
| 34 | `deckent explain` MCP'de yok | **YAPILACAK** | CLI-only rehberlik aracı |
| 35 | Telemetry/analytics | **YAPILACAK** | Opt-in kullanım analitikleri |
| 36 | `deckent upgrade` test | **DONE** | `--local` flag eklendi, beta workflow |
| 37 | Skill marketplace backend | **YAPILACAK** | CLI komutu var ama backend yok |
| 38 | Plugin system e2e test | **YAPILACAK** | Gerçek plugin ile test edilmedi |
| 39 | Rate limiting production | **YAPILACAK** | 100 req/60s yeterli mi? |
| 40 | Graceful shutdown | **DONE** | SIGINT handler + interruptActiveSprint + killAllSessions (Sprint 076) |

---

## Rakip Analizi

### A. OpenClaw (Acik Kaynak Kisisel AI Asistan)

**Genel:** Peter Steinberger tarafindan olusturulmus acik kaynak (MIT) kisisel AI asistani. **343,000+ GitHub yildizi** (Nisan 2026 — React'i 60 gunde gecti, GitHub'un en cok yildizli yazilim projesi), **1,000+ katkici**, **2 milyon aylik aktif kullanici**, **27 milyon aylik web ziyareti** (%925 buyume). Onceki adlari: Clawdbot → Moltbot → OpenClaw.

**Mimari (5 Katman):**

| Katman | Isim | Islem | Deckent Karsiligi |
|--------|------|-------|-------------------|
| 1 | **Gateway** | Always-on daemon (port 18789), mesaj yonlendirme, session yonetimi, Control UI + WebChat | api/server.ts + mcp/server.ts |
| 2 | **Brain** | ReAct reasoning loop ile LLM orkestrasyonu | orchestra/sprint-controller.ts |
| 3 | **Memory** | Markdown dosyalarinda persistent context (local-first) | .brain/ dizini |
| 4 | **Skills** | 13,729 ClawHub skill (%65+ MCP server wrap): dosya sistemi, shell, browser, email, 400+ uygulama | 21 built-in skill |
| 5 | **Heartbeat** | 30dk aralikla otonom gorev taramasi daemon'u | ✅ heartbeat-daemon.ts (Sprint 088) |

**OpenClaw'un Deckent'te Olmayan Ozellikleri:**

1. ~~**Heartbeat Daemon**~~ — ✅ Sprint 088'de eklendi: `deckent heartbeat --daemon` ile periyodik gorev taramasi, `.deckent/HEARTBEAT.md` okuyup calistirma.
2. **50+ Kanal Entegrasyonu** — WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Teams, Matrix. Deckent sadece CLI + MCP + Dashboard.
3. **Browser Kontrolu** — Web tarayici otomasyonu, sayfa tasima, form doldurma. Deckent'te yok.
4. **Always-On Gateway** — Surekli calisan daemon. Deckent sprint-bazli (basla-bitir modeli).
5. **Otonom Zamanlanmis Gorevler** — HEARTBEAT.md ile kullanici sormadan calisma. Deckent her zaman insan tetiklemesi bekliyor.
6. **Local-First Memory** — Markdown'da kalici bellek. Deckent'te .brain/MEMORY.md benzer ama kapsamdasi (300 satir limit).

**OpenClaw'un Deckent'e Gore Zayif Yanlari:**

1. Tek-agent — coklu paralel worker yok
2. Sprint planlamasi yok — her istek tek seferlik
3. Scope enforcement yok — tum dosya sistemine erisim
4. Multi-provider orkestrasyonu yok — tek LLM
5. Yapılandırılmış task decomposition yok
6. Kalite degerlendirme (GO/NO_GO) yok

**Deckent Icin Dersler:**
- Heartbeat daemon modeli onemli — proaktif calisan sistem
- Kanal entegrasyonlari (Slack, Telegram) kullanici erisimini genisletir
- Always-on gateway modeli sprint-bazli modelden daha otonom
- Skill marketplace (13,729 skill, ClawHub) ekosistem buyutme stratejisi — SKILL.md markdown pattern'i basit ve etkili
- 2M MAU, 27M web ziyareti — acik kaynak topluluk buyutme stratejisi ogrenilebilir

---

### B. Microsoft Copilot Cowork (Kurumsal AI Orkestrator)

**Genel:** Microsoft'un Anthropic isbirligi ile gelistirdigi kurumsal AI agent sistemi. M365 Frontier urununde sunuluyor. Mart 2026'da lansman.

**Mimari:**

| Ozellik | Detay | Deckent Karsiligi |
|---------|-------|-------------------|
| Multi-model | GPT + Claude "critique layer" — GPT yazar, Claude dogrular | Multi-provider (Claude + Codex + Gemini) |
| Enterprise Graph | Outlook, Teams, Calendar, SharePoint, Excel entegrasyonu | Sadece dosya sistemi + git |
| Otonom Plan | Kullanici sonuc tanimlar, Cowork plan yapar | DIRECTIVES.md → plan → execute |
| Checkpoints | Plan yuruturken insan onay noktalari | ✅ human_checkpoints config (Sprint 088) |
| Arka Plan Calisma | Gorevler arka planda devam eder | Sprint arka planda calisiyor (tmux/subprocess) |

**Cowork'un Deckent'te Olmayan Ozellikleri:**

1. ~~**Human Checkpoints**~~ — ✅ Sprint 088'de eklendi: plan/evaluate/fix fazlarinda onay noktalari, `waitForHumanApproval()` mekanizmasi.
2. **Critique Layer** — Model A yazar, Model B dogrular. Deckent'te tek model per task.
3. **Enterprise Data Graph** — Email, takvim, dosya iliskileri. Deckent sadece kod + dosya.
4. **Progressive Disclosure** — Kullanici istedigi kadar detay gorebilir. Deckent'te tum-veya-hic (dashboard veya terminal).

**Cowork'un Deckent'e Gore Zayif Yanlari:**

1. Kod yazma yetkinligi sinirli — genel is otomasyonu odakli
2. Self-hosted yok — Microsoft bulut zorunlu
3. Acik kaynak degil — genisletilemez
4. Fiyat: $30+/kullanici/ay zorunlu M365 lisansi

**Deckent Icin Dersler:**
- Critique layer (Model A yaz + Model B dogrula) kalite arttirir
- Human checkpoint'ler otonom ama guvenilir is akisi saglar
- Enterprise data entegrasyonu (Jira, Linear, GitHub) onemli genisleme alani

---

### C. Perplexity Computer (Multi-Model AI Agent Sistemi)

**Genel:** 25 Subat 2026'da lansman. $200/ay (Max, 10,000 kredi dahil), $325/koltuk/ay (Enterprise Max). **19 uzmanlasmis AI modeli** orkestre ediyor. Harcama limiti: varsayilan $200, max $2,000.

**Model Rolleri:**

| Model | Rol | Deckent Karsiligi |
|-------|-----|-------------------|
| Claude Opus 4.6 | Merkezi reasoning engine | brain_provider: claude |
| GPT-5.2 | Long-context recall, web search | worker_provider alternatif |
| Gemini | Deep research | worker_provider alternatif |
| Grok (xAI) | Lightweight, hiz-oncelikli islemler | haiku tier karsiligi |
| Nano Banana | Gorsel uretim | YOK |
| Veo 3.1 | Video uretim | YOK |
| +13 diger | Ozel gorevler | YOK |

**Mimari:**

| Ozellik | Detay | Deckent Karsiligi |
|---------|-------|-------------------|
| Multi-model | 19 model, gorev bazli otomatik secim | 3 provider, 13 model, ModelRegistry + routing engine |
| Task Decomposition | Hedef → alt-gorev → sub-agent → uzman model | DIRECTIVES → task JSON → worker |
| Paralel Calisma | Birden fazla sub-agent ayni anda | Max 4-5 worker paralel |
| Cloud Sandbox | Izole ortam, gercek dosya sistemi, browser | Lokal dosya sistemi |
| 400+ Uygulama | Slack, Gmail, GitHub, Notion entegrasyonu | Sinirli (git, dosya, test) |
| Sure | Saatler, gunler, hatta aylar boyunca calisabilir | Sprint bazli (dakikalar-saatler) |
| Kredi Sistemi | 10K kredi/ay, task karmasikligina gore tuketim | YOK (flat usage) |

**Perplexity Computer'in Deckent'te Olmayan Ozellikleri:**

1. **19 Uzmanlasmis Model** — Her alt-gorev icin en uygun model otomatik secilir. Deckent 13 model + ModelRegistry + routing engine benzer mantik, ama daha az model.
2. **Gunler/Aylar Suren Gorevler** — Uzun sureli otonom calisma. Deckent sprint-bazli (kisa sureli).
3. **400+ Uygulama Entegrasyonu** — Web, e-posta, sosyal medya, veritabani. Deckent sadece gelistirme araclari.
4. **Cloud Sandbox** — Izole ortam, guvenlik. Deckent lokal (avantaj ve dezavantaj).
5. **Kredi-Bazli Fiyatlandirma** — Kullanimla olceklenen maliyet. Deckent flat (ucretsiz ama kaynak sinirli).

**Perplexity Computer'in Deckent'e Gore Zayif Yanlari:**

1. $200-325/ay fiyat — Deckent ucretsiz + acik kaynak
2. Self-hosted yok — veri guvenligi endisesi
3. Kod uzmanligi sinirli — genel amacli
4. Sprint planlama/retrospektif yok
5. Scope enforcement yok

**Deckent Icin Dersler:**
- Model sayisini artirmak (Grok, Llama, Mistral) rekabet avantaji
- Uzun sureli gorev destegi (multi-sprint zincirleme)
- ✅ Dinamik model secimi ModelRegistry ile guclendirildi (Sprint 097) — 13 model, tier-based routing

---

### D. Devin 2.0/3.0 (Otonom Yazilim Muhendisi)

**Genel:** Cognition Labs. $20/ay (Core, $2.25/ACU), $500/ay (Team, $2.00/ACU, 250 ACU dahil). 1 ACU ≈ 15dk calisma. v2.0 Mart 2026, v3.0 dynamic replanning eklendi.

**Compound AI Mimarisi (Tek Model Degil, Model Surusi):**

| Bileşen | Rol | Deckent Karsiligi |
|---------|-----|-------------------|
| **Planner** | High-reasoning model, strateji belirleme | planner.ts (AI mode) |
| **Coder** | Kod-uzman model, trilyonlarca token egitimli | Worker (genel amacli) |
| **Critic** | Adversarial model, guvenlik + mantik review | YOK — tek model per task |

**Mimari:**

| Ozellik | Detay | Deckent Karsiligi |
|---------|-------|-------------------|
| Interactive Planning | Kullanici ile isbirlikci, karsilikli plan olusturma | DIRECTIVES.md (tek yonlu) |
| Cloud IDE | Paralel Devin instance'lari, browser'da editor | tmux/subprocess worker'lar |
| Devin Wiki | Otomatik repo indeksleme, mimari diagram, kaynak link | .brain/ bellek sistemi |
| Dynamic Replanning (v3.0) | Takildiyinda stratejiyi tamamen degistirme | mid-sprint-adapter.ts (sinirli, max 1 reroute) |
| Legacy Refactoring | COBOL/Fortran → Rust/Go/Python | Stack detection var, refactoring sinirli |
| UI Mockup → Kod | Figma/gorsel → kod uretme | YOK |
| Kod + Test + Deploy | Tam yazilim dongusu | Kod + test (deploy yok) |

**Devin'in Deckent'te Olmayan Ozellikleri:**

1. **Interactive Planning** — Kullanici ile karsilikli plan olusturma. Deckent'te DIRECTIVES yazilir, plan tek yonlu.
2. **Dynamic Replanning** — Takildiyinda tamamen farkli strateji. Deckent'te mid-sprint reroute sinirli (max 1 deneme).
3. **Devin Wiki** — Repo otomatik indeksleme + mimari diagram. Deckent'te yok.
4. **Cloud IDE** — Browser'da canli kod editoru. Deckent CLI-bazli.
5. **Deploy Yetkinligi** — Production'a deploy. Deckent'te yok.

**Devin'in Deckent'e Gore Zayif Yanlari:**

1. Tek-agent — paralel coklu agent yok
2. Sprint/retrospektif sistemi yok — ogrenme sinirli
3. $20-500/ay — Deckent ucretsiz
4. Self-hosted yok
5. Multi-provider orkestrasyonu yok
6. Scope enforcement yok

**Deckent Icin Dersler:**
- Interactive planning (kullanici isbirligi) onemli UX iyilestirme
- Codebase Wiki/indeksleme (semantic search) buyuk avantaj
- Dynamic replanning (mid-sprint'te plan degisikligi) guclendirmek lazim

---

### E. Claude Agent SDK + Computer Use (Anthropic Ekosistemi)

**Genel:** Anthropic'in resmi agent SDK'si. Claude Code altyapisini kullanir. Mart 2026'da Computer Use Agent lansmani.

**Mimari:**

| Ozellik | Detay | Deckent Karsiligi |
|---------|-------|-------------------|
| Computer Use | Desktop kontrolu: tikla, yaz, uygulama ac | YOK |
| Agent SDK | Otonom agent olusturma altyapisi | MCP entegrasyonu |
| Worktree Isolation | Git worktree ile izole calisma | Scope enforcement |
| Background Agents | Paralel alt-gorev | Worker'lar (benzer) |
| Voice Mode | 20 dil sesli kontrol | YOK |
| Loop/Schedule | Cron-tarzı zamanlanmis gorevler | ✅ heartbeat-daemon.ts (Sprint 088) |
| Dispatch | Kullanici yokken otonom calisma | Sprint arka plan calismasi (benzer) |

**Deckent Icin Dersler:**
- Claude Agent SDK entegrasyonu dogal genisleme yolu
- Computer Use yetkinligi (browser, desktop) fark yaratir
- Loop/schedule (zamanlanmis gorevler) heartbeat daemon benzeri
- Worktree isolation zaten scope enforcement'ta var — guclendirilebilir

---

### F. Karsilastirma Matrisi

| Yetenek | OpenClaw | Cowork | Perplexity | Devin | Claude SDK | **Deckent** |
|---------|----------|--------|------------|-------|------------|-------------|
| **Acik Kaynak** | MIT | Hayir | Hayir | Hayir | SDK evet | **MIT** |
| **Self-Hosted** | Evet | Hayir | Hayir | Hayir | Kismi | **Evet** |
| **Fiyat** | Ucretsiz | M365 | $200/ay | $20/ay | API | **Ucretsiz** |
| **Multi-Agent Paralel** | Hayir | Sinirli | Evet | Hayir | Kismi | **Evet** |
| **Sprint Planlama** | Hayir | Hayir | Hayir | Hayir | Hayir | **Evet** |
| **Scope Enforcement** | Hayir | Hayir | Cloud | Hayir | Worktree | **Evet** |
| **Multi-Provider** | Hayir | 2 | 19 | Hayir | 1 | **3 (13 model, ModelRegistry)** |
| **Retrospektif/Ogrenme** | Sinirli | Hayir | Hayir | Wiki | Hayir | **Evet** |
| **MCP Native** | Hayir | Hayir | Hayir | Hayir | Evet | **Evet** |
| **Heartbeat Daemon** | 30dk | Hayir | Evet | Hayir | Loop | **✅ Evet (Sprint 088)** |
| **Human Checkpoints** | Hayir | Evet | Hayir | Evet | Hayir | **✅ Evet (Sprint 088)** |
| **Interactive Plan** | Hayir | Evet | Hayir | Evet | Hayir | **Hayir** |
| **Browser Kontrolu** | Evet | Hayir | Evet | Evet | Evet | **Hayir** |
| **Kanal Entegrasyonu** | 50+ | M365 | 400+ | Slack | Hayir | **Hayir** |
| **Codebase Indeks** | Hayir | Hayir | Hayir | Wiki | Hayir | **Hayir** |
| **Always-On** | Evet | Evet | Evet | Hayir | Dispatch | **Hayir** |
| **Uzun Sureli Gorev** | Evet | Evet | Gunler | Saatler | Saatler | **Sinirsiz (Sprint 088)** |
| **Skill Ekosistemi** | 13,729 | - | - | - | 5,700 | **21** |
| **Critique Layer** | Hayir | GPT+Claude | Hayir | Planner+Critic | Hayir | **Hayir** |
| **GitHub Stars** | 343K+ | - | - | - | - | **~0 (beta)** |
| **Community** | 1,000+ contrib | - | - | - | - | **1 (solo)** |

### G. Deckent'in Benzersiz Konumu

**Hicbir rakipte BIRLIKTE bulunmayan ozellikler:**
1. Multi-agent paralel calisma + scope enforcement + sprint planlama + retrospektif ogrenme + multi-provider + MCP native + acik kaynak + ucretsiz + self-hosted

**Stratejik pozisyon:** Deckent, "gelistirici takim orkestratoru" nisinde tek acik kaynak cozum. Rakipler ya tek-agent (Devin, OpenClaw) ya da kapali/pahali (Cowork, Perplexity).

**Buyume karsilastirmasi:**
- OpenClaw: 0 → 343K stars, 4 ayda. Yildiz/gun: ~2,860
- Deckent: Henuz acik kaynak olarak yayinlanmadi. Lansman stratejisi belirleyici olacak.

---

## Doğrulanmış Engeller

Her engel codebase'de dogrudan dogrulandi. Yanlis iddialar duzeltildi.

### ENGEL-1: OGRENME DONGUSU KIRIK — ✅ COZULDU (Sprint 091)

**Orijinal durum:** 3/4 alt-iddia dogruydu

| Alt-Iddia | Orijinal | Sprint 091 Cozumu |
|-----------|----------|-------------------|
| RuleEvolver kurallar uretir ama uygulamaz | **DOGRUYDU** | ✅ Evolved rules artik planSprint() icinde auto-applied olanlari agent/skill activation'a inject ediyor |
| Agent tiebreaker V2'de calismiyor | **DOGRUYDU** | ✅ getLearningBonus() ile learnings.json'dan okuyor (agent.json stats yerine) |
| Promotion/demotion execute edilmiyor | **DOGRUYDU** | ✅ pipeline.promote() ve pipeline.demote() artik cagrilyor |
| Quality score kullanilmiyor | **DOGRUYDU** | ✅ avgQualityScore routing bonus hesabina entegre edildi |
| Skill stats guncellenmez | **DOGRUYDU** | ✅ updateSkillStats() V1'de cagrilyor, RETRO'da skill tablosu olusturuluyor |
| Hard-coded sabitler | **DOGRUYDU** | ✅ LearningConfig'den okunuyor (minSamplesForBonus, recentSprintWindow) |

**Sonuc:** Ogrenme dongusu tamamen kapatildi. 8 kopuk nokta Sprint 091'de duzeltildi.

### ENGEL-2: INTENT CLASSIFIER STATIK (DOGRULANDI)

**Durum:** DOGRULANDI

- `intent-classifier.ts:10-44` — `INTENT_KEYWORDS`, `OPERATION_KEYWORDS`, `SCOPE_INTENT_SIGNALS` tamami `const` olarak tanimli
- `updateWeights()`, `learn()`, `feedback()` gibi dinamik fonksiyonlar YOK
- Keyword agirliklari 84 sprint boyunca hic degismedi
- Yanlis siniflandirma geri bildirimi icin mekanizma YOK

### ENGEL-3: SESSIZ HATA YUTMA — ✅ COZULDU (Sprint 085+086+087+088)

**Orijinal:** 49 sessiz catch blogu
**Cozum:** debugLog'a donusturuldu (Sprint 085: 15, Sprint 086: 14, Sprint 088: kalan ~20)
- Dönüştürülenler: cleanup(7), finalizeSprint(7), spawnWorkers(5), evaluateResults(5), planSprint(5), utility fonksiyonlari

### ENGEL-4: COVERAGE THRESHOLD — ✅ COZULDU (Sprint 086)

**Orijinal:** %90 hardcoded, config override yok
**Cozum:** `config.coverage_threshold` (varsayilan 90) — 6 dosya guncellendi:
- config-types.ts: DeckentConfig + ResolvedConfig'e field eklendi
- config.ts: defaults + loadConfig return'a eklendi
- result-evaluator.ts: evaluateResult() parametresi olarak aliniyor
- sprint-phases.ts: runEvaluatePhase() + runFixPhase() geciriyor
- sprint-controller.ts: config.coverage_threshold geciriyor

### Duzeltilen Yanlis Iddialar

| Iddia | Gercek | Kanit |
|-------|--------|-------|
| "AI planner fallback YOK" | **YANLIS** — `auto` modunda structured'a fallback VAR | sprint-controller.ts:601-643 |
| "Agent stats persist edilmiyor" | **YANLIS** — `updateAgentStats()` sprint sonunda cagirilir, agent.json'a yazilir | agent-pool.ts:344-371, sprint-controller.ts:1292 |
| "goNogo.goCriteria ignored" | **YANLIS** — Sinirli da olsa kontrol ediliyor | result-evaluator.ts:68-76 |

---

## Self-Improvement Yol Haritası

### FAZ 0: Gozlemlenebilirlik Temeli — ✅ TAMAMLANDI (Sprint 085)

- ✅ debugLog() 3-param overload + .brain/ERRORS.md (max 200 satir, append)
- ✅ Decision trail: .deckent/routing/decisions/decision-{sprint}-{task}.json
- ✅ applyEvolvedRules(): confidence >= 0.85 → manifest otomatik guncelleme + rollback
- ✅ getSynergyBonuses(): skill cift basari orani → routing bonus/penalty (+2/-2)

### FAZ 1: Ogrenme Dongusunu Kapat — ✅ TAMAMLANDI (Sprint 086)

- ✅ routeTaskV2 cagri yerlerine sprintId/taskId/projectRoot eklendi (decision trail aktif)
- ✅ 14 ek sessiz catch → debugLog (toplam 29/49 donusturuldu)
- ✅ coverage_threshold: hardcoded 90 → config.coverage_threshold (DeckentConfig + ResolvedConfig)
- ✅ INTENT_WEIGHTS: dinamik agirlik sistemi + updateIntentWeights() + loadIntentWeights()
- ✅ getWorstCombinations(5): AI planner prompt'una GECMIS SONUCLAR blogu eklendi
- ⚠️ Kalan tech debt: ~20 sessiz catch, task-router.ts cagri yeri, planner entegrasyon

### FAZ 2: Otonom Adaptasyon — ✅ TAMAMLANDI (Sprint 088+091)

**Hedef:** Sistem kendi yapisini degistirsin

**2.1 Adaptive Thresholds** — ✅ TAMAMLANDI (Sprint 088)
- ✅ applyAdaptiveThresholds() + getRecentSprintStats()
- ✅ NO_GO rate > %30 → agent_min_score otomatik dusur
- ✅ Coverage surekli dusuk → threshold'u proje ortalamasina ayarla
- ✅ `adaptive_thresholds: true` + `adaptive_config` ayarlanabilir

**2.2 Dinamik Model Secimi Iyilestirme** — ✅ TAMAMLANDI (Sprint 097 — ModelRegistry)
- ✅ ModelRegistry class: 13 model, 3 provider, tek kaynak (model-registry.ts)
- ✅ Tier-based routing: premium_plus/premium/standard/economy tier'lari
- ✅ Provider-agnostic config: brain_tier/worker_tier (model isimleri yerine)
- ✅ MODE_PRESETS: performance/balanced/economic/api stratejileri (mode-presets.ts)
- ✅ BUILTIN_MODELS katalogu: maliyet, hiz, context bilgileri
- ✅ Init wizard tier secimi: selectTiers() + tierToModel() refactor
- ⏳ Token kullanimi tracking (historicalTokenUsage) — Bolum X.I'de detayli is plani mevcut
- ⏳ Context-Aware Routing (context butcesi → model secimi → task parcalama) — Bolum X.I

**2.3 Mid-Sprint Reroute Guclendirme** — ✅ TAMAMLANDI (Sprint 088)
- ✅ Max reroute: config.max_reroutes (varsayilan 3)
- ✅ GO_WITH_TECH_DEBT'te reroute opsiyonu (config.reroute_on_tech_debt)
- ✅ Confidence threshold: sadece confidence > 0.7 ise reroute

**2.4 Agent/Skill Evrim Pipeline** — ✅ TAMAMLANDI (Sprint 091)
- ✅ Agent tiebreaker: learnings.json'dan getLearningBonus() ile okuyor
- ✅ Promotion/demotion: pipeline.promote() ve pipeline.demote() execute ediliyor
- ✅ Evolved rules: auto-applied kurallar activation'a inject ediliyor
- ✅ Skill stats: updateSkillStats() V1'de cagriliyor, RETRO'da skill tablosu
- ✅ Quality score: avgQualityScore routing bonus'a entegre
- ✅ Config-driven: LearningConfig'den minSamplesForBonus, recentSprintWindow okunuyor
- ✅ Integration test: evolution-pipeline.test.ts uctan uca test

### FAZ 3: Proaktif Sistem — ✅ KISMI TAMAMLANDI (Sprint 088)

**Hedef:** OpenClaw'daki heartbeat daemon modeli — sistem kendi basina calissin

**3.1 Heartbeat Daemon** — ✅ TAMAMLANDI (Sprint 088)
- ✅ `.deckent/HEARTBEAT.md` tarama dosyasi
- ✅ `HeartbeatDaemon` class: periyodik calistirma (configurable interval)
- ✅ `deckent heartbeat` CLI komutu (tek seferlik + daemon + stop)
- ✅ Sonuclar `.brain/heartbeat-log.md`'ye kaydedilir
- ⏳ Sonuclari kullaniciya bildir (Slack/terminal/dashboard) — henuz yok

**3.2 Always-On Gateway (Opsiyonel)** — ⏳ BEKLIYOR
- API server'i daemon olarak calistirma
- SSE ile surekli izleme
- Uzaktan kontrol: telefon/web uzerinden sprint baslat/durdur

**3.3 Multi-Sprint Zincirleme** — ⏳ BEKLIYOR
- Sprint A tamamlaninca otomatik Sprint B baslat
- DIRECTIVES.md'de `## Next Sprint:` blogu
- Uzun sureli gorevler: gunler boyunca calisan sprint zincirleri

### FAZ 4: Human-in-the-Loop — ✅ KISMI TAMAMLANDI (Sprint 088)

**Hedef:** Cowork/Devin seviyesinde insan isbirligi

**4.1 Worker Soru Sorma Mekanizmasi** — ⏳ BEKLIYOR
- Worker: `askBrain(question)` → Brain'e IPC mesaji
- Brain → kullaniciya soru ilet (CLI prompt / dashboard dialog / Slack)
- Cevap → worker'a dondur
- Timeout: 5dk cevap gelmezse varsayilan hareket

**4.2 Human Checkpoint'ler** — ✅ TAMAMLANDI (Sprint 088)
- ✅ Plan fazindan sonra: `waitForHumanApproval('plan', ...)` onay
- ✅ Evaluate fazindan sonra: `waitForHumanApproval('evaluate', ...)` onay
- ✅ Fix fazindan once: `waitForHumanApproval('fix', ...)` onay
- ✅ Configurable: `human_checkpoints: ['plan', 'evaluate', 'fix']`
- ✅ Dosya bazli approve/reject: `.deckent/checkpoints/` dizini
- ✅ `SprintStatus.ABORTED` — reddedilirse sprint durdurulur

**4.3 Interactive Planning** — ⏳ BEKLIYOR
- Devin modeli: kullanici ile karsilikli plan olusturma
- DIRECTIVES draft → AI oner → kullanici duzenle → finalize
- Dashboard'da plan editoru

### FAZ 5: Ekosistem Genisleme (4+ sprint)

**Hedef:** Perplexity/OpenClaw seviyesinde entegrasyon genisligi

**5.1 Kanal Entegrasyonlari**
- Slack bot: sprint durumu, bildirim, komut
- GitHub Issues/PR entegrasyonu: issue → otomatik task
- Linear/Jira: ticket → DIRECTIVES

**5.2 Codebase Semantik Indeksleme**
- Devin Wiki benzeri: repo otomatik indeksleme
- AST-based dependency graph
- "Bu dosyayi degistirirsen su dosyalar etkilenir" bilgisi
- RAG ile worker context zenginlestirme

**5.3 Critique Layer (Cowork Modeli)**
- Model A yazar, Model B dogrular
- result-evaluator.ts'de AI-powered degerlendirme
- Worker'in kendi kodunu farkli provider ile review ettirme

**5.4 Browser/Computer Use**
- Claude Computer Use SDK entegrasyonu
- Web uygulamasi test otomasyonu
- UI/UX review (screenshot analizi)

**5.5 Provider Genisleme**
- Grok, Llama, Mistral, DeepSeek adaptorler
- 13 → 19+ model destegi (ModelRegistry altyapisi hazir — Sprint 097)
- Perplexity'nin 19 model modeline yaklasma

### Öncelik Matrisi

```
                    ETKI (is degeri)
              DUSUK         YUKSEK
         ┌────────────┬────────────┐
  KOLAY  │ P3         │ P1         │
  EFOR   │ Coverage   │ Kural      │
  (1-2   │ config     │ auto-apply │
  sprint)│ Hata log   │ Synergy →  │
         │            │ router     │
         ├────────────┼────────────┤
  ZOR    │ P4         │ P0         │
  EFOR   │ Browser    │ Ogrenme    │
  (3+    │ control    │ dongusu    │
  sprint)│ Dagitik    │ Heartbeat  │
         │ workers    │ HitL       │
         └────────────┴────────────┘
```

#### P0 — ✅ TAMAMLANDI (Sprint 085)
1. ~~Yapilandirilmis hata loglama~~ → debugLog + .brain/ERRORS.md
2. ~~Karar loglama (decision trail)~~ → .deckent/routing/decisions/ JSON
3. ~~Kural auto-apply pipeline~~ → applyEvolvedRules() + rollback
4. ~~Synergy matrix → routing engine~~ → getSynergyBonuses() entegre

#### P1 — ✅ TAMAMLANDI (Sprint 086)
5. ~~Intent classifier feedback loop~~ → INTENT_WEIGHTS + updateIntentWeights()
6. ~~Planner'a gecmis bilgisi~~ → getWorstCombinations() + prompt blogu
7. ~~Coverage threshold config~~ → config.coverage_threshold
8. ~~Tech debt kapatma~~ → routeTaskV2 cagri yerleri + 14 catch
- ⏳ Adaptive thresholds → JSDoc eklendi, implementasyon Faz 2'de
- ⏳ Mid-sprint reroute guclendirme → Faz 2'de

#### P2 — ✅ TAMAMLANDI (Sprint 088+091+097)
9. ✅ ~~Adaptive thresholds (NO_GO rate bazli otomatik ayar)~~ → Sprint 088
10. ✅ ~~Mid-sprint reroute guclendirme (1 → 3, configurable)~~ → Sprint 088
11. ✅ ~~Heartbeat daemon (OpenClaw modeli, proaktif calisma)~~ → Sprint 088
12. ✅ ~~Human checkpoint'ler (plan + evaluate fazlarinda onay)~~ → Sprint 088
13. ✅ ~~Kalan sessiz catch → debugLog~~ → Sprint 085-088 (tamamlandi)
13b. ✅ ~~Sprint timeout reform (sinirsiz calisma)~~ → Sprint 088
14. ✅ ~~ModelRegistry + tier-based routing (13 model, 3 provider)~~ → Sprint 097

#### P3 — ORTA VADE (5-10 sprint)
14. Worker soru sorma mekanizmasi (askBrain IPC)
15. Interactive planning (kullanici-AI isbirlikci plan)
16. Codebase semantik indeksleme (AST + RAG)
17. Kanal entegrasyonlari (Slack, GitHub Issues)
18. Otomatik agent olusturma pipeline
19. **Context-Aware Routing** — context butcesi tahmini, model limit karsilastirma, task parcalama (Bolum X.I)
20. **Token Usage Tracker** — JSONL parse, provider-native sayim, RETRO.md token summary (Bolum X.I)

#### P4 — UZUN VADE (10-15 sprint)
19. Critique layer (multi-model dogrulama, Cowork modeli)
20. Multi-sprint zincirleme (gunlerce calisan gorevler)
21. Browser/Computer Use (Claude SDK entegrasyonu)
22. Provider genisleme (Grok, Llama, Mistral, DeepSeek)
23. Always-on gateway (daemon modu)

---

## Sprint Metrikleri

### Tamamlanan Hedefler (Sprint 085 + 086)

| Hedef | Durum | Sprint | Detay |
|-------|-------|--------|-------|
| Yapilandirilmis hata loglama | ✅ DONE | 085 | debugLog 3-param overload, .brain/ERRORS.md (max 200 satir) |
| Karar loglama (decision trail) | ✅ DONE | 085+086 | .deckent/routing/decisions/ JSON + cagri yerleri sprintId/taskId eklendi |
| Kural auto-apply pipeline | ✅ DONE | 085 | applyEvolvedRules() confidence>=0.85 → manifest, rollback JSON |
| Synergy matrix → routing | ✅ DONE | 085 | getSynergyBonuses() +2/-2 bonus/penalty, min 5 ornek |
| routeTaskV2 cagri yerleri | ✅ DONE | 086 | task-router.ts + mid-sprint-adapter.ts + sprint-controller.ts guncellendi |
| 14 ek catch → debugLog | ✅ DONE | 086 | cleanup(7) + finalizeSprint(7) fonksiyonlari |
| Coverage threshold config | ✅ DONE | 086 | config.coverage_threshold (varsayilan 90), 6 dosya guncellendi |
| Intent classifier feedback | ✅ DONE | 086 | INTENT_WEIGHTS Map + updateIntentWeights() + loadIntentWeights() |
| Planner'a gecmis bilgisi | ✅ DONE | 086 | getWorstCombinations(5) + AI prompt GECMIS SONUCLAR blogu |
| Adaptive thresholds | ✅ DONE | 088 | applyAdaptiveThresholds() + getRecentSprintStats() |

### Sprint 085 Metrikleri
- **Kod:** +400 / -37 satir
- **Sure:** 25dk 22s
- **Sonuc:** 4/4 tamamlandi (2 DONE, 2 GO_WITH_TECH_DEBT)
- **Yeni dosyalar:** .brain/ERRORS.md, .deckent/routing/decisions/, .deckent/routing/applied-rules.json

### Sprint 086 Metrikleri
- **Kod:** +172 / -21 satir
- **Sure:** 25dk 4s
- **Sonuc:** 4/4 tamamlandi (2 DONE, 2 GO_WITH_TECH_DEBT)
- **Yeni dosyalar:** .deckent/routing/intent-weights.json

### Sprint 097 Metrikleri
- **Kapsam:** ModelRegistry + Provider Config Evrimi (Enterprise Refactor)
- **Task:** 10 task (tümü GO_WITH_TECH_DEBT)
- **Yeni dosyalar:** src/core/model-registry.ts, src/core/mode-presets.ts
- **Onemli degisiklikler:**
  - ModelRegistry class: 13 model, 3 provider, tek kaynak
  - Tier-based routing: premium_plus/premium/standard/economy
  - Provider-agnostic config: brain_tier/worker_tier
  - Init wizard refactor: selectTiers() + tierToModel()
  - Codex + Gemini adapter CLI uyumluluk guncellemeleri

### Sprint 098 Metrikleri
- **Kapsam:** Dokümantasyon + Sprint Output + History Fix
- **Task:** 5/5 (tümü GO_WITH_TECH_DEBT)
- **Süre:** 8dk 25sn
- **Kod:** +77 / -56 satır
- **Önemli değişiklikler:**
  - MCP history tool .brain/archive/ okuyor (85 sprint log erişilebilir)
  - sprint-reporter.ts debug log eklendi (evaluations map debug)
  - ANALYSIS, README, DECKENT.md ModelRegistry güncellemeleri

### Sprint 099 Metrikleri
- **Kapsam:** RETRO Debug + Job Output Reform + Docs Güncelleme
- **Task:** 5/5 (tümü GO_WITH_TECH_DEBT)
- **Süre:** 16dk 16sn
- **Kod:** +77 / -56 satır
- **Önemli değişiklikler:**
  - RETRO Done Sayacı: evaluations map debug eklendi (Sprint 093 fix doğrulandı)
  - Job Output Reform: finalizeSprint() job summary zenginleştirildi
  - VISION.md + health-check.md + roadmap.md sayı güncellemeleri
  - README sprint badge 97+ → 98+ güncellendi
  - PROJECT-IDENTITY.md Test Count 12 → 12,193+ düzeltildi

### Sprint 100 Metrikleri
- **Kapsam:** Docs sayı güncellemeleri (Sprint 100 numaraları)
- **Güncellenen dosyalar:** docs/architecture/architecture.md, docs/ANALYSIS-2026-04-02.md
- **Önemli değişiklikler:**
  - architecture.md: Version Sprint 100+, CLI 35+, orchestra 63 modules, MCP 20 tools
  - ANALYSIS: Toplam Sprint 100, test 12,051+, orchestra 55, CLI 35+, MCP 20 tool
  - Sonuç bölümü Sprint 100 sonrası olarak güncellendi

### Sprint 101 Metrikleri
- **Kapsam:** Sprint Lock + Result Timeout + autoApprove + Docker Backend
- **Task:** 4/10 (2 DONE, 2 GO_WITH_TECH_DEBT, 6 NO_GO)
- **Sure:** ~42dk
- **Onemli degisiklikler:**
  - Sprint lock mekanizmasi (coklu process cakisma engeli)
  - autoApprove=true standart hale getirildi
  - Docker Spawn Backend + MockSpawnBackend + E2E Sprint Lifecycle Tests
  - README/DECKENT.md usage temizligi + flaky test fix

### Sprint 102 Metrikleri
- **Kapsam:** Tech Debt Fix (098 borclari) + Docker Smoke Test
- **Task:** 0/6 (tumu NO_GO — worker timeout)
- **Sure:** 12dk 9sn
- **Not:** Tum worker'lar zaman asimina ugradi, sprint rollback yapildi

### Kalan Tech Debt
1. ~~**085-001-debt (kısmi)**~~: ✅ Tamamlandi — sessiz catch'ler Sprint 085-088'de debugLog'a donusturuldu
2. ~~**086-001-debt**~~: ✅ Tamamlandi — routeTaskV2 cagri yerleri Sprint 086'da guncellendi
3. ~~**086-003-debt**~~: ✅ Tamamlandi — planner entegrasyonu Sprint 086'da tamamlandi
4. **Token kullanimi tracking** — historicalTokenUsage henuz implement edilmedi (ModelRegistry altyapisi hazir, Bolum X.I'de is plani)

---

## Sprint History
| Sprint | Durum |
|--------|-------|
| sprint-116 | tamamlandı |
| sprint-117 | tamamlandı |
| sprint-118 | tamamlandı |
| sprint-119 | tamamlandı |
| sprint-120 | tamamlandı |
| sprint-121 | tamamlandı |
| sprint-122 | tamamlandı |
| sprint-123 | tamamlandı |

## Bug Tracker

### Sprint 070 — Init UX Overhaul (15 fix)

| Bug | Açıklama | Fix |
|-----|----------|-----|
| BUG-3 | Claude CLI spawn ENOENT (Windows) | `shell: process.platform === 'win32'` — 7 dosyada |
| BUG-4 | Worker rules hardcoded `tsc --noEmit` | `detectFullStack()` sonucunu worker rules'a aktar |
| BUG-6 | Stack detection `Language: unknown` | Stack detection HER ZAMAN çalıştır |
| BUG-7 | Doctor FAIL+OK çelişkisi | FAIL → SKIP etiketi (optional provider'lar) |
| BUG-8 | Framework `next` (fastapi olmalı) | Python/Go/Rust projede JS framework algılama atla |
| BUG-9 | IDENTITY.md dosyası eksik | Init'te workspace IDENTITY.md oluştur |
| BUG-10 | DECKENT.md `Build: tsc` (Python projede) | `!== undefined` kontrolü + `echo "no build step"` |
| BUG-11 | DIRECTIVES.md boş placeholder | Stack-aware örnek task formatı + TR/EN şablon |
| BUG-12 | Worker rules hardcoded `npx vitest run` | `detectFullStack().commands.test` kullan |
| BUG-13 | Brain rules yanlış limitler | 200→300, 600→900 |
| BUG-14 | TempAgent oluşturulmuyor | `detectedLanguages` ile genişletilmiş eşleşme |
| BUG-15 | BOOT.md kullanıcı ipucu yok | Kullanıcı-dostu açıklama + ipuçları (TR/EN) |
| BUG-16 | `ps: unknown option -- o` (Windows) | `process.platform !== 'win32'` guard |
| BUG-18 | MCP binary adı tutarsız | Dokümantasyon: `deckent-mcp` ayrı binary |

### Sprint 071 — Dogfooding Bug Fixes (7 fix + upgrade)

| Bug | Açıklama | Fix |
|-----|----------|-----|
| BUG-19 | UTF-8 encoding Windows | LANG + PYTHONIOENCODING env vars subprocess'e eklendi |
| BUG-21 | Doctor healthScore=0 tüm check passed | `c.ok` → `c.passed` field mismatch düzeltildi |
| BUG-22 | Review "No tasks found" sprint sonrası | `loadTaskResults()` archive/ fallback eklendi |
| BUG-23 | Heartbeat 28x stale, sequence=1 | setInterval 15s periyodik heartbeat update |
| BUG-24 | Worker .result dosyası yazmıyor | Fallback .result on child exit |
| BUG-25 | Scope parser Files/Scope ignorluyor | Explicit `Files:` / `Scope:` label parsing |
| BUG-26 | Task log boş (Windows) | closeSync(logFd) child exit handler'a taşındı |
| — | Versiyon bump + upgrade --local | `deckent upgrade --local <path.tgz>` beta workflow |

### Sprint 070 — Yeni Özellikler

| Özellik | Açıklama |
|---------|----------|
| `.deckent/workspace/IDENTITY.md` | Stack detection sonuçlarıyla dolu proje kimliği |
| `.deckent/docs/quick-start.md` | 5 adımda ilk sprint rehberi (TR/EN) |
| `.deckent/docs/directives-guide.md` | DIRECTIVES format rehberi + alan açıklamaları |
| `.deckent/docs/config-reference.md` | Tüm config.json ayarları referansı |
| TempSkill init'te | `project-conventions` skill otomatik oluşturuluyor |
| TempAgent init'te | Proje stack'ine göre temp agent'lar oluşturuluyor |
| DECKENT.md Workflow | Workflow adımları, DIRECTIVES format, Providers bölümü |
| Worker prompt stack-aware | Hardcoded `tsc`/`vitest` yerine DECKENT.md referansı |
| allowedTools genişletme | `Edit`, `Glob`, `Grep` worker tool'larına eklendi |

### Bilinen Açık Bug'lar

| Bug | Açıklama | Önem | Not |
|-----|----------|------|-----|
| BUG-17 | Worker .result yazmıyor (orijinal) | Low | BUG-24 fallback ile kısmen çözüldü |
| BUG-20 | İzin dialogu worker'ı yavaşlatıyor | Low | `--dangerously-skip-permissions` ile bypass edilebilir |

---

## Docker & Altyapı

### A. Bulunan ve Duzeltilen 3 Kritik Sorun

| Sorun | Kök Neden | Çözüm |
|-------|-----------|-------|
| Container auth fail | `~/.cache/claude/` mount → credentials `~/.claude/.credentials.json`'da | `~/.claude/` mount |
| `--dangerously-skip-permissions` blocked | Container root olarak çalışıyor, Claude CLI root'ta engelliyor | `--user uid:gid` ile non-root |
| Config uyarıları | `~/.claude.json` mount edilmiyordu | Conditional `.claude.json` mount |

### B. E2E Test Sonuclari

- **Tek worker**: `.result` dosyası container'dan host'a ulaştı ✅
- **2 paralel worker**: Her ikisi de bağımsız başarılı ✅
- **Container auto-cleanup**: `docker wait` + `docker rm -f` ✅
- **Heartbeat**: `exitCode: 0`, `status: DONE`, `backend: docker` ✅
- **Timeout marker**: Başarılı işte oluşmadı ✅

### C. Sprint 103 Sonuclari (7 Task)

| Sonuç | Sayı | Detay |
|-------|------|-------|
| DONE | 5 | ANALYSIS güncelleme, README badge, module sayıları, Docker test, Docker rehber |
| NO_GO | 1 | don't-ask mode → Edit/Write izni yok (debt-098-001) |
| GO_WITH_TECH_DEBT | 1 | Zaten çözülmüş debt, sadece DEBT.md marking kaldı |

### D. Eklenen Yeni Ozellikler

1. **`checkDocker()`** — Doctor'a Docker daemon + worker image kontrolü (14 check)
2. **Init Docker algılama** — Docker varsa otomatik `spawn_backend: docker` set
3. **`tests/e2e/docker-backend.test.ts`** — 10 integration test (spawn, heartbeat, cleanup, concurrent, log extraction)
4. **`docs/guide/docker-backend.md`** — 362 satır kapsamlı rehber

### E. Container Exit Code Analizi (Sprint 103 Test Container'lari)

| Exit Code | Anlam | Sayı | Detay |
|-----------|-------|------|-------|
| 0 | Başarılı | 1 | debug2 container |
| 137 | SIGKILL (timeout) | 8 | Test timeout sonrası kill |

### F. Tespit Edilen ve Cozulen Sorunlar

| # | Sorun | Durum | Cozum |
|---|-------|-------|-------|
| 1 | MCP server eski dist/ cache'liyor | ⚠️ Bilinen | `tsc` sonrasi MCP restart gerekli (dynamic import ESM'de cache bypass etmiyor) |
| 2 | Worker don't-ask mode | ✅ **COZULDU** | MCP start `autoApprove: default(true)` — commit `574ef65` |
| 3 | autoApprove gecmiyor | ✅ **COZULDU** | MCP start default(false)→default(true) — commit `574ef65` |
| 4 | Worker .result birakmadan cikiyor | ✅ **COZULDU** | Shell EXIT trap eklendi (tmux + docker) — commit `c5d2c89` |
| 5 | Config revert (spawn_backend siliniyor) | ✅ **COZULDU** | `updateLastSprintId()` null guard — commit `574ef65` |
| 6 | MCP run worker spawn etmiyor | ✅ **COZULDU** | `buildWorkerPrompt` + `SpawnBackendFactory` eklendi — commit `574ef65` |
| 7 | Docker auth mount yanlis | ✅ **COZULDU** | `~/.cache/claude/`→`~/.claude/` + non-root — commit `e807891` |
| 8 | Doctor Docker check eksik | ✅ **COZULDU** | `checkDocker()` eklendi — commit `e807891` |
| 9 | debt-098-001 duplicate ID | ✅ **COZULDU** | `debtId` guard eklendi — commit `5080d16` |

### G. `deckent run` Test Sonuclari

**Onceki durum (fix oncesi):**

| Yontem | Model | Sonuc | Detay |
|--------|-------|-------|-------|
| MCP `deckent_run` | sonnet | **TIMEOUT** | Worker spawn edilmiyordu (sadece JSON yaziyordu) |
| CLI `deckent run --auto-approve` | haiku | **TIMEOUT** | EXIT trap yoktu, .result birakmiyordu |

**Sonraki durum (fix sonrasi — dogrulama bekliyor):**
- MCP run: `SpawnBackendFactory` ile config-aware worker spawn
- EXIT trap: worker crash/timeout durumunda fallback NO_GO result
- autoApprove: `default(true)` — `--dangerously-skip-permissions` otomatik

### H. Guncel Is Plani (Sprint 104+)

**Oncelik 1 — Docker Sprint Canli Dogrulama**
1. ✅ MCP server restart sonrasi Docker sprint canli testi (Sprint 120-122)
2. ✅ `deckent run` MCP + CLI canli dogrulama (Sprint 121 CLI exit 0, Sprint 122 MCP reconnect OK)
3. ✅ Docker container timeout config'den okunuyor (`docker_timeout` config.json'da, varsayilan 1200s)

**Oncelik 2 — Beta Hazirligi**
4. ✅ README Docker backend bolumu + Quick Start (README.md:387-405, docs/guide/docker-backend.md)
5. ✅ Version bump 0.4.0-beta.1 (zaten yapildi)
6. ✅ CLI/MCP start parity (iki taraf da config.spawn_backend okuyor, MCP doctor skip dokumante)

**Oncelik 3 — Ozellik Genisleme**
7. ⏳ Hibrit backend (Docker worker + subprocess auditor) — ADR yazilacak
8. ⏳ Dashboard Docker container status goruntuleme
9. ✅ spawnWorkerMultiProvider config-aware (config.spawn_backend + docker_image + docker_timeout okuyor)

### Oturum Kapanisi (7 Nisan 2026 — 10 commit)

Bu oturumda Docker backend canli ortamda calisir hale getirildi. Ozet:

| Kategori | Detay |
|----------|-------|
| Commit | 10 (3 feat, 6 fix, 1 docs) |
| Yeni dosya | `tests/e2e/docker-backend.test.ts` (7 test), `docs/guide/docker-backend.md` (362 satir) |
| CI | ❌ 3 fail → ✅ 19/19 GREEN |
| Debt | 2 acik → 0 acik |
| Test | 12,062 pass, 0 fail |
| Coverage | 90% line, 89% branch, 95% function |

**Kritik fixler:** Docker auth (3 fix), Worker EXIT trap (.result garantisi), Config revert guard, MCP autoApprove default(true), MCP run worker spawn, MockSpawnBackend CI crash.

### Oturum Ozeti (8-9 Nisan 2026 — Docker Canli Dogrulama)

Docker backend canli E2E sprint dogrulamasi Sprint 119-122 boyunca tamamlandi. Ozet:

| Kategori | Detay |
|----------|-------|
| Sprint | 119 (NO_GO), 120 (NO_GO), 121 (CLI GO), 122 (MCP GO) |
| Docker test | 7 → 10 e2e test (log extraction, monitor updates) |
| CI fix | Coverage job Docker e2e `skipIf(!dockerAvailable)` guard eklendi |
| Canli sonuc | CLI exit 0 dogrulandi, MCP reconnect dogrulandi, smoke dosyalari olusturuldu |
| Dosyalar | `docs/docker-smoke/cli-test.md`, `docs/docker-smoke/mcp-ok.md` |

**Onemli tespit:** Sprint 119-120 Docker worker result dosyasi birakmadan cikti — MCP cache sorunu olarak tanimlandi. MCP server restart + CLI fallback sonrasi Sprint 121 CLI ve Sprint 122 MCP basarili oldu.

### I. Token Kullanim Analizi + Context-Aware Routing Is Plani

#### Mevcut Durum (7 Nisan 2026 — Gercek JSONL Verisi)

**Son 30 gun gercek token kullanimi** (Claude Code JSONL transcript parse):

| Metrik | Deger |
|--------|-------|
| Session sayisi | 1,189 (1,001'inde usage verisi) |
| API cagrisi | 56,713 |
| Input tokens | 1.6M |
| Output tokens | 13.0M |
| Cache write tokens | 176.2M |
| Cache read tokens | 5,084.9M |
| **Toplam (cache dahil)** | **5.28 Milyar token** |

**Model bazli dagilim:**

| Model | Input | Output | Cache Read | API Cagrisi | API Maliyeti |
|-------|-------|--------|------------|-------------|--------------|
| Opus 4.6 | 1.18M | 6.92M | 3,677M | 32,253 | $9,527 |
| Sonnet 4.6 | 0.32M | 5.50M | 1,253M | 21,525 | $669 |
| Haiku 4.5 | 0.07M | 0.57M | 154M | 2,885 | $8 |

**Cache etkisi:**

| Senaryo | Maliyet |
|---------|---------|
| Cache ile (gercek) | $10,212 |
| Cache olmasaydi | $61,468 |
| Cache tasarrufu | $51,256 (%83 indirim) |
| Claude Code Max Plan | $200 |
| **ROI** | **51x** |

**Kritik metrikleri:**
- Ortalama API cagri basina: 89,666 token cache'den, 28 token yeni input, 229 token output
- Context'in %97'si cache'den geliyor
- Cache hit orani: %99.9
- Max cache read: 553,047 token (tek cagri)
- Haftalik trend: +%122 artis (Deckent sprint yogunlugu artiyor)

#### Sorun: Cache ≠ Context Tasarrufu

Cache sadece maliyet azaltir — tokenlar yine context window'da yer kaplar:
- 90K token cache'den okunsa bile model o 90K'yi "goruyor"
- Opus/Sonnet 4.6: 200K context limit
- Uzun conversation'larda context compression devreye giriyor → bilgi kaybi

#### Is Plani: Context-Aware Routing (Sprint 104+)

**Katman 1: Context Estimator**
- Task basina context butcesi tahmini
- System prompt boyutu (CLAUDE.md + rules + skill prompts) hesapla
- Task scope dosyalarinin toplam token sayisini tahmin et
- Beklenen tool call overhead'i ekle
- Mevcut `token-counter.ts` (orphan, test'li) aktive edilecek

**Katman 2: Context-Aware Router**
- `task-router.ts`'e context boyutunu faktor olarak ekle
- ModelRegistry'ye `contextLimit` alani ekle (her model icin)
- Routing karari: Budget < %75 model limit → bu model OK, degilse yukselt veya parcala
- Karar mantigi:
  ```
  Budget < 150K → Sonnet 200K (ucuz, yeterli)
  Budget 150K-180K → Opus 200K (daha akilli, sikiisik)
  Budget > 180K → Task'i PARCALA veya 1M context modele yonlendir
  Budget > 800K → Kesinlikle parcala
  ```

**Katman 3: Task Splitter**
- Context butcesi model limitini astiginda otomatik scope bolme
- Dosya gruplamasina gore alt-task'lar olustur
- Her alt-task bagimsiz calisabilir olmali (shared context minimize)

**Katman 4: Token Usage Tracker (Sprint Reporter Entegrasyonu)**
- Worker result dosyasina `tokenUsage` alani ekle:
  ```json
  { "inputTokens": 15420, "outputTokens": 3200, "provider": "claude", "model": "opus" }
  ```
- Claude: JSONL transcript'ten post-hoc parse
- Gemini: Mevcut `parseGeminiOutput()` sonucunu kaydet (zaten parse ediyor)
- Codex: API response usage alanini yakala
- Sprint reporter'a token summary tablosu ekle (RETRO.md)

**Tahmini efor:** 3-4 sprint (Katman 1-2 oncelikli, Katman 3-4 sonraki fazda)

---

## Başarı Metrikleri & Risk

### Self-Improvement Olcumleri
| Metrik | Sprint 084 Oncesi | Sprint 086 Sonrasi | Hedef (10 sprint) | Olcum |
|--------|-------------------|--------------------|--------------------|-------|
| Sprint NO_GO rate | ~%15 | %0 (085+086) | <%5 | Sprint retro |
| Agent secim accuracy | Bilinmiyor | Olculebilir (decision trail) | >%85 | Decision JSON |
| Otomatik uygulanan kural | 0 | Altyapi hazir | 5+ per sprint | applied-rules.json |
| Intent classifier ogrenme | Yok | updateIntentWeights() aktif | <%10 yanlis | intent-weights.json |
| Sessiz hata | 49 | ~20 | 0 | grep count |
| Planner gecmis bilgisi | Yok | getWorstCombinations() | Her sprint | Planner prompt |
| Coverage threshold | Hardcoded %90 | Config'den okunuyor | Proje-bazli | config.json |

### Otonomi Olcumleri
| Metrik | Mevcut | Hedef (15 sprint) | Olcum |
|--------|--------|-------------------|-------|
| Insan mudahale / sprint | ~3-5 | <1 | Sprint log |
| Proaktif gorev sayisi | ✅ Daemon aktif | 5+ / gun | Heartbeat log |
| Self-heal orani | %0 | >%50 | Auto-fix / total error |
| Cross-sprint ogrenme | Minimal | Tam | Memory recall accuracy |

### Rakip Yakinlastirma
| Metrik | Mevcut | Hedef | Referans Rakip |
|--------|--------|-------|----------------|
| Skill/entegrasyon sayisi | 21 | 50+ | OpenClaw (13,729) |
| Model sayisi | 13 (ModelRegistry) | 15+ | Perplexity (19) |
| Kanal entegrasyonu | 0 | 5+ | OpenClaw (50+) |
| Human checkpoint | ✅ 3 faz (Sprint 088) | 3+ faz | Cowork |
| Codebase indeks | Yok | AST+RAG | Devin Wiki |

### Risk Analizi

| Risk | Olasilik | Etki | Azaltma |
|------|----------|------|---------|
| Auto-apply kurallar sistemi bozarsa | Dusuk | Yuksek | Kural versiyonlama + rollback + sandbox test |
| Heartbeat daemon kaynak tuketimi | Orta | Orta | Configurable interval, idle detection |
| Human checkpoint UX friction | Yuksek | Orta | Progressive disclosure, smart defaults |
| Intent feedback yanlis ogrenme | Orta | Yuksek | Minimum sample (10+), slow decay |
| Multi-sprint zincirleme sonsuz dongu | Dusuk | Yuksek | Max chain depth, cost guard |
| Browser control guvenlik acigi | Orta | Yuksek | Sandbox, permission system |

---

## Stratejik Konumlandırma

### ✅ Kisa Vade — TAMAMLANDI (Sprint 085-086): "Ogrenen Orkestrator"
- ✅ Ogrenme dongusu kapatildi (rule auto-apply + synergy + intent feedback + planner gecmis)
- ✅ Kurallar otomatik evrilir (applyEvolvedRules, confidence >= 0.85)
- ✅ Karar loglama + gozlemlenebilirlik (decision trail + .brain/ERRORS.md)
- ✅ Intent classifier sonuclardan ogreniyor (INTENT_WEIGHTS)
- **Rakiplerden farki:** Hicbir rakip (OpenClaw, Devin, Perplexity, Cowork) ogrenme dongusu kapatmis degil

### ✅ Orta Vade — TAMAMLANDI (Sprint 087-097): "Proaktif Gelistirici Asistani"
- ✅ Heartbeat daemon ile proaktif calisma (OpenClaw modeli) — Sprint 088
- ✅ Human checkpoint'ler ile guvenilir otonomi (Cowork modeli) — Sprint 088
- ✅ Sprint timeout reform — sinirsiz sureli calisma — Sprint 088
- ✅ Adaptive thresholds (NO_GO rate bazli otomatik ayar) — Sprint 088
- ✅ Mid-sprint reroute guclendirme (max 3 deneme) — Sprint 088
- ✅ Agent/Skill Evrim Pipeline (promotion/demotion, evolved rules) — Sprint 091
- ✅ ModelRegistry + tier-based routing (13 model, 3 provider, tek kaynak) — Sprint 097
- ⏳ Slack/GitHub entegrasyonlari
- **Rakiplerden farki:** Multi-agent + ogrenme + proaktif + checkpoints + acik kaynak

### Uzun Vade (Sprint 103-115): "Otonom Yazilim Takimi"
- Codebase semantik anlayis (Devin Wiki modeli)
- Critique layer ile cok-modelli dogrulama (Cowork modeli)
- Browser/desktop kontrol (Claude Computer Use)
- Multi-sprint zincirleme (gunlerce calisan gorevler, Perplexity modeli)
- Provider genisleme: Grok, Llama, Mistral, DeepSeek (ModelRegistry altyapisi hazir)
- **Rakiplerden farki:** Tam takim simulasyonu — tek kisiden cok ekip

---

## Sonuç

**Deckent'in mevcut durumu (Sprint 122 sonrasi, v0.4.0-beta.1):**
- 122+ sprint, 12,193+ test (413 dashboard), 96% coverage
- 16 built-in agent (+2 temp), 21 built-in skill
- 13 model, 3 provider (Claude, Codex, Gemini), ModelRegistry ile tek kaynak
- 20 MCP tool + 8 resource, 35+ CLI komutu
- Self-improving routing AKTIF (kural evrimi, synergy, intent ogrenme, planner gecmis)
- Decision trail ile tam gozlemlenebilirlik
- ✅ Heartbeat Daemon AKTIF (proaktif gorev calistirma) — Sprint 088
- ✅ Human Checkpoints AKTIF (plan/evaluate/fix onay noktalari) — Sprint 088
- ✅ Sprint Timeout Reform (sinirsiz calisma destegi) — Sprint 088
- ✅ Adaptive Thresholds (NO_GO rate bazli otomatik ayar) — Sprint 088
- ✅ Mid-Sprint Reroute (max 3, configurable) — Sprint 088
- ✅ Agent/Skill Evrim Pipeline (promotion/demotion, evolved rules) — Sprint 091
- ✅ ModelRegistry + Tier-Based Routing (13 model, 3 provider) — Sprint 097
- ✅ Provider-Agnostic Config (brain_tier/worker_tier) — Sprint 097
- ✅ Docker Spawn Backend (container-based worker isolation) — Sprint 101
- ✅ Sprint Lock Mekanizmasi (coklu process cakisma engeli) — Sprint 101

**Tamamlanan stratejik hedefler (Sprint 085-103+):**
1. ✅ **Ogrenme dongusunu kapat** — rule auto-apply + synergy → router + intent feedback + planner gecmis (Sprint 085-086)
2. ✅ **Gozlemlenebilirlik** — sessiz catch → debugLog + decision trail + .brain/ERRORS.md (Sprint 085-088)
3. ✅ **Coverage config** — hardcoded %90 → config.coverage_threshold (Sprint 086)
4. ✅ **Heartbeat daemon** — OpenClaw modelinden proaktif calisma (Sprint 088)
5. ✅ **Human checkpoint'ler** — sprint fazlarinda insan onay noktalari (Sprint 088)
6. ✅ **Sprint timeout reform** — sinirsiz sureli sprint destegi (Sprint 088)
7. ✅ **Adaptive thresholds** — NO_GO rate bazli otomatik score ayarlama (Sprint 088)
8. ✅ **Mid-sprint reroute guclendirme** — max 3 deneme, configurable (Sprint 088)
9. ✅ **Agent/Skill evrim pipeline** — promotion/demotion execute, evolved rules inject (Sprint 091)
10. ✅ **ModelRegistry** — 13 model, 3 provider, tier-based routing, tek kaynak (Sprint 097)
11. ✅ **Sprint History Fix** — MCP history tool .brain/archive/ okuyor, 85+ sprint log erisilebilir (Sprint 098)
12. ✅ **Job Output Reform** — finalizeSprint() detayli gerekce/metrik/kanit (Sprint 099)
13. ✅ **Docs Surekli Guncel** — ANALYSIS, README, VISION, architecture sayilari tutarli (Sprint 098-100)
14. ✅ **Docker Spawn Backend** — container-based worker isolation, MockSpawnBackend, E2E tests (Sprint 101)
15. ✅ **Sprint Lock Mekanizmasi** — coklu process cakisma engeli, autoApprove standart (Sprint 101)
16. ✅ **Docker Canli E2E Dogrulama** — CLI+MCP sprint test, CI coverage skip guard, 10 e2e test (Sprint 119-122)

**Siradaki 4 aksiyon (P3):**
1. **Context-Aware Routing** — context butcesi tahmini → model secimi → task parcalama (Bolum X.I)
2. **Token Usage Tracker** — JSONL parse + provider-native sayim + RETRO.md token summary (Bolum X.I)
3. **Worker soru sorma mekanizmasi** — askBrain IPC, kullanici-worker iletisim
4. **Codebase semantik indeksleme** — AST + RAG ile repo anlayisi

**Tam otonom asistan icin tahmini sure:** 8-12 sprint
**Self-improving orkestrator: ✅ TAMAMLANDI (Sprint 102+)

---

## Kaynaklar (Dogrulanmis — Nisan 2026)

### OpenClaw
- [OpenClaw GitHub](https://github.com/openclaw/openclaw) — 343K+ yildiz (Nisan 2026), MIT lisans
- [OpenClaw Architecture](https://docs.openclaw.ai/concepts/architecture) — Gateway, Brain, Memory, Skills, Heartbeat
- [OpenClaw 250K Milestone](https://openclaws.io/blog/openclaw-250k-stars-milestone) — React'i 60 gunde gecti (3 Mart 2026)
- [OpenClaw 335K Stats](https://openclawvps.io/blog/openclaw-statistics) — 2M MAU, 27M web ziyareti, 1000+ contributor
- [OpenClaw Surpasses React](https://www.star-history.com/blog/openclaw-surpasses-react-most-starred-software) — GitHub'un en cok yildizli yazilim projesi
- [OpenClaw vs Claude Code](https://claudefa.st/blog/tools/extensions/openclaw-vs-claude-code) — Kategori farki analizi
- [ClawHub Skills](https://github.com/openclaw/clawhub) — 13,729 topluluk skill, %65+ MCP server wrap
- [OpenClaw Security](https://thenewstack.io/openclaw-github-stars-security/) — Guvenlik endise analizi

### Microsoft Copilot Cowork
- [Cowork Lansman](https://www.microsoft.com/en-us/microsoft-365/blog/2026/03/09/copilot-cowork-a-new-way-of-getting-work-done/) — Multi-model orkestrator (GPT + Claude critique)
- [Cowork Frontier](https://www.microsoft.com/en-us/microsoft-365/blog/2026/03/30/copilot-cowork-now-available-in-frontier/) — Anthropic isbirligi, Mart 2026
- [Cowork Fortune](https://fortune.com/2026/03/09/microsoft-copilot-cowork-ai-agents-anthropic-e7-m365-saas/) — Kurumsal detaylar
- [Cowork SiliconANGLE](https://siliconangle.com/2026/03/30/microsoft-accelerates-agentic-automation-copilot-cowork-complex-workflows/) — Agentic otomasyon

### Perplexity Computer
- [Perplexity Computer](https://www.perplexity.ai/hub/blog/introducing-perplexity-computer) — 19 model, $200/ay
- [Perplexity VentureBeat](https://venturebeat.com/technology/perplexity-launches-computer-ai-agent-that-coordinates-19-models-priced-at/) — Lansman detayi
- [Perplexity Enterprise](https://theaiinsider.tech/2026/02/28/perplexity-unveils-enterprise-focused-ai-agent-system-powered-by-multi-model-architecture/) — $325/koltuk/ay
- [Perplexity vs OpenClaw](https://www.pymnts.com/artificial-intelligence-2/2026/perplexity-enters-autonomous-ai-race-with-launch-of-computer/) — Rekabet analizi
- [Perplexity Pricing](https://www.sentisight.ai/how-much-perplexity-computer-cost/) — 10K kredi/ay, harcama limiti

### Devin
- [Devin 2.0 VentureBeat](https://venturebeat.com/programming-development/devin-2-0-is-here-cognition-slashes-price-of-ai-software-engineer-to-20-per-month-from-500/) — $500 → $20 fiyat dususu
- [Devin Pricing](https://devin.ai/pricing) — Core $20/ay, Team $500/ay, ACU sistemi
- [Devin Alternatives](https://www.augmentcode.com/tools/best-devin-alternatives) — Rakip analizi
- [Devin Review 2026](https://vibecoding.app/blog/devin-review) — v3.0 dynamic replanning, Compound AI

### Claude Ekosistemi
- [Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk) — Resmi agent altyapisi
- [Claude Computer Use](https://www.cnbc.com/2026/03/24/anthropic-claude-ai-agent-use-computer-finish-tasks.html) — Desktop otomasyon
- [Claude Dispatch](https://claude.com/blog/dispatch-and-computer-use) — Telefon → bilgisayar gorev akisi
- [Claude Code Features](https://help.apiyi.com/en/claude-code-2026-new-features-loop-computer-use-remote-control-guide-en.html) — Loop, Schedule, Computer Use
- [AI Agents Comparison 2026](https://blog.iskohm.com/en/posts/ai-agents-comparison-2026-cursor-copilot-kilo-code-claude-code/) — Tam karsilastirma

## Sprint Metrics
| Metrik | Değer |
|--------|-------|
| Sprint | sprint-123 |
| Toplam Task | 3 |
| Tamamlanan | 3 |
| Tech Debt | 3 |
| No-Go | 0 |
| Süre | 4dk 30sn |
| Coverage | 0.0% |
