# DIRECTIVES — SKILL-UNLOCK: builtin kataloğa canonical V3 profile + routing eligibility + force/exclude tutarlılığı + delivery-proof (9034+7121 çekirdeği)

## Goal

MASTER 9034 (SKILL-ROUTING-ELIGIBILITY-001) + 7121 (SKILLMD-V3-RECONCILIATION-001)
çekirdeği — owner öne-alması (Alperen 2026-08-18: "görevlere skill injection yok,
kaybımız devam ediyor"). Kanıtlı durum: 30/30 builtin skill'de `profile: null`
(manifest yalnız V2 activation taşır; V3 onu öldürdü), routing-plan-adapter.ts:91
yalnız valid profile kabul eder → HER task `assignedSkills=[]` → 30 uzmanlık paketi
hiçbir worker prompt'una ulaşmıyor. Enjeksiyon borusu CANLI (sprint-spawner.ts:1054
resolveSkillPrompts + typed HOLD) — yalnız seçim tarafı boş besliyor.
9034 code-truth'un ek canlı bug'ları: direct-V3 yolu forceSkills'i boş listeyle
eziyor (sprint-spawner sonradan union ederken), V3 adapter enabled filtresi
uygulamıyor, hermetik testler profile'ları test-local sabitte taklit ediyor.
Owner karar tabanı (2026-08-11, follow-up-works/skill-catalog-authority-design +
agent-catalog-authority-design): D1 generated < human-override · D2 terfi YALNIZ
owner review-receipt (stats yalnız önerir) · D3 retired id tombstone + namespace ·
D5 installed-but-unroutable görünür etiket · D9 flat-id + registry-mapping ·
D10 kaçak resolver = lint FAILURE · 7121: canonical V3 profile source metadata /
owner mapping'den versioned üretilir, üretilemeyen typed unroutable/HOLD; legacy V2
activation yalnız migration girdisidir, tek başına routability kanıtı DEĞİLDİR.

## Execution Contract

- No build and no repository-wide/full-suite test run during this sprint.
- ADR-G-036/KANUN-10: skill-id/model-adı literal'i kod yoluna gömülmez — profile
  üretimi manifest source metadata'sından türetilir, elle yazılmış profil tablosu
  koda konmaz (data dosyası + üretici mekanizma olur).
- Mevcut S5 canonical projection (snapshotSkillCatalog) ve S3 entrypoint/containment
  authority'si KULLANILIR — paralel katalog/resolver icat edilmez.
- Legacy V2 `activation` bloğu routability authority'sine TERFİ ETTİRİLMEZ (7121
  owner kararı) — yalnız V3 profile üretiminin migration GİRDİSİ olabilir.
