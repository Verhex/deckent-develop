# DIRECTIVES — Sprint 20 (Fix Doğrulama + deckent test Modu)

## Hedef: Sprint 19 fix'lerini doğrula (12 paralel görev, task queue dalga testi) + deckent test CLI komutu ekle.

---

## Görev 1: Brain Modülü Fonksiyon Listesi
- Dosya: tmp-test/file-01.md (yeni)
- Kapsam: tmp-test/

### Açıklama
src/orchestra/brain.ts dosyasını analiz et. Tüm export edilen ve internal fonksiyonları listele. Her fonksiyon için: isim, parametre sayısı, dönüş tipi, tek satır açıklama.

### Test
- Manuel doğrulama

---

## Görev 2: Auditor Modülü Fonksiyon Listesi
- Dosya: tmp-test/file-02.md (yeni)
- Kapsam: tmp-test/

### Açıklama
src/monitor/auditor.ts dosyasını analiz et. Tüm export edilen ve internal fonksiyonları listele. Her fonksiyon için: isim, parametre sayısı, dönüş tipi, tek satır açıklama.

### Test
- Manuel doğrulama

---

## Görev 3: Worker Modülü Fonksiyon Listesi
- Dosya: tmp-test/file-03.md (yeni)
- Kapsam: tmp-test/

### Açıklama
src/agents/worker.ts dosyasını analiz et. Tüm export edilen ve internal fonksiyonları listele. Her fonksiyon için: isim, parametre sayısı, dönüş tipi, tek satır açıklama.

### Test
- Manuel doğrulama

---

## Görev 4: Config Sistemi Analizi
- Dosya: tmp-test/file-04.md (yeni)
- Kapsam: tmp-test/

### Açıklama
src/core/config.ts dosyasını analiz et. 3-layer merge sistemi, validation, deepMerge, tüm fonksiyonlar ve config yapısını dokümante et.

### Test
- Manuel doğrulama

---

## Görev 5: tmux Modülü Analizi
- Dosya: tmp-test/file-05.md (yeni)
- Kapsam: tmp-test/

### Açıklama
src/orchestra/tmux.ts dosyasını analiz et. Session management, worker spawn/kill, send-keys, pipe-pane fonksiyonlarını listele ve açıkla.

### Test
- Manuel doğrulama

---

## Görev 6: Planner Modülü Analizi
- Dosya: tmp-test/file-06.md (yeni)
- Kapsam: tmp-test/

### Açıklama
src/orchestra/planner.ts dosyasını analiz et. AI planning, Zod schema, structured fallback, model seçimi, planning modlarını dokümante et.

### Test
- Manuel doğrulama

---

## Görev 7: MCP Tool Listesi ve Açıklamaları
- Dosya: tmp-test/file-07.md (yeni)
- Kapsam: tmp-test/

### Açıklama
src/mcp/tools/ dizinindeki 10 MCP tool'u analiz et. Her tool için: isim, parametre, açıklama, kullanım örneği.

### Test
- Manuel doğrulama

---

## Görev 8: MCP Resource Listesi ve Açıklamaları
- Dosya: tmp-test/file-08.md (yeni)
- Kapsam: tmp-test/

### Açıklama
src/mcp/resources/ dizinindeki 5 MCP resource'u analiz et. Her resource için: URI, açıklama, döndürdüğü veri formatı.

### Test
- Manuel doğrulama

---

## Görev 9: HTTP API Endpoint Analizi
- Dosya: tmp-test/file-09.md (yeni)
- Kapsam: tmp-test/

### Açıklama
src/api/server.ts dosyasını analiz et. 16 HTTP endpoint'i listele: method, path, açıklama, request/response formatı.

### Test
- Manuel doğrulama

---

## Görev 10: Test Coverage Raporu
- Dosya: tmp-test/file-10.md (yeni)
- Kapsam: tmp-test/

### Açıklama
tests/ dizin yapısını analiz et. Her modül için: test dosyası sayısı, test sayısı (describe/it bloklarını say), kapsam.

### Test
- Manuel doğrulama

---

## Görev 11: Dependency Analizi
- Dosya: tmp-test/file-11.md (yeni)
- Kapsam: tmp-test/

### Açıklama
package.json'ı analiz et. Runtime ve dev dependency'leri listele, her birinin ne için kullanıldığını açıkla. Dependency sayısı ve bundle boyutu tahmini.

### Test
- Manuel doğrulama

---

## Görev 12: Sprint 18-19 Karşılaştırma Raporu
- Dosya: tmp-test/file-12.md (yeni)
- Kapsam: tmp-test/

### Açıklama
docs/SPRINT-18-OBSERVATION.md ve docs/SPRINT-19-OBSERVATION.md dosyalarını oku. İki sprint'i karşılaştır: süre, görev sayısı, başarı oranı, bug sayısı, test artışı. Fix'lerin etkinliğini değerlendir.

### Test
- Manuel doğrulama

---

## Görev 13: deckent test CLI Komutu
- Dosya: src/cli/commands/test-run.ts (yeni), tests/cli/test-run.test.ts (yeni)
- Kapsam: src/cli/, tests/cli/

### Açıklama
Yeni CLI komutu: `deckent test`
1. DIRECTIVES.md'yi okur, sprint başlatır
2. Tüm worker çıktıları `tmp-test/` dizinine yönlendirilir
3. Sprint kaydı tutulmaz (RETRO, MEMORY, sprint log yazılmaz)
4. Sprint sonunda `tmp-test/` otomatik temizlenir
5. `--keep` flag: temizleme yapma, dosyaları bırak
6. `--timeout <ms>` flag: max süre (varsayılan 300000ms = 5dk)
7. Exit code: 0 = tüm görevler DONE, 1 = herhangi NO_GO var
8. CLI'da register et (src/cli/index.ts güncelle)

### Test
- test-run komutu kayıtlı
- --keep flag çalışıyor
- --timeout flag çalışıyor
- Sprint kaydı tutulmuyor (RETRO, MEMORY yazılmamış)
- tmp-test/ temizleniyor (--keep olmadan)
- Exit code doğru
- 8+ test

---

## Görev 14: deckent test Entegrasyon Dokümantasyonu
- Dosya: tmp-test/file-14.md (yeni)
- Kapsam: tmp-test/

### Açıklama
deckent test komutunun kullanım kılavuzunu yaz. Komut örnekleri, flag'ler, çıktı formatı, CI entegrasyonu senaryosu.

### Test
- Manuel doğrulama

---

## Kalite Kuralları
- tsc --noEmit MUST pass
- npx vitest run MUST pass — mevcut 1123 test kırılmamalı
- Her yeni kaynak kodu için test yazılmalı — hedef: 1135+ test
- Coverage düşmemeli (%97.5+)
- tmp-test/ dosyaları sprint sonunda silinecek (sadece gözlem için kalabilir)
- Sadece görev 13 kaynak kod değiştirir, diğerleri sadece tmp-test/ yazıyor
- MCP: 10 tool, 5 resource (değişiklik yok)
- CLI: 26→27 komut (test ekleniyor)
- HTTP API: 16 endpoint (değişiklik yok)
