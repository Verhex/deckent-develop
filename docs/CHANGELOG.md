# Changelog
<!-- Dil: TR | Teknik terimler EN -->

Bu projedeki tüm önemli değişiklikler bu dosyada belgelenmektedir.

Format [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) standardına dayanır
ve proje [Semantic Versioning](https://semver.org/spec/v2.0.0.html) kurallarına uyar.

## [0.2.0-beta.3-sprint73] - 2026-03-30

### Added

- God Object Split Faz 2 — sprint-controller Utility Extract

### Changed

- Dokümantasyon Dil Stratejisi — TR/EN Tutarlılık (completed with tech debt)
- VISION.md — Proje Vizyonu ve Yol Haritası (completed with tech debt)
- docs/ Link Audit — Kırık Link Kontrolü (completed with tech debt)
- .detect-secrets Kurulumu — Pre-commit Güvenlik (completed with tech debt)


_Tasks: 5 total, 5 done, 4 tech debt, 0 no-go_

## [0.2.0-beta.3-sprint72] - 2026-03-30

### Added

- README.md Güncellemesi — Test Sayıları + Sprint Bilgisi
- CHANGELOG.md + docs/CHANGELOG.md Güncelleme

### Changed

- Fix debt: 069-005-fix teknik borcu — TempAgent mekanizması zaten tamamen uygulanmıştı (teknik borçla tamamlandı)
- .brain/ Dokümantasyon Tutarlılığı — RETRO, MEMORY, PROJECT-IDENTITY (teknik borçla tamamlandı)
- DECKENT.md + CLAUDE.md Tutarlılık Kontrolü (teknik borçla tamamlandı)
- docs/SPRINT-LOG.md Güncelleme (teknik borçla tamamlandı)

### Fixed

- Fix debt: 069-006-fix teknik borcu — extractScopeFromDirective hatası düzeltildi: docFileMatch


_Görevler: 7 toplam, 7 tamamlanan, 4 teknik borç, 0 no-go_

## [0.2.0-beta.3-sprint73] - 2026-03-30

### Fixed

- **Test Regresyon Düzeltmesi**: 100 test regresyonu düzeltildi — 0 fail, 12,161 passed
  - 43 fs mock düzeltmesi (worker-feedback, verify-lang testleri)
  - 16 brain mock düzeltmesi (`statSync` mock, `isStackStale()` çağrı zinciri)
  - 9 doctor logic düzeltmesi (`c.ok` → `c.passed` field mismatch)
  - 23 stack/CI/analyzer detection düzeltmesi
  - 3 integration test düzeltmesi (start.test.ts, analyzer-overhaul.test.ts)

### Changed

- Brain Test — statSync Mock düzeltmesi (16 fail) (teknik borçla tamamlandı)
- Kalan Mock/Integration düzeltmesi (3 fail) (teknik borçla tamamlandı)

_Sprint 073: 5 görev, 5 tamamlanan, 2 teknik borç, 0 no-go_

---

## [0.2.0-beta.3-sprint72] - 2026-03-28

### Added

- Model API ID güncellemesi: `claude-opus-4-6`, `claude-sonnet-4-6` resmi API ID'leri

### Changed

- **Plan Tier Generalizasyonu**: Claude-specific plan adları provider-agnostic hale getirildi
  - `max_plan` → `performance`, `max5x_plan` → `balanced`, `pro_plan` → `economic`
  - Tüm provider'lar (Claude, Codex, Gemini) aynı tier sistemini kullanıyor
- **Init Wizard**: "Select your Claude plan" → "Select your plan" — provider-agnostic
  - Yeni tier isimleri: performance/balanced/economic/unlimited
- **sprint-controller.ts God Object Split**: 7 sprint faz fonksiyonu `sprint-phases.ts`'e taşındı
  - `runPlanPhase`, `runSpawnPhase`, `runEvaluatePhase` ve diğerleri extract edildi
  - `sprint-controller.ts` slim hale geldi, maintainability artırıldı
- **README.md**: Test sayısı, sprint sayısı, Windows destek bilgisi güncellendi

_Sprint 072: 5 görev, 5 tamamlanan, 4 teknik borç, 0 no-go_

## [0.2.0-beta.3] - 2026-03-27

### Added

- `deckent upgrade --local <path.tgz>` — closed beta development workflow
- `.deckent/workspace/IDENTITY.md` — stack detection sonuçlarıyla proje kimliği
- `.deckent/docs/` — quick-start.md, directives-guide.md, config-reference.md (TR/EN)
- TempSkill + TempAgent init sırasında otomatik oluşturma
- DECKENT.md Workflow Guide + DIRECTIVES Format + Providers bölümleri
- Subprocess heartbeat periodic update (setInterval 15s)
- Fallback .result file on worker exit
- Review archive/ fallback — cleanup sonrası task'lar hala erişilebilir
- Scope parser explicit `Files:` / `Scope:` label parsing

### Fixed

- **BUG-3**: Claude CLI spawn ENOENT on Windows — `shell: true` 7 dosyada
- **BUG-4,12**: Worker rules hardcoded tsc/vitest → stack-aware komutlar
- **BUG-6**: Stack detection sadece --auto'da çalışıyordu → her zaman çalışır
- **BUG-7**: Doctor FAIL+OK çelişkisi → optional provider'lar SKIP olarak gösterilir
- **BUG-8**: Python projede framework `next` algılanıyordu → dil guard eklendi
- **BUG-9**: IDENTITY.md dangling reference → workspace IDENTITY.md oluşturuluyor
- **BUG-10**: DECKENT.md `Build: tsc` Python projede → empty string falsy fix
- **BUG-11**: DIRECTIVES.md boş placeholder → stack-aware örnek task şablonu
- **BUG-13**: Brain rules yanlış limitler → 200→300, 600→900
- **BUG-14**: TempAgent "mixed" dilde oluşturulmuyor → detectedLanguages eşleşme
- **BUG-15**: BOOT.md kullanıcı ipucu yok → TR/EN kullanıcı-dostu
- **BUG-16**: `ps -o` Windows'ta hata → platform guard
- **BUG-19**: UTF-8 encoding Windows → LANG + PYTHONIOENCODING env vars
- **BUG-21**: Doctor healthScore=0 tüm check passed → `c.ok` → `c.passed`
- **BUG-22**: Review "No tasks found" → archive/ fallback
- **BUG-23**: Heartbeat 28x stale → periodic update
- **BUG-24**: Worker .result yazmıyor → fallback on exit
- **BUG-25**: Scope parser Files/Scope ignorluyor → explicit parsing
- **BUG-26**: Task log boş Windows → closeSync child exit handler

### Changed

- Version bump: 0.2.0-beta.1 → 0.2.0-beta.3
- Worker prompt: hardcoded `tsc --noEmit`/`npx vitest run` kaldırıldı → DECKENT.md referansı
- allowedTools: `Edit`, `Glob`, `Grep` worker tool'larına eklendi
- FullStackResult: `detectedLanguages` field eklendi

_Sprint 070: 8 görev, 8 tamamlanan, 15 hata düzeltme. Sprint 071: 8 görev, 8 tamamlanan, 7 hata düzeltme. 0 regresyon._

---

## [0.2.0-beta.1-sprint69] - 2026-03-27

### Added

- Skill İstatistik Takibi — uses/successRate/avgCoverage
- Sonuç Tabanlı Öğrenme Güçlendirme — Agent/Skill Bonus

### Changed

- Agent Seçim Hassasiyeti — test-writer Exclude + Intent Weights (teknik borçla tamamlandı)
- Skill Seçim Bütçesi — Dinamik maxTokens + Priority (teknik borçla tamamlandı)


_Görevler: 6 toplam, 4 tamamlanan, 2 teknik borç, 2 no-go_

## [0.2.0-beta.1-sprint68] - 2026-03-26

### Added

- DECKENT.md AI-Native Rehber Genişletme
- deckent init Multi-Ortam Adaptörü
- V2 Routing E2E Doğrulama Testi

### Changed

- MCP Sunucu Talimatları — AI Sistem Prompt Enjeksiyonu (teknik borçla tamamlandı)
- Tool Açıklamaları + Annotations Zenginleştirme (teknik borçla tamamlandı)
- deckent_help Aracı — Çalışma Zamanı Yetenekleri + Durum (teknik borçla tamamlandı)


_Görevler: 6 toplam, 6 tamamlanan, 3 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint67] - 2026-03-26

### Added

- Job State Sprint Sonuçları — finalizeSprint → iş dosyası

### Changed

- Fix debt: 064-004-fix teknik borcu — tests/cli/helpers/output'a 11 hedefli test eklendi (teknik borçla tamamlandı)
- Retro Detay Zenginleştirme — Worker Notes Aktarımı (teknik borçla tamamlandı)
- any Kullanımı Temizliği — 10 Adet, 7 Dosya (teknik borçla tamamlandı)
- V2 Routing Doğrulama — Audit + IDENTITY Güncelleme (teknik borçla tamamlandı)


_Görevler: 6 toplam, 5 tamamlanan, 4 teknik borç, 1 no-go_

