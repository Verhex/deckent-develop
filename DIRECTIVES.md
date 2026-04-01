# DIRECTIVES — Sprint 084: Dashboard Tutarlılık + i18n Tam Kapsam + Config Doğrulama

## Goal: Settings/Config sayfaları birleştirilsin, TR/EN tam çalışsın, config değişiklikleri doğru dosyaya yazılsın, dashboard işlemleri terminalde görünsün.

---

## Task 1: Settings + Config Sayfa Birleştirme
- Model: sonnet
- Effort: high
- Agent: refactorer
- Skills: frontend-expert, typescript-expert
- Files: src/dashboard/src/pages/SettingsPage.tsx, src/dashboard/src/pages/ConfigPage.tsx, src/dashboard/src/App.tsx, src/dashboard/src/components/Layout.tsx
- Scope: src/dashboard/

### Description
SettingsPage ve ConfigPage iki ayrı sayfa olarak çakışıyor — ikisi de config yazıyor. BİRLEŞTİR:

A) ConfigPage'i ana yapılandırma sayfası yap. İçine ekle:
- En üstte: Doctor sağlık kontrol bölümü (SettingsPage'den taşı)
- Ortada: Mevcut ConfigPage alanları (30+ alan, kategoriler halinde)
- Altta: Save butonu

B) SettingsPage'i kaldır veya ConfigPage'e yönlendir:
- App.tsx'te `/settings` route'unu `/config`'e redirect yap
- Layout.tsx navItems'dan Settings'i kaldır (veya "Settings" → "Config" olarak birleştir)
- Sidebar'da tek "Yapılandırma/Config" linki olsun

C) SettingsPage'deki mode/language/model seçicileri ConfigPage'deki alanlarla çakışıyor. ConfigPage'in CONFIG_FIELDS zaten bu alanları içeriyor — SettingsPage'deki ayrı form gereksiz.

D) Doctor bölümünü ConfigPage'in üstüne taşı:
- "System Health" card'ı + Run Doctor butonu
- Check sonuçları tablosu (pass/fail/warn)
- Health score

E) İlk render'da doctor otomatik çalışsın (SettingsPage'deki gibi useEffect ile).

**Kanıt:** `grep "SettingsPage" src/dashboard/src/App.tsx` → yönlendirme var veya kaldırılmış

**Test:** `tsc --noEmit` temiz geçmeli.

---

## Task 2: i18n Tam Kapsam — Kalan Hardcoded String'ler
- Model: sonnet
- Effort: high
- Agent: refactorer
- Skills: frontend-expert, typescript-expert
- Files: src/dashboard/src/pages/DashboardPage.tsx, src/dashboard/src/pages/HistoryPage.tsx, src/dashboard/src/pages/MemoryPage.tsx, src/dashboard/src/pages/ConfigPage.tsx, src/dashboard/src/components/WorkerCard.tsx, src/dashboard/src/components/SprintPhaseTimeline.tsx, src/dashboard/src/components/ActivityFeed.tsx, src/dashboard/src/components/NewSprintModal.tsx, src/dashboard/src/components/AgentDetail.tsx, src/dashboard/src/i18n/en.ts, src/dashboard/src/i18n/tr.ts
- Scope: src/dashboard/

### Description
Dashboard'daki TÜM hardcoded İngilizce string'leri i18n key'lerine taşı:

A) Her bileşen ve sayfayı tara. Aşağıdaki kalıpları bul ve `t('key')` ile değiştir:
- "Sprint Status" → t('dashboard.sprint_status')
- "Updated" → t('dashboard.updated')
- "Sprint ID" → t('dashboard.sprint_id')
- "5hr Usage" / "Weekly Usage" → t('dashboard.usage_5hr') / t('dashboard.usage_weekly')
- "No sprint data available." → t('dashboard.no_data')
- "Done:", "Active:", "Pending:" → t('dashboard.done'), t('dashboard.active'), t('dashboard.pending')
- Tablo header'ları: "ID", "Task", "Last HB", "Elapsed", "Action"
- WorkerCard: "Agent:", "Skill:", "files changed", "Detail"
- ActivityFeed: her event mesajı
- HistoryPage: "All Sprints", tablo header'ları
- MemoryPage: tab isimleri, empty state mesajları
- ConfigPage: kategori isimleri, "Save Changes", "Reset", alan açıklamaları
- NewSprintModal: tüm adım başlıkları ve butonlar
- AgentDetail: header, alan isimleri

