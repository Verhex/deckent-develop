# Audit — `src/agents/agent-genealogy.ts`

> **Sprint:** sprint-186 (per-file pilot, 50-task batch)
> **Task:** 186-002
> **Auditor:** doc-writer (worker w-186-002, claude/opus)
> **Date:** 2026-05-21

---

## 1. Inventory

| Field | Value |
|---|---|
| Path | `src/agents/agent-genealogy.ts` |
| LoC (incl. blanks/comments) | 188 |
| Module type | ESM (TypeScript) |
| Exports | `interface GenealogyNode`, `interface FamilyTree`, `class AgentGenealogy` |
| Public methods (8) | `registerAgent`, `removeAgent`, `buildFamilyTree`, `findCommonAncestor`, `getDescendants`, `getChildren`, `getParent`, `hasAgent` |
| Private-by-convention methods (3, `_` prefix — **not** TS `private`) | `_getAncestorChain`, `_loadNodes`, `_saveNodes` |
| Imports (runtime) | `node:fs`, `node:path` |
| Imports (internal) | — none — |
| Reverse deps (src/) | **0 files** — `grep -r "agent-genealogy\|AgentGenealogy" src/` returns only the file itself |
| Reverse deps (tests/) | 2 files — `tests/agents/agent-genealogy.test.ts` (218 LoC dedicated spec), `tests/core/non-null-safety.test.ts` (defensive coverage) |
| Runtime artifact | `.deckent/agents/genealogy.json` — **not present** in workspace (feature has never produced data) |
| Storage location | `<projectRoot>/.deckent/agents/genealogy.json` (constructor takes `projectRoot`) |
| Constructor | `new AgentGenealogy(projectRoot: string)` — single string arg, no DI of `fs` |

**Data shape:**

```ts
GenealogyNode { agentId, parentId: string|null, createdAt: ISO8601, reason: string }
FamilyTree   { roots: string[], nodes: Record<id, GenealogyNode>, edges: { parent, child }[] }
```

---

## 2. Bağlam (Architectural Context)

`AgentGenealogy` modülü, agent havuzu (`src/core/agent-pool.ts`) ile birlikte çalışmak üzere tasarlanmış bir **lineage tracker** prototipidir. Niyet, geçici (`temp`) agent'ların hangi parent agent'tan türediğini, ne zaman ve hangi gerekçeyle yaratıldığını kayıt altına almaktır — promosyon/demosyon kararları (`src/orchestra/promotion-pipeline.ts`) ve specialization-drift tespiti (`src/agents/specialization-drift.ts`) için forensic geçmiş.

| Mimari katman | Bağlantı durumu |
|---|---|
| `agent-pool.ts` (15 built-in + temp havuzu) | **Hayır** — `AgentGenealogy` import edilmiyor |
| `promotion-pipeline.ts` (temp→permanent) | **Hayır** — pipeline lineage’ı sorgulamıyor |
| `specialization-drift.ts` | **Hayır** — drift sinyali genealogy’den faydalanabilirdi, etmiyor |
| `evolution-types.ts` / `temp-skill-generator.ts` | **Hayır** — bağımsız yaşıyor |
| Persistence | `.deckent/agents/genealogy.json` — runtime'da dolmuyor |

**ADR ilişkisi:**

- **ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık):** Modül hiçbir orchestra/agent modülünden import etmediği için ADR-008 ihlali yok; ancak agent pool tarafından _consume edilmediği_ için işlevsel olarak izole.
- **ADR-038 (Dead Code Disposition — Sprint 139 Audit Results):** Bu dosya tam olarak bu ADR'ın hedeflediği "yazılmış ama runtime'da çağrılmayan modül" kategorisindedir.
- **ADR-041 (Agent Taxonomy — Horizontal Skills vs Vertical Agents):** Genealogy yapısı vertical-agent evrim hipotezini destekleyecek altyapı; vizyon ile uyumlu ama wire edilmedi.

---

## 3. Debt Risk