## [0.2.0-beta.1-sprint66] - 2026-03-26

### Added

- Phantom Modüller — prompt-token-optimizer + ecosystem-intelligence
- PlannerTask Arayüzü + enrichScope + api-surface Sözleşmesi
- Stale Heartbeat Kök Neden + Config routing_engine Doğrulama
- V1+V2 Paralel Doğrulama + decision-engine Analizi

### Changed

- Manifest v2 Toplu Güncelleme — 20 Dosya (teknik borçla tamamlandı)
- MCP Dokümantasyon Tutarlılık — 16 Tool + 9 Resource (teknik borçla tamamlandı)
- Housekeeping — gitignore + IDENTITY Sayıları (teknik borçla tamamlandı)


_Görevler: 7 toplam, 7 tamamlanan, 3 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint65] - 2026-03-26

### Added

- history Trend + retro Arşivleme

### Changed

- plan — AI Planner Timeout Yapılandırılabilir (teknik borçla tamamlandı)
- config — autoMigrateOnLoad + Modes İç İçe Geçme (teknik borçla tamamlandı)
- cleanup — Çift Geçiş, Sahte Sprint, destroy Session, .gitignore (teknik borçla tamamlandı)
- spawn — Kapsam Zorlama + Multi-Provider (teknik borçla tamamlandı)
- analyze — Wrapper Birleştirme + Monorepo (teknik borçla tamamlandı)
- Dokümantasyon — CHANGELOG/SPRINT-LOG Geri Yükleme + cli-deep-analysis Final (teknik borçla tamamlandı)


_Görevler: 7 toplam, 7 tamamlanan, 6 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint64] - 2026-03-26

### Added

- Tamamlanan görev yok


_Görevler: 14 toplam, 0 tamamlanan, 0 teknik borç, 14 no-go_

## [0.2.0-beta.1-sprint62] - 2026-03-26

### Added

- ci-guardian Agent Tanımı + PROMPT.md
- beforeSprint Hook — Sprint Öncesi CI Doğrulama
- afterTask Hook — Görev Düzeyinde Regresyon Tespiti
- afterSprint Hook — Sprint CI Raporu
- CI Öğrenme — Sprintler Arası Öğrenme

### Changed

- ci-testing Skill Tanımı + SKILL.md (teknik borçla tamamlandı)
- CI Dashboard Entegrasyonu (teknik borçla tamamlandı)
- GitHub Actions Workflow İyileştirme (teknik borçla tamamlandı)


_Görevler: 8 toplam, 8 tamamlanan, 3 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint61] - 2026-03-26

### Added

- Plan Bağımsız Provider Başlatma (P0)

### Changed

- Agent Listesi Görüntü Düzeltmesi + History Agent Sütunu (P1) (teknik borçla tamamlandı)
- Brain Bütçe Decay + Memory Temizliği (P0) (teknik borçla tamamlandı)
- Açık Borç Temizliği (debt-059-008-fix) (P1) (teknik borçla tamamlandı)
- Framework Tespiti + Analyzer Düzeltmesi (P2) (teknik borçla tamamlandı)
- Kalan CLI İyileştirmeleri (teknik borçla tamamlandı)

### Fixed

- Agent Atama Kalıcılık Düzeltmesi (P0 KRİTİK)
- Agent İstatistik Güncelleme Düzeltmesi (P0 KRİTİK)


_Görevler: 8 toplam, 8 tamamlanan, 5 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint60] - 2026-03-26


### Changed

- CLI Komut + Flag Doğrulama (teknik borçla tamamlandı)
- Agent Pool + Skill Pool Doğrulama (teknik borçla tamamlandı)
- MCP Tool + Resource Doğrulama (teknik borçla tamamlandı)
- Sprint Yaşam Döngüsü + Format Tutarlılık Doğrulama (teknik borçla tamamlandı)
- Doctor + Config + Provider Doğrulama (teknik borçla tamamlandı)

### Fixed

- Fix debt: 057-012-fix teknik borcu — tüm agent/skill/plugin/marketplace/archive-debt iyileştirmeleri


_Görevler: 6 toplam, 6 tamamlanan, 5 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint59] - 2026-03-25


### Changed

- cli-deep-analysis.md Tam [DONE] İşaretleme + Doğrulama (teknik borçla tamamlandı)
- Prompt Boilerplate Azaltma + Worker Rehberi (teknik borçla tamamlandı)
- spawn+kill+run Multi-Provider Desteği (teknik borçla tamamlandı)
- doctor+watch Provider-Duyarlı Düzeltme (teknik borçla tamamlandı)
- MCP Kaynakları Genişleme (+4 kaynak) (teknik borçla tamamlandı)
- MCP Tool Kalitesi — Zenginleştirme + Hata Yönetimi (teknik borçla tamamlandı)
- Format Tutarlılığı + Ölü Kod Temizliği (teknik borçla tamamlandı)
- Sync Genişleme (Gemini/Cursor/Codex Adaptörleri) (teknik borçla tamamlandı)
- Doküman Güncelleyici Düzeltme + CHANGELOG Konsolidasyonu (teknik borçla tamamlandı)

### Fixed

- Agent Aktivasyon Düzeltmesi — forceModel Agent Bypass Kaldırıldı
- Skill Seçim Düzeltmesi — Görev-Bazlı Seçim + Truncation
- Scope & GO/NO-GO Düzeltmesi — filesWrite + Kriter Zenginleştirme


_Görevler: 13 toplam, 12 tamamlanan, 9 teknik borç, 1 no-go_

## [0.2.0-beta.1-sprint58] - 2026-03-25

### Added

- agent+skill+plugin+marketplace+archive-debt Tamlık Kontrolü
- dashboard+attach+watch+cross-cutting Bütünleştirme


_Görevler: 2 toplam, 2 tamamlanan, 0 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint57] - 2026-03-25

### Added

- status Yenileme — Bağımsız, ETA, NO_COLOR, fs.watch, Verbose
- retro+explain Kalitesi — Dil, Trend, Agent/Skill Performansı, Öğrenmeler
- usage Yenileme — Gerçek Token'lar, Race Condition, Canlı Kullanım, Filtreler
- history Yenileme — --json, --last, Agent/Skill, Ölü Kod, Format
- config Kalitesi — list/keys, autoMigrate, Doğrulama, Yorum, Env Var
- review+finalize Yenileme — Etkileşimli, Yeniden Deneme, Guard, Çoklama
- serve Güvenliği — Rate Limit, Body Size, DeepMerge, Auth, Versiyonlama

### Changed

- doctor İyileştirmeleri — tmux Koşullu, .deck Kontrol, Auth, İpuçları (teknik borçla tamamlandı)
- cleanup+decay Yenileme — Otomatik Decay, Combo, Lock Guard, Arşiv (teknik borçla tamamlandı)
- run+test+web Flag'leri — Timeout, Keep, Sandbox, CI, MIME (teknik borçla tamamlandı)
- sync+onboard+upgrade İyileştirme (teknik borçla tamamlandı)


_Görevler: 13 toplam, 11 tamamlanan, 4 teknik borç, 2 no-go_

## [0.2.0-beta.1-sprint56] - 2026-03-25

### Added

- init UX — Otomatik Dil, Öneri, Yeniden Başlatma, Hata Kurtarma

### Changed

- Doküman Güncelleyici Referans Düzeltmesi + CHANGELOG Konsolidasyonu (teknik borçla tamamlandı)
- init Hata Düzeltmesi — deepMerge + .deck Güvenlik + Provider Sihirbazı (teknik borçla tamamlandı)
- plan Çekirdek — Async Kullanım, Dry-Run, Idempotency, Koruma (teknik borçla tamamlandı)
- plan Kalitesi — Parser, i18n, Bağlam Önceliği, Hata Loglama (teknik borçla tamamlandı)
- start Çekirdek — Bekleme Timeout, Spawn Yeniden Deneme, Sıfır-Yapılandırma, Faz Kalıcılığı (teknik borçla tamamlandı)
- start Kalitesi — Provider Cache, Dashboard Kullanımı, Cleanup Finally, --watch Alternatif (teknik borçla tamamlandı)


_Görevler: 20 toplam, 7 tamamlanan, 7 teknik borç, 13 no-go_

## [0.2.0-beta.1-sprint55] - 2026-03-25

### Fixed

- Retro Parse/Write Format Uyumsuzluğu Fix + --compare Bug (P0 KRİTİK)
- Kill Komutu Task Status + Lock Temizliği + --all Flag (P0 KRİTİK)

### Changed

- readLanguage + readJsonSafe Tam DRY Temizliği (teknik borçla tamamlandı)
- Config Set İç İçe Anahtar + Import DeepMerge + Config Get (teknik borçla tamamlandı)
- Spawn Komutu Prompt Zenginleştirme + Status Kontrolü (teknik borçla tamamlandı)
- Doctor --json + Retro --json Flag'leri (teknik borçla tamamlandı)
- Cleanup --dry-run Flag'i (teknik borçla tamamlandı)
- Agent Delete + Edit Komutları (teknik borçla tamamlandı)
- Skill Enable/Disable + Delete Komutları (teknik borçla tamamlandı)
- Explain --sprint Flag + Goal Bilgisi + Dil Desteği (teknik borçla tamamlandı)


