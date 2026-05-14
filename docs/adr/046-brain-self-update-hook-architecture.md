# ADR-046: Brain Self-Update Hook Architecture

**Status:** accepted

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-13

**Sprint:** Sprint 166 (implementation contract — T1/T2/T3 fixes bu ADR'ın kontratına göre yazıldı)

---

## Status

accepted (Sprint 166 — 4 root cause forensic + Sprint 154-165 arasında kırık self-update döngüsünün kapanması)

---

## Context

Sprint 154-165 boyunca Brain'in post-finalize self-update döngüsü **yarım çalıştı**: Brain her sprint sonunda
dosyaları güncellediğini "sanıyordu" ama gerçekte dört kritik hook ya hiç tetiklenmiyordu ya da yanlış
çalışıyordu. Sprint 166 forensic analizi dört root cause tespit etti:

### Bug M — ADR Insert Hook Eksikliği

`sprint-finalizer.ts:1197` çevresindeki `runPostFinalizeHooks` çağrısında `adrInsert` step yoktu.
ADR-043, ADR-044, ADR-045 `docs/adr/` dizinine yazıldı; ancak `memory.db`'ye hiçbir zaman insert
edilmedi. Brain ADR tabanlı kararlar alırken en güncel governance veriye erişemiyordu.

**Kanıt:** `sqlite3 .brain/memory.db "SELECT COUNT(*) FROM entries WHERE type='adr'"` → Sprint 166
öncesi `adr-042`'de duruyordu; `docs/adr/` dizininde 3 yeni ADR (043/044/045) mevcuttu.

### Bug N — Manuel Finalize Path'inde onRuleRegen Eksikliği

`sprint-phases.ts:1238` ve `sprint-finalizer.ts:1197` Brain'in otomatik finalize path'ini doğru
şekilde yönetiyordu; ancak `cli/commands/finalize.ts:166` içindeki `finalizeSprint(...)` çağrısında
`onRuleRegen` parametresi yoktu. Sprint 152'den itibaren manuel finalize kullanılan tüm dönemlerde
`.claude/rules/*.md` dosyaları 13 sprint boyunca stale kaldı.

**Kanıt:** `grep -n "onRuleRegen" src/cli/commands/finalize.ts` → Sprint 166 T2 öncesi 0 match.

### Bug S — Cache Key Sprint-Agnostik Olduğundan Doc Sync Atlıyordu

`src/orchestra/managed-docs/doc-cache.ts` cache key'i `fileHash + entryHash` olarak hesaplıyordu;
sprint ID dahil değildi. Aynı dosya aynı sprint'te birden fazla kez finalize edildiğinde (veya farklı
sprint'lerde içerik değişmediyse) cache hit oluyordu ve CLAUDE.md güncellenmiyordu. Sprint 152'den
beri `cached_no_change` skip path aktifti.

**Kanıt:** Sprint 130-151 working chain commit zinciri vs Sprint 152+ `cached_no_change` log analizi.

### Bug Y2 — Doc Sync Ground-Truth Eksikliği

Sprint 164 commit `a4f3be4`'te koordinatör agent prompt'una "16 agent" yanlış inject edildi (gerçek: 15).
5 anchor `.md` dosyası yanlış güncellendi. Doc sync agent'larının prompt'a inject ettiği sayım gerçek
dosya sistemine karşılaştırılmıyordu.

**Ortak Pattern:** 4 bug da aynı mimari eksiklikten kaynaklanıyordu — post-finalize hook chain'i
**opsiyonel callback'ler** ve **partial wiring** ile tasarlanmıştı. Yeni step eklendiğinde veya mevcut
step'in wire'ı eksik kaldığında sessizce atlanıyordu. Hiçbir hook **koşulsuz invocation** garantisi
vermiyordu.

---

## Decision

Brain post-finalize hook chain için **Step Ordering Contract** zorunlu kılınır. Bu kontrat
`src/core/identity-generator.ts → runPostFinalizeHooks()` implementasyonuna kodlanır ve bu ADR ile
dokümante edilir.

### Step Ordering Contract (Section 5.1)

Post-finalize hook'lar aşağıdaki sırayla çalışır. Sıralama değiştirilemez — değişiklik bu ADR'ın
amendment'ını gerektirir (ADR-036 mandatory).

| Step | Adı             | Hedef                                      | Zorunluluk |
|------|-----------------|--------------------------------------------|------------|
| 1    | memoryExport    | `exports/*.md` regenerate                  | Koşulsuz   |
| 2    | identityRegen   | `PROJECT-IDENTITY.md` update               | Deprecated (Sprint 168'de kaldırılır) |
| 3    | adrInsert       | `docs/adr/*.md` → `memory.db` upsert       | Koşulsuz   |
| 4    | ruleRegen       | `.claude/rules/*.md` regenerate            | Koşullu (callback mevcut ise) |

**Step 3, Step 4'ten ÖNCE çalışmak ZORUNDADIR.** Sprint 166'da kabul edilen ADR-046 gibi yeni ADR'ler
Step 3'te `memory.db`'ye insert edilir; Step 4'te regenerate edilen `.claude/rules/*.md` dosyaları
bu insert'ten sonra çalışır. Sıralama ters olursa yeni ADR'ler kurallar güncellenmeden önce kayıt
altına alınamaz.

### Mimari Prensipler

**1. Koşulsuz Invocation (Unconditional Invocation Pattern)**

Her hook **her finalize döngüsünde** çalışır. Opsiyonel callback tasarımı yerine doğrudan çağrı kullanılır.
`skipXxx` flag'leri sadece test izolasyonu ve acil devre-dışı bırakma senaryoları için mevcuttur;
production deploy'da hiçbiri aktif olmamalıdır.

**Rationale:** Bug M ve Bug N'nin ortak kökü optional wiring'di. `opts.onRuleRegen` callback yoksa
Step 4 sessizce atlanıyordu. Koşulsuz pattern bu "sessiz atlanma" riskini ortadan kaldırır.

**2. Cache Key Kompletliği (Complete Cache Key)**

Managed-docs pipeline'ında her cache key şunları ZORUNLU olarak içerir:
- `fileHash` — hedef dosya içerik hash'i
- `entryHash` — generator entry config hash'i
- `sprintId` — mevcut sprint identifier

Eksik `sprintId` → cache hit → `cached_no_change` skip → doc sync sessizce atlanır.
Bu Bug S'in tam tanımıdır.

**3. Single Registration Target**

Her hook sadece bir yerde registration point'e sahip olur:
- **Brain otomatik path:** `sprint-finalizer.ts` → `runPostFinalizeHooks()`
- **Manuel path:** `cli/commands/finalize.ts` → `finalizeSprint({ onRuleRegen: ... })`

Her iki path da aynı `PostFinalizeHookOptions` interface'ini kullanır. Yeni hook eklendiğinde her iki
path'e aynı anda eklenmek ZORUNDADIR (Bug N dersi: sadece bir path'e eklemek 13 sprint stale'e yol açar).

**4. Ground-Truth Verification**

Doc sync agent'ları (type='doc') inject edilen sayısal iddiayı (`N agents`, `M tools`) çalıştırma
öncesi gerçek dosya sistemi ile doğrulamak ZORUNDADIR. Doğrulama whitelist:
`.deckent/ground-truth-overrides.json`.

### Step Ordering Contract Değişikliği Protokolü

Step sıralamasını değiştirmek için:
1. Bu ADR'ı supersede eden yeni ADR yazılır
2. `runPostFinalizeHooks()` JSDoc bloğu güncellenir
3. `tests/core/identity-generator-step-order.test.ts` regression test güncellenir
4. Sprint finalize log'unda step execution order doğrulanır

---

## Consequences

### Olumlu

- **ADR-043/044/045/046 memory.db'ye insert edildi.** Brain ADR-bazlı kararlar için artık güncel
  governance veriye erişebilir. Sprint 166 sonrası query: `searchMemory(store, {type:['adr']})` doğru
  döner.
- **`.claude/rules/*.md` artık manuel finalize'da da güncellenir.** Bug N kapandı — 13 sprint stale
  borcu bitti. Multi-provider sync (Bug Q) ile `.codex/rules/`, `.gemini/rules/`, `.cursor/rules/`
  da aynı anda güncellenir.
- **CLAUDE.md her sprint'te güncellenir.** Bug S kapandı — sprint-aware cache key ile her yeni sprint
  cache miss üretir ve doc sync çalışır.
- **Doc sync agent'ları inject öncesi ground-truth doğrular.** Bug Y2 kapandı — `ls | wc -l` vs
  whitelist kontrolü ile yanlış sayım propagasyonu engellenir.
- **Yeni hook eklenmesi için anchor.** Sprint 167-168 M1-M4 monitoring hook'ları (örn. token budget
  tracker, stale_md detector) bu contract'a uygun olarak Step 5+ olarak eklenir. Her yeni step bu
  ADR'ı referans alır.

### Olumsuz

- **Step 2 (identityRegen) deprecated yükü.** Sprint 168'e kadar kod'da kalır. `skipIdentityRegen`
  flag'i olmayan caller'lar eski behavior'ı almaya devam eder. Migration: managed-docs zincirine devret.
- **onRuleRegen opsiyonelliği korundu.** Step 4 hâlâ callback-conditional — ancak artık cli finalize
  path'inde callback zorunlu geçiriliyor (Bug N fix). Test coverage bu bağlantıyı korur.
- **Cache key migration backward-compat yükü.** Eski cache entry'leri `sprintId` içermiyor — ilk
  sprint'te her entry cache miss yapar (beklenen davranış, bütçe etkisi minimal).

### M1-M4 Monitoring Falsifiable Claims (Sprint 167-168)

Bu ADR'ın kontrakt doğruluğu 4 ölçüm kanalı ile izlenir:

| Kanal | Metrik | Beklenti (Sprint 167+) |
|-------|--------|------------------------|
| M1    | `memory.db SELECT COUNT(*) WHERE type='adr'` | Her yeni ADR dosyası → +1 entry |
| M2    | `ls .claude/rules/*.md` mtime | Her finalize → mtime güncellenir |
| M3    | `grep "sprint-NNN" CLAUDE.md` | Her sprint → yeni sprint ID'si CLAUDE.md'de |
| M4    | `stale_md detector emitAlert` | CLAUDE.md mtime > 70min ise alarm |

Sprint 167'de dependency_pipeline_enabled flip + M1-M4 baseline tracking ile bu claim'ler
ilk kez ölçülebilir hale gelir.

### Sprint 170 Refactor Trigger

Aşağıdaki koşullardan biri gerçekleşirse Sprint 170'te hook chain refactor tetiklenir:

1. Step sayısı 6'yı geçerse (yeni M1-M4 monitoring hook'ları + billing hook + event emit)
2. `runPostFinalizeHooks()` LoC > 150 olursa (şu an ~85 LoC)
3. Step 2 (identityRegen deprecated) Sprint 168'den geçerse ve hâlâ kodda ise

