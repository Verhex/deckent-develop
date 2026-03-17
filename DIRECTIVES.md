# DIRECTIVES — Sprint 2: Dogfooding (Self-Improvement)
# Deckent kendi teknik borçlarını kendi orkestrasyon sistemiyle düzeltecek.
# Operatör: Alperen @ Verhex
# Tarih: 2026-03-17

## Hedef
Deckent'in Sprint 1'den kalan teknik borçlarını düzelt.
Her fix için mevcut 297 testi bozmadan yeni testler yaz.
Coverage hedefi: değişen her dosyada minimum %80.

---

## Görev 1: waitForResults async polling (DEBT-004)
- Dosya: src/orchestra/brain.ts
- Sorun: waitForResults (satır 458) sleepSync (satır 101) kullanıyor, main thread bloklanıyor
- Fix: async/await + setTimeout tabanlı polling'e geç
  - sleepSync fonksiyonunu kaldır, yerine async sleep(ms) yaz
  - waitForResults'ı async yap
  - runSprint'teki çağrıları await ile güncelle
  - Mevcut davranış korunsun: timeout, partial results, retry
- Test: async polling, timeout, partial result senaryoları
- Kapsam: src/orchestra/brain.ts

## Görev 2: haiku_allowed semantik düzeltme (DEBT-005)
- Dosya: src/core/types.ts, src/cli/commands/start.ts, src/orchestra/tmux.ts
- Sorun: autoApprove (CLI flag) ve haiku_allowed (model config) karışıyor
- Fix: İkisini net ayır
  - autoApprove: sadece --dangerously-skip-permissions için (CLI/tmux)
  - haikuAllowed: sadece model seçim kısıtlaması için (Brain planlama)
  - StartOptions tipini genişlet: { autoApprove?: boolean; sandboxMode?: boolean }
  - Brain.runSprint opts parametresi alsın
- Test: config validation, start komutu flag parsing
- Kapsam: src/core/types.ts, src/cli/commands/start.ts, src/orchestra/tmux.ts, src/orchestra/brain.ts

## Görev 3: checkUsage gerçek entegrasyon (DEBT-002)
- Dosya: src/orchestra/brain.ts
- Sorun: checkUsage (satır 208) her zaman sıfır dönen stub
- Fix: claude -p "/usage" veya "claude usage" CLI çıktısını parse et
  - spawnSync('claude', ['-p', '/usage']) çalıştır
  - Çıktıdan 5hr %, weekly %, mesaj sayısı ayrıştır
  - Parse başarısız olursa → güvenli varsayılan dön (50%, 30%)
  - adjustSprintSize fonksiyonu gerçek verilerle çalışsın
- Test: mock spawnSync çıktısı ile parsing testleri, hata senaryoları
- Kapsam: src/orchestra/brain.ts

## Görev 4: Directive parsing iyileştirme (DEBT-003)
- Dosya: src/orchestra/brain.ts
- Sorun: parseDirectives satır bazlı basit parsing, scope çıkaramıyor
- Fix: Daha yapılandırılmış parsing
  - "## Görev N:" pattern'ini tanı → ayrı task'lara böl
  - Her görev bloğundan scope, dosya, test hedefi çıkar
  - "- " prefix strip + regex ile alan extraction
  - Fallback: mevcut satır bazlı parsing korunsun
- Test: yapılandırılmış directive parsing, fallback, edge case
- Kapsam: src/orchestra/brain.ts

## Görev 5: Worker prompt zenginleştirme
- Dosya: src/orchestra/brain.ts (buildWorkerPrompt fonksiyonu)
- Sorun: Worker prompt'u test yazma talimatı içermiyor, coverage 0 çıkıyor
- Fix: buildWorkerPrompt'a ekle:
  - "Yazdığın her fonksiyon için test yaz (*.test.ts)"
  - "npx vitest run çalıştır, sonucu .result dosyasına yaz"
  - "Coverage hedefi: %80 minimum"
  - "Test dosyası aynı dizinde, aynı isimle .test.ts uzantılı olsun"
  - ".tasks/task-{id}.result dosyasını MUTLAKA yaz (JSON format)"
- Test: buildWorkerPrompt çıktısında test talimatı varlığı kontrolü
- Kapsam: src/orchestra/brain.ts
