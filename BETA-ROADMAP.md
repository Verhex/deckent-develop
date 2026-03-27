# Deckent Beta Readiness Roadmap

**Son güncelleme:** 2026-03-27 | **Sprint:** 070 | **Test:** 12,160 | **Durum:** Closed Beta — Dogfooding aktif

---

## Genel Bakış

70 sprint, 12,160+ test, 250+ TypeScript modülü. Windows dogfooding tamamlandı — init→plan→start→status→cleanup zinciri çalışıyor.

**Strateji:** npm paketle → kendi projelerinde dogfood → feedback → düzelt → public repo (VerhexIO/deckent)

**Mevcut Durum:** Mono Closed Beta — Vizetron (Python/FastAPI) projesinde dogfooding yapıldı, 17 bug bulundu, 15'i düzeltildi.

---

## Dogfooding Bug Tracker

### Düzeltilen Bug'lar (Sprint 070)

| Bug | Açıklama | Root Cause | Fix | Dosya |
|-----|----------|-----------|-----|-------|
| BUG-3 | Claude CLI spawn ENOENT (Windows) | `spawn('claude')` Windows'ta `.cmd` wrapper çözemez | `shell: process.platform === 'win32'` — 7 dosyada | subprocess.ts, claude.ts, doctor.ts, subscription.ts, usage-manager.ts, onboard.ts |
| BUG-4 | Worker rules hardcoded `tsc --noEmit` | Init template sabit TypeScript komutları yazıyordu | `detectFullStack()` sonucunu worker rules'a aktar | init.ts |
| BUG-6 | Stack detection `Language: unknown` | `analyzeProject()` sadece `--auto` modda çalışıyordu | Stack detection HER ZAMAN çalıştır | init.ts |
| BUG-7 | Doctor FAIL+OK çelişkisi | Optional provider'lar FAIL olarak gösteriliyordu | FAIL → SKIP etiketi (optional provider'lar için) | doctor.ts |
| BUG-8 | Framework `next` (fastapi olmalı) | JS framework detection dil kontrolü yapmıyordu | Python/Go/Rust projede JS framework algılama atla | stack-detector.ts |
| BUG-9 | IDENTITY.md dosyası eksik | `.deckent/workspace/IDENTITY.md` hiç oluşturulmuyordu | Init'te workspace IDENTITY.md oluştur | init.ts |
| BUG-10 | DECKENT.md `Build: tsc` (Python projede) | `commands.build = ""` falsy → default `tsc` kalıyordu | `!== undefined` kontrolü + `echo "no build step"` | init.ts |
| BUG-11 | DIRECTIVES.md boş placeholder | Kullanıcı ne yazacağını bilmiyordu | Stack-aware örnek task formatı + TR/EN şablon | init.ts |
| BUG-12 | Worker rules hardcoded `npx vitest run` | Test komutu stack'e göre değişmiyordu | `detectFullStack().commands.test` kullan | init.ts |
| BUG-13 | Brain rules yanlış limitler | `max 200 lines`, `exceeds 600 lines` eski değerler | 200→300, 600→900 güncellendi | init.ts |
| BUG-14 | TempAgent oluşturulmuyor | "mixed" dil projede hiçbir template eşleşmiyordu | `detectedLanguages` ile genişletilmiş eşleşme | temp-skill-generator.ts, stack-detector.ts |
| BUG-15 | BOOT.md kullanıcı ipucu yok | Sadece teknik iç süreç yazıyordu | Kullanıcı-dostu açıklama + ipuçları (TR/EN) | init.ts |
| BUG-16 | `ps: unknown option -- o` (Windows) | POSIX `ps` komutu Windows'ta yok | `process.platform !== 'win32'` guard | wizard.ts |

### Yeni Özellikler (Sprint 070)

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

### Devam Eden Bug'lar

| Bug | Açıklama | Önem | Not |
|-----|----------|------|-----|
| BUG-17 | Worker `.result` dosyası yazmıyor | Medium | Worker çalışıp bitiyor ama result/hb güncellemiyor. İzin veya prompt sorunu olabilir |
| BUG-18 | MCP komutu `deckent mcp` değil `deckent-mcp` | Low | Dokümantasyon tutarsızlığı — binary adı düzeltilmeli |

---

## P0 — npm Paketleme + Dogfooding

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 1 | npm publish test | **DONE** | 518KB, 479 dosya, local install çalışıyor |
| 2 | `deckent init` gerçek proje testi | **DONE** | Windows'ta Vizetron (Python/FastAPI) projesinde test edildi |
| 3 | `deckent doctor` dış ortam | **DONE** | WSL2 + Windows test edildi, SKIP/OK/FAIL etiketleri düzeltildi |
| 4 | Shebang + bin entry | **DONE** | `#!/usr/bin/env node`, `deckent` + `deckent-mcp` çalışıyor |
| 5 | İlk sprint UX | **DONE** | DIRECTIVES rehberi, quick-start docs, workflow guide, stack-aware templates |
| 6 | Windows native desteği | **DONE** | subprocess backend, tmux skip, CLI shell:true, ps guard, spawn fix |

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
| 13 | README.md eski veriler | **KISMEN** | Badge güncellendi (12100+), özellikler hala eksik |
| 14 | Dil tutarsızlığı | **YAPILACAK** | Bazı docs İngilizce başlıyor Türkçe devam ediyor |
| 15 | TR+EN çift dil | **KISMEN** | .deckent/docs/ TR/EN desteği eklendi, ana docs hala tek dil |
| 16 | CHANGELOG.md boş | **YAPILACAK** | 80 byte — 70 sprint'lik geçmiş yok |
| 17 | Config referans eksik | **DONE** | .deckent/docs/config-reference.md init'te oluşturuluyor |
| 18 | VISION.md eksik | **YAPILACAK** | Proje vizyonu ve yol haritası |
| 19 | docs/ link kontrolü | **YAPILACAK** | Linklenen dokümanlar var mı? |

