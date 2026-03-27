# Deckent Beta Readiness Roadmap

**Son güncelleme:** 2026-03-27 | **Sprint:** 071 | **Test:** 12,160 | **Durum:** Closed Beta — Dogfooding aktif

---

## Genel Bakış

71 sprint, 12,160+ test, 250+ TypeScript modülü. Windows dogfooding tamamlandı — init→plan→start→status→cleanup zinciri çalışıyor. İlk gerçek sprint Vizetron'da başarıyla tamamlandı.

**Strateji:** npm paketle → kendi projelerinde dogfood → feedback → düzelt → public repo (VerhexIO/deckent)

**Mevcut Durum:** Mono Closed Beta v0.2.0-beta.3 — Vizetron (Python/FastAPI) projesinde 2 sprint tamamlandı, 26 bug bulundu, 22'si düzeltildi.

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
| 7 | Plan tier'ları Claude-specific | **YAPILACAK** | max_plan/max5x_plan/pro_plan → performance/balanced/economic |
| 8 | Claude subscription bağımlılığı | **YAPILACAK** | Init wizard "Select your Claude plan" → genel provider seçimi |
| 9 | Model isimleri güncelliği | **YAPILACAK** | opus/sonnet/haiku, gpt-5/gpt-4.1, gemini-2.5-pro doğruluğu |
| 10 | Multi-provider aynı anda test | **YAPILACAK** | Claude + Codex + Gemini aynı sprint'te hiç test edilmedi |
| 11 | API + Subscription birlikte | **YAPILACAK** | API key ile subscription aynı anda çalışıyor mu? |
| 12 | Codex/Gemini CLI binary check | **YAPILACAK** | Gerçek CLI binary'leri doğrulama |

## P2 — Dokümantasyon

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 13 | README.md eski veriler | **KISMEN** | Badge güncellendi, özellikler hala eksik |
| 14 | Dil tutarsızlığı | **YAPILACAK** | Bazı docs İngilizce başlıyor Türkçe devam ediyor |
| 15 | TR+EN çift dil | **KISMEN** | .deckent/docs/ TR/EN desteği eklendi |
| 16 | CHANGELOG.md boş | **YAPILACAK** | 71 sprint'lik geçmiş yok |
| 17 | Config referans eksik | **DONE** | .deckent/docs/config-reference.md |
| 18 | VISION.md eksik | **YAPILACAK** | Proje vizyonu ve yol haritası |
| 19 | docs/ link kontrolü | **YAPILACAK** | Linklenen dokümanlar var mı? |

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
| 29 | .detect-secrets | **YAPILACAK** | Secret leak koruması |

## P5 — Kod Kalitesi

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 30 | .gitignore runtime state | **DONE** | |
| 31 | God objects | **YAPILACAK** | sprint-controller 2300+ satır |
| 32 | V2 routing test-writer bias | **KISMEN** | Exclude kuralı yazıldı |

## P6 — Kullanıcı Deneyimi İyileştirmeleri

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 33 | Error messages kullanıcı-dostu değil | **YAPILACAK** | Teknik kodlar → anlaşılır mesajlar |
| 34 | `deckent explain` MCP'de yok | **YAPILACAK** | CLI-only rehberlik aracı |
| 35 | Telemetry/analytics | **YAPILACAK** | Opt-in kullanım analitikleri |
| 36 | `deckent upgrade` test | **DONE** | `--local` flag eklendi, beta workflow |
| 37 | Skill marketplace backend | **YAPILACAK** | CLI komutu var ama backend yok |
| 38 | Plugin system e2e test | **YAPILACAK** | Gerçek plugin ile test edilmedi |
| 39 | Rate limiting production | **YAPILACAK** | 100 req/60s yeterli mi? |
| 40 | Graceful shutdown | **YAPILACAK** | Ctrl+C → state tutarlılığı |

---

## Faz Planı

### Faz 1: "Kendin Kullan" — TAMAMLANDI ✅
### Faz 1.5: "Init UX + Onboarding" — TAMAMLANDI ✅ (Sprint 070-071)

### Faz 2: "Genel Kullanılabilirlik" — AKTİF

**Sprint 072 Planı:**
- [ ] P1-7: Plan tier'ları genel → performance/balanced/economic
- [ ] P1-8: Init wizard → genel provider seçimi (Claude/Codex/Gemini)
- [ ] P1-9: Model isimleri doğrulama + güncel model listesi
- [ ] P2-16: CHANGELOG.md — Sprint 066-071 entries
- [ ] P2-13: README.md güncel özellikler, test sayısı, Windows desteği
- [ ] P5-31: sprint-controller.ts god object → modüler split başlangıcı

**Sprint 073+ Planı:**
- [ ] P1-10: Multi-provider test — Claude + Codex aynı sprint
- [ ] P1-12: Codex/Gemini CLI binary doğrulama
- [ ] P2-18: VISION.md yazımı
- [ ] P3-20..22: Dashboard gerçek test
- [ ] P4-29: .detect-secrets kurulumu

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
| **Toplam** | **40/40** | **40** | 12,160 test, 0 regression, v0.2.0-beta.3 |