_Görevler: 10 toplam, 10 tamamlanan, 10 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint54] - 2026-03-25

### Changed

- Agent Aktivasyonu — systemPrompt + Worker Enjeksiyonu (teknik borçla tamamlandı)
- Brain Kendi Kendine Öğrenme — Config Önerileri + Desen Tespiti (teknik borçla tamamlandı)
- Zengin Sprint Çıktısı + README Güncelleme (teknik borçla tamamlandı)
- docs/ Yeniden Düzenleme + .claude/rules/ Güncelleme (teknik borçla tamamlandı)

_Görevler: 4 toplam, 4 tamamlanan, 4 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint53] - 2026-03-25

### Added

- Skill Enjeksiyonu — 10 Skill'i Worker'lara Enjekte Et

### Changed

- Kendini İyileştiren Bootstrap — Başlangıçta Otomatik Migration (teknik borçla tamamlandı)


_Görevler: 8 toplam, 2 tamamlanan, 1 teknik borç, 6 no-go_

## [0.2.0-beta.1-sprint52] - 2026-03-25


### Changed

- Dashboard Tam Genişleme (teknik borçla tamamlandı)


_Görevler: 1 toplam, 1 tamamlanan, 1 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint51] - 2026-03-25

### Added

- Başlangıç Rehberi

### Changed

- Tam Config Genişleme (teknik borçla tamamlandı)
- Config Dokümantasyonu (Satır İçi Yorumlar) (teknik borçla tamamlandı)
- Dashboard Config Editörü (teknik borçla tamamlandı)
- VitePress Kurulumu (teknik borçla tamamlandı)
- CLI Referansı (Otomatik Oluşturulan) (teknik borçla tamamlandı)
- Config Migration Yardımcısı (teknik borçla tamamlandı)
- Dağıtım Yapılandırması (teknik borçla tamamlandı)


_Görevler: 8 toplam, 8 tamamlanan, 7 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint50] - 2026-03-25


### Changed

- npm Publish Dry Run & Düzeltme (teknik borçla tamamlandı)
- README.md Yenileme (teknik borçla tamamlandı)
- bin Giriş Doğrulama (teknik borçla tamamlandı)
- CHANGELOG.md Güncelleme (teknik borçla tamamlandı)
- npm Publish Pipeline Doğrulama (teknik borçla tamamlandı)


_Görevler: 5 toplam, 5 tamamlanan, 5 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint48] - 2026-03-24

### Added

- Sadece Doküman Görevleri Doğrulama Atla

### Changed

- Claude MCP Backend Stub Tamamlama (teknik borçla tamamlandı)
- Sandbox Modu Zarif İşleme (teknik borçla tamamlandı)
- API Modu Kullanım Entegrasyonu (teknik borçla tamamlandı)
- Subprocess Worker Log İyileştirme (teknik borçla tamamlandı)
- Coverage Metrik Koruma (teknik borçla tamamlandı)
- Blueprint Bölüm Numaraları Güncelleme (teknik borçla tamamlandı)
- RELEASE-NOTES-BETA.md Son Güncelleme (teknik borçla tamamlandı)


_Görevler: 8 toplam, 8 tamamlanan, 7 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint47] - 2026-03-24

### Added

- Tamamlanan görev yok


_Görevler: 10 toplam, 0 tamamlanan, 0 teknik borç, 10 no-go_

## [0.2.0-beta.1-sprint46] - 2026-03-24

### Added

- Zengin Çıktı finalizeSprint'e Entegrasyonu

### Changed

- Router Sprint Yaşam Döngüsüne Entegrasyon (teknik borçla tamamlandı)
- Codex Adaptörü — Gerçek CLI Entegrasyonu (teknik borçla tamamlandı)
- Claude Adaptörü — MCP Sunucu Modu Seçeneği (teknik borçla tamamlandı)
- .deck Secret Yükleme Provider Auth'da (teknik borçla tamamlandı)
- deckent doctor'da Provider Sağlığı (teknik borçla tamamlandı)
- Ortam-Duyarlı deckent init (teknik borçla tamamlandı)
- Sprint 044 Modül Smoke Test'leri (teknik borçla tamamlandı)


_Görevler: 10 toplam, 8 tamamlanan, 7 teknik borç, 2 no-go_

## [0.1.0-sprint42] - 2026-03-23


### Changed

- npm Publish Doğrulama (teknik borçla tamamlandı)
- Global Kurulum E2E Testi (teknik borçla tamamlandı)
- Provider Adaptör Smoke Test'leri (teknik borçla tamamlandı)


_Görevler: 8 toplam, 3 tamamlanan, 3 teknik borç, 5 no-go_

## [0.2.0-beta.1] — 2026-03-23 (Stabilizasyon — Beta Hazır)

### Added
- **CHANGELOG**: Sprint 035-042 girdileri semver formatında
- **RELEASE-NOTES-BETA.md**: Özellikler, metrikler, başlangıç rehberi, bilinen sınırlamalar ve yol haritası ile beta sürüm notları
- **npm Publish Doğrulama**: `scripts/validate-publish.ts` ve `npm run validate:publish` ile otomatik yayın kontrolleri
- **E2E Test'ler**: Global kurulum akışı ve ilk sprint yolculuğu testleri (`tests/e2e/`)
- **Provider Smoke Test'leri**: Claude, Codex ve Gemini için gerçek API çağrısı olmadan adaptör smoke testleri

### Changed
- Sürüm 0.1.0'dan 0.2.0-beta.1'e yükseltildi
- Tüm açık teknik borç maddeleri kapatıldı veya DECISIONS.md'de belgelendi
- Dokümantasyon son inceleme geçişi (README, QUICKSTART, CONFIG-REFERENCE, CONTRIBUTING)

### Fixed
- Test paketi stabilize edildi: Linux/WSL'de 0 hata
- Tüm kararsız testler çözüldü (zamanlama, eşzamanlılık, platform-özel)

_Sprint 042: Stabilizasyon — Beta Hazır_

## [0.1.0-sprint041] — 2026-03-23 (İnsan-Dostu Çıktı Tamamlandı)

### Added
- **Dashboard SprintSummary**: Web dashboard için insan-dostu SprintSummary bileşeni
- **CLI Doctor İyileştirme**: Kategorize edilmiş sonuçlarla insan-dostu sağlık kontrolü çıktısı
- **RETRO İyileştirme**: Karşılaştırma metrikleri ile insan-okunabilir retrospektif formatı
- **Hata Mesajları**: Öneriler ve düzeltme ipuçları ile bağlam-duyarlı hata mesajları
- **Worker Log'ları**: Worker çalışma log'ları için insan-okunabilir ilerleme çıktısı

### Changed
- MCP tool yanıtları insan-dostu formata yeniden düzenlendi (teknik borçla)

### Fixed
- Sprint 033'ten kalan debugLog() yardımcı fonksiyonu teknik borcu çözüldü

_Görevler: 7 toplam, 7 tamamlanan, 1 teknik borç, 0 no-go | Coverage: %94.3_

## [0.1.0-sprint040] — 2026-03-23 (Worker Geri Bildirim Döngüsü + İnsan-Dostu Çıktı)

### Added
- **Worker Doğrulama Döngüsü**: Worker çalışması içinde dahili tsc ve test doğrulaması
- **Worker Geri Bildirim Metrikleri**: Worker öz-değerlendirme metrik toplama
- **İnsan-Dostu Sprint Tamamlanma**: Renkli, kategorize edilmiş sprint tamamlanma çıktısı
- **İnsan-Dostu Init Sihirbazı**: Rehberli kurulum ile etkileşimli init sihirbazı

### Changed
- CLI status çıktısı insan-dostu formata yeniden düzenlendi (teknik borçla)

### Fixed
- Worker prompt yenileme: insan-okunabilir talimatlar ve agent/skill enjeksiyon düzeltmesi

_Görevler: 13 toplam, 7 tamamlanan, 1 teknik borç, 6 no-go | Coverage: %92.1_

## [0.1.0-sprint039] — 2026-03-22 (Provider Düzeltmeleri)

### Fixed
- **Codex Adaptörü**: Codex provider adaptörü için gerçek CLI entegrasyon düzeltmesi

_Görevler: 19 toplam, 1 tamamlanan, 0 teknik borç, 18 no-go | Coverage: %95.0_

## [0.1.0-sprint038] — 2026-03-22 (Multi-Provider Altyapısı)

