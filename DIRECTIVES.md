# DIRECTIVES — 7087 ATREF-TOOL-MEDIATED-READ: @ref bütçe-bilinçli descriptor modu + ranged deckent_read_file

## Goal

MASTER 7087 (owner onayı 2026-08-18). Canlı incident: 131K pencereli lokal Qwen'e
3 doküman @ref'lendi → `INPUT_CONTEXT_OVERFLOW measured=149503 available=126976`
(7086 admission'ı DOĞRU çalıştı; eksik olan davranış). Claude-Code paradigması:
büyük dosya context'e GÖMÜLMEZ — model dosyayı read aracıyla KENDİ okur, parça
parça. Mevcut mekanizma: src/cli/repl/at-ref.ts `expandAtRefs` (AT_REF_MAX_REFS=5,
AT_REF_MAX_CHARS=32KB/dosya, full-inline) → app.tsx:1407 → bridge structured
TurnInput (rawIntent/expandedPayload/references — 560-004 LANDED). Araç tarafı:
native-tool-registry.ts `deckent_read_file` yalnız `{path}` — ranged okuma YOK.
Hedef: küçük @ref inline kalır; ölçülen bütçeye sığmayan set otomatik
tool-mediated moda düşer (descriptor + yönerge); read aracı satır-aralığı kazanır.

## Execution Contract

- No build and no repository-wide/full-suite test run during this sprint.
- 7086 zinciri BOZULMAZ: ölçüm/admission (measureProviderRequest, typed
  INPUT_CONTEXT_OVERFLOW) authority olarak kalır — bu paket admission'ı
  ZAYIFLATMAZ, tetiklenmesini önler. Kümülatif billing/usage sayaçlarına dokunma.
- i18n-FIRST: user-facing metin getMessage en+tr; `[@ref]` protokol satırları
  mekanizma-string'i olarak İngilizce typed kalır (at-ref.ts:12 mevcut sözleşme).
- Descriptor modu KAYIPSIZ: hangi referansın inline, hangisinin descriptor'a
  düştüğü typed olarak references lineage'ına yazılır (560-004 yapısı).
- Parallel execution ADMITTED; single-writer chokepoints: ONLY Task 1 writes
  src/cli/repl/at-ref.ts + src/cli/repl/app.tsx; ONLY Task 2 writes
  src/cli/repl/native-tool-registry.ts; messages.ts yazımı YALNIZ Task 3.
- Hermetic tmpdir tests; async spawn; no spawnSync; scoped verification only.
- Echo the policy digest in your .result as runPolicyEvidence exactly as the
  prompt's Result contract instructs.

## Task 1: Bütçe-bilinçli @ref kararı — inline vs descriptor modu
- Files: src/cli/repl/at-ref.ts, src/cli/repl/app.tsx, tests/cli/at-ref-budget.test.ts
- Scope: src/cli/repl/, tests/cli/
- Provider: codex
- Model: gpt-5.6-sol

### Description
1. `expandAtRefs` bütçe-bilinçli olur: opsiyonel `expansionBudgetChars` parametresi
   (caller'dan; yoksa mevcut davranış BYTE-IDENTICAL — geriye dönük güvenli).
   Bütçe verildiğinde: referanslar sırayla inline edilir; TOPLAM expansion bütçeyi
   aşacaksa kalan referanslar (ve gerekirse tümü) DESCRIPTOR moduna düşer —
   inline içerik yerine `[@ref-descriptor] <path> — <bytes> bytes, <lines> lines,
   sha256:<digest12> — read it in slices with deckent_read_file (offset/limit)`
   protokol satırı. Sonuç yapısı hangi ref'in `inline` hangi ref'in `descriptor`
   olduğunu typed taşır (mevcut AtRefExpansion şekli genişler; app.tsx tüketimi
   uyumlanır).
2. app.tsx:1407 çağrı yeri bütçeyi GERÇEK kaynaktan türetir: efektif context
   penceresi (run.tsx'in getContextBudgetTokens zinciriyle aynı authority) −
   çıktı/güvenlik rezervi − mevcut transcript tahmini → kalan alanın konservatif
   payı (chars ≈ tokens×3 üst-sınır kuralı; iyimser katsayı YASAK). Authority
   çözülemiyorsa (getter throw) mevcut inline davranış korunur — admission zaten
   fail-closed (davranış gerilemez).
3. Test (hermetik): küçük tek ref inline kalır (byte-parity); bütçeyi aşan set
   descriptor'a düşer ve descriptor satırı path+bytes+digest taşır; karışık set
   (ilk ref sığar, ikincisi düşer); bütçesiz çağrı mevcut snapshot'la byte-eş;
   lineage typed alanları doğru.

GO: tsc 0; scoped yeşil; incident-şekilli karar (3×~50K ref + ~120K bütçe →
descriptor) kanıtlı. NO_GO: bütçesiz yol byte-değişirse veya descriptor kayıpsız
lineage taşımazsa.

## Task 2: deckent_read_file ranged-read — offset/limit satır-aralığı
- Files: src/cli/repl/native-tool-registry.ts, tests/cli/native-read-ranged.test.ts
- Scope: src/cli/repl/, tests/cli/
- Provider: claude
- Model: claude-opus-5

### Description
1. `deckent_read_file` şeması genişler: `{path, offset?, limit?}` — offset =
   1-tabanlı başlangıç satırı, limit = satır sayısı (default: baştan, mevcut
   davranış). Dönüş, cat -n tarzı satır-numaralı içerik + `{totalLines, range}`
   meta satırı (model kaç parça kaldığını bilsin). Mevcut path-containment/izin
   katmanı AYNEN geçerli (read tier'ı değişmez).
2. Büyük-dosya güvenliği: limit verilmemişse mevcut tek-parça davranış korunur
   ama çıktı mevcut üst sınırı aşacaksa dürüst kesme işareti + totalLines meta
   (sessiz kesme yok). Tool description'ı MCP/CLI kataloğu düzenine uygun
   güncellenir (7085 tek-kaynak kuralı — description-catalog bağlaması varsa
   oradan, yoksa mevcut yerinde metin + sayımlı not).
3. Test (hermetik tmpdir): offset/limit dilimi doğru satırları döner; aralık-dışı
   offset dürüst boş+meta; default yol regresyonsuz; 5,000 satırlık fixture 3
   dilimde tam kapsanır (birleşim = bütün).

GO: tsc 0; scoped yeşil; dilim-birleşim kanıtı. NO_GO: default davranış değişirse
veya containment zayıflarsa.

## Task 3: Typed UX + i18n + incident battery (depends on Task 1, Task 2)
- Files: src/cli/repl/native-agent-bridge.ts, src/cli/helpers/messages.ts, tests/cli/atref-tool-mediated-battery.test.ts
- Scope: src/cli/repl/, src/cli/helpers/, tests/cli/
- Provider: claude
- Model: claude-sonnet-5
- Dependencies: Task 1, Task 2

### Description
1. Bridge, Task 1 lineage'ından descriptor-moduna düşen referans olduğunda BİR
   typed bilgilendirme satırı basar (en+tr, getMessage): "N referans ölçülen
   bütçeye sığmadı; araçlı parçalı okumaya geçildi" — mevcut
   REFERENCE_EXPANSION sınıf ailesinin devamı olarak (ret mesajı DEĞİL, bilgi).
2. Battery (hermetik, gerçek modüller — fixture-local reimplementation YOK):
   (a) incident şekli: 3 büyük ref + dar bütçe → prompt'ta inline gövde YOK,
   3 descriptor VAR, ölçülen istek bütçe ALTINDA (measureProviderRequest'le
   doğrula — admission tetiklenmez); (b) descriptor yönergesindeki read aracı
   gerçekten ranged çağrılabilir (registry'den dispatch, dilim döner);
   (c) küçük-ref yolu regresyonsuz inline; (d) en+tr bilgilendirme satırı.
3. Kapsam sayımı .result'a (sessiz borç yok).

GO: battery yeşil; tsc 0; incident-şekli uçtan uca kanıtlı. NO_GO: herhangi bir
halka mock'sa (UNWIRED) veya bilgilendirme ret gibi okunuyorsa.
