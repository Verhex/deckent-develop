# ADR-037: Brain-Auditor-Worker Authority Matrix — RBAC Protocol V1.0

**Status:** accepted

**Date:** 2026-04-16

**Sprint:** _To be backfilled_

---

**Status:** accepted

**Date:** 2026-04-15

**Context:**

Deckent'in üç temel bileşeni — Brain (orkestratör), Auditor (doğrulayıcı), Worker (uygulayıcı) — Sprint 138'e kadar örtük güven (implicit trust) modeliyle çalışıyordu. Yetki sınırları `.claude/rules/*.md` dosyalarında doğal dil kuralları olarak tanımlı, ancak bu kurallar:

1. **Enforceable değildi:** Worker'ın scope dışına yazması yalnızca post-hoc `git diff` ile tespit ediliyordu. Brain'in `src/**`'e doğrudan müdahalesi engelleyen mekanizma yoktu. Auditor'ın kaynak kod yazmasını engelleyen tek şey doğal dil talimatıydı.

2. **Formal olarak tanımlı değildi:** ADR-008 Brain merkezi import kuralını, ADR-034 per-project izolasyonu, ADR-035 mesaj protokolünü tanımlıyordu — ama bu üç ADR'nin kesişiminde oluşan "kim neyi yapabilir?" sorusu hiçbir yerde tek tablo olarak cevaplanmıyordu.

3. **Enterprise ölçeğe hazır değildi:** Milyon kullanıcı hedefiyle (Q3 2026 vizyonu), bir bileşenin yetkisini aştığında ne olacağının deterministik, denetlenebilir, versiyonlanmış bir protokolü yoktu. NIST SP 800-162 (ABAC) ve RBAC standartları referans alınmalıydı.

4. **Sprint 137-138 canlı kanıtları:**
   - Sprint 137 Task 137-001: Worker `DONE` bildirdi, vitest 53 fail — worker kendi doğrulama yetkisini aşıyordu (self-assessment = judge of own work).
   - Sprint 138 Task 138-003: Auditor Authority Extension 3-Pipeline ile auditor aktif doğrulayıcı oldu, ama bu yetki genişlemesi formal RBAC kaydı olmadan yapıldı.
   - Sprint 138 Task 138-004: Event stream kanal kodları (ADR-035) "source" ve "target" alanlarıyla örtük role bilgisi taşıyor, ama hangi kanalı kimin kullanabileceği tanımlı değil.

