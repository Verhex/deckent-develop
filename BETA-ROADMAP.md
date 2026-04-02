<!-- Dil: TR | Teknik terimler EN -->
# Deckent Beta Readiness Roadmap

**Son güncelleme:** 2026-04-02 | **Sprint:** 080 | **Test:** 12,190+ | **Durum:** Closed Beta — Dogfooding aktif

---

## Genel Bakış

75+ sprint, 12,200+ test, 250+ TypeScript modülü. Windows dogfooding tamamlandı — init→plan→start→status→cleanup zinciri çalışıyor. İlk gerçek sprint Vizetron'da başarıyla tamamlandı. Self-dogfooding aktif — Deckent kendi test regresyonlarını ve dokümantasyonunu sprint'lerle düzeltiyor. Dil tutarlılığı (TR/EN) tamamlandı, VISION.md ve link audit bitti.

**Strateji:** npm paketle → kendi projelerinde dogfood → feedback → düzelt → public repo (VerhexIO/deckent)

**Mevcut Durum:** Mono Closed Beta v0.2.0-beta.4 — Vizetron (Python/FastAPI) projesinde 2 sprint tamamlandı, 26 bug bulundu, 22'si düzeltildi. Dokümantasyon ve kod kalitesi iyileştirmeleri Sprint 075 tamamlandı.

---

## Dogfooding Bug Tracker

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

## P0 — npm Paketleme + Dogfooding — TAMAMLANDI ✅

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 1 | npm publish test | **DONE** | 518KB, 479 dosya, local install çalışıyor |
| 2 | `deckent init` gerçek proje testi | **DONE** | Windows'ta Vizetron (Python/FastAPI) test edildi |
| 3 | `deckent doctor` dış ortam | **DONE** | WSL2 + Windows, SKIP/OK/FAIL, healthScore fix |
| 4 | Shebang + bin entry | **DONE** | `deckent` + `deckent-mcp` çalışıyor |
| 5 | İlk sprint UX | **DONE** | Vizetron'da sprint-002 başarıyla tamamlandı |
| 6 | Windows native desteği | **DONE** | 7 dosyada shell:true, heartbeat periodic, log capture |

## P1 — Provider & Tier Generalizasyonu

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 7 | Plan tier'ları Claude-specific | **DONE** | performance/balanced/economic + backward compat (Sprint 072) |
| 8 | Claude subscription bağımlılığı | **DONE** | Init wizard provider-agnostic, $ kaldırıldı (Sprint 072) |
| 9 | Model isimleri güncelliği | **DONE** | MODEL_API_IDS + resolveApiModelId() (Sprint 072) |
| 10 | Multi-provider aynı anda test | **YAPILACAK** | Claude + Codex + Gemini aynı sprint'te hiç test edilmedi |
| 11 | API + Subscription birlikte | **YAPILACAK** | API key ile subscription aynı anda çalışıyor mu? |
| 12 | Codex/Gemini CLI binary check | **YAPILACAK** | Gerçek CLI binary'leri doğrulama |

## P2 — Dokümantasyon

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 13 | README.md eski veriler | **DONE** | Badge + sayılar güncellendi (Sprint 074) |
| 14 | Dil tutarsızlığı | **DONE** | docs/CHANGELOG.md Türkçeleştirildi (Sprint 075) |
| 15 | TR+EN çift dil | **KISMEN** | .deckent/docs/ TR/EN desteği eklendi |
| 16 | CHANGELOG.md boş | **DONE** | docs/CHANGELOG.md 1159 satır, Sprint 1-073 (Sprint 074) |
| 17 | Config referans eksik | **DONE** | .deckent/docs/config-reference.md |
| 18 | VISION.md eksik | **DONE** | VISION.md oluşturuldu — vizyon, rakip analizi, roadmap (Sprint 075) |
| 19 | docs/ link kontrolü | **DONE** | 4 broken link tespit edildi ve düzeltildi (Sprint 075) |

## P3 — UX & Dashboard

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 20 | Dashboard veri doğruluğu | **YAPILACAK** | Doğru veri görüntülemiyor |
| 21 | Dashboard config arayüzü | **YAPILACAK** | Tüm config ayarları dashboard'dan seçilebilmeli |
| 22 | Dashboard gerçek test | **YAPILACAK** | React dashboard gerçek sprint ile hiç test edilmedi |
| 23 | Config.json karmaşıklığı | **KISMEN** | config-reference.md var, dashboard'dan seçim eksik |
| 24 | İlk kullanım deneyimi | **DONE** | quick-start.md, directives-guide.md, workflow rehberi |

## P4 — Platform & Altyapı

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 25 | Windows native | **DONE** | Tam destek: spawn, heartbeat, log, encoding, ps guard |
| 26 | Node >= 18 neden? | **YAPILACAK** | OpenClaw Node 22+, ES2022+ feature check |
| 27 | Docker/Sandbox | **YAPILACAK** | Var mı? Çalışıyor mu? |
| 28 | CI/CD billing | **YAPILACAK** | Public repo ile çözülür |
| 29 | .detect-secrets | **DONE** | .pre-commit-config.yaml kuruldu, detect-secrets v1.5.0 (Sprint 075) |

## P5 — Kod Kalitesi

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 30 | .gitignore runtime state | **DONE** | |
| 31 | God objects | **DONE** | Faz 1 (Sprint 072), Faz 2 (Sprint 075), Faz 3 (Sprint 076) — result-collector.ts extract tamamlandı |
| 32 | V2 routing test-writer bias | **KISMEN** | Exclude kuralı yazıldı |

## P6 — Kullanıcı Deneyimi İyileştirmeleri

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

## Faz Planı