B) en.ts'e tüm yeni key'leri ekle (İngilizce değerler)
C) tr.ts'e tüm yeni key'lerin Türkçe çevirilerini ekle
D) TranslationKey type'ı otomatik güncellenecek (en.ts'ten derive ediliyor)

E) LanguageProvider'daki dil değişikliği anında tüm bileşenlere yansımalı (context re-render). Sayfa yenileme GEREKMEMELİ.

**Kanıt:** Dashboard kaynak dosyalarında `grep -r '"[A-Z][a-z]' src/dashboard/src/pages/ src/dashboard/src/components/` → i18n key dışında hardcoded İngilizce string olmamalı (teknik terimler hariç)

**Test:** `tsc --noEmit` temiz geçmeli.

---

## Task 3: Config Yazma Doğrulama + Geri Okuma
- Model: sonnet
- Effort: normal
- Agent: test-writer
- Skills: typescript-expert, testing-expert
- Files: tests/api/server.test.ts, tests/dashboard/config-integration.test.ts
- Scope: tests/

### Description
Dashboard'dan yapılan config değişikliklerinin doğru yazılıp okunduğunu doğrulayan testler:

A) API test'lerine ekle (tests/api/server.test.ts):
- POST /api/config ile `{ mode: "economic" }` gönder → GET /api/config'te `mode: "economic"` dön
- POST /api/config ile `{ language: "tr" }` gönder → geri oku, `language: "tr"` olmalı
- POST /api/config ile nested key `{ git: { auto_commit: true } }` → geri oku, nested doğru olmalı
- POST /api/config ile `{ memory_budget: 900 }` → writeFileSync çağrısında 900 olmalı
- POST /api/config ile geçersiz değer → 422 dönmeli
- Mevcut config'i bozmamalı — sadece gönderilen alanlar değişmeli (deepMerge)

B) Round-trip testi: POST → GET → değerler eşleşmeli (en az 5 farklı alan)

C) Nested key round-trip: `skill_routing.testing`, `modes.performance.max_workers` gibi

**Kanıt:** `grep "round-trip\|roundtrip\|config.*write.*read\|POST.*GET.*config" tests/api/server.test.ts` → test var

**Test:** Yeni testlerin tamamı geçmeli.

---

## Task 4: Dashboard İşlemlerinin Terminal Çıktısı
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/api/server.ts, src/cli/commands/web.ts
- Scope: src/api/, src/cli/

### Description
Dashboard'dan yapılan işlemler terminalde (deckent web çalıştıran terminal) görünsün:

A) server.ts'teki POST handler'larına console.log ekle:
- POST /api/start → `[deckent] Sprint started via dashboard (jobId: xxx)`
- POST /api/kill/:id → `[deckent] Worker killed via dashboard: xxx`
- POST /api/cleanup → `[deckent] Cleanup triggered via dashboard (removed: N tasks, N locks)`
- POST /api/config → `[deckent] Config updated via dashboard: {changed_keys}`
- POST /api/set-directives → `[deckent] Directives updated via dashboard (N tasks)`
- POST /api/plan → `[deckent] Plan requested via dashboard (mode: xxx)`

B) Format: `[deckent] {action} via dashboard` — tutarlı prefix

C) Sadece POST işlemlerinde logla (GET'ler sessiz)

D) Hassas veri loglama: API key gibi değerler loglanmamalı. Config değişikliğinde sadece key isimleri logla, değerleri değil.

**Kanıt:** `grep "\[deckent\]" src/api/server.ts` → en az 6 log satırı

**Test:** `tsc --noEmit` temiz geçmeli.

---

## Quality Rules
- tsc --noEmit MUST pass
- Mevcut testlerde 0 regresyon
- Dashboard'da İngilizce seçilince 0 Türkçe görünmeli
- Dashboard'da Türkçe seçilince 0 İngilizce görünmeli (teknik terimler hariç)
- Config round-trip: yazılan = okunan
- Terminal logları tutarlı format: [deckent] prefix
- %100 GO hedefli