5. **Tehdit modeli (ADR-034'ü genişletir):**
   - **Privilege escalation:** Worker'ın `.brain/DECISIONS.md`'yi değiştirerek kendi scope kurallarını gevşetmesi
   - **Lateral movement:** Worker A'nın Worker B'nin task dosyalarını okuması/yazması
   - **Audit bypass:** Brain'in auditor verification'ı atlayarak doğrudan GO kararı vermesi
   - **Role confusion:** Auditor'ın kaynak kodu yazması (audit bağımsızlığını bozar)

**Decision:**

Brain, Auditor ve Worker bileşenleri için formal Role-Based Access Control (RBAC) authority matrix tanımlanır. Bu matrix, Protocol Version 1.0 (ADR-035) üzerine inşa edilir ve her bileşenin dosya sistemi erişim hakları, event stream kanal kullanım hakları ve sprint yaşam döngüsü eylem yetkilerini belirler.

### Temel Prensipler

1. **Least Privilege (En Az Yetki):** Her bileşen yalnızca görevini yerine getirmek için gereken minimum yetkilere sahiptir. Ek yetki açıkça tanımlanmalı ve bu ADR'de kayıt altına alınmalıdır.

2. **Separation of Duties (Görev Ayrılığı):** Aynı bileşen hem uygulayıcı hem denetleyici olamaz. Worker kod yazar, Auditor doğrular, Brain karar verir. Bu üçlü hiçbir bileşende birleşmez.

3. **Auditability (Denetlenebilirlik):** Her yetki kullanımı event stream'e (ADR-035) kaydedilir. Yetkisiz erişim girişimleri `SCOPE_VIOLATION` olayı olarak loglanır.

4. **Fail-Closed (Kapalı Hata):** Yetki doğrulaması başarısız olursa varsayılan karar "erişim yok" olur. Açıkça izin verilmeyen her eylem yasaklanmış kabul edilir.

### Brain Authority Matrix

Brain, sprint orkestratörüdür. Planlama, karar verme ve koordinasyon yetkilerine sahiptir.

**Dosya Sistemi — YAZMA İZNİ:**

| Yol Pattern | İzin | Gerekçe |
|-------------|------|---------|
| `.tasks/*` | ✅ WRITE | Task JSON oluşturma, durum güncelleme, sprint yönetimi |
| `.deckent/config.json` | ✅ WRITE | Konfigürasyon güncelleme (config set komutu) |
| `.deckent/sprint-state.json` | ✅ WRITE | Sprint faz geçişi, aktif sprint kaydı |
| `.deckent/sprint-*-events.jsonl` | ✅ APPEND | Event stream yazma (yalnızca append, overwrite yasak) |
| `.deckent/sprint-*-checkpoint.json` | ✅ WRITE | Checkpoint yazma (resume capability) |
| `.deckent/sprint-*-metrics.jsonl` | ✅ APPEND | Metrik noktaları kaydetme |
| `.deckent/cache/*` | ✅ WRITE | Managed-docs cache, build cache |
| `.brain/MEMORY.md` | ✅ WRITE | Sprint öğrenimleri kaydetme (max 300 satır) |
| `.brain/RETRO.md` | ✅ WRITE | Retrospektif yazma (overwrite, max 120 satır) |
| `.brain/DEBT.md` | ✅ WRITE | Teknik borç tablosu yönetimi |
| `.brain/PATTERNS.md` | ✅ WRITE | Desen kayıtları güncelleme |
| `.brain/sprints/sprint-*.md` | ✅ WRITE | Sprint log dosyaları (max 80 satır) |
| `.brain/archive/*` | ✅ WRITE | Sprint arşivleme (DIRECTIVES, tasks) |

**Dosya Sistemi — YAZMA YASAĞI:**

| Yol Pattern | İzin | Gerekçe |
|-------------|------|---------|
| `src/**` | ❌ DENY | Brain kaynak kodu yazmaz — ADR-038 istisnası hariç (gelecek ADR) |
| `tests/**` | ❌ DENY | Brain test yazmaz — worker görevi |
| `.brain/DECISIONS.md` | ❌ DENY | ADR'ler yalnızca insan (Alperen) veya ADR governance süreci ile değişir |
| `docs/vision/roadmap.md` | ❌ DENY | Vizyon dokümanı yalnızca insan tarafından güncellenir |
| `.dashboard` | ❌ DENY | Auditor'ın münhasır yazma alanı |
| `.locks/*` | ❌ DENY | Lock yönetimi auditor + worker sorumluluğu |

**Sprint Yaşam Döngüsü Eylemleri:**

| Eylem | İzin | Koşul |
|-------|------|-------|
| Task oluşturma (PLAN fazı) | ✅ | DIRECTIVES.md okunmuş olmalı |
| Worker spawn | ✅ | SPAWN fazı aktif olmalı |
| Worker kill | ✅ | Timeout veya NO_GO sonrası |
| GO / NO_GO / GO_WITH_TECH_DEBT label | ✅ | EVALUATE fazı aktif olmalı |
| Cross-dependency fix spawn | ✅ | FIX fazı aktif, bağımlılık analizi tamamlanmış |
| Auditor doğrulamasını atlama | ❌ | Brain, auditor verification sonuçlarını beklemek ZORUNDADIR |
| Kendi kararını doğrulama | ❌ | Self-audit gate (Sprint 134 T-014) auditor tarafından kontrol edilir |

**Event Stream Kanal Hakları (ADR-035 V1.0):**

| Kanal | Hak | Rol |
|-------|-----|-----|
| `BRAIN→WORKER:TASK_ASSIGN` | ✅ EMIT | Kaynak |
| `BRAIN→WORKER:ANSWER` | ✅ EMIT | Kaynak |
| `BRAIN→WORKER:FIX_REQUEST` | ✅ EMIT | Kaynak |
| `BRAIN→*:METRIC_EMITTED` | ✅ EMIT | Kaynak |
| `BRAIN→*:SPRINT_PHASE_CHANGE` | ✅ EMIT | Kaynak |
| `WORKER→BRAIN:*` | ✅ CONSUME | Hedef |
| `AUDITOR→BRAIN:*` | ✅ CONSUME | Hedef |
| `WORKER→AUDITOR:*` | ❌ | Ne kaynak ne hedef |
| `DECKENT→USER:NOTIFY` | ❌ | Deckent CLI katmanı sorumlu |

### Auditor Authority Matrix

Auditor, bağımsız doğrulayıcıdır. Gözlemleme, doğrulama ve raporlama yetkilerine sahiptir. Kaynak kodu ASLA yazmaz.

**Dosya Sistemi — YAZMA İZNİ:**

| Yol Pattern | İzin | Gerekçe |
|-------------|------|---------|
| `.dashboard` | ✅ WRITE | Sprint durumu dashboard'u (30s scan cycle'da overwrite) |
| `.deckent/sprint-*-gate.json` | ✅ WRITE | Sprint gate hesaplama sonucu |
| `.deckent/sprint-*-events.jsonl` | ✅ APPEND | Event stream'e doğrulama sonuçları yazma |
| `docs/audits/*` | ✅ WRITE | Audit raporları, load-test raporları |
| `.brain/PATTERNS.md` | ✅ APPEND | Yeni pattern ekleme (mevcut içerik korunur, yalnızca append) |

