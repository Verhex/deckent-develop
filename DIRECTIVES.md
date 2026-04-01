# DIRECTIVES — Sprint 082: Dashboard Faz 2 + Init Onboarding + README-TR Fix

## Goal: Dashboard'dan sprint yönetimi, init deneyimi iyileştirme, README-TR.md Türkçe karakter düzeltme.

---

## Task 1: README-TR.md Türkçe Karakter Düzeltme
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: README-TR.md
- Scope: README-TR.md

### Description
README-TR.md'deki ASCII Türkçe karakterleri doğru UTF-8 Türkçe karakterlere çevir:

- "Yapay zeka gelistirme ekibiniz" → "Yapay zeka geliştirme ekibiniz"
- "orkestre edilmis" → "orkestre edilmiş"
- "dogal dili calisan koda donusturen" → "doğal dili çalışan koda dönüştüren"
- "Nasil Calisir" → "Nasıl Çalışır"
- "Temel Ozellikler" → "Temel Özellikler"
- Tüm "i" → "İ" (büyük harf başında), "ı" eksikleri
- Tüm ş, ç, ğ, ü, ö, ı, İ eksikliklerini düzelt
- Dosyanın tamamını tara — hiçbir ASCII Türkçe kalmamalı

Sadece Türkçe karakter düzeltmesi yap, içerik değiştirme.

**Kanıt:** `grep -P "[^a-zA-Z]calis[^m]|gelistir|ozellik|donust|urunl|basla" README-TR.md | wc -l` → 0

**Test:** Bu task test gerektirmez.

---

## Task 2: DashboardPage Sprint Kontrol Butonları
- Model: sonnet
- Effort: high
- Agent: refactorer
- Skills: frontend-expert, typescript-expert
- Files: src/dashboard/src/pages/DashboardPage.tsx, src/dashboard/src/i18n/en.ts, src/dashboard/src/i18n/tr.ts
- Scope: src/dashboard/

### Description
DashboardPage'e sprint yönetim kontrolleri ekle:

A) "Yeni Sprint" butonu zaten var (NewSprintModal). Ek olarak:
- **Cleanup** butonu: Aktif sprint yokken veya COMPLETE fazındayken görünsün
  - POST /api/cleanup çağırsın (mevcut endpoint varsa kullan, yoksa POST body boş)
  - Onay dialogu göstersin: "Sprint dosyalarını arşivle?"
- **Kill All** butonu: Sprint EXECUTE fazındayken görünsün (kırmızı, tehlikeli)
  - POST /api/kill/all çağırsın
  - Onay dialogu: "Tüm worker'ları durdur?"

B) Butonları header'daki "Yeni Sprint" butonunun yanına ekle — koşullu render:
- EXECUTE/FIX fazı → Kill All butonu
- COMPLETE/no sprint → Cleanup butonu
- Her zaman → Yeni Sprint butonu

C) i18n key'leri ekle:
```
'dashboard.cleanup': 'Cleanup' / 'Temizle'
'dashboard.kill_all': 'Kill All' / 'Tümünü Durdur'  
'dashboard.confirm_cleanup': 'Archive sprint files?' / 'Sprint dosyalarını arşivle?'
'dashboard.confirm_kill': 'Stop all workers?' / 'Tüm worker'ları durdur?'
'dashboard.new_sprint': 'New Sprint' / 'Yeni Sprint'
```

**Kanıt:** `grep "cleanup\|kill_all\|confirm_cleanup" src/dashboard/src/pages/DashboardPage.tsx` → var

**Test:** `tsc --noEmit` temiz geçmeli.

---

## Task 3: Init Dil Seçimi İlk Adım
- Model: sonnet
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/cli/commands/init.ts
- Scope: src/cli/

### Description
`deckent init` wizard'ında dil seçimini İLK adım yap:

A) Mevcut init akışını oku. Şu anki sıra muhtemelen:
1. Plan/tier seçimi
2. Dil seçimi
3. Proje adı

Yeni sıra:
1. **Dil seçimi** (English / Türkçe) — hemen seçilsin
2. Plan/tier seçimi — seçilen dilde gösterilsin
3. Proje adı — seçilen dilde sorulsun

B) Dil seçildikten sonra `getMessage()` çağrılarında seçilen dili kullan. Böylece wizard'ın geri kalanı kullanıcının dilinde gösterilir.

C) messages.ts'e init wizard mesajları ekle (eksikse):
```
'init.select_language': { en: 'Select language:', tr: 'Dil seçin:' }
'init.select_plan': { en: 'Select your plan:', tr: 'Planınızı seçin:' }
'init.enter_project_name': { en: 'Project name:', tr: 'Proje adı:' }
```

D) Wizard çıktısı seçilen dilde olmalı — "Next steps" yerine "Sonraki adımlar" gibi.

**Kanıt:** `grep "select_language\|Dil seçin" src/cli/commands/init.ts` → dil seçimi ilk adım

**Test:** `tsc --noEmit` temiz geçmeli.

---

## Task 4: /api/cleanup Endpoint
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/api/server.ts
- Scope: src/api/

### Description
Dashboard'dan cleanup çağırabilmek için POST /api/cleanup endpoint'i ekle:

A) server.ts'e POST /api/cleanup ekle:
```typescript
if (method === 'POST' && url === '/api/cleanup') {
  // cleanup fonksiyonunu import et ve çağır
  // archiveTasks + releaseLocks + killSessions
  // Sonuç: { success: true, removedTasks: N, removedLocks: N }
}
```

B) Mevcut cleanup fonksiyonunu bul (muhtemelen `src/orchestra/` veya `src/cli/commands/cleanup.ts`'te) ve API'den çağırılabilir hale getir.

C) Auth gerekli (POST endpoint — Bearer token kontrolü).

D) Sprint aktifken cleanup çalışmamalı — hata döndür: `{ error: "Cannot cleanup while sprint is active" }`

**Kanıt:** `grep "api/cleanup" src/api/server.ts` → endpoint var

**Test:** `tsc --noEmit` temiz. En az 2 test: başarılı cleanup, sprint aktifken hata.

---

## Quality Rules
- tsc --noEmit MUST pass
- Mevcut testlerde 0 regresyon
- Dashboard butonları koşullu render — yanlış fazda görünmemeli
- Init wizard dil seçimi İLK adım olmalı
- %100 GO hedefli
