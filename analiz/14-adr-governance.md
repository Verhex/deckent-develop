# ADR Yönetişimi — Mimari Karar Kayıtları

deckent, 89 mimari karar kaydını (ADR — Architecture Decision Record) Memory V2 veritabanında saklar ve her worker'ın çalışmadan önce bu kararları okumasını zorunlu kılar. Yönetişim sistemi ADR-036'da resmileştirilmiştir: hiçbir worker mimari sınırlamaları bilmeden kod üretemez; ihlal → NO_GO + ADR değişiklik önerisi.

---

## ADR Nedir?

Mimari Karar Kaydı, bir tasarım kararının "neden" alındığını gelecek için belgeler. deckent, MADR v3 hibrit formatını kullanır — her ADR'de zorunlu bir `**Status:**` alanı bulunur.

Geçerli durum değerleri: `accepted`, `deprecated`, `superseded`, `proposed`, `rejected`.

---

## Depolama: DB-First (ADR-088)

ADR'ler, `.brain/memory.db` veritabanında `type='adr'` olarak saklanır. Authoring yüzeyi `docs/adr/*.md` dosyalarıdır; runtime'da `syncAdrFilesToDb` (`src/core/adr-file-sync.ts`) ile DB'ye senkronize edilir.

```
docs/adr/adr-001-typescript-esm.md  ← düzenleme yüzeyi
    ↓  syncAdrFilesToDb (post-finalize hook)
.brain/memory.db (type='adr')        ← runtime kaynağı
    ↓  deckent memory export
.brain/exports/decisions.md          ← git-tracked dışa aktarım
```

**Kural:** ADR'leri `.md` dosyası okuyarak değil, `MemoryStore` üzerinden sorgula:

```typescript
store.getByType('adr').filter(a => a.status === 'accepted')
```

Doğrudan markdown ayrıştırma yasaktır (ADR-088).

---

## Kaç ADR Var?

Sprint 288 itibarıyla **89 ADR** — ADR-001'den ADR-089'a kadar. `npm run lint:adr` son doğrulamada 78 ADR'yi geçerli olarak onayladı (bir kısım proposed/deprecated durumundadır, dolayısıyla validator ADR'nin kendisi tarafından da doğrulanmış sayılır).

---

## Worker Prompt'a Zorunlu Enjeksiyon

Her sprint task'ı spawn edildiğinde, `src/orchestra/adr-selector.ts` modülü kabul edilmiş ADR'leri ilgililik puanına göre sıralar ve en uygun olanları worker prompt'una enjekte eder:

```
task-builder.ts
  → adr-selector.ts → store.getByType('adr') .filter(accepted)
  → worker prompt'una ADR bölümü olarak eklenir
```

Worker bu kısıtlamaları sprint sırasında görür. Eğer bir implementasyon kabul edilmiş bir ADR'yi ihlal ediyorsa, worker:
1. Çalışmayı durdurur
2. `.tasks/task-XXX.result` dosyasına `selfAssessment: "NO_GO"` yazar
3. ADR değişiklik önerisi hazırlar

---

## Doğrulama Pipeline'ı

### lint:adr (`scripts/adr-validator.mjs`)

`.brain/exports/decisions.md` üzerinde çalışır (ADR-088 DB-first mimarisine uygun):

- Format doğrulama: MADR v3 zorunlu `**Status:**` alanı
- Durum enum kontrolü: geçersiz değerler hata verir
- Duplicate ID tespiti

```bash
npm run lint:adr   # CI pipeline'da zorunlu
```

### Authoring Akışı

```bash
# 1. docs/adr/adr-090-yeni-karar.md oluştur
# 2. DB'ye senkronize et
deckent memory rebuild
# 3. Dışa aktar ve doğrula
deckent memory export && npm run lint:adr
```

---

## ADR Yaşam Döngüsü

```
proposed → accepted → deprecated (yeni ADR tarafından geride bırakılır)
                    → superseded (başka ADR tarafından yerini alır)
                    → rejected   (hiç uygulanmadı)
```

**Kritik kural:** Var olan ADR'ler değiştirilemez. Yeni bir karar almak için yeni bir ADR oluşturulur ve eskisi `superseded` olarak işaretlenir. Bu, kararların denetim izini korur.

`decay_exempt=1`: ADR'ler hafıza decay'den muaftır — silinmez, çürümez.

---

## Önemli ADR'ler

| ADR | Başlık | Etki |
|-----|--------|------|
| ADR-001 | TypeScript + ESM | Tüm kaynak dosyalar `.ts`, import'lar `.js` uzantılı |
| ADR-002 | Node16 Module Resolution | `import './foo.js'` zorunlu (uzantısız → hata) |
| ADR-003 | vitest over Jest | Test çerçevesi: sadece `vitest` |
| ADR-008 | Brain Merkezi Import | Tek yönlü bağımlılık — circular import yasak |
| ADR-036 | ADR Governance Integration | Bu dokümanın konusu |
| ADR-037 | Brain-Auditor-Worker RBAC | Otorite matrisi, izin sınırları |
| ADR-040 | Nervous System | Proaktif meta-orchestrator |
| ADR-045 | Wave-Based Execution | Kahn topolojik sıralama, wave yürütme |
| ADR-087 | Async I/O & Test Hermeticity | `spawnSync` yasak, tmpdir zorunlu |
| ADR-088 | Memory V2 DB-First | SQLite tek kaynak, .md export |

---

## ADR İhlali Senaryosu

1. Worker `src/core/config.ts`'e `spawnSync` çağrısı ekler
2. Auditor scan loop fark eder (ADR-087 ihlali: `spawnSync` yasak)
3. Brain EVALUATE fazında sonucu NO_GO olarak işaretler
4. FIX fazında worker ADR-087 uyumlu `spawn` + promise async alternatifi ile yeniden çalışır

---

## Konfigürasyon Entegrasyonu

ADR yönetişimi `.deckent/config.json` ile konfigüre edilmez — her zaman aktif ve zorunludur. `brain.md`, `worker-default.md`, `auditor.md` kurallarının hepsinde ADR zorunluluğu açıkça belirtilmiştir.