Refactor hedefi: hook chain'i `PostFinalizeStepRegistry` pattern'ına taşımak
(ADR-026 God Object Split Stratejisi prensipleri ile).

---

## Alternatives Considered

### (a) Optional Callback Pattern Korunur

Mevcut `onRuleRegen?: callback` tasarımı korunur, eksik wire'lar tek tek patch edilir.

**Neden reddedildi:** Bu yaklaşım Bug N'yi tekil olarak fix eder ama pattern'ı korur. Her yeni hook
için aynı wiring hatası tekrarlanabilir. Sprint 166 forensic'i 4 bağımsız wiring hatasını aynı anda
ortaya koydu — pattern değişikliği gerekli.

### (b) Event-Driven Hook Dispatch

`EventEmitter` pattern: `finalizeEmitter.emit('post-finalize', opts)`. Hook'lar listener olarak kayıt
olur. Execution order belirsiz.

**Neden reddedildi:** Step ordering contract ile çelişir. EventEmitter sıralaması listener registration
sırasına bağlıdır — `once()` vs `on()` race condition riski. Explicit step ordering okunabilirliği ve
test edilebilirliği daha yüksek; 4 step için EventEmitter overhead gereksiz karmaşıklık.

### (c) Database-Only Hook Registration

Tüm hook'lar `memory.db`'ye kayıt olur; finalize döngüsü DB'yi okuyarak hangi hook'ların çalışacağını
belirler.