### Added
- **ModelType Genişletme**: 3 provider'da 8 model varyantı (Claude, Codex, Gemini)
- **Codex Adaptörü**: Kullanım takibi ile OpenAI Codex provider adaptörü
- **Gemini Adaptörü**: Kullanım takibi ile Google Gemini provider adaptörü
- **Provider-Duyarlı Model Seçimi**: model-selector.ts 3 provider'da yönlendirme
- **spawnWorkers Yönlendirme**: Provider/model atamasına göre Worker spawn yönlendirme
- **Planner Bağımsızlaştırma**: planner.ts tmux/subprocess'ten bağımsızlaştırıldı
- **tmux Bağımsızlaştırma**: tmux.ts platform soyutlama katmanı
- **Subprocess Bağımsızlaştırma**: subprocess backend soyutlama iyileştirmeleri
- **CLI Giriş Noktası Düzeltmesi**: buildProgram() + entry.ts ile yan etkisiz giriş noktası
- **Platform Destek Matrisi**: macOS/Linux/WSL2 destek matrisi belgelendi
- **bootstrapProviders()**: Provider tespiti ve kayıt için tek başlangıç noktası

### Changed
- ModelType enum'u Codex ve Gemini model varyantlarıyla genişletildi
- ProviderRegistry dinamik provider kaydını destekliyor
- Config provider başına API anahtarı ve endpoint yapılandırmasını destekliyor

_Görevler: 20 toplam, 20 tamamlanan, 0 teknik borç, 0 no-go — +476 test (8073 → 8555)_

## [0.1.0-sprint037] — 2026-03-22 (Güvenlik, Performans, Plugin Sistemi)

### Added
- **Zamanlama-Güvenli Auth**: Kimlik doğrulama token'ları için sabit zamanlı karşılaştırma (SHA-256 hash)
- **Kimlik Bilgisi Maskeleme**: Log'lardan API anahtarları, Bearer token'ları ve URL parolalarının otomatik maskelenmesi
- **Skill Sandbox AST**: eval/Function/child_process tespiti için TypeScript compiler API ikinci geçiş
- **DIRECTIVES Doğrulama**: Görev oluşturmadan önce Zod şema doğrulaması (DirectiveSchema + DirectiveTaskSchema)
- **Plugin Sistemi**: Tam kurulum yaşam döngüsü (npm/git/local + geri alma), çalışma zamanı hook'ları (beforeSprint/afterTask/afterSprint)
- **PROJECT-IDENTITY.md**: Kalıcı proje kimlik dosyası, asla decay edilmez, her sprint güncellenir
- **finalizeSprint()**: Ayrılmış sprint sonlandırma fonksiyonu + `deckent finalize` CLI komutu
- **Config Mod Takma Adları**: performance/balanced/economic/unlimited kanonik mod adlarına eşlendi

### Changed
- Bellek bütçesi 300'den 600 satıra artırıldı
- Decay eşiği 3'ten 5 sprint'e uzatıldı
- RETRO maksimum satır 60'tan 100'e artırıldı
- Sprint log maksimum satır 50'den 80'e artırıldı
- Agent havuzu LRU eviction kullanıyor (maks 50 geçici, 5 sprint yaşı) toplu okuma ile

_Görevler: 16 toplam, 16 tamamlanan, 0 teknik borç, 0 no-go — +258 test (7815 → 8073)_

## [0.1.0-sprint036] — 2026-03-22 (Mimari Temizlik)

### Added
- **sprint-controller.ts**: brain.ts'den çıkarılan sprint yaşam döngüsü yönetimi
- **result-evaluator.ts**: brain.ts'den çıkarılan görev sonuç değerlendirme mantığı
- **usage-manager.ts**: brain.ts'den çıkarılan kullanım takibi ve bütçe yönetimi
- **Tip Modülleri**: types.ts → task-types, config-types, monitoring-types, sprint-types + barrel olarak bölündü

### Changed
- **brain.ts God Object Split**: 1312 → 58 satır, artık geriye uyumlu saf re-export katmanı
- **spawn-backend.ts**: core/'dan orchestra/'ya taşındı (katman ihlali düzeltmesi)
- **Non-null Assertions**: 29 dosyada 48 `!` operatörü guard clause, `.at()` ve `?? fallback` ile değiştirildi
- **Type Cast'ler**: Enum literal'leri (`TaskStatus.DONE`) ve type guard'lar ile değiştirildi
- **Barrel Temizlik**: orchestra/index.ts 30+ export'tan 22 public API export'a indirildi, @internal JSDoc ile
- **Auditor Kuyruk**: shift() O(n) → azalan sıralama + pop() O(1) ile değiştirildi
- **PromptAnalytics**: prompt-metrics + prompt-ab-test tek sınıfta birleştirildi

_Görevler: 11 toplam, 11 tamamlanan, 0 teknik borç, 0 no-go — +315 test_

## [0.1.0-sprint035] — 2026-03-22 (Beta Temizlik Dalgası 1+2)

### Added
- **readJsonSafeAsync()**: Bloklamayan JSON dosya okumaları için readJsonSafe'in asenkron varyantı
- **Yardımcı Fonksiyon Çıkarma**: readFileIfExists, listFilesWithExtension, safeMapGet → utils.ts'ye taşındı
- **Hata Kayıt Defteri Genişleme**: Düzeltme önerileri ile E039-E053 hata kodları

### Changed
- **readJsonSafe Göçü**: 13 satır içi JSON.parse çağrısı readJsonSafe() ile değiştirildi
- **Hata Yönetimi Birleştirme**: 11 genel throw ifadesi DeckentError + ErrorRegistry ile değiştirildi
- **Sessiz Catch Loglama**: 8 catch bloğunda DECKENT_DEBUG env kapısı ile debugLog() yardımcısı
- **parseBody Tip Güvenliği**: 5 Zod şeması (Start/Plan/Directives/Config/Kill) + parseBodyWithSchema()
- **EventEmitter Düzeltme**: setMaxListeners(0) ile ayrılmış _ipcEmitter, process EventEmitter kullanımı kaldırıldı

### Fixed
- **tmux Worker Çökme Kurtarma**: Çöken tmux worker'ları için agent tabanlı subprocess fallback

_Sprint 035: Beta Temizlik Dalgası 1+2_

## [0.1.0-sprint33] - 2026-03-22

### Added

- CHANGELOG Sürüm Formatı
- SECURITY.md Konumu
- PR Şablonu Deckent-Özel
- FUNDING.yml Güncelleme
- Yardımcı Fonksiyon Çıkarma

### Changed

- EventEmitter MaxListeners Düzeltmesi (teknik borçla tamamlandı)
- Onboard Test Timeout Düzeltmesi (teknik borçla tamamlandı)
- README Badge Güncelleme (teknik borçla tamamlandı)
- Dosya Uzantısı Sabit Kullanımı (teknik borçla tamamlandı)
- Sprint Gözlem Dokümanları Arşivleme (teknik borçla tamamlandı)
- CI Coverage Kapısı (teknik borçla tamamlandı)
- parseBody Tip Güvenliği (teknik borçla tamamlandı)

### Fixed

- CI Workflow Test Düzeltmesi — publish
- CI Workflow Test Düzeltmesi — release


_Görevler: 17 toplam, 14 tamamlanan, 7 teknik borç, 3 no-go_

## [0.1.0-sprint33] — 2026-03-22 (Entegrasyon + Marketplace + Analitik)

