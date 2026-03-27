# Deckent Beta Readiness Roadmap

**Son güncelleme:** 2026-03-27 | **Sprint:** 069 | **Test:** 12,145 | **Durum:** Faz 1 aktif

---

## Genel Bakış

69 sprint, 12,145+ test, 250+ TypeScript modülü. Ürün geliştirildi — şimdi gerçek kullanıcı deneyimi test edilecek.

**Strateji:** npm paketle → kendi projelerinde dogfood → feedback → düzelt → public repo (VerhexIO/deckent)

---

## P0 — npm Paketleme + Dogfooding

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 1 | npm publish test | **DONE** | 508KB, 479 dosya, local install çalışıyor |
| 2 | `deckent init` gerçek proje testi | **DONE** | Windows'ta Vizetron projesinde test edildi |
| 3 | `deckent doctor` dış ortam | **DONE** | WSL2 + Windows test edildi |
| 4 | Shebang + bin entry | **DONE** | `#!/usr/bin/env node`, `deckent` + `deckent-mcp` çalışıyor |
| 5 | İlk sprint UX | **KISMEN** | DIRECTIVES rehberi MCP instructions'ta var, CLI'da eksik |
| 6 | Windows native desteği | **DONE** | subprocess backend auto-detect, tmux skip, CLI shell:true |

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
| 15 | TR+EN çift dil | **YAPILACAK** | docs/tr/ + docs/en/ yapısı |
| 16 | CHANGELOG.md boş | **YAPILACAK** | 80 byte — 69 sprint'lik geçmiş yok |
| 17 | Config referans eksik | **YAPILACAK** | config.json tüm ayarları belgelenmemiş |
| 18 | VISION.md eksik | **YAPILACAK** | Proje vizyonu ve yol haritası |
| 19 | docs/ link kontrolü | **YAPILACAK** | Linklenen dokümanlar var mı? |

## P3 — UX & Dashboard

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 20 | Dashboard veri doğruluğu | **YAPILACAK** | Doğru veri görüntülemiyor |
| 21 | Dashboard config arayüzü | **YAPILACAK** | Tüm config ayarları dashboard'dan seçilebilmeli |
| 22 | Dashboard gerçek test | **YAPILACAK** | React dashboard gerçek sprint ile hiç test edilmedi |
| 23 | Config.json karmaşıklığı | **YAPILACAK** | Kullanıcı değerleri bilmiyor |
| 24 | İlk kullanım deneyimi | **YAPILACAK** | `deckent init` sonrası rehber |

## P4 — Platform & Altyapı

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 25 | Windows native | **DONE** | subprocess backend, tmux skip, CLI shell:true |
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

### Faz 1: "Kendin Kullan" — AKTIF
npm pack → local install → kendi projelerinde kullan → feedback topla

### Faz 1.5: "Init UX + Onboarding" — KRİTİK (Windows dogfooding'den)

**Bulgular:**
- DIRECTIVES.md boş şablon — kullanıcı ne yazacağını bilmiyor
- IDENTITY.md "Language: unknown" — stack algılama init'te doğru çalışmıyor
- DECKENT.md sadece teknik rules — kullanıcı rehberi yok
- BOOT.md iç süreç — kullanıcıya yönelik değil
- Skills hiç kurulmuyor (tempSkill de yok)
- Hata mesajları i18n desteği eksik/yetersiz
- .deckent/ altında kullanıcı rehberi (docs) yok
- Init sonrası "ne yapmalıyım" rehberi eksik

**Yapılacaklar:**
- [ ] DIRECTIVES.md şablonu → örnek task formatı + açıklama
- [ ] IDENTITY.md → init'te stack detection sonucu doğru yazılmalı
- [ ] .deckent/docs/ → quick-start rehberi, config referans, örnek DIRECTIVES
- [ ] Init'te tempSkill + tempAgent oluşturulmalı (proje stack'ine göre)
- [ ] Worker rules'da hardcoded "tsc --noEmit" → stack-aware komut
- [ ] i18n hata mesajları kontrolü — Türkçe init → Türkçe hatalar
- [ ] brain.md'de "max 200 lines" → güncel "max 300 lines"
- [ ] api-surface.md'de "max 600 lines" → güncel "max 900 lines"

### Faz 2: "Genel Kullanılabilirlik"
Provider/tier generalizasyonu, config dokümantasyonu, model güncelliği

### Faz 3: "Dokümantasyon"
TR+EN çift dil, CHANGELOG, VISION, link audit, config dashboard

### Faz 4: "Public Repo"
.detect-secrets, VerhexIO/deckent'e taşıma, CI/CD, npm publish

---

## Tamamlanan Sprintler (Bu oturum)

| Sprint | Task | DONE | Süre | Öne Çıkan |
|--------|------|------|------|-----------|
| 066 | 7/7 | 7 | 15min | Phantom modüller, manifest v2, MCP docs, heartbeat fix |
| 067 | 6/6 | 6 | 20min | Paket 494KB, job enrichment, retro notes, any cleanup |
| 068 | 6/6 | 6 | 17min | AI-native discoverability, loadConfig fix, V2 routing |
| 069 | 6/6 | 6 | 40min | Skill stats, agent precision, dynamic budget, tempAgent |
| **Toplam** | **25/25** | **25** | **92min** | 12,145 test, 0 NO_GO |