| Risk | Severity | Açıklama | Kanıt |
|---|---|---|---|
| **Dead feature** | **HIGH** | Hiçbir `src/` consumer yok; `.deckent/agents/genealogy.json` workspace’te boş — modül runtime'da çağrılmıyor | `grep -r AgentGenealogy src/` → 0 match dışında dosyanın kendisi |
| **Sync I/O on every call** | MEDIUM | Her public metod `_loadNodes()` çağırır → her invocation’da `fs.readFileSync` + `JSON.parse` | `agent-genealogy.ts:36, 52, 63, 83, 101, 123, 134, 142` — 8 metod, 8 sync read |
| **No write-atomicity** | MEDIUM | `_saveNodes` doğrudan `writeFileSync` — kesinti durumunda `genealogy.json` kısmen yazılabilir, çöp JSON kalır | `agent-genealogy.ts:178-186` (Docker-HB tarzı `atomicWriteFileSync` kullanılmıyor — bkz. Sprint 139 Task 13 mimari prensibi) |
| **Silent failure on corrupt JSON** | LOW–MEDIUM | `_loadNodes` catch-all `return {}` — bozuk dosya sessizce sıfırlanır, kullanıcı uyarısı yok | `agent-genealogy.ts:173-175` |
| **`_` prefix yanıltıcı** | LOW | `_loadNodes`, `_saveNodes`, `_getAncestorChain` underscore ile başlasa da **TypeScript `private` değil** — dışarıdan çağrılabilir, test kodu da `as any` olmadan erişebilir | `agent-genealogy.ts:149, 165, 178` |
| **N+1 ancestor walk** | LOW | `findCommonAncestor` → her ajan için ayrı `_getAncestorChain` → ayrı `_loadNodes` çağrısı; küçük N’de görünmez, büyürse O(n × file-read) | `agent-genealogy.ts:84-87` |
| **Path traversal exposure** | LOW | `projectRoot` validate edilmiyor; çağıran modül zaten trusted ama ADR-034 (Multi-Project Isolation) açısından savunma katmanı eksik | `agent-genealogy.ts:31, 166` |
| **No size cap / decay** | LOW | `genealogy.json` sınırsız büyür; binlerce temp agent senaryosu için bellek baskısı | yok — herhangi bir prune mekanizması tanımlı değil |

---

## 4. Dead Code Candidates

| Bulgu | Kanıt | Karar |
|---|---|---|
| **Tüm `AgentGenealogy` sınıfı `src/` içinde tüketilmiyor** | `grep -r "AgentGenealogy" src/` → sadece kendi dosyası (1 dosya) | **DEAD-OR-DORMANT** — Sprint 188’de karar (integrate veya remove) |
| **`removeAgent` metodu** | İçeride/test dışında çağıran yok (`grep -r "\.removeAgent("` src/ → 0) | Removal kandidatı — ancak silinmesi ileride kullanıma engeldir |
| **`buildFamilyTree` metodu** | Aynı: çağıran yok | Dormant — dashboard/visualization için tutulabilir |
| **`findCommonAncestor` metodu** | Aynı: çağıran yok | Dormant |
| **`getDescendants` / `getChildren` / `getParent` / `hasAgent`** | Aynı: yalnızca test çağırıyor | Dormant — API yüzeyi tamam ama kullanılmıyor |
| **`GenealogyNode` ve `FamilyTree` interface'leri** | `grep -r "GenealogyNode\|FamilyTree" src/` → sadece kendi dosyası | Re-export edilmiyor; harici tüketim yok |

> **Sınıflandırma:** Dosya tamamen "in-development" ama hiçbir entegrasyon hattına bağlanmamış. ADR-038 (Dead Code Disposition) açısından **`DELETE` veya `WIRE`** zorunlu karar gerektirir. Test maintenance maliyeti tek başına 218 satır.

---

## 5. Documentation Gaps

| Gap | Konum | Önerilen |
|---|---|---|
| Class-level JSDoc / `@remarks` yok | `agent-genealogy.ts:30` | Sınıfın amacını, persistence kontratını, thread/concurrency varsayımını anlatan blok ekle |
| Hiçbir public metotta `@example` yok | tüm public metotlar | En azından `registerAgent` ve `findCommonAncestor` için kullanım örneği |
| `@throws` annotation yok | `_loadNodes` sessiz fail, `_saveNodes` `mkdirSync`/`writeFileSync` exception fırlatır | `_saveNodes` için EACCES/ENOSPC notu |
| `genealogy.json` format'ı dokümante değil | yok | Top-level docstring veya README parçasında JSON şema |
| ADR-038 / ADR-041 referansı yok | yok | Modülün vizyon-içi rolünü ADR'lara bağla |
| Storage path neden `.deckent/agents/genealogy.json` (agent dizinleri ile aynı parent) — convention belirsiz | `agent-genealogy.ts:25-26` | İsim çakışma riski yok mu? (`agents/` altında agent klasörleri + tek JSON) açıkla |