### Added
- **Entegrasyon Testleri**: Tam agent+skill E2E, TypeScript/React projesi, Python/FastAPI projesi, monorepo, hata kurtarma
- **Skill Marketplace**: Kayıt istemcisi (arama/detay/yayın), CLI arama+yayın, derecelendirme sistemi, bağımlılık çözücü, marketplace auth
- **Gelişmiş Adaptif Agent**: Sprint arası analizci, uzmanlık sapma tespiti, agent emeklilik, prompt evrim logu, agent soy ağacı
- **Analitik Verisi**: Sprint analitikleri, kullanım grafikleri, başarı çizelgeleri, agent karşılaştırması, skill ısı haritası verisi
- **Performans**: Agent seçim cache'i (LRU 100), skill yükleme cache'i (500KB), token sayacı, tembel yükleyici, toplu istatistikler
- **Güvenlik**: Skill sandbox (şüpheli skill'leri karantinaya al), izin koruması (agent kendini değiştirmeyi engelle)
- **Dokümantasyon**: AGENT-GUIDE.md, MARKETPLACE-GUIDE.md

### Changed
- package.json: +4 anahtar kelime (agents, skills, marketplace, analytics)

## [0.1.0-sprint32] — 2026-03-22 (UX İyileştirme)

### Added
- **İlerleme Sistemi**: Canlı ilerleme çubuğu, ETA hesaplayıcı (ağırlıklı ortalama), worker durum takipçisi, kuyruk görüntüleme, terminal genişlik adaptasyonu
- **Zengin Sprint Özeti**: Kategorize dosya değişiklikleri, agent performans tablosu, öneri motoru (maks 5), delta ile sprint karşılaştırması
- **Bildirim Sistemi**: Terminal zili, webhook (POST+yeniden deneme), Discord embed'leri (renk-kodlu), Slack Block Kit
- **Etkileşimli İnceleme**: `deckent review` komutu — görev başına onayla/reddet/yeniden dene, --auto modu, inceleme raporları
- **Seçici Yeniden Deneme**: Başarısız görevleri sonraki sprint'e kuyruğa al, yeniden deneme direktifleri oluştur
- **Tema Sistemi**: Tutarlı renkler (success/error/warning/info/muted/accent), NO_COLOR/FORCE_COLOR desteği
- **Çıktı Modları**: --quiet (sadece hatalar), --verbose (debug), --normal (varsayılan)
- **İlerleme Kalıcılığı**: Yeniden bağlantı için ilerleme durumunu kaydet/yükle

### Changed
- Dashboard: skills sütunu eklendi, agent görünürlüğü iyileştirildi
- Status komutu: agent/skill atama bölümleri, --verbose flag'i
- Retro komutu: zengin format varsayılan, --raw orijinal için, --compare delta için
- History komutu: --agent ve --skill filtreleri
- MCP status: yanıtta agentAssignments + skillAssignments
- types.ts: DeckentConfig üzerinde bildirimler yapılandırması

## [0.1.0-sprint31] — 2026-03-22 (Brain Karar Motoru)

### Added
- **Karar Motoru**: 6 adımlı pipeline (analiz → agent → skill → model → effort → scope)
- **Görev Analizci**: Görev tipi çıkarımı (code/test/doc/security/refactor/devops/config), karmaşıklık puanlama
- **Karar Kaydedici**: Hata ayıklama ve tekrar için kararları .tasks/decisions/'a kaydet
- **Karar Tekrarı**: Aynı girdilerle kararları yeniden çalıştır, fark karşılaştırması
- **Öğrenme Döngüsü**: PatternRecorder/PatternReader — sprint başına agent+skill+model değerlendirmelerini kaydet
- **Kombinasyon Puanlayıcı**: Tarihsel kombinasyonları puanla (başarı*2 - başarısız*3 - güncellik cezası)
- **Öğrenme Decay**: Eski öğrenme verisini kaldır, özete sıkıştır
- **Öğrenme Göçü**: PATTERNS.md'yi öğrenme formatına dönüştür, dışa/içe aktar
- **Paralel Pipeline**: Bağımlılık-duyarlı çalıştırma dalgalarına topolojik sıralama
- **Paylaşımlı Bellek**: TTL ile worker'lar arası anahtar-değer iletişimi
- **Çakışma Çözücü**: Aynı dosyaya yazma/kapsam çakışması tespiti, çözüm stratejileri
- **Sonuç Birleştirici**: Worker sonuçlarını birleştir (tekrar kaldırma, ağırlıklı coverage)
- **Devir Protokolü**: Bağımlı görevler arasında artifact devri
- **Adaptif Agent**: Prompt etkinlik analizi, iyileştirme önerileri
- **Prompt A/B Testi**: Prompt varyantlarını karşılaştır (min 4 örnek, 50/50 bölme)
- **Prompt Versiyonlama**: Etkinleştir/budama ile maks 10 versiyon
- **Prompt Geri Alma**: Kötü prompt'ları otomatik geri al (3 kullanım sonrası <%50 başarı)
- **Prompt Metrikleri**: Performans dashboard'u (trend, en iyi/kötü versiyon)
- **Brain Bağlamı**: Planlama için stack/agent/skill/history zenginleştirmesi
- **Karar Yapılandırması**: DecisionEngineConfig, LearningConfig, CollaborationConfig

### Changed
- types.ts: DeckentConfig üzerinde decision_engine, learning, collaboration yapılandırma alanları
## [0.1.0-sprint30] - 2026-03-21

### Added

- **Fix debt: 027-003 teknik borcu**: Doğrulama raporu tmp-test/rollback-verify'a yazıldı: DONE
- **Fix debt: 027-004 teknik borcu**: Kapsamlı doğrulama raporu tmp-test/ip'ye yazıldı: DONE
- **Subprocess Backend Doğrulama**: GO_WITH_TECH_DEBT
- **tmux'suz Doğrulama**: GO_WITH_TECH_DEBT
- **Provider Soyutlama Analizi**: GO_WITH_TECH_DEBT
- **Sprint 27 Özellik Özeti**: GO_WITH_TECH_DEBT
- **Görevler**: 6 toplam, 6 tamamlanan, 4 teknik borç, 0 no-go
## [0.1.0-sprint30] — 2026-03-22 (Skill Sistemi)

### Added
- **Skill Tip Sistemi**: SkillDefinition, ProjectStack, SkillSelectionResult, SkillCategory tipleri
- **Skill Havuz Yöneticisi**: .deckent/skills/'dan yükleme, kaydetme, doğrulama, istatistik takibi
- **Stack Dedektör**: Cache ile proje teknolojisi otomatik tespiti (TypeScript/React/Python/Rust/Go/Docker)
- **Skill Seçici**: Çok faktörlü puanlama (stack+anahtar kelime+agent), kompozisyon çözücü, maks 3 skill
- **Skill Kayıt Defteri**: Gelecekteki marketplace için yerel skill indeksi temeli
- **10 Yerleşik Skill**: typescript-expert, react-specialist, python-expert, api-builder, database-migration, testing-expert, documentation-writer, security-specialist, performance-optimizer, devops-engineer
- **CLI Komutları**: `deckent skill list`, `deckent skill create`, `deckent skill install`
- **Skill Dokümantasyonu**: docs/SKILLS.md

### Changed
- brain.ts planSprint (artık async): proje stack'ini otomatik tespit, görev başına skill seçimi
- task-builder.ts buildWorkerPrompt: SKILL.md içeriğini enjekte eder (1500 karakter/skill, 4000 toplam limit)
- model-selector.ts: Katman 4d skill model tercihi (skill'ler arasında en yüksek kazanır)
- sprint-reporter.ts: RETRO.md'de skill performans tablosu
- config.ts: skills yapılandırması (enabled, maxPerTask, autoDetectStack, preferredSkills)
- types.ts: Task üzerinde assignedSkills, TaskResult üzerinde skillIds, DeckentConfig üzerinde SkillConfig

## [0.1.0-sprint29] — 2026-03-22 (Agent Havuzu Çekirdeği)

### Added
- **Agent Tip Sistemi**: AgentDefinition arayüzü, AgentPool, AgentSelectionResult tipleri
- **Agent Havuz Yöneticisi**: Yükleme, kaydetme, doğrulama, istatistik takibi, geçici agent yaşam döngüsü
- **Agent Seçici**: Anahtar kelime+kapsam puanlama algoritması, eşik filtreleme, başarı oranına göre beraberlik çözme
- **8 Yerleşik Agent**: security-auditor (opus), test-writer (sonnet), doc-writer (sonnet), code-reviewer (opus, salt okunur), refactorer (sonnet), bug-fixer (opus, 1.5x effort), api-builder (sonnet), performance-analyzer (opus)
- **Paylaşımlı Bağlam**: .tasks/shared-context.json ile agent'lar arası iletişim (atomik yazma)
- **Çoklu Agent Pipeline**: Paylaşımlı bağlam yayılımı ile sıralı agent çalıştırma
- **CLI Komutları**: `deckent agent list`, `deckent agent create`, `deckent agent enable/disable`
- **Agent Dokümantasyonu**: 8 bölümlü docs/AGENTS.md

### Changed
- brain.ts planSprint: anahtar kelimeler ve kapsama göre görev başına uzman agent otomatik seçimi
- task-builder.ts buildWorkerPrompt: görev içeriğinden önce agent PROMPT.md'yi enjekte eder (2000 karakter limiti)
- worker.ts: heartbeat ve sonuç dosyalarında agent ID dahil
- sprint-reporter.ts: RETRO.md'de agent performans tablosu
- Dashboard: renk kodlu agent sütunu (cyan=uzman, dim=genel)
- types.ts: Task üzerinde assignedAgent, TaskResult/Heartbeat/AgentInfo üzerinde agentId
## [0.1.0-sprint28] — 2026-03-21 (npm Yayın Hazırlığı)

### Added
- **Hata Kayıt Defteri**: 10 hata kodu ve düzeltme önerileri ile DeckentError sınıfı + ErrorRegistry
- **Telemetri Altyapısı**: TelemetryCollector (isteğe bağlı, PII temizleme, GDPR-uyumlu)
- **TUI Sihirbaz Çatısı**: Etkileşimli CLI için WizardStep arayüzü (select/input/confirm)
- **Hata İşleyici**: Renkli çıktı ve önerilerle merkezi CLI hata yönetimi
- **Sürüm Bilgisi**: Node.js, OS, tmux, claude durumu ile geliştirilmiş `--version` + `--version-json`
- **Yayın Betikleri**: prepublish.ts, build-verify.ts, pack-test.ts, publish.ts
- **.npmignore**: npm paketinden .brain/, .tasks/, .locks/, tests/, src/ hariç tutar
- **SECURITY.md**: Güvenlik açığı raporlama süreci ile güvenlik politikası
- **RELEASE-CHECKLIST.md**: 11 adımlı yayın kontrol listesi
- **Açılış Sayfası İçeriği**: deckent.agency için pazarlama içeriği

### Changed
- **onboard komutu**: Stub yerine etkileşimli sihirbaz (Claude tespiti, sistem profili, yapılandırma önerisi)
- **upgrade komutu**: Stub yerine gerçek npm güncelleme (sürüm kontrolü, --check flag'i)
- **README.md**: Badge'ler, karşılaştırma tablosu, mimari diyagramı ile tam yeniden yazım
- **CONTRIBUTING.md**: Geliştirici rehberleri ile güncelleme (CLI komutu ekle, MCP tool ekle)
- **docs/QUICKSTART.md, API.md, CONFIG-REFERENCE.md**: curl örnekleri ile iyileştirme
- **doctor.ts**: Platform-özel kurulum önerileri ile geliştirilmiş hata mesajları
- **Changelog güncelleyici**: Keep a Changelog formatı (Added/Changed/Fixed kategorileri)
- **Doctor çıktısı**: Renklerle trafik ışığı formatı [PASS]/[FAIL]/[WARN]

### Fixed
- brain.test.ts changelog format beklentileri Keep a Changelog için güncellendi
- Doctor test beklentileri [PASS]/[FAIL] formatı için güncellendi
- Onboard testi gerçek uygulama çıktısı için güncellendi

## [0.1.0-sprint27] — 2026-03-21 (Teknik Boşluk Kapama)

### Added
- **Provider Soyutlama**: ProviderAdapter arayüzü, ProviderRegistry singleton, ClaudeAdapter
- **SpawnBackend Soyutlama**: TmuxBackend, SubprocessBackend, SpawnBackendFactory (yapılandırma-güdümlü)
- **Subprocess Backend**: child_process.spawn ile worker'lar — tmux artık gerekli değil
- **Kullanım Takibi**: .deckent/usage/'da sprint tabanlı JSON depolama ile UsageTracker sınıfı
- **Coverage Doğrulama**: %5 eşik ile parseCoverageFromVitest, validateCoverage
- **Geri Alma Mekanizması**: Git güvenlik noktaları (deckent-backup-{sprintId}), tüm NO_GO'larda otomatik geri alma
- **Worker IPC**: process.send tabanlı iletişim için WorkerChannel + ChannelRegistry
- **Sıfır-Yapılandırma Modu**: `deckent start "açıklama"` — tek satır doğal dil sprint'i
- **Sandbox Temeli**: Bellek limitleri ve kapsam zorlama ile SandboxSpawnBackend
- **Global Config**: Proje birleştirmesi ile ~/.deckent/config.json (proje öncelikli)
- **Kimlik Bilgisi Yönetimi**: ~/.deckent/credentials/'da güvenli anahtar depolama (0600 izinleri)
- 13 yeni kaynak modül, 167 yeni test (3442 → 3609)

### Changed
- brain.ts config.spawn_backend'i okur ve SpawnBackendFactory.create() kullanır
- evaluateResult coverage doğrulamasını entegre eder (doküman görevleri atlar)
- spawnWorkers SpawnBackend soyutlamasını destekler (geriye uyumlu)
- tmux artık isteğe bağlı — tmux olmayan ortamlar için subprocess backend mevcut

### Fixed
- brain-ipc.test.ts kanal kaydında görev ID uyumsuzluğu
- brain-usage.test.ts OOM — ağır runSprint entegrasyonu kaldırıldı, birim testleri korundu
- spawn-backend.ts'de ESM require() → doğrudan import (TmuxBackend + SubprocessBackend)
## [0.1.0-sprint26] - 2026-03-20

### Added

- **readJsonSafe Import Göçü Tamamlama**: GO_WITH_TECH_DEBT
- **package.json files + keywords Tamamlama**: GO_WITH_TECH_DEBT
- **CODEOWNERS İyileştirme**: DONE
- **dependabot.yml İyileştirme**: DONE
- **Release Workflow İyileştirme**: DONE
- **Security Template + FUNDING.yml İyileştirme**: DONE
- **debt-manager.test.ts Test Tamamlama**: DONE
- **task-builder.test.ts Test Tamamlama**: GO_WITH_TECH_DEBT
- **CLI init.test.ts Test Tamamlama**: DONE
- **CLI archive-debt.test.ts Test Tamamlama**: DONE
- **Görevler**: 35 toplam, 35 tamamlanan, 16 teknik borç, 0 no-go
## [0.1.0-sprint25] - 2026-03-20

### Added

- **readJsonSafe/readFileSafe Paylaşımlı Yardımcı**: DONE
- **result-watcher pendingResolve Zamanlayıcı Düzeltmesi**: DONE
- **package.json files Alanı Düzeltme**: GO_WITH_TECH_DEBT
- **CODEOWNERS Dosyası**: GO_WITH_TECH_DEBT
- **dependabot.yml**: GO_WITH_TECH_DEBT
- **GitHub Actions Release Workflow**: GO_WITH_TECH_DEBT
- **Security Issue Şablonu**: GO_WITH_TECH_DEBT
- **FUNDING.yml**: GO_WITH_TECH_DEBT
- **brain.ts readJsonSafe Import Göçü**: GO_WITH_TECH_DEBT
- **debt-manager.ts readJsonSafe Import Göçü**: GO_WITH_TECH_DEBT
- **Görevler**: 97 toplam, 62 tamamlanan, 32 teknik borç, 35 no-go
## [0.1.0-sprint23] - 2026-03-18

### Fixed

- **AI planner post-validation fallback**: AI planner eksik görev döndürürse (`plannerResult.tasks.length < directiveTaskCount`) structured fallback'e düşüyor — ilk kez 12/12 görev planlandı
- **CI hardcoded path fix**: `tools-enrichment-batch2.test.ts` absolute path → `__dirname` bazlı relative path

### Added

- 12 task (12 tamamlanan, 4 teknik borç, 0 no-go) — ilk 12-görevli sprint, task queue wave mekanizması doğrulandı
- 11 doğrulama dokümanı (`tmp-test/`): Sprint 22 özelliklerinin kapsamlı validasyonu
- +30 test (1392→1422), 55 test dosyası
- Planning mode: `fallback` (AI yetersiz → structured fallback)

## [0.1.0-sprint22] - 2026-03-18

### Fixed

- **runDecay DEBT.md resolved retention**: `shouldRemoveResolvedDebt()` + `parseSprintNumber()` — resolved entry'ler 3 sprint boyunca korunuyor (DEBT-002 artık decay'de silinmiyor)

### Added

- **Auto Setup Wizard** (`src/cli/auto-setup.ts`): `generateSetupRecommendation()` — subscription, sistem profili ve proje boyutuna göre otomatik yapılandırma önerisi
- **MCP Enrichment** (10/10 tool): `enrichResponse()` altyapısı (`src/mcp/helpers/enrich.ts`) — tüm tool response'larına `_enriched: { summary, hints, timestamp }` ekleniyor
- **CLI Hints System** (`src/cli/helpers/hints.ts`, `messages.ts`): `getContextualHints()` faz bazlı öneriler, `getMessage()` lokalize mesajlar (tr/en)
- **doctor --profile**: Sistem profili gösterimi (CPU, RAM, recommended workers, subscription)
- `SetupRecommendation` interface (`types.ts`)
- +132 test (1260→1392), 0 regresyon

## [0.1.0-sprint21] - 2026-03-18

### Added

- **System Profile** (`src/core/system-profile.ts`): `getSystemProfile()` — CPU, RAM, recommended workers tespiti
- **Subscription Detection** (`src/core/subscription.ts`): `detectSubscription()` — Claude plan tespiti (max_20x/max_5x/pro/api/unknown)
- **Layered Model Selection** (`src/orchestra/brain.ts`): `resolveTaskModel()` — scope, complexity, plan, usage'a göre katmanlı model seçimi (opus/sonnet/haiku)
- **Auto Workers**: `resolveEffectiveWorkers()` — config "auto" ise sistem profiline göre worker sayısı
- **deckent test** CLI: `npx vitest run` wrapper
- **deckent run** CLI: Arbitrary komut çalıştırma
- **Planner task queue fix**: `planSprint` artık max_workers'dan bağımsız tüm görevleri planlıyor (spawnWorkers parallelism sınırını uygular)
- +137 test (1123→1260), 28 CLI komut, 0 regresyon

## [0.1.0-sprint20] - 2026-03-18

### Added

- **Fix validation sprint**: Sprint 18'de keşfedilen 6 bug'ın 3'ü doğrulandı
  - Heartbeat timestamp: PASSED (0 stale alert)
  - Dashboard progress: PASSED (done counter doğru)
  - Alert dedup: PASSED (0 duplicate alert)
  - Task queue: FAILED (planner hala max_workers ile sınırlı — Sprint 21'de düzeltildi)
  - Doc task criteria: PARTIAL
  - Model inference: doğrulanamadı
- 6 analiz dokümanı (`tmp-test/`): sistematik fix doğrulama
- 8/14 görev planlandı ve çalıştırıldı (113s)
- 1027 test (doğrulama sprint'i — yeni test yok), 0 regresyon

## [0.1.0-sprint19] - 2026-03-18

### Fixed

- **Heartbeat timestamp**: Worker heartbeat'te doğru UTC zaman damgası — stale agent false positive düzeltildi
- **Dashboard progress**: Done counter `.result` dosyaları oluşunca güncelleniyor (EVALUATE fazını beklemiyor)
- **Alert deduplication**: Aynı alert aynı scan döngüsünde tekrarlanmıyor
- **inferModelFromDirective**: Opus aşırı atama düzeltildi
- **Doc task criteria**: `isDocTask()` — doc scope'ları için coverage check atlanıyor
- **Auto doc update**: `updateProjectDocs()` — sprint sonrası doc dosyaları otomatik güncelleniyor

### Added

- Sprint 18'de keşfedilen 6 bug'ın tamamı ele alındı (6 DONE + 2 GO_WITH_TECH_DEBT)
- +96 test (1027→1123), +1555 satır kaynak kodu, 0 regresyon

## [0.1.0-sprint18] - 2026-03-18

### Added

- **Orkestrasyon smoke testi**: Sprint 10'dan bu yana ilk gerçek `runSprint` çalıştırma — 10 paralel doküman görevi planlandı, 8 çalıştırıldı
- **8 dokümantasyon dosyası** (~135 KB toplam): GLOSSARY, TROUBLESHOOTING, SECURITY, MCP-GUIDE, MEMORY-SYSTEM, SPRINT-LIFECYCLE, CONFIG-REFERENCE, WORKER-GUIDE
- **Sprint gözlem raporu**: `docs/SPRINT-18-OBSERVATION.md` — detaylı faz-faz orkestrasyon analizi
- **6 hata keşfedildi**: planner max_workers görev limiti, heartbeat zaman damgası kayması, dashboard ilerleme gecikmesi, alert tekrar kaldırma eksik, doküman görevi coverage kriteri, DEBT.md boş tablo testi
- **Uçtan uca doğrulama**: PLAN → SPAWN → EXECUTE → EVALUATE → RETRO → CLEANUP 8 paralel sonnet worker ile 260 saniyede tamamlandı
- **Test paketi**: 1027 test (0 yeni — sadece doküman sprint'i), %97.5 coverage, 0 regresyon

## [0.1.0-sprint17] - 2026-03-18

### Added

- **MCP arka plan işleri**: `deckent_start` `jobId` ile hemen döner, sprint `child_process.fork()` ile arka planda çalışır — MCP timeout yok
- **`.deckent/jobs/{jobId}.json`**: İş durumu takibi (RUNNING/COMPLETE/FAILED)
- **`deckent_status`** artık aktif iş durumunu içerir
- **cleanup() düzeltme**: Tüm görev dosya uzantılarını kapsar (.json, .plan, .hb, .result, .paused, .log), sprint ön ek koruması, eski dosya tespiti (24s)
- **Sprint ID güvenliği**: `.deckent/config.json`'da `last_sprint_id`, config vs dosya tarama maksimumu — asla gerilemez
- **Dashboard sıfırlama**: PLAN fazında taze `DashboardState`, sprint ID uyumsuzluğu auditor'da sıfırlama tetikler
- **React test altyapısı**: `src/dashboard/vitest.config.ts` (happy-dom), AgentDetail + DashboardPage testleri
- **`test:dashboard`** npm betiği: `vitest run --config src/dashboard/vitest.config.ts`
- **Test paketi**: 1027 test (+40 yeni), %97.5 coverage, 0 regresyon

## [0.1.0-sprint16] - 2026-03-18

### Added

- **`deckent watch`** CLI komutu: Dashboard ve worker panelleri ile canlı tmux bölünmüş görünüm, `--follow <taskId>` flag'i
- **Worker log yakalama**: tmux pipe-pane worker stdout'unu `.tasks/task-{id}.log`'a yakalar
- **`deckent start --watch`**: Sprint çalışmadan önce izleme penceresi oluşturur (bloklamayan)
- **`readWorkerLog()`** (`src/agents/worker.ts`): Worker log dosyalarını okuma yardımcısı
- **GET `/api/worker/:taskId/log`**: Görev JSON + worker log içeriği döndüren API endpoint
- **`AgentDetail`** bileşeni: 3 saniye yoklama ile React bileşeni, Sheet panelinde gösterilir
- **`inferModelFromDirective()`** (`src/orchestra/brain.ts`): Yapısal planlayıcı modu için sezgisel model seçimi
- **`setupWatchWindow()`** (`src/orchestra/tmux.ts`): Bloklamayan izleme düzeni oluşturma
- **.brain/ dogfooding**: sprint-015.md log, ADR-013, MEMORY.md Sprint 15 öğrenmeleri
- **Test paketi**: 987 test (+20 yeni), %97.5 coverage, 0 regresyon

## [0.1.0-sprint15] - 2026-03-18

### Added

- **DECKENT.md** — Agent yapılandırması için tek doğruluk kaynağı (AGENTS.md+CLAUDE.md symlink kalıbını değiştirir)
- **`ensureDeckentImport()`** (`src/core/utils.ts`): Eklemeli @DECKENT.md enjeksiyonu için paylaşımlı yardımcı — mevcut içeriği asla üzerine yazmaz
- **`DECKENT_FILE` sabiti** (`src/core/constants.ts`)
- **Init eklemeli enjeksiyon**: `deckent init` artık CLAUDE.md'yi üzerine yazmaz — bunun yerine `ensureDeckentImport()` kullanır
- **Config birleştirme**: Yeniden başlatma sırasında mevcut `.deckent/config.json` alanları korunur
- **Blueprint-kalitesinde kural şablonları**: brain.md (13 kural + frontmatter), auditor.md (9 kural), worker-default.md (9 kural)
- **`deckent sync`** CLI komutu: Adaptör dosyalarını (CLAUDE.md, AGENTS.md) DECKENT.md referansı ile senkronize et
- **`deckent_sync`** MCP aracı (10. araç): MCP üzerinden aynı işlevsellik
- **`deckent://config`** MCP kaynağı (5. kaynak): MCP üzerinden proje yapılandırmasını oku
- **Kendi kendini barındırma**: deckent-dev artık kendi `.deckent/` yapısını çalıştırıyor (config, workspace, i18n, plugins)
- **DEBT-002 kapatıldı**: checkUsage sprint-003'te çözüldü, borç kaydı resmileştirildi
- **Test paketi**: 967 test (+29 yeni), %97.5 coverage, 0 regresyon

## [0.1.0-sprint12-13] - 2026-03-18

### Added

- **Brain AI Planlama** (`src/orchestra/planner.ts`): Zod şema doğrulaması ile AI görev planlaması, 3 planlama modu (ai/structured/auto)
- **BrainPlanningMode**: PlanModeConfig'de `'ai' | 'structured' | 'auto'` yapılandırma alanı
- **DRAFT görev durumu**: `confirmDraftTasks()` spawn'dan önce DRAFT → PENDING geçişi yapar
- **Süreç-içi Auditor**: `startScanLoop()` Brain'in `runSprint` içinde çalışır (Faz 2.5), ayrı tmux penceresi değil
- **`writeScanToDashboard()`**: Tarama sonuçlarını dashboard durumuna birleştirir (alertler, agent durumları)
- **Worker heartbeat prompt'u**: `buildWorkerPrompt` .hb dosya oluşturma/güncelleme talimatlarını içerir
- **.deckent/ yapısı**: TOOLS.md, BOOT.md, plugins/, i18n/ init tarafından oluşturulur
- **Test paketi**: 938 test, %97.5 coverage

## [0.1.0-sprint11] - 2026-03-18

### Added

- **Web Dashboard** (`src/dashboard/`): React+Vite+Tailwind, shadcn/ui bileşenleri
- **4 sayfa**: DashboardPage, SettingsPage, HistoryPage, MemoryPage
- **14 UI bileşeni**: button, card, tabs, select, input, label, separator, sheet, scroll-area, badge, table, textarea, dialog, progress
- **6 ana bileşen**: Layout, DebtTable, ThemeProvider, NewSprintModal, SprintChart, SimpleMarkdown
- **SSE entegrasyonu**: `useSSE` hook, gerçek zamanlı dashboard güncellemeleri
- **`deckent web`**: localhost:3100'de HTTP API + web dashboard başlatır
- **Koyu/açık tema**, hamburger menü ile mobil uyumlu
- **Test paketi**: 852 test, %97 coverage

## [0.1.0-sprint10] - 2026-03-17

### Added

- **HTTP API** (`src/api/server.ts`): 15 endpoint + SSE akışı
- **Route'lar**: GET status/sprint/history/config/doctor/memory/debt/job/events, POST start/plan/kill/set-directives/config
- **Dashboard gözlemcisi** (`src/api/watcher.ts`): SSE için debounce ile dosya gözlemcisi
- **Terminal dashboard** (`deckent dashboard`): Unicode kutu çizimi ile zengin TUI
- **`deckent serve`**: Bağımsız HTTP API sunucusu
- **Sprint ID yeniden düzenleme**: Kod tabanı genelinde tutarlı format
- **Test paketi**: 799 test, %95 coverage

## [0.1.0-sprint9] - 2026-03-17

### Added

- **Analizci** (`src/core/analyzer.ts`): Proje stack, boyut, metodoloji tespiti
- **9. MCP aracı**: `deckent_analyze_project` — projeyi analiz eder ve öneriler döndürür
- **CI pipeline**: GitHub Actions workflow
- **Dinamik sürüm**: Çalışma zamanında package.json'dan okur
- **`deckent archive-debt`**: Çözülmüş teknik borçları arşivle
- **Zenginleştirilmiş sprint geçmişi**: Sprint log görüntülemede metrikler
- **Test paketi**: 720 test, %95 coverage

## [0.1.0-sprint8] - 2026-03-17

### Added

- **CONTRIBUTING.md**: Tam katkı rehberi (kurulum, standartlar, test, PR süreci)
- **docs/API.md**: Kapsamlı programatik API referansı (1491 satır)
- **docs/ARCHITECTURE.md**: Yoğunlaştırılmış mimari genel bakış
- **docs/ROADMAP.md**: Faz tabanlı yol haritası
- **MCP dogfooding**: Geliştirme sırasında Deckent'in kendi MCP araçları kullanıldı
- **Test paketi**: 669 test, %95 coverage

## [0.1.0-sprint7] - 2026-03-17

### Added

- **MCP Sunucusu** (`src/mcp/`): 8 araç + 4 kaynak, stdio taşıma
- **Sürtünmesiz entegrasyon**: .claude/settings.json'da otomatik kayıt
- **Test paketi**: 669 test, %95 coverage, 24 yeni MCP testi

## [0.1.0-sprint6] - 2026-03-16

### Added

- **İlk dogfooding**: Deckent kendi üzerinde `deckent start` çalıştırdı
- 1 worker ile 86 saniyede README.md oluşturuldu
- Uçtan uca orkestrasyon döngüsü kanıtlandı
- **Test paketi**: 645 test, %95 coverage

## [0.1.0-sprint5] - 2026-03-16

### Added

- **Bellek decay**: >300 satır olduğunda .brain/ otomatik sıkıştır
- **Doctor kontrolleri**: Ön uçuş doğrulaması için `runDoctorChecks()`
- **`deckent start --dry-run`**: Worker spawn etmeden görevleri planla
- **`deckent status --watch`**: Her 2 saniyede otomatik yenileme
- **Barrel hariç tutma**: index.ts dosyaları coverage'dan hariç
- **Test paketi**: 644 test, %94.83 coverage

## [0.1.0-sprint4] - 2026-03-16

### Added

- **Borç çözüm yaşam döngüsü**: `resolveDebt()`, eski borç temizliği
- **Test paketi**: 617 test, %93 coverage

## [0.1.0-sprint3] - 2026-03-16

### Fixed

- **haiku_allowed**: Semantik düzeltme (true = haiku düşürme seçeneği olarak izinli)
- **checkUsage regex**: Kullanım yüzdesi ayrıştırma düzeltildi

### Added

- **Test paketi**: 540 test, %92 coverage

## [0.1.0-sprint2] - 2026-03-16

### Changed

- **Async göçü**: `sleepSync(Atomics.wait)` → `async sleep(setTimeout)`
- Brain artık sprint yaşam döngüsü boyunca tamamen async

### Added

- **Test paketi**: 480 test, %91 coverage

## [0.1.0-wave4] - 2026-03-16

### Added

- **CLI Module** (`src/cli/`): 17 komut, 16 komut dosyası, 3 helper — `deckent` CLI arayüzü
- **Entry point** (`src/cli/index.ts`): Shebang + Commander program, 16 register fonksiyonu
- **Init wizard** (`src/cli/commands/init.ts`): Interactive setup — plan seçimi, dil, proje adı, dizin yapısı oluşturma, .gitignore duplicate kontrolü
- **Doctor** (`src/cli/commands/doctor.ts`): Node.js, git, tmux, Claude CLI sağlık kontrolü
- **Terminal dashboard** (`src/cli/commands/status.ts`): Unicode box-drawing ile ASCII dashboard render
- **Sprint commands**: `start` (runSprint + --auto-approve + --sandbox stub), `plan` (plan-only mode), `cleanup`, `retro`
- **Agent commands**: `attach` (tmux), `spawn` (manual worker), `kill` (worker kill)
- **Config commands**: `config` (show), `config set` (validate + write)
- **Info commands**: `usage`, `history` (sprint log table)
- **Stub commands**: `plugin install/list`, `upgrade`, `onboard` — "not yet implemented"
- **Helpers**: `output.ts` (formatDashboard, formatDoctorResult, formatTable, formatProgressBar, formatSprintSummary), `process.ts` (EXIT_CODES, handleCliError, resolveProjectRoot), `prompt.ts` (promptText, promptSelect, promptConfirm)
- **Çalışma zamanı bağımlılığı**: `commander@^13.0.0` (tek runtime bağımlılık)
- **Test paketi**: 86 yeni test, toplam 297 (tümü geçiyor)
- **Coverage**: genel %92.91; CLI komutları %98.33, CLI giriş %95.23, CLI yardımcılar %89.47

### Changed

- `vitest.config.ts`: Removed `src/cli/**` from coverage exclude
- `package.json`: Added `commander` as runtime dependency

## [0.1.0-wave3] - 2026-03-16

### Added

- **Brain Module** (`src/orchestra/brain.ts`): 17 exported fonksiyon + 7 internal helper — tam sprint yaşam döngüsü (8 phase), GO/NO-GO değerlendirme, çapraz bağımlılık çözümü, debt escalation (2→HIGH, 3+→CRITICAL), decay mekanizması (300 satır budget), usage-aware sprint planning. `BrainError` error class. `BrainContext`, `ProjectState`, `SprintSizeRecommendation`, `CreateTaskParams` interfaces.
- **Sprint Lifecycle**: `runSprint` master orchestrator — PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP. Her phase try/catch ile korunur, sprint asla yarım kalmaz.
- **DEBT.md Programatic I/O**: `parseDebtTable`/`generateDebtTable` ile markdown tablo formatı korunarak okuma/yazma.
- **Barrel export'ları**: `src/orchestra/index.ts` 17 brain fonksiyon export'u + 4 tip export'u ile güncellendi
- **Sabitler**: `DEBT_TABLE_HEADER` `src/core/constants.ts`'ye eklendi
- **Test paketi**: 83 yeni test, toplam 211 (tümü geçiyor)
- **Coverage**: brain.ts %93.61 statement, %96.42 fonksiyon; genel %91.51

## [0.1.0-wave2] - 2026-03-16

### Added

- **tmux Manager** (`src/orchestra/tmux.ts`): 10 fonksiyon — session management, worker spawn/kill, auditor start, attach, send-keys. `SpawnOptions` interface (allowedTools + autoApprove). `TmuxError` error class.
- **Auditor** (`src/monitor/auditor.ts`): 10 fonksiyon — heartbeat scanning, boundary violation detection (git diff), stale lock detection, Kahn's algorithm deadlock detection, dashboard update, pattern detection. Resilient `readJsonSafe` pattern.
- **Worker** (`src/agents/worker.ts`): 12 fonksiyon — task read/claim, plan write, file locking (acquire/release/check/releaseAll), heartbeat create/write, result write with status update, scope validation. `TaskClaimError`, `LockError`, `ScopeViolationError` error classes.
- **Barrel export'ları**: `src/orchestra/index.ts`, `src/monitor/index.ts`, `src/agents/index.ts`
- **Root yeniden export'lar**: `src/index.ts` 3 yeni modül export'u ile güncellendi
- **Test paketi**: 80 yeni test (19 tmux + 24 auditor + 37 worker), toplam 128
- **Coverage**: genel %90.89 (tmux %100, auditor %95.58, worker %95.81)

## [0.1.0-wave1] - 2026-03-16

### Added

- **Constants** (`src/core/constants.ts`): 50+ constants — paths, timing, memory limits, tmux names, task extensions, tech debt escalation, defaults
- **Type system** (`src/core/types.ts`): 8 enums (`TaskStatus`, `TaskEvaluation`, `AgentStatus`, `AlertLevel`, `SprintPhase`, `SprintStatus`, `DebtPriority`), 25+ interfaces covering Task, Sprint, Agent, Config, Dashboard, Memory, Lock, Usage, Plugin, and CLI domains
- **Config loader** (`src/core/config.ts`): 3-layer merge (defaults → global → project), `ConfigValidationError` with detailed error arrays, `deepMerge`, `loadConfig`, `validatePartialConfig`
- **Barrel export'ları**: `src/core/index.ts`, `src/index.ts`
- **Test paketi**: 3 dosyada 48 test — constants, types (enum üyeliği), config (yükleme/birleştirme/doğrulama)
- **Coverage**: genel %91.87 (constants %100, types %100, config %92.39)
- **Proje iskeleti**: `package.json`, `tsconfig.json` (strict, Node16, ES2022), `vitest.config.ts`, `.gitignore`
