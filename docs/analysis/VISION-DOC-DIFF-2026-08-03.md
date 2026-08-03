# Vizyon ↔ dokümantasyon fark raporu — 2026-08-03

Bu rapor `docs/en/vision.md` (canonical) ve `docs/tr/vision.md` (ayna) dokümanlarını, reset sonrası
`docs/en/` + `docs/tr/` ağacının tamamına karşı tarar. Amaç: vizyonun iddia ettiği ile dokümante
edilmiş kod-gerçekliğinin ayrıştığı noktaları adlandırmak.

**Yöntem.** `docs/en/` altındaki 22 dosyanın tamamı okundu (EN canonical; TR ayna yapısal olarak
kontrol edildi). Her bulgu `dosya:satır` çapasıyla verilir. Sayı iddiaları `src/` üzerinde ayrıca
doğrulandı.

**Öncelik kuralı.** Çelişki çözümünde sıra: `.deckent/workspace/IDENTITY.md` > kanıt-atıflı
dokümanlar > `vision.md`. Bir referans dokümanı `src/...` atfı taşıyor ve vizyon onunla çelişiyorsa,
**kusur vizyondadır**. Aşağıdaki bulguların çoğu bu yöndedir.

**Bu rapor ne değildir.** Düzeltme uygulamaz, MASTER-PLAN'ı düzenlemez, ürün kontratı üretmez.
Planlanan iş için SSOT `docs/MASTER-PLAN.md`'dir.

---

## Özet

| Sınıf | Adet | Ağırlık merkezi |
|---|---:|---|
| A — Çelişki (doküman X der, vizyon değil-X der) | 5 | Hepsi vizyonun **şimdiki zaman** kullanımından; kusur `vision.md`'de |
| B — Boşluk (vizyon iddia eder, hiçbir doküman kapsamaz) | 4 | Assistant-şekilli kullanım ve local-first anlatısı |
| C — Bayat / aşırı-iddia (elle yazılmış sayı, eksik envanter) | 5 | Sayı drifti — arşiv VISION.md'yi çürüten aynı arıza deseni |
| D — TR ayna drifti | 0 yapısal | Başlık sayıları eşleşiyor; içerik-eşleşmesi bulgu-noktalarında kontrol edildi |

En kritik iki madde: **A1** (yönetişim iddiası) ve **C2** (provider envanteri eksik) — ikisi de
vizyonun en güçlü iki iddiasını, kendi dokümantasyonumuz zayıflatıyor.

---

## A — Çelişkiler

### A1 — "Yapı gereği yönetişim" şimdiki zamanda iddia ediliyor, dokümanlar opt-in diyor

**Vizyon** (`docs/en/vision.md`, *What makes Deckent different* / `docs/tr/vision.md`, *Deckent'i
farklı kılan*): "Yetki, scope, onay, bütçe ve tenancy; enterprise alıcılar için sonradan takılan
seçenekler değil, execution modelinin **yapısal özellikleridir**."

**Dokümanların söylediği:**

| Kaynak | İfade |
|---|---|
| `docs/en/governance/authority-rbac.md:58` | "Enterprise RBAC default — ⚠️ opt-in. Standalone defaults disable tenancy/RBAC; **disabled enforcement is a permissive no-op**" |
| `docs/en/governance/authority-rbac.md:62` | "Capability least privilege — ⚠️ opt-in. Registry default is **permissive**" |
| `docs/en/governance/authority-rbac.md:60` | "Brain/Auditor/Worker matrix — ⚠️ partial. authority enforcer reports **soft** mode" |
| `docs/en/governance/immutable-laws.md:63` · `docs/en/reference/platform-security.md:62` | "Repository hooks/policies are **not an unbypassable admin boundary**" |
| `docs/en/reference/enterprise-and-resources.md:5` | "**No single flag** turns a local project into a certified security boundary" |

**Karar:** kusur `vision.md`'de. İddia yön olarak doğru, durum olarak yanlış. Kanıt-atıflı
governance dokümanları kazanır.