**Dosya Sistemi — OKUMA İZNİ:**

| Yol Pattern | İzin | Gerekçe |
|-------------|------|---------|
| `.tasks/*.hb` | ✅ READ | Worker heartbeat kontrolü (stale detection) |
| `.tasks/*.result` | ✅ READ | Worker sonuç doğrulaması |
| `.tasks/*.json` | ✅ READ | Task tanımı okuma (scope doğrulama) |
| `.locks/*` | ✅ READ + WRITE | Stale lock tespiti ve temizleme (>5 min) |
| `src/**` | ✅ READ | Kod analizi, ADR compliance kontrolü (sadece okuma!) |
| `tests/**` | ✅ READ | Test sonuç doğrulaması |
| `.brain/DECISIONS.md` | ✅ READ | ADR compliance kontrolü |
| `git diff --stat` | ✅ EXEC | Boundary violation tespiti |

**Dosya Sistemi — YAZMA YASAĞI:**

| Yol Pattern | İzin | Gerekçe |
|-------------|------|---------|
| `src/**` | ❌ DENY | Auditor kaynak kodu ASLA yazmaz — audit bağımsızlığı |
| `tests/**` | ❌ DENY | Auditor test yazmaz — bağımsızlık ilkesi |
| `.tasks/*.json` | ❌ DENY | Task tanımı değiştirme yetkisi yok — Brain münhasır |
| `.brain/MEMORY.md` | ❌ DENY | Bellek yönetimi Brain sorumluluğu |
| `.brain/RETRO.md` | ❌ DENY | Retrospektif yazma Brain sorumluluğu |
| `.brain/DECISIONS.md` | ❌ DENY | ADR değişikliği governance süreci gerektirir |
| `.deckent/sprint-state.json` | ❌ DENY | Sprint faz geçişi Brain sorumluluğu |

**Sprint Yaşam Döngüsü Eylemleri:**

| Eylem | İzin | Koşul |
|-------|------|-------|
| Verification 3-pipeline (`verifyWorkerResult`) | ✅ | Worker `.result` dosyası mevcut |
| Functional verification (`verifyFunctional`) | ✅ | EXECUTE veya EVALUATE fazı |
| Tech debt validation (`validateTechDebt`) | ✅ | Worker GO_WITH_TECH_DEBT bildirdi |
| ADR compliance check (`checkADRCompliance`) | ✅ | Pilot ADR'ler (ADR-006, ADR-008, ADR-010) |
| Sprint gate hesaplama (`GATE_COMPUTED`) | ✅ | EVALUATE fazı tamamlandı |
| PASS / DOWNGRADE / FAIL verdict | ✅ | 3-pipeline sonucu |
| GO / NO_GO label kararı | ❌ | Brain münhasır — auditor yalnızca verdict önerir |
| Worker spawn / kill | ❌ | Brain münhasır |
| Task oluşturma / değiştirme | ❌ | Brain münhasır |

**Event Stream Kanal Hakları (ADR-035 V1.0):**