## P3 — UX & Dashboard

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 20 | Dashboard veri doğruluğu | **YAPILACAK** | Doğru veri görüntülemiyor |
| 21 | Dashboard config arayüzü | **YAPILACAK** | Tüm config ayarları dashboard'dan seçilebilmeli |
| 22 | Dashboard gerçek test | **YAPILACAK** | React dashboard gerçek sprint ile hiç test edilmedi |
| 23 | Config.json karmaşıklığı | **KISMEN** | config-reference.md oluşturuluyor, dashboard'dan seçim hala eksik |
| 24 | İlk kullanım deneyimi | **DONE** | quick-start.md, directives-guide.md, DECKENT.md workflow rehberi |

## P4 — Platform & Altyapı

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 25 | Windows native | **DONE** | subprocess backend, tmux skip, CLI shell:true, ps guard, spawn ENOENT fix |
| 26 | Node >= 18 neden? | **YAPILACAK** | OpenClaw Node 22+, ES2022+ feature check |
| 27 | Docker/Sandbox | **YAPILACAK** | Var mı? Çalışıyor mu? |
| 28 | CI/CD billing | **YAPILACAK** | Public repo ile çözülür |
| 29 | .detect-secrets | **YAPILACAK** | Secret leak koruması |

## P5 — Kod Kalitesi

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 30 | .gitignore runtime state | **DONE** | .brain/, .deckent/routing/, config.json gitignore'a alındı |
| 31 | God objects | **YAPILACAK** | sprint-controller 2300+ satır |
| 32 | V2 routing test-writer bias | **KISMEN** | Exclude kuralı yazıldı, sonraki sprint test edilecek |

## P6 — Kullanıcı Deneyimi İyileştirmeleri

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 33 | Error messages kullanıcı-dostu değil | **YAPILACAK** | Teknik kodlar → anlaşılır mesajlar |
| 34 | `deckent explain` MCP'de yok | **YAPILACAK** | CLI-only rehberlik aracı |
| 35 | Telemetry/analytics | **YAPILACAK** | Opt-in kullanım analitikleri |
| 36 | `deckent upgrade` test | **YAPILACAK** | npm update mekanizması |
| 37 | Skill marketplace backend | **YAPILACAK** | CLI komutu var ama backend yok |
| 38 | Plugin system e2e test | **YAPILACAK** | Gerçek plugin ile test edilmedi |
| 39 | Rate limiting production | **YAPILACAK** | 100 req/60s yeterli mi? |
| 40 | Graceful shutdown | **YAPILACAK** | Ctrl+C → state tutarlılığı |

---

## Faz Planı

### Faz 1: "Kendin Kullan" — TAMAMLANDI
npm pack → local install → kendi projelerinde kullan → feedback topla

### Faz 1.5: "Init UX + Onboarding" — TAMAMLANDI (Sprint 070)

**Bulgular (Vizetron dogfooding):**
- DIRECTIVES.md boş şablon → ✅ Stack-aware örnek task formatı
- IDENTITY.md "Language: unknown" → ✅ Stack detection her zaman çalışıyor
- DECKENT.md sadece teknik rules → ✅ Workflow + DIRECTIVES Format + Providers
- BOOT.md iç süreç → ✅ Kullanıcı-dostu açıklama + ipuçları
- Skills hiç kurulmuyor → ✅ TempSkill + TempAgent init'te oluşturuluyor
- .deckent/ altında rehber yok → ✅ .deckent/docs/ (quick-start, directives-guide, config-reference)
- Worker rules hardcoded → ✅ Stack-aware lint/test komutları
- Windows spawn ENOENT → ✅ shell:true tüm claude spawn'larda
- Brain budget değerleri eski → ✅ 200→300, 600→900

### Faz 2: "Genel Kullanılabilirlik" — SIRADA
Provider/tier generalizasyonu, config dokümantasyonu, model güncelliği

### Faz 3: "Dokümantasyon"
TR+EN çift dil, CHANGELOG, VISION, link audit, config dashboard

### Faz 4: "Public Repo"
.detect-secrets, VerhexIO/deckent'e taşıma, CI/CD, npm publish

---

## Tamamlanan Sprintler

| Sprint | Task | DONE | Süre | Öne Çıkan |
|--------|------|------|------|-----------|
| 066 | 7/7 | 7 | 15min | Phantom modüller, manifest v2, MCP docs, heartbeat fix |
| 067 | 6/6 | 6 | 20min | Paket 494KB, job enrichment, retro notes, any cleanup |
| 068 | 6/6 | 6 | 17min | AI-native discoverability, loadConfig fix, V2 routing |
| 069 | 6/6 | 6 | 40min | Skill stats, agent precision, dynamic budget, tempAgent |
| 070 | 8/8 | 8 | — | Init UX overhaul, 15 bug fix, Windows dogfooding |
| **Toplam** | **33/33** | **33** | — | 12,160 test, 0 regression |
