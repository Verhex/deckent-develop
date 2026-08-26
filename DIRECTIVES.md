# 7141 SON-DALGA + 3303 MULTI-PROVIDER SMOKE — iki provider, iki küme, çakışmasız

## Goal

İki hedef tek koşuda: (1) 7141 typed-throw dönüşümünün en-yoğun kalan 8 dosyası (32 site)
kapanır; (2) 3303 multi-provider replay-sertifikasyonunun canlı-kanıt tarafı üretilir — iki
bağımsız-kimlikli provider (claude + codex) runtime-çözümlü routing altında ÇAKIŞMASIZ
gerçek iş yürütür; hesaplaşma typed kalır, exact interval'lar settlement'ta kapanır.

## Execution contract

- Otorite: main'deki kontratlar; assertion zayıflatılmaz. Yalnız kendi Files listendeki
  dosyalara yaz; Reads listendekileri OKU. Scope dışına çıkma.
- YENİ registry kodu EKLEME (errors.ts kilidi bu dalgada kimsede değil) — her site için
  MEVCUT DECKENT_E* kataloğundan uygun kod seç; gerçekten uygun kod yoksa o siteyi
  DÖNÜŞTÜRMEDEN bırak ve exact FINDING yaz (dürüst kısmi sonuç geçerli DONE'dur —
  notes'ta dönüştürülen/atlanan sayımıyla).
- scripts/error-handling-baseline.json'a DOKUNMA (budama landing-host'ta).
- Mesaj-metni ve kontrol-akışı bit-korunur; testler hermetik; VITEST_MAX_FORKS=2.
- Değişen dosyalara `npx tsc --noEmit` SIFIR; exit-kodlar PIPE'SIZ; result notes'a
  önce/sonra ham-throw sayımı.

## Task 1: CLI kümesi (agent · skill · process · recover) — claude-provider
- Files: src/cli/commands/agent.ts, src/cli/commands/skill.ts, src/cli/commands/process.ts, src/cli/commands/recover.ts
- Reads: src/core/errors.ts, src/cli/helpers/messages.ts
- Priority: HIGH
- Provider: claude
- Model: claude-sonnet-5
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/cli/agent-delete-confirm.test.ts tests/cli/recover-resume.test.ts tests/core/error-registry-lint.test.ts
### Description
7141 son-dalga CLI kümesi: dört dosyadaki ham `throw new Error(...)` siteleri (yaklaşık 14)
mevcut DeckentError/registry kontratına taşınır (contract'taki kurallarla — yeni kod YOK,
uygun-kod-yoksa FINDING+atla). Kullanıcıya görünen hata-mesajı davranışı birebir korunur;
i18n-anahtarlı mesajlar varsa onlara dokunulmaz, yalnız taşıyıcı tip değişir. Test komutu
TAM YEŞİL; registry-lint testinin baseline-bölümü mevcut baseline'la tutarlı kalır (sen
baseline'a dokunmadığın ve yeni-ihlal üretmediğin sürece yeşildir). tsc sıfır.

## Task 2: Orchestra kümesi (mission-acceptance · backlog · mission-approval-coordinator · directives-builder) — codex-provider
- Files: src/orchestra/autonomous/mission-store/mission-acceptance.ts, src/orchestra/autonomous/backlog.ts, src/orchestra/autonomous/mission-store/mission-approval-coordinator.ts, src/orchestra/directives-builder.ts
- Reads: src/core/errors.ts, src/orchestra/autonomous/backlog-types.ts
- Priority: HIGH
- Provider: codex
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/autonomous/mission-store/mission-acceptance.test.ts tests/orchestra/autonomous/mission-store/mission-approval-coordinator.test.ts tests/orchestra/backlog.test.ts tests/orchestra/directives-builder.test.ts
### Description
7141 son-dalga orchestra kümesi: dört dosyadaki ham throw siteleri (yaklaşık 18) mevcut
registry kodlarına taşınır (aynı kurallar: yeni kod YOK, uygun-yoksa FINDING+atla,
davranış bit-korunur). Bu task bilinçli olarak Task-1'den FARKLI provider'da koşar
(3303 multi-provider kanıtı): dosya-kümeleri ayrık olduğundan collision-free paralel
yürütme beklenir. Test komutu TAM YEŞİL; tsc sıfır.