**Önerilen düzeltme:** cümleyi hedef-model olarak işaretle ve statüye link ver — `overview.md:25`'in
`Goal→Operation` için yaptığı gibi ("This is the required product model. The current source … does
not yet expose…"). Örn: "…yapısal özellikleridir. Bugünkü varsayılanlar birçok kontrolü opt-in
bırakıyor; güncel statü [Authority/RBAC](../governance/authority-rbac.md)."

---

### A2 — "Kapalı öğrenme döngüsü" kapalıymış gibi anlatılıyor

**Vizyon:** "Fiilen olan şey, bundan sonra olacak şeyi besler: sonuçlar routing'i, routing agent ve
skill terfisini şekillendirir; tüm geçmiş planlama anında sorgulanabilir kalır."

**Dokümanların söylediği:**

| Kaynak | İfade |
|---|---|
| `docs/en/guide/memory-learning.md:54` | "Closed outcome→routing→promotion loop — ⚠️ partial … **end-to-end production closure not certified**" |
| `docs/en/guide/memory-learning.md:43` | "**Do not describe automatic learning as a fully closed production loop** without current routing consumption and settlement proof" |
| `docs/en/features/catalog.md:53` | ecosystem-intelligence: "persistence exists, but **routing-engine-v3 does not consume the analysis**" |
| `docs/en/glossary.md:73` | training trace: "its **production wiring is a named direction item**" |

**Karar:** kusur `vision.md`'de. Özellikle `memory-learning.md:43` doğrudan bir yazım talimatıdır ve
vizyon onu ihlal ediyor.

**Not:** vizyonun kendi *"Bu vizyonu ne yanlışlar"* bölümü zaten "Öğrenmenin yürütmeyi değiştirmeyi
bırakması"nı sayıyor — yani yapı doğru, sadece ana paragrafın kipi yanlış. Düzeltme silme değil,
kip/nitel ek.

---

### A3 — "Tek kernel, tek policy sistemi" vs. çoğul rol sözlükleri

**Vizyon:** "Tek kernel, tek policy sistemi, tek kanıt zinciri ve tek öğrenme döngüsü paylaşırlar."

**Dokümanların söylediği:**

- `docs/en/governance/authority-rbac.md:3` — "Deckent'in **several role vocabularies** … must not be
  treated as interchangeable" (product RBAC · orchestration authority · approval requester ·
  capability roles)
- `docs/en/governance/authority-rbac.md:63` — "Role vocabulary unification — **⚠️ HOLD** … mapping
  authority is OQ-23"
- `docs/en/reference/runtime-contracts.md:84` — canonical work-model "additive and *dead until a
  consumer migrates*"; OQ-06 normalize kapanışı HOLD

**Karar:** ifade `IDENTITY.md:5`'ten geldiği için vizyonda **kalabilir** — ama `overview.md:9,25`
gibi hedef-model olduğu belirtilmeli. Şu anki haliyle vizyon, `overview.md`'nin özenle koyduğu ⚠️
nitelemesini kaldırıyor.

**Önerilen düzeltme:** Trinity bölümüne tek cümle — "Tek normalize edilmiş uçtan uca tip grafiği
henüz açık (OQ-05/OQ-06); güncel statü [Genel bakış](./overview.md)."

---

### A4 — "Sistem kendi başına hareket eder" vs. otonom yürütme HOLD

**Vizyon**, non-goal listesinde: "**Kontrolsüz otonomi değildir.** Sistem kendi başına hareket eder,
yetki kullanıcıda kalır."

**Dokümanların söylediği:**

