# MASTER 6181 DİLİM-1: COMPETITIVE INTELLIGENCE — BASELINE KERNEL

> Kaynak: `docs/governance/lane-briefs/competitive-intelligence-watch-2026-08-27.md` (owner-ADMIT
> 2026-08-27). Lane-brief'in üç "high effort" task'ı mikro-task disiplinine göre bölündü; bu dilim
> yalnız **Task 1 = baseline karşılaştırma kernel'i** kapsamını taşır. Retrieval/dedup/notification
> (lane-brief Task 2) ve Goal-v2 wiring/CLI/docs (Task 3) AYRI dilimlerdir, burada YAZILMAZ.

## Goal

Deckent'in kendi kod-gerçeğini kanıt-bağlı, makine-okunur bir baseline'a çeviren ve rakip
sinyallerini bu baseline'a karşı deterministik olarak sınıflandıran saf çekirdeği kur. Bu dilim
ağ erişimi, zamanlama, bildirim veya kalıcı depolama İÇERMEZ — hepsi sonraki dilimlerin işidir.
Buradaki her şey saf fonksiyon + typed veri olmalı ki sonraki dilimler onu güvenle tüketebilsin.

Ürün karşılığı: bugün "rakip X şunu yaptı" haberi geldiğinde bunun Deckent için gerçekten yeni
bir şey olup olmadığını söyleyecek tek kaynak yok. Bu çekirdek onu verir: her yetenek alanı için
"bizde ne var, ne kadar kanıtlı" cetveli + gelen sinyalin bu cetvele göre anlamı.

## Execution contract