- Parallel execution ADMITTED; single-writer chokepoints: ONLY Task 1 writes
  src/core/skill-pool.ts + src/core/skill-types.ts + .deckent/skills/*/manifest.json;
  ONLY Task 2 writes src/orchestra/routing-plan-adapter.ts; ONLY Task 3 writes
  src/orchestra/sprint-spawner.ts + src/orchestra/task-builder.ts; scripts/ yazımı
  YALNIZ Task 2 (lint) ve tests/ herkesin kendi dosyası.
- i18n-FIRST: user-facing metin getMessage en+tr; typed rejection reason'ları
  mekanizma kodu olarak kalır (İngilizce typed code), yüzey render'ı i18n.
- Hermetic tmpdir tests; async spawn; no spawnSync; scoped verification only.
- Echo the policy digest in your .result as runPolicyEvidence exactly as the
  prompt's Result contract instructs.

## Task 1: Canonical V3 profile üretimi — 30 builtin skill routable olur
- Files: src/core/skill-pool.ts, src/core/skill-types.ts, src/core/skill-profile-derivation.ts, .deckent/skills/, tests/core/skill-profile-derivation.test.ts
- Scope: src/core/, .deckent/skills/, tests/core/
- Provider: codex
- Model: gpt-5.6-sol

### Description
1. Yeni `src/core/skill-profile-derivation.ts`: manifest source metadata'sından
   (category, triggers, stackDetection, composableWith, priority, description)
   deterministik, VERSIONED canonical V3 SkillProfile üretir (mevcut
   validateSkillProfile şemasına uygun). Üretim kuralları data-driven'dır (alan
   eşlemeleri tek modülde, elle profil tablosu YOK); üretilemeyen skill typed
   `unroutable/HOLD` diagnostiği taşır (sessiz atlama ölür — bugünkü adapter
   davranışının tersi). Legacy `activation` yalnız migration girdisi olarak
   okunabilir; profile'a yükseltilen her alan provenance notu taşır.
2. SkillPoolManager yüklemede türetilmiş profile'ı effective record'a bağlar
   (disk manifest'i değiştirmeden runtime-derivation MI, yoksa 30 manifest'e
   profile alanının persist edilmesi Mİ — karar: PERSIST + derivation idempotent
   `deckent sync` yolunda yeniden üretilebilir; manifest'ler .deckent/skills/
   altında güncellenir, schemaVersion/lint-manifests uyumu korunur).
3. `installed-but-unroutable` görünür durum (D5): profile üretilemeyen skill
   effective record'da typed reason'la işaretlenir; CLI/MCP list yüzeyleri bu
   durumu zaten canonical projection'dan okur — projection alanı eklenir.
4. Test (hermetik): temsilci manifest fixture'larından deterministik profile
   üretimi; üretilemeyen → typed HOLD; idempotent yeniden-üretim byte-eş;
   GERÇEK repo taraması testte koşulmaz ama üretici script'in 30/30 gerçek
   skill'de valid profile ürettiği tek assert'lik smoke (fs read-only).

GO: tsc 0; scoped yeşil; 30/30 builtin valid V3 profile taşır (gerçek disk
kanıtı .result'ta); üretilemeyen sınıf typed HOLD. NO_GO: elle profil tablosu
veya legacy-activation'ın doğrudan routability'ye terfisi görülürse.

## Task 2: Routing eligibility + typed rejection + lint (depends on Task 1)
- Files: src/orchestra/routing-plan-adapter.ts, scripts/lint-skill-routing-eligibility.mjs, tests/orchestra/skill-routing-eligibility.test.ts, tests/scripts/lint-skill-routing.test.ts
- Scope: src/orchestra/, scripts/, tests/orchestra/, tests/scripts/
- Provider: claude
- Model: claude-opus-5
- Dependencies: Task 1

### Description
1. routing-plan-adapter.ts: sessiz atlama ölür — profile'sız/invalid/disabled/
   retired/quarantined skill seçilmez AMA her red typed reason üretir
   (`profile-missing`, `disabled`, `retired`, `quarantined`, `invalid-profile`);
   enabled filtresi UYGULANIR (bugün yok — 9034 code-truth). Rejection'lar routing
   decision journal'ına/plan meta'ya yazılır (mevcut journal pattern'i).
2. Hermetik testlerdeki test-local profile reimplementation'ları GERÇEK
   derivation authority'sine bağlanır (9034 kriteri: "test-local profile
   reimplementation kalmaz") — kendi dosyalarında; başka test dosyası gerekirse
   sayımla raporla.
3. Yeni `scripts/lint-skill-routing-eligibility.mjs` (D10): resolver-bypass =
   FAILURE — routing yüzeyinde skill seçimi yalnız adapter üzerinden; sentetik
   ihlal fixture'ıyla FAIL + temiz fixture'la PASS testi; gerçek repo'da exit 0.

GO: tsc 0; scoped yeşil; typed rejection'lar kanıtlı; lint gerçek repo'da 0.
NO_GO: herhangi bir sessiz-atlama yolu kalırsa.

## Task 3: Force/exclude tutarlılığı + delivery-proof (depends on Task 1)
- Files: src/orchestra/sprint-spawner.ts, src/orchestra/task-builder.ts, tests/orchestra/skill-force-delivery.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Provider: claude
- Model: claude-opus-5
- Dependencies: Task 1

### Description
1. FORCE-EZME BUG'ı ölür (9034 code-truth): direct-V3 yolunda forceSkills boş
   routing sonucuyla EZİLMEZ — operatör force'u her yolda (sprint, FIX, single-task)
   aynı sonucu verir; force edilen skill çözülemezse mevcut typed HOLD davranışı
   korunur (GR-2026-08-08-DOGFOOD-RCPT2-01 dengesi: AUTO-assigned rotasyon
   force'a TERFİ ETMEZ).
2. DELIVERY-PROOF (9034 kriteri): skill içeriği resolveSkillPrompts'tan worker
   prompt'una GERÇEKTEN girmeden stats credit yazılmaz — spawner, prompt'a giren
   skill-id setini task meta'ya kaydeder; finalizer'ın sidecar yazımı (sprint-545
   zinciri) bu kanıt setini tüketir (yalnız kanıt alanını üret; finalizer değişikliği
   gerekiyorsa sayımla raporla, scope'a sızma).
3. Test: force-preserve her üç yolda; boş-routing + force → force yaşar;
   delivery-kanıt seti prompt'a giren gerçek id'lerle byte-eş.

GO: tsc 0; scoped yeşil; üç yol tutarlılığı + delivery-kanıt seti kanıtlı.
NO_GO: force'un ezildiği herhangi bir yol kalırsa.

## Task 4: Uçtan-uca battery — assignedSkills dolu kanıtı (depends on Task 2, Task 3)
- Files: tests/orchestra/skill-unlock-battery.test.ts
- Scope: tests/orchestra/, tests/core/
- Provider: claude
- Model: claude-sonnet-5
- Dependencies: Task 1, Task 2, Task 3

### Description
Tek hermetik battery: (a) gerçek derivation → gerçek adapter → gerçek spawner
zinciriyle (mock authority YOK) temsilci task'ların `assignedSkills`'inin DOLU
çıktığı; (b) disabled/retired/profile'sız skill'in typed reason'la seçilmediği;
(c) force/exclude'un üç yolda aynı sonucu verdiği; (d) delivery-kanıt setinin
prompt'a giren id'lerle eşleştiği; (e) kapsam sayımı .result'a (N skill, M
routable, K unroutable+nedenleri — sayı hardcode edilmez, taramadan türetilir).

GO: battery yeşil; tsc 0; sayım .result'ta. NO_GO: zincirin herhangi bir halkası
fixture-local taklitse (UNWIRED).