### Faz 1: "Kendin Kullan" — TAMAMLANDI ✅
### Faz 1.5: "Init UX + Onboarding" — TAMAMLANDI ✅ (Sprint 070-071)

### Faz 2: "Genel Kullanılabilirlik" — AKTİF

**Sprint 072 — TAMAMLANDI (2026-03-27):**
- [x] P1-7: Plan tier'ları → performance/balanced/economic + backward compat
- [x] P1-8: Init wizard → genel provider seçimi, $ kaldırıldı
- [x] P1-9: MODEL_API_IDS mapping + resolveApiModelId()
- [x] P2-13: README.md → 12,160+ test, 71+ sprint, Windows full, 17 MCP tools
- [x] P5-31: sprint-controller.ts → 7 phase fonksiyonu sprint-phases.ts'ye extract

**Sprint 073 — TAMAMLANDI (2026-03-30) — Self Dogfooding:**
- [x] 100 test regresyonu düzeltildi (43+16+9+23+3 = 100 fail → 0 fail)
- [x] test-writer agent 5/5 task DONE, 17m 41s

**Sprint 074 — TAMAMLANDI (2026-03-30) — Docs + Debt:**
- [x] P2-13: README.md sayılar güncellendi (12,176+ test, 73+ sprint)
- [x] P2-16: CHANGELOG + SPRINT-LOG Sprint 072-073 entry'leri
- [x] .brain/ tutarlılık (PROJECT-IDENTITY, DECISIONS)
- [x] CLAUDE.md + DECKENT.md modül sayıları düzeltildi (orchestra 45, core 49, MCP 17)
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

**Sprint 078 (Deckent sprint-076) — TAMAMLANDI (2026-04-01):**
- [x] Blueprint senkronizasyonu — MCP 17 tools/9 resources, memory 900, CLI 32
- [x] ANA-PLAN-TR tam güncelleme
- [x] BETA-ROADMAP Sprint 076-077 DONE
- [x] Memory budget 600→900 tüm docs'ta
- [x] Dashboard i18n (LanguageProvider, 90+ key, dil switcher)
- [x] README-TR.md + VISION-EN.md oluşturuldu
- [x] GET /api/tasks endpoint
- [x] SSE bağlantı indicator, config mode/memory fix
- [x] Docs catch-up (CHANGELOG, SPRINT-LOG, PROJECT-IDENTITY)
- [x] HistoryPage success rate trend chart

**Sprint 079 (Deckent sprint-077) — TAMAMLANDI (2026-04-01):**
- [x] README-TR.md UTF-8 karakter düzeltme
- [x] Dashboard kontrol butonları (Cleanup, Kill All)
- [x] Init wizard dil seçimi İLK adım
- [x] POST /api/cleanup endpoint

**Sprint 080 (Deckent sprint-078-080) — TAMAMLANDI (2026-04-02):**
- [x] Dashboard UX Overhaul: WorkerCard grid, SprintPhaseTimeline, ActivityFeed
- [x] Settings+Config birleştirme, i18n tam kapsam (44 key)
- [x] Config round-trip testleri (10 test), terminal logları
- [x] MCP/CLI parity: 13 parametre, 2 yeni tool (agent_list, skill_list)
- [x] CLI set-directives komutu, ADR-022 dokümantasyonu

**Sonraki Planlar:**
- [ ] Usage tracking gerçek veri (Claude API rate limit sorgusu)
- [ ] Dashboard Faz B (task detay, skeleton loader)
- [ ] P1-10..12: Multi-provider test (BLOCKED — API key gerekli)
- [ ] Windows Codex CLI dogfooding

### Faz 3: "Dokümantasyon"
TR+EN çift dil, VISION, link audit, config dashboard

### Faz 4: "Public Repo"
.detect-secrets, VerhexIO/deckent'e taşıma, CI/CD, npm publish

---

## Tamamlanan Sprintler

| Sprint | Task | DONE | Öne Çıkan |
|--------|------|------|-----------|
| 066 | 7/7 | 7 | Phantom modüller, manifest v2, MCP docs |
| 067 | 6/6 | 6 | Paket 494KB, retro notes, any cleanup |
| 068 | 6/6 | 6 | AI-native discoverability, V2 routing |
| 069 | 6/6 | 6 | Skill stats, agent precision, tempAgent |
| 070 | 8/8 | 8 | Init UX overhaul, 15 bug fix, Windows dogfooding |
| 071 | 7/7 | 7 | BUG-19..26 fix, heartbeat periodic, upgrade --local |
| 072 | 5/5 | 5 | Tier generalizasyonu, model API IDs, god object split, README |
| 073 | 5/5 | 5 | Self-dogfooding: 100 test regresyonu fix, 0 fail |
| 074 | 7/7 | 7 | Docs tutarlılık, debt-069 kapanış, CHANGELOG/SPRINT-LOG |
| 075 | 5/5 | 5 | Docs TR tutarlılık, VISION.md, link audit, detect-secrets, god object faz 2 |
| 076 | 4/4 | 4 | Stale heartbeat fix, dashboard API test, graceful shutdown, god object faz 3 |
| 077 | 3/3 | 3 | CHANGELOG, SPRINT-LOG, PROJECT-IDENTITY, CLAUDE.md güncelleme |
| 078 | 10/10 | 10 | Blueprint sync, i18n, TR/EN docs, /api/tasks, SSE indicator, docs catch-up |
| 079 | 4/4 | 4 | README-TR fix, dashboard kontrol, init dil-ilk, /api/cleanup |
| 080 | 14/14 | 14 | Dashboard overhaul, config birleşme, MCP/CLI parity (19 tool), ADR-022 |
| **Toplam** | **97/97** | **97** | 12,190+ test, 0 regression, v0.2.0-beta.4 |
