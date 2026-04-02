# DIRECTIVES — Sprint 084: Dashboard Fix + Canlı İzleme Testi

## Goal: Dashboard sorunlarını düzelt, canlı sprint izleme deneyimini test edilebilir hale getir. Kullanıcı geri bildirimine dayalı UX fix'leri.

---

## Task 1: AgentDetail Penceresi — Okunabilirlik ve Boyut Fix
- Model: sonnet
- Effort: normal
- Agent: refactorer
- Skills: frontend-expert, typescript-expert
- Files: src/dashboard/src/pages/DashboardPage.tsx, src/dashboard/src/components/AgentDetail.tsx
- Scope: src/dashboard/

### Description
AgentDetail sağ panel penceresi dar ve okunaklı değil. Düzelt:

A) DashboardPage.tsx'te Sheet bileşeninin genişliğini artır:
- Mevcut: muhtemelen `w-[400px]` veya default
- Yeni: `w-[600px] sm:w-[700px]` — geniş panel

B) AgentDetail.tsx font boyutlarını artır:
- Task başlığı: `text-base` → `text-lg font-bold`
- Badge'ler: `text-xs` → `text-sm`
- Agent/skill satırları: `text-xs` → `text-sm`
- Log bölümü: `h-[220px]` → `h-[350px]` veya `flex-1` ile tüm kalan alanı kapla
- Description: `text-xs` → `text-sm`

C) Log bölümünde scrollbar görünür olsun (ScrollArea yerine overflow-auto ile)

D) Karakter encoding: Türkçe karakterler log'da düzgün görünmüyorsa `whitespace-pre-wrap` + `break-words` ekle

**Kanıt:** `grep "w-\[600\|text-lg\|h-\[350" src/dashboard/src/components/AgentDetail.tsx` → güncel boyutlar

**Test:** `tsc --noEmit` temiz.

---

## Task 2: i18n Kalan Hardcoded String'ler — Tam Kapsam
- Model: sonnet
- Effort: high
- Agent: refactorer
- Skills: frontend-expert, typescript-expert
- Files: src/dashboard/src/pages/DashboardPage.tsx, src/dashboard/src/pages/ConfigPage.tsx, src/dashboard/src/components/WorkerCard.tsx, src/dashboard/src/components/SprintPhaseTimeline.tsx, src/dashboard/src/components/ActivityFeed.tsx, src/dashboard/src/components/NewSprintModal.tsx, src/dashboard/src/i18n/en.ts, src/dashboard/src/i18n/tr.ts
- Scope: src/dashboard/

### Description
Dashboard'daki TÜM kalan hardcoded string'leri tara ve i18n'e taşı:

A) ConfigPage.tsx — CATEGORIES dizisindeki kategori isimleri i18n'e:
- "Provider" → t('config.category.provider') (zaten key var mı kontrol et)
- "Sprint", "Memory", "Auditor", "Output" vb. hepsi

B) ConfigPage.tsx — Doctor bölümündeki string'ler:
- "All required checks passed" → t('settings.all_passed')
- "Some required checks failed" → t('settings.some_failed')
- "(required)" → t('settings.required')

C) NewSprintModal — tüm adım başlıkları ve butonlar:
- "Set Directives", "Plan Sprint", "Review", "Start Sprint" → i18n key

D) SprintPhaseTimeline — faz isimleri zaten EN teknik terimler, kalabilir

E) ActivityFeed — event mesajları (spawned, done, nogo, alert) i18n kontrol

F) WorkerCard — "Agent:", "Skill:", "files", "Detail" → i18n kontrol

G) EN→TR geçişinde SAYFA YENİLEMEDEN tüm metinler değişmeli. `useTranslation()` context re-render'ı doğrula.

**Kanıt:** Dashboard kaynak dosyalarında İngilizce hardcoded string minimal (teknik terimler hariç)

**Test:** `tsc --noEmit` temiz.

---

## Task 3: Dashboard Canlı Veri Akışı Doğrulama
- Model: sonnet
- Effort: normal
- Agent: test-writer
- Skills: typescript-expert, testing-expert
- Files: tests/dashboard/live-data.test.ts
- Scope: tests/dashboard/

### Description
Dashboard'un SSE canlı veri akışını doğrulayan testler:

A) SSE hook testi:
- useSSE bağlandığında `connected` status dönmeli
- SSE mesajı geldiğinde DashboardState parse edilmeli
- Bağlantı koptuğunda `disconnected` status + 3s reconnect

B) WorkerCard render testi:
- agents dizisi geldiğinde kart sayısı = agent sayısı
- EXECUTING agent'ta pulse animasyon class'ı var mı
- DONE agent'ta yeşil border var mı

C) ActivityFeed testi:
- Yeni SSE verisi geldiğinde feed'e entry eklenmeli
- Max 50 entry sınırı çalışmalı

D) SprintPhaseTimeline testi:
- EXECUTE fazında doğru daire mavi pulse olmalı

**Kanıt:** `ls tests/dashboard/live-data.test.ts` → dosya var

**Test:** `npm run test:dashboard` → yeni testler geçmeli.

---

## Task 4: Dashboard Build Otomasyonu
- Model: haiku
- Effort: low
- Agent: refactorer
- Skills: typescript-expert
- Files: package.json
- Scope: package.json

### Description
Dashboard build'i her `tsc` sonrası otomatik çalışsın:

A) package.json'a script ekle:
```json
"build:dashboard": "cd src/dashboard && npx vite build --outDir ../../dist/dashboard",
"build:all": "tsc && npm run build:dashboard",
"postbuild": "npm run build:dashboard"
```

B) Böylece `npm run build:all` ile hem TypeScript hem dashboard build edilir.

**Kanıt:** `grep "build:dashboard\|build:all" package.json` → script var

**Test:** `npm run build:all` başarılı çalışmalı.

---

## Quality Rules
- tsc --noEmit MUST pass
- npm run test:dashboard → 372+ passed + yeni testler
- npx vitest run → 0 fail
- Dashboard TR seçilince TÜM etiketler Türkçe (teknik terimler hariç)
- Dashboard EN seçilince TÜM etiketler İngilizce
- AgentDetail penceresi geniş ve okunaklı
- %100 GO hedefli