- Kalite barı aynen: i18n-FIRST (bu dilimde user-facing string YOK — analyzer/prompt metinleri
  İNGİLİZCE sabit veri olarak `alarm-prompt.ts` içinde durur) · 0-hardcode (eşik/sınır literal'i
  yok; sabitler tek yerde named export) · hermetik test (tmpdir/fixture, ağ YOK, spawnSync YOK) ·
  mevcut-pattern (repo'daki typed-store/registry desenlerini kullan, yeniden icat etme).
- Test komutları TASK-SCOPED ve TEKİL. Her task tek test dosyası koşar.
- Bu dilim `src/intelligence/` dışına YAZMAZ. CLI, config, scheduler, memory, connector
  dosyalarına DOKUNULMAZ.
- Sahte skor/uydurma yüzde YASAK: sınıflandırma yalnız typed enum + kanıt referansıdır.

## Task 1: Baseline tipleri ve kanıt-bağlı yetenek cetveli
- Files: src/intelligence/types.ts, src/intelligence/baseline-catalog.ts, tests/intelligence/baseline-catalog.test.ts
- Reads: src/core/types.ts, src/core/model-registry.ts, docs/governance/lane-briefs/competitive-intelligence-watch-2026-08-27.md
- Priority: HIGH
- Agent: implementer
- Model: gpt-5.6-sol
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/intelligence/baseline-catalog.test.ts
### Description
`types.ts`: bu alt-sistemin tüm typed sözleşmesi. `CapabilityStatus` tam olarak yedi değer taşır —
`LIVE_PROVEN` · `LIVE_PARTIAL` · `WIRED_UNPROVEN` · `DORMANT_DEFAULT_OFF` · `ROADMAP` · `HOLD` ·
`DEAD_LEGACY`; başka değer kabul edilmez. `CapabilityEntry` her kayıt için alan zorunlu kılar:
`capabilityId`, `domain`, `status`, `evidenceRefs` (en az bir exact repo yolu; boş dizi tip
seviyesinde reddedilir), `sourceDigest` (kanıt dosyalarının içerik digest'i), `notes`.
`baseline-catalog.ts`: yetenek alanlarının kanonik listesi — Goal/Mission/Flow/Run/WorkItem/
Attempt/Operation, Brain, worker self-assessment, Auditor, Nervous, ApprovalBroker-HITL,
normative verdicts, dependency dispatch, collision control, FIX/retry/recovery, checkpoints,
settlement, evidence/receipts, XVerify/cross-provider, routing/provider authority,
budgets/landing, backends/isolation, MCP/API/CLI/Terminal/Desktop, connectors, process,
autonomous, memory, agents, skills, capability authority, reactive/notification. Katalog saf
veridir (ağ yok, dosya okuma yok); her girdi hangi repo yollarının kanıt sayıldığını beyan eder.
Test: yedi-değerli statü sözlüğünün tamlığı ve kapalılığı, her katalog girdisinin en az bir
evidenceRef taşıması, alan kimliklerinin tekilliği, katalogda beyan edilen her repo yolunun
gerçekten var olması (fixture değil, gerçek repo yolu kontrolü).

## Task 2: Baseline türetici — digest invalidation
- Files: src/intelligence/baseline.ts, tests/intelligence/baseline.test.ts
- Reads: src/intelligence/types.ts, src/intelligence/baseline-catalog.ts
- Priority: HIGH
- Agent: implementer
- Model: gpt-5.6-sol
- Dependencies: Task 1
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/intelligence/baseline.test.ts
### Description
Katalogdan compact bir `Baseline` üretir: her girdi için kanıt dosyalarının içerik digest'ini
hesaplar ve baseline'ın kendi digest'ini bu içeriklerden türetir. **HEAD tek başına yetmez:**
aynı commit'te bir kanıt dosyası değişirse baseline digest'i DEĞİŞMELİ; alakasız bir dosya
değişirse DEĞİŞMEMELİ. Üretici enjekte edilebilir bir dosya-okuyucu alır (test hermetikliği
için); üretim çağrısı gerçek fs kullanır. Eksik/okunamayan kanıt dosyası sessizce atlanmaz —
girdi typed `HOLD` durumuna düşer ve nedeni kayda geçer.
Test: digest invalidation (kanıt değişti→değişti, alakasız değişti→değişmedi), eksik kanıt
dosyasında typed HOLD, statü/kanıt tamlığı, determinizm (aynı girdi→aynı digest).

## Task 3: Karşılaştırma kernel'i ve material-signal kapısı
- Files: src/intelligence/competitor-universe.ts, src/intelligence/terminology.ts, src/intelligence/comparison.ts, src/intelligence/significance-gate.ts, src/intelligence/alarm-prompt.ts, tests/intelligence/comparison.test.ts
- Reads: src/intelligence/types.ts, src/intelligence/baseline.ts, docs/governance/lane-briefs/competitive-intelligence-watch-2026-08-27.md
- Priority: HIGH
- Agent: implementer
- Model: gpt-5.6-sol
- Dependencies: Task 2
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/intelligence/comparison.test.ts
### Description
`competitor-universe.ts`: bilinen rakip kümesi + **açık yeni-giren seam'i** (listede olmayan bir
aktör sinyali typed `unknown-entrant` olarak taşınır, sessizce düşmez). `terminology.ts`: rakip
terimlerini Deckent primitive'lerine çeviren mapping (ör. karşı-taraf "agent teams" → Deckent
`Mission`/`WorkItem`); eşleşmeyen terim typed `unmapped` döner. `comparison.ts`: bir sinyali
baseline'a karşı beş göreli sınıftan birine koyar (`AHEAD` · `PARITY` · `BEHIND` ·
`DIFFERENT_APPROACH` · `NOT_APPLICABLE`) ve sekiz boşluk boyutunu (capability · evidence-depth ·
distribution · enterprise-economics · protocol/interop · ecosystem · operability · trust) ayrı
ayrı raporlar — tek skorda ezmez. `significance-gate.ts`: yalnız pozisyonu gerçekten değiştiren
sinyali `material` sayar; DAG catch-up sınıfı (rakibin bizde zaten LIVE_PROVEN olan bir şeyi
yakalaması) varsayılan olarak bastırılır. `alarm-prompt.ts`: analyzer prompt'u — İNGİLİZCE,
uydurma skor/yüzde İÇERMEZ, yalnız typed sınıf + kanıt referansı taşır.
Test: beş sınıfın kapalı sözlüğü, sekiz boyutun ayrık raporlanması, DAG catch-up'ın
bastırılması, distribution / enterprise-economics / protocol sinyallerinin doğru boyut ve
imayla ayrılması, unknown-entrant ve unmapped-terim seam'leri, prompt'ta skor-benzeri sayı
bulunmaması.