| Kanal | Hak | Rol |
|-------|-----|-----|
| `AUDITOR→BRAIN:VERIFICATION_RESULT` | ✅ EMIT | Kaynak |
| `AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED` | ✅ EMIT | Kaynak |
| `AUDITOR→BRAIN:ADR_VIOLATION` | ✅ EMIT | Kaynak |
| `AUDITOR→BRAIN:GATE_COMPUTED` | ✅ EMIT | Kaynak |
| `AUDITOR→BRAIN:LOAD_REPORT_WRITTEN` | ✅ EMIT | Kaynak |
| `WORKER→AUDITOR:CODE_VERIFY_REQUEST` | ✅ CONSUME | Hedef |
| `BRAIN→*:SPRINT_PHASE_CHANGE` | ✅ CONSUME | Broadcast dinleyici |
| `BRAIN→*:METRIC_EMITTED` | ✅ CONSUME | Broadcast dinleyici |
| `BRAIN→WORKER:*` | ❌ | Ne kaynak ne hedef |
| `WORKER→BRAIN:*` | ❌ | Ne kaynak ne hedef (Brain'e ait) |

### Worker Authority Matrix

Worker, görev uygulayıcısıdır. Atanan task scope'u içinde kaynak kodu yazar, test çalıştırır ve sonuç raporlar.

**Dosya Sistemi — YAZMA İZNİ:**

| Yol Pattern | İzin | Koşul |
|-------------|------|-------|
| `scope.filesWrite` (task JSON'dan) | ✅ WRITE | Yalnızca atanan task'ın scope.filesWrite listesindeki dosyalar |
| `scope.directories` (task JSON'dan) | ✅ WRITE | Yalnızca atanan task'ın scope.directories içindeki yeni dosyalar |
| `.tasks/task-{ownId}.hb` | ✅ WRITE | Kendi heartbeat dosyası |
| `.tasks/task-{ownId}.result` | ✅ WRITE | Kendi sonuç dosyası |
| `.tasks/task-{ownId}.plan` | ✅ WRITE | Kendi yürütme planı |
| `.tasks/task-{ownId}.verify-delta.json` | ✅ WRITE | Honest assessment kanıt dosyası |
| `.locks/{ownScope}` | ✅ WRITE | Kendi scope'undaki dosyalar için lock alma/bırakma |

**Dosya Sistemi — OKUMA İZNİ:**

| Yol Pattern | İzin | Koşul |
|-------------|------|-------|
| `.tasks/task-{ownId}.json` | ✅ READ | Kendi task tanımı |
| `scope.filesRead` (task JSON'dan) | ✅ READ | Task scope'undaki okuma listesi |
| `.brain/DECISIONS.md` | ✅ READ | ADR compliance kontrolü (zorunlu okuma — ADR-036) |
| `.locks/*` | ✅ READ | File lock kontrolü (yazma öncesi) |
| `DIRECTIVES.md` | ✅ READ | Sprint hedefleri bağlamı |

**Dosya Sistemi — YAZMA YASAĞI:**

| Yol Pattern | İzin | Gerekçe |
|-------------|------|---------|
| `.tasks/task-{otherId}.*` | ❌ DENY | Başka worker'ın dosyalarına erişim yasak — lateral movement engeli |
| `.brain/DECISIONS.md` | ❌ DENY | ADR değişikliği governance süreci gerektirir — privilege escalation engeli |
| `.brain/MEMORY.md` | ❌ DENY | Brain münhasır |
| `.brain/RETRO.md` | ❌ DENY | Brain münhasır |
| `.deckent/sprint-state.json` | ❌ DENY | Sprint durumu Brain münhasır |
| `.dashboard` | ❌ DENY | Auditor münhasır |
| `docs/audits/*` | ❌ DENY | Auditor münhasır |
| Scope dışı `src/**` | ❌ DENY | Scope violation — auditor `git diff --stat` ile tespit eder |

**Sprint Yaşam Döngüsü Eylemleri:**

| Eylem | İzin | Koşul |
|-------|------|-------|
| Task claim (PENDING → CLAIMED) | ✅ | Task kendisine atanmış olmalı |
| Kod yazma | ✅ | Scope dahilinde |
| Test çalıştırma (`tsc --noEmit`, `vitest run`) | ✅ | Verify loop (max 3 attempt) |
| Self-assessment yazma | ✅ | Honest assessment kuralları geçerli (ADR-035 V1.0 honest block) |
| Checkpoint question (`WORKER→BRAIN:QUESTION`) | ✅ | Blocker durumunda |
| Başka worker'ı spawn/kill | ❌ | Brain münhasır |
| Sprint faz değiştirme | ❌ | Brain münhasır |
| GO / NO_GO kararı | ❌ | Brain münhasır — worker yalnızca self-assessment yazar |
| Verification çalıştırma | ❌ | Auditor münhasır — worker kendi çalışmasını judge edemez |

**Event Stream Kanal Hakları (ADR-035 V1.0):**

| Kanal | Hak | Rol |
|-------|-----|-----|
| `WORKER→BRAIN:HEARTBEAT` | ✅ EMIT | Kaynak |
| `WORKER→BRAIN:RESULT` | ✅ EMIT | Kaynak |
| `WORKER→BRAIN:QUESTION` | ✅ EMIT | Kaynak |
| `WORKER→AUDITOR:CODE_VERIFY_REQUEST` | ✅ EMIT | Kaynak |
| `BRAIN→WORKER:TASK_ASSIGN` | ✅ CONSUME | Hedef |
| `BRAIN→WORKER:ANSWER` | ✅ CONSUME | Hedef |
| `BRAIN→WORKER:FIX_REQUEST` | ✅ CONSUME | Hedef |
| `BRAIN→*:SPRINT_PHASE_CHANGE` | ✅ CONSUME | Broadcast dinleyici |
| `AUDITOR→BRAIN:*` | ❌ | Ne kaynak ne hedef (Brain'e ait) |
| `BRAIN→*:METRIC_EMITTED` | ❌ | Worker metrik tüketmez |

### Cross-Role Interaction Rules (Çapraz Rol Kuralları)

**Kural 1: Separation of Assessment and Verification**
Worker self-assessment yazar (DONE / GO_WITH_TECH_DEBT / NO_GO). Auditor bağımsız olarak doğrular (PASS / DOWNGRADE / FAIL). Brain her iki sonucu değerlendirerek nihai GO / NO_GO kararı verir. Hiçbir bileşen hem uygulayıcı hem doğrulayıcı olamaz.

**Kural 2: No Direct Worker-to-Worker Communication**
Worker'lar birbirleriyle doğrudan iletişim kuramaz. Tüm koordinasyon Brain üzerinden yapılır. Worker A'nın Worker B'nin çıktısına ihtiyacı varsa, Brain dependency resolution yapar (FIX fazı, cross-dep priority).

**Kural 3: Auditor Independence**
Auditor hiçbir koşulda kaynak kodu (src/**, tests/**) yazmaz. Bu kural ADR-037'nin "dokunulamaz" maddesidir. Auditor bağımsızlığı kırılırsa self-audit mekanizması anlamsızlaşır.

**Kural 4: Brain Orchestration Boundary**
Brain planlama, koordinasyon ve karar verme yapar. Doğrudan kaynak kod üretimi yapmaz (src/** yazma yasağı). Brain'in kodu etkilemesi gereken durumlarda worker spawn eder. İstisna: gelecek ADR-038 meta-refactoring capability (şu an tanımlı değil, bu ADR'de referans olarak belirtilmiştir).

**Kural 5: Event Stream Integrity**
Her bileşen yalnızca kendi kanal haklarında belirtilen kanalları kullanabilir. Event stream append-only'dir — mevcut event'ler değiştirilemez veya silinemez. Event stream bozulması durumunda file-based fallback devreye girer (ADR-035 backward compatibility).

### Enforcement Mekanizması

**Katman 1 — Compile-Time (Static)**
- `npm run lint:adr` ADR-037 authority matrix'ini parse eder ve scope kurallarını doğrular
- Worker prompt injection (ADR-036) authority matrix'i worker'a bildirir
- `isWithinScope()` fonksiyonu (ADR-034) symlink-aware dosya erişim kontrolü yapar

**Katman 2 — Runtime (Dynamic)**
- Auditor 30s scan cycle: `git diff --stat` ile scope violation tespiti
- Event stream `source` alanı doğrulaması: yanlış source ile yazılan event → `SCOPE_VIOLATION` alert
- File lock çakışma tespiti: aynı dosyaya iki worker yazarsa → `SCOPE_COLLISION_DETECTED` event

**Katman 3 — Post-Hoc (Audit Trail)**
- Event stream replay: sprint sonunda tüm yetki kullanımları reconstruct edilebilir
- `.deckent/sprint-*-gate.json`: sprint gate hesaplamasında authority violation sayısı raporlanır
- `docs/audits/sprint-*/`: her sprint'in audit raporu authority matrix compliance içerir

### Versioning & Evolution

Bu RBAC matrix Protocol Version 1.0 ile birlikte tanımlanmıştır. Değişiklikler:

| Değişiklik Türü | Gereksinim |
|-----------------|------------|
| Yeni yetki ekleme (izin genişletme) | Bu ADR'ye amendment + `npm run lint:adr` geçmeli |
| Yetki kaldırma (izin daraltma) | Bu ADR'ye amendment + etkilenen bileşen testleri güncellenmeli |
| Yeni rol ekleme | Yeni ADR (ADR-037 bu ADR'yi supersede eder) |
| Kanal hakkı değişikliği | ADR-035 ve bu ADR birlikte güncellenmeli |

**Consequences (+):**

- Her bileşenin yetki sınırları tek tablo olarak okunabilir — onboarding kolaylığı
- Privilege escalation vektörleri (worker → `.brain/DECISIONS.md` yazma) formal olarak kapatılır
- Audit trail event stream üzerinden reconstruct edilebilir — post-mortem analiz mümkün
- Enterprise-ready RBAC pattern: NIST SP 800-162 prensiplerine uyumlu (least privilege, separation of duties, fail-closed)
- Yeni bileşen eklendiğinde (örn. Notifier, Scheduler) authority matrix genişletme pattern'ı belirli
- Sprint 137/138 canlı kanıtlarından türetilen kurallar — teorik değil, gerçek ihlallerden öğrenilmiş

**Consequences (-):**

- Authority matrix bakımı gerektirir — her yeni dosya pattern'ı veya kanal eklenmesinde güncellenmeli
- Runtime enforcement henüz tam değil (Sprint 139 scope) — şu an compile-time + audit trail ağırlıklı
- Matrix karmaşıklığı yeni katkıda bulunanlar için başlangıçta zorlayıcı olabilir
- File-system level enforcement (OS capability) implementasyonu yok — güven modeli hâlâ process-level

**Alternatives Considered:**

- **Implicit trust (örtük güven):** Sprint 138'e kadarki model. Reddedildi: Sprint 137 canlı kanıtı gösterdi ki worker self-assessment güvenilmez, formal boundary'ler gerekli.
- **OS-level capability model (Linux capabilities, seccomp):** Her bileşen ayrı process, OS-level file permission. Reddedildi: cross-platform uyumsuzluk (macOS seccomp yok), Docker backend'de container-in-container karmaşıklığı, ADR-033 "kur-çalıştır" ilkesiyle çelişir.
- **CI lint-only enforcement:** Authority matrix'i yalnızca CI pipeline'da kontrol et, runtime'da enforce etme. Reddedildi: runtime violation'lar CI'da yakalanamaz, post-hoc tespit yetersiz (Sprint 137 kanıtı).
- **Centralized policy engine (OPA/Rego):** Policy-as-code engine. Reddedildi: ADR-010 tek runtime dependency ilkesi ihlali, kur-çalıştır friction'ı artırır, Deckent'in mevcut ölçeği için overkill.
- **Per-sprint dynamic RBAC:** Her sprint'te farklı yetki matrisi. Reddedildi: öngörülemezlik yaratır, debug zorlaştırır, authority matrix'in sabit olması güvenlik garantisi verir.

**References:**

- NIST SP 800-162: Guide to Attribute Based Access Control (ABAC) Definition and Considerations — least privilege, separation of duties prensipleri
- ADR-008: Brain Merkezi Import — tek yönlü bağımlılık (import boundary = authority boundary temeli)
- ADR-034: Multi-Project Isolation — per-project security boundaries (symlink-aware scope enforcement)
- ADR-035: Brain ↔ Worker ↔ Auditor Verification Protocol Standard V1.0 — event stream kanal kodları
- ADR-036: ADR Governance Integration — mandatory read wiring, validator enforcement
- Sprint 137 Task 137-001 retrospektif — worker self-assessment güvenilmezlik kanıtı
- Sprint 138 Task 138-003 — Auditor Authority Extension 3-Pipeline implementasyonu
- Sprint 134 T-014 — Brain Self-Audit Gate
- `.claude/rules/brain.md`, `.claude/rules/auditor.md`, `.claude/rules/worker-default.md` — mevcut doğal dil yetki kuralları (bu ADR ile formalize edildi)
- `src/agents/worker.ts:isWithinScope()` — runtime scope check implementasyonu
- `src/monitor/auditor.ts:verifyWorkerResult()` — 3-pipeline verification implementasyonu

---