| Kaynak | İfade |
|---|---|
| `docs/en/operations/current-frictions.md:56` | "**HOLD — not certified for publish-grade autonomous execution**" |
| `docs/en/guide/nervous-system.md:53` | "Always-on meta-orchestration — **🔜 roadmap**; not supported by current wiring proof" |
| `docs/en/guide/nervous-system.md:44` | manifest Nervous'u **dormant** sınıflar; observer sprint-controller tarafından import edilmiyor |
| `docs/en/features/catalog.md:37` | autonomous runtime "⚠️ partial — default-off; CLI-only; reactive observer attach-only" |
| `docs/en/operations/evidence-and-settlement.md:55` | "Unattended settlement certification — 🔜 roadmap" |

**Karar:** kusur `vision.md`'de. Cümle bir yetenek beyanı gibi okunuyor; oysa 0/31 müdahalesiz koşum
kaydı var (`PAZARTESI.md` üzerinden `current-frictions.md:7`).

**Önerilen düzeltme:** "Sistem kendi başına hareket ettiğinde yetki kullanıcıda kalır" — koşullu kip.

---

### A5 — "Deterministik, sabit faz dizisi" vs. faz sözlüğü HOLD

**Vizyon:** "Yaşam döngüsü … **sabit ve denetlenebilir bir faz dizisidir**."

**Dokümanların söylediği:**

- `docs/en/architecture.md:38` — `SprintPhase` enum'unda `CLEANUP` **yok**; `runSprint` doc-comment'i
  `COMPLETE`'i sekizinci faz sayıp cleanup'ı ayrı diyor, yürütülen yol ise cleanup'ı Faz 8 olarak
  çağırıyor
- `docs/en/architecture.md:79` · `docs/en/guide/run-lifecycle.md:53` — "Phase vocabulary — **⚠️ HOLD**
  (OQ-04)"

**Karar:** düşük şiddet. Yürütme sırası gerçekten deterministik; **kamuya açık sözlük** değil. Vizyon
"faz dizisi" derken hangisini kastettiğini belirtmeli.

**Önerilen düzeltme:** "sabit ve denetlenebilir bir yürütme dizisidir" (sözlük değil, sıra iddiası) —
tek kelimelik düzeltme çelişkiyi kapatır.

---

## B — Boşluklar

### B1 — Altı yürütme bağlamının ikisinin rehber karşılığı yok

Vizyon altı bağlam sayıyor. Rehber ağacı (`docs/index.md` → Guides) yalnız kod-şekilli olanları
kapsıyor:

| Bağlam | Rehber karşılığı |
|---|---|
| Sıfırdan proje · Aktif geliştirme · Bakımdaki kod tabanı | ✅ `guide/getting-started.md`, `guide/run-lifecycle.md`, `guide/execution-modes.md` |
| **Günlük iş** ("özetle, yanıtı taslakla, kontrol listesini güncelle") | ❌ yok — `guide/interactive-surfaces.md` REPL mekaniğini anlatıyor, assistant-şekilli iş akışını değil |
| **İş sistemleri** (ERP/veri/onay) | ⚠️ kısmi — `reference/enterprise-and-resources.md:39-44` adaptörleri listeliyor, kullanıcı akışı yok |
| Enterprise runtime | ✅ `reference/enterprise-and-resources.md`, `governance/authority-rbac.md` |

**Etki:** vizyon "yalnız kod-biçimli işi karşılayan bir sistem Agent OS değil bir kodlama aracıdır"
diyor, ama dokümantasyon tam da o dar kapsamı yansıtıyor. Bu, vizyonun kendi yanlışlama
sinyallerinden birinin ("Ölçeğin daraltarak elde edilmesi") **doküman düzeyinde şu an gerçekleşiyor**
olduğunu gösteriyor.

### B2 — "Tek kurulu ürün, fork yok" taahhüdü hiçbir dokümanda yok

Vizyon: "Aynı kurulu ürün her iki ucu da fork, yeniden yazım veya ayrı bir 'enterprise edition'
olmadan karşılamak zorundadır." `reference/enterprise-and-resources.md` enterprise'ı **opt-in
kompozisyon** olarak tarif ediyor; tek-artifact taahhüdünü hiçbir yer kaydetmiyor. Bu iddia yalnız
vizyonda yaşıyor — dokümante edilmiş bir kısıt değil.