---

## 6. ADR Compliance Check

| ADR | Beklenti | Durum | Not |
|---|---|---|---|
| ADR-001 (TypeScript + ESM) | TS, ESM | ✓ | `import * as fs from 'node:fs'` ESM-uyumlu |
| ADR-002 (Node16 Module Resolution) | `.js` uzantısı internal import'larda zorunlu | ✓ N/A | İç import yok; node built-in için uzantı kuralı geçerli değil |
| ADR-005 (Synchronous I/O) | **deprecated** — yeni kodda async tercih | ⚠ | Tüm I/O sync (`readFileSync`, `writeFileSync`, `mkdirSync`); modül bilinçli sync — ancak ADR-005 deprecated olduğu için **violation değil, dikkat** notu |
| ADR-006 (spawnSync Security Pattern) | shell injection koruması | N/A | spawn kullanılmıyor |
| ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık) | Brain ↔ alt-modüller tek yön | ✓ | Bu modül kimseyi import etmiyor, kimse de etmiyor — tek yön bozulmuyor (ama "yalnız" |
| ADR-010 (Tek Runtime Dependency — commander.js) | minimal dep | ✓ | Yalnızca node built-in kullanıyor |
| ADR-034 (Multi-Project Isolation) | per-project sınır | ✓ (zayıf) | `projectRoot` argümanından okuyor; ancak path validation yok |
| ADR-037 (Brain-Auditor-Worker Authority Matrix) | RBAC compile-time | N/A | Bu modül authority-sensitive değil |
| ADR-038 (Dead Code Disposition) | Dead → delete or wire | **❗ATTENTION** | Modül tam olarak ADR-038 hedefinde; karar bekliyor |
| ADR-041 (Agent Taxonomy) | Horizontal skills vs vertical agents | ✓ (vizyon) | Modül vertical-agent lineage'ı destekler ama wire edilmedi |
| ADR-043 (Brain Crash Recovery Protocol) | atomic durum yazımı | ⚠ | `_saveNodes` non-atomic — crash sırasında genealogy.json bozulabilir |
| ADR-046 (Brain Self-Update Hook Architecture) | identity/state korunumu | N/A | İlgisiz |

---

## 7. Refactor Recommendations

**A. Karar (öncelik 1) — integrate vs. delete:**

İki seçenek:

1. **WIRE:** `agent-pool.ts` içine `genealogy.registerAgent(...)` çağrısı ekle (yeni temp agent yaratımında); `promotion-pipeline.ts` promosyon sırasında lineage'ı sorgulasın; `specialization-drift.ts` drift sinyaline parent geçmişini ekleyebilsin.
2. **DELETE:** Modül + test dosyası kaldırılsın; ADR-038'e `agent-genealogy.ts removed (never wired since creation)` notu eklensin.

Sprint 188 directives'ine **A.1 veya A.2 zorunlu karar maddesi** olarak girmeli.

**B. Wire kararı verilirse — küçük yapısal iyileştirmeler:**

1. **`_` prefix yerine `private`** — TS visibility erişimi sınırlasın (`private loadNodes()`, `private saveNodes()`, `private getAncestorChain()`).
2. **Atomic write** — `_saveNodes` `writeFileSync` yerine `writeFileSync(tmp) + renameSync(tmp, final)` paterni (Sprint 139 Task 13 Docker-HB referansı — `atomicWriteFileSync`).
3. **In-memory cache + invalidation** — her public metot çağrısında dosya okumak yerine sınıf seviyesinde `nodes` cache + mutation sonrası invalidate. Test edilebilirlik için `refresh()` API'ı eklenebilir.
4. **Async API alternatifi** — `loadNodesAsync` / `saveNodesAsync` ekle, sync metotları korumak istersen `*Sync` suffix'i ile yeniden adlandır (ADR-005 deprecated).
5. **Corrupt JSON observability** — `_loadNodes` catch bloğunda en azından `console.warn` veya `event-stream` üzerinden `genealogy.corrupt` event'i emit et (Sprint 138 Task 4 structured event-stream pattern).
6. **Size cap + decay** — sprint sayısına göre eski node'ları arşivle veya `archived: true` flag'i ekle; `.brain/memory.db` benzeri decay (memory store decay_after_sprints pattern).
7. **Path validation** — `projectRoot` absolute path olmalı; relative geldiğinde `path.resolve` ile normalize et veya throw.
8. **`buildFamilyTree.roots` orphan tespiti** — `parentId !== null && !(parentId in nodes)` durumunda root listesine alıyor; bu "orphaned" status'ünü açıkça gösteren bir alan eklenebilir (`{ roots, orphans, nodes, edges }`).
9. **JSDoc + `@example`** — bkz. §5; class-level remarks + en az 2 metotta runnable örnek.

**C. Test surface:**

- 218 satırlık dedicated test mevcut — wire kararı verilirse koruyalım, sadece atomic write için yeni 1-2 test eklenmeli.
- `removeAgent` orphan-edilmiş çocukların durumunu test etmiyor — child'ın `parentId`'si var ama parent silinmiş. `buildFamilyTree` bu durumu "yetim root" olarak yorumluyor (line 69) ama spec'te explicit değil; test eklenebilir.

---

## 8. Sprint 188 Follow-up Items

| # | Madde | Etki | Effort |
|---|---|---|---|
| 1 | **Karar:** `agent-genealogy` WIRE mı DELETE mi? | mimari netlik | low (1 ADR amendment) |
| 2 | (Wire kararı verilirse) `agent-pool.ts:createTempAgent` → `genealogy.registerAgent` çağrısı ekle | lineage doğru bilgi taşır | low |
| 3 | (Wire) `promotion-pipeline.ts:promote` → `genealogy` mutate (parent override veya new lineage entry) | promosyon trace | low |
| 4 | (Wire) `specialization-drift.ts` → drift skorunu parent-child benzerliği ile zenginleştir | sinyal kalitesi | normal |
| 5 | `_saveNodes` atomic-write (`tmp + rename`) | crash safety (ADR-043 hizalama) | low |
| 6 | `_`-prefix metotları → `private` keyword | encapsulation | low |
| 7 | Class-level JSDoc + `@example` blokları | DX / onboarding | low |
| 8 | (Delete kararı verilirse) dosya + test + dummy `.deckent/agents/genealogy.json` referansları kaldır + ADR-038 listesine ekle | dead-code temizliği | low |
| 9 | Corrupt JSON observability (event-stream `genealogy.corrupt`) | silent-failure’ı kıran sinyal | low |
| 10 | Decay / size-cap politikası (yalnızca wire kararında) | uzun vadeli stabilite | normal |

---

## 9. Summary

`src/agents/agent-genealogy.ts` **188 satırlık, kendi başına çalışan, hiçbir `src/` modülü tarafından tüketilmeyen bir lineage-tracker prototipidir.** Sınıf API tasarımı temiz (8 public metot, 2 interface), test kapsamı yeterli (218 LoC spec), ancak runtime entegrasyonu **yok**: ne `agent-pool.ts`, ne `promotion-pipeline.ts`, ne `specialization-drift.ts` bu sınıfı çağırıyor; `.deckent/agents/genealogy.json` artefaktı workspace'te oluşmamış.

**ADR ihlali yok**, fakat **ADR-038 (Dead Code Disposition) kapsamında "wire-or-delete" kararı gerekiyor**. Sync I/O ADR-005’in deprecated kapsamında — yeni kod yazılırken async tercih edilmeli ama mevcut sync pattern silinmeden önce wire kararı beklemeli.

Küçük teknik borç noktaları: (1) non-atomic dosya yazımı (ADR-043 crash-recovery hizasıyla riskli), (2) `_`-prefix metotları gerçek `private` değil, (3) class-level JSDoc + `@example` eksik, (4) corrupt JSON sessiz fail.

**Sprint 188 zorunlu karar maddesi:** wire (önerilen, vizyon-içi) veya delete (kısa vade dead-code temizliği). Wire kararında §7.B'deki 9 maddelik küçük refactor seti uygulanabilir.

---

*Audit version: 1.0 — generated by w-186-002 / claude-opus / Sprint 186 per-file-pilot-50.*