**Neden reddedildi:** Finalize döngüsünün DB'ye bağımlılığını artırır. DB yoksa veya kilitliyse
hiçbir hook çalışmaz. Mevcut in-process step chain daha güvenilir; DB sadece persistence layer
olarak kalmalı (ADR-008 Brain merkezi import prensibi).

---

## References

1. **Sprint 154-165 forensic analizi** — 4 root cause (M, N, S, Y2) tespiti
2. **Sprint 166 T1** — `src/core/adr-file-sync.ts` + `identity-generator.ts` Step 3 wire (Bug M fix)
3. **Sprint 166 T2** — `cli/commands/finalize.ts:166` onRuleRegen wire (Bug N fix)
4. **Sprint 166 T3** — `doc-cache.ts` sprint-aware cache key (Bug S fix)
5. **Sprint 166 T4** — Ground-truth verification 3-layer defense (Bug Y2 fix)
6. **ADR-036** — ADR Governance Integration — mandatory read; bu ADR ADR-036 disiplinine uygun
7. **ADR-037** — Brain-Auditor-Worker Authority Matrix — hook chain RBAC sınırlarını ihlal etmez
8. **ADR-026** — God Object Split Stratejisi — Sprint 170 refactor trigger referansı
9. **ADR-031** — Content Hash Cache — Bug S root cause (sprint ID eksik cache key)

---

## Memory DB Insert Pattern

Bu ADR'ın `memory.db`'ye insert edilmesi `syncAdrFilesToDb()` aracılığıyla otomatik gerçekleşir
(Sprint 166 T1 — Bug M fix). Alperen'in `npx deckent memory rebuild` çalıştırmasının ardından:

```typescript
// adr-file-sync.ts syncAdrFilesToDb() output (expected):
{
  inserted: 1,   // adr-046 (yeni)
  updated: 3,    // adr-043, adr-044, adr-045 (eksik idiler)
  skipped: 42,   // mevcut ve değişmemiş ADR'lar
  errors: [],
  ids: ['adr-046', 'adr-043', 'adr-044', 'adr-045'],
}
```

Doğrulama: `sqlite3 .brain/memory.db "SELECT id FROM entries WHERE id='adr-046'"` → 1 row.

---

## Notes

Bu ADR, Sprint 154-165 boyunca birikmiş "Brain self-update yarım çalışıyor" borcunun resmi
kapanış belgesidir. T1-T3 fix'leri bu ADR'ın Step Ordering Contract'ına uygun yazıldı; test
coverage (`tests/core/identity-generator-step-order.test.ts`) kontratı kalıcı kılar.

Sprint 167-168 için M1-M4 monitoring baseline ve Sprint 170 refactor trigger bu ADR'a
kodlanmıştır — gelecek sprint'ler bu kararı referans alarak genişletebilir.