### B3 — Local-first / "Deckent bulutu gerekmez" hiçbir dokümanda yok

Vizyon: "Deckent'in çalışması için bir Deckent bulutunun var olması gerekmez." `IDENTITY.md:3`
"local-first" diyor; `guide/getting-started.md` kurulumu anlatıyor ama bu özelliği hiçbir doküman
açıkça beyan etmiyor. Ürün konumlandırmasının ayırt edici bir parçası için boşluk.

### B4 — Hiçbir doküman `vision.md`'ye link vermiyor

Ağacın tamamında `vision.md`'ye giden tek link `docs/index.md`'de. `docs/en/overview.md:53` "The
vision is authoritative direction" diyor ama **dosyaya link vermiyor** — okur yönü nereden okuyacağını
bilmiyor. En az `overview.md` ve `governance/immutable-laws.md` geri-link taşımalı.

---

## C — Bayat / aşırı-iddia

### C1 — MCP tool sayısı yedi ayrı yerde elle yazılmış, ledger'la çelişiyor

| Konum | Değer |
|---|---|
| `docs/en/mcp.md:7,11,13,77,84` (5 yer) | **49** |
| `docs/en/glossary.md:45` | "49 are canonical" |
| `docs/en/architecture.md:55` | "49 tool registrations" |
| `docs/en/operations/current-frictions.md:44` | "49 tools" + gerçek `connect --json` çıktısı **31** (MCP-18 olarak kayıtlı) |
| `docs/MASTER-PLAN.md` satır 8092 (`DOCS-TRUTH-PASS-001`, 2026-07-31) | "verified code inventory — **42 MCP tools**" |

`mcp.md:7` sayıyı `TOOL_CATALOG.length`'ten türetip test-korumalı olduğunu belirtiyor, yani **49 doğru
taraf**; ledger'daki 42 ve `connect`'in 31'i bayat. Ama sayı 7 ayrı elle-yazılmış yerde duruyor —
arşiv `VISION.md`'yi çürüten aynı arıza deseni (metin 15 agent / 34 tool derken tablo 21/49 diyordu).

**Öneri:** sayıyı üreten tek kaynak (`docs:ref` pipeline'ı) dışında hiçbir elle-yazılmış dokümanda
tekrar etme; prose "canonical catalog" desin, sayıyı generated projeksiyona bıraksın.

### C2 — Provider envanteri eksik — vizyonun en güçlü iddiasını zayıflatıyor

`docs/en/guide/workers-and-providers.md:9`: "Deckent recognizes **Claude, Codex, Gemini, Ollama, and
OpenRouter** in configuration." (5)

`src/providers/` gerçeği — **7 adaptör ailesi**: `claude.ts`, `codex.ts`, `gemini.ts`, `ollama.ts`,
`openrouter.ts`, `openai-compatible.ts`, `bedrock.ts`.

`bedrock` yalnız dosya olarak durmuyor; 5 ayrı üretim modülünde referanslı: `src/core/provider.ts`,
`src/core/pricing-updater.ts`, `src/core/catalog/cache-archetype.ts`, `src/orchestra/token-counter.ts`,
`src/agents/agentic-worker-entry.ts`. `openai-compatible` ise `src/core/config-types.ts:617`'de
config'te tanımlı.

**Etki:** vizyon "hiçbir provider Deckent'in kimliğinin parçası değildir" diyor ve provider
bağımsızlığını üç moat özelliğinden biri sayıyor; doküman ise mevcut adaptörlerin %29'unu (7'de 2)
listelemiyor. Az-raporlama, tam da en çok kanıt istenen yerde.

**Öneri:** `workers-and-providers.md` tabloyu 7 aileye genişletsin ve her biri için config/registry
bağlanma durumunu ayrı kolonda dürüstçe işaretlesin (`bedrock` config enum'unda görünmüyor — bu
kendisi bir bulgudur, gizlenmemeli).

### C3 — Agent/skill sayıları elle yazılmış

- `docs/en/reference/agents.md:7` — "21 routable worker personas plus Brain and Auditor" + `:42`
  "**Only 15 of the 21** worker IDs are present in `BUILTIN_AGENT_ROLES`"; "21+2" notasyonu OQ-21
  altında `HOLD`
- `docs/en/reference/skills.md:7,51` — "exactly **30** canonical project skill documents"

Her ikisi de kanıt-atıflı ve tarihli, yani şu an dürüst. Ama `IDENTITY.md`'nin AUTOGEN bloğu aynı
sayıları üretiyor (`identity-summary`) — iki bağımsız elle/otomatik kaynak aynı gerçeği taşıyor ve
zamanla ayrışacak. C1 ile aynı öneri geçerli.

### C4 — `12 detectors` sabiti

`docs/en/guide/nervous-system.md:11` — "The registry implements 12 detectors" + numaralı liste.
Kaynak-atıflı (`src/nervous/detector-registry.ts:24-190`) ama elle sayılmış; detector eklendiğinde
sessizce bayatlar.

### C5 — Tarihli anlık görüntüler kalıcı metin gibi duruyor

`docs/en/features/catalog.md:35` ve `docs/en/guide/memory-learning.md:25` — "1,764 records/entries",
2026-08-01. Her iki yer de "dated repository snapshot" diye açıkça niteliyor, yani **dürüst**; yine de
iki ayrı dosyada tekrarlanan bir çalışma-zamanı sayısı, tekrarlandığı için driftе açık.

---

## D — TR ayna

Dosya kümesi paritesi tam (`docs/en` ↔ `docs/tr`, birebir aynı göreli yollar). Bulgu içeren
dosyalarda başlık sayısı kontrolü:

| Dosya | EN başlık | TR başlık |
|---|---:|---:|
| `overview.md` | 7 | 7 |
| `architecture.md` | 7 | 7 |
| `glossary.md` | 3 | 3 |
| `features/catalog.md` | 6 | 6 |
| `guide/workers-and-providers.md` | 9 | 9 |
| `guide/memory-learning.md` | 9 | 9 |
| `operations/current-frictions.md` | 8 | 8 |
| `governance/immutable-laws.md` | 7 | 7 |

**Yapısal drift yok.** A–C sınıfındaki her bulgu TR aynasında da geçerlidir; düzeltmeler iki dilde
birlikte uygulanmalı, aksi halde parite kırılır.

---

## Önerilen işlem sırası

| # | İş | Nerede | Neden önce |
|---|---|---|---|
| 1 | A1, A2, A4 kip/nitel düzeltmesi | `docs/en/vision.md` + `docs/tr/vision.md` | Vizyon en yeni doküman; kanıt-atıflı dokümanlarla çelişmesi en hızlı güven kaybı |
| 2 | C2 provider envanteri | `guide/workers-and-providers.md` (en+tr) | Vizyonun moat iddiasını doğrudan zayıflatıyor |
| 3 | B4 geri-linkler | `overview.md`, `governance/immutable-laws.md` (en+tr) | Tek satır; vizyonu keşfedilebilir yapar |
| 4 | A3, A5 tek-cümle nitelemeleri | `vision.md` (en+tr) | Düşük şiddet, düşük maliyet |
| 5 | C1/C3/C4 sayı-tek-kaynak | `mcp.md`, `glossary.md`, `architecture.md`, `agents.md`, `skills.md`, `nervous-system.md` | Yapısal; ayrı bir generated-projection kararı gerektirir |
| 6 | B1, B2, B3 yeni içerik | yeni rehber sayfası + `overview.md` | En büyük iş; kapsam kararı Alperen'e ait |

Madde 5 ve 6, `DOCS-RELEASE-TRUTH-001` ve `DOCS-PRODUCT-001` ledger satırlarının kapsamına giriyor;
bu rapor onları değiştirmez, yalnız somut kanıt sağlar.
