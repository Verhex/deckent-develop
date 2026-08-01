# Audit: `src/agents/agent-retirement.ts`

Sprint 186-003 per-file pilot audit. Dosya satır-satır incelendi (207 LoC), 9 zorunlu bölüm üretildi.

---

## 1. Inventory

| Alan | Değer |
|---|---|
| Yol | `src/agents/agent-retirement.ts` |
| LoC (kaynak) | 207 |
| Modül tipi | ESM TypeScript class module |
| Public exports | `AgentRetirement` (class), `RetirementStats`, `RetirementConfig`, `RetirementResult`, `RetiredAgentRecord` (interfaces) |
| Public methods | `evaluateForRetirement()`, `retire()`, `reinstate()`, `listRetired()` |
| Dahili sabitler | `AGENTS_DIR`, `RETIRED_DIR`, `AGENT_FILENAME`, `RETIRED_FILENAME`, `DEFAULT_CONFIG` |
| Imports | `node:fs`, `node:path` (sadece Node.js built-in — sıfır 3rd-party bağımlılık) |
| Reverse deps (production) | **0** dosya (`grep "from .*agent-retirement" src/**/*.ts` → boş) |
| Reverse deps (tests) | 1 dosya: `tests/agents/agent-retirement.test.ts` |
| Bağımlılığı olan üretim kodu | Yok — orphan modül |
| Constructor | `new AgentRetirement(projectRoot: string)` |
| Effective public API | 4 metod × class |

---

## 2. Bağlam — Architectural Context

`agent-retirement.ts` modülü, `agent-genealogy.ts` ve `specialization-drift.ts` ile birlikte **Agent Evolution Pipeline**'ın retirement koluna ait. Görevi: düşük performans gösteren learned/user-defined agent'ları aktif havuzdan `.deckent/agents/.retired/` arşivine taşımak ve gerektiğinde geri yüklemek.

| ADR | İlgi |
|---|---|
| ADR-041 (Agent Taxonomy) | Built-in agent'ları "horizontal skills" katmanında konumlar — `evaluateForRetirement()` `source: 'builtin'` için her zaman `shouldRetire: false` döner. Doğrudan uyumlu. |
| ADR-038 (Dead Code Disposition) | Modül kendisi production'da hiç çağrılmıyor — Sprint 139 dead-code audit'ine konu olmuş olabilir, fakat test kapsamı ve "evolution pipeline" niyeti nedeniyle silinmemiş. |
| ADR-008 (Brain Merkezi Import) | Modül kimseyi import etmiyor (sadece `node:fs`, `node:path`) — tek yönlü bağımlılık ilkesini ihlal etmiyor. |
| ADR-006 (spawnSync Security Pattern) | Modül subprocess çağırmıyor — N/A. |

Pipeline rol haritası (mevcut/beklenen):
- `agent-pool.ts` (`AgentPoolManager`) → LRU eviction yapar (sprint-based age), retirement YAPMAZ.
- `promotion-pipeline.ts` (orchestra) → promotion + demotion yapar; retirement çağırması beklenirdi, ancak grep ile referans bulunmadı.
- `outcome-tracker.ts` → `successRate`, `totalUses` üretir → `RetirementStats` doldurma için doğal kaynak; bağlantı yok.

Sonuç: tasarım niyeti net, **runtime bağlantısı eksik**.

---

## 3. Debt Risk

| ID | Risk | Şiddet | Kanıt |
|---|---|---|---|
| D-1 | Üretim çağrı sıfır — orphan modül | HIGH | `grep "from .*agent-retirement" src/**/*.ts` → 0 sonuç. Sadece kendisi + test dosyası. |
| D-2 | `evaluateForRetirement` `_agentId` parametresi kullanılmıyor (alt çizgi ile suppress edilmiş) | LOW | L59: `_agentId: string` — gelecekte logging/ADR-039 self-modify discrimination için açık bırakılmış olabilir. |
| D-3 | `retire()` race condition — `rmSync` ve `writeFileSync` atomik değil | MEDIUM | L132-144: kaynak agent dosyası yazılır, sonra `rmSync` ile silinir. Crash anında hem `.retired/` hem `agents/` dizininde aynı agent kalabilir. |
| D-4 | `stats.sprintsParticipated` her zaman `0` hardcoded | MEDIUM | L124: `sprintsParticipated: 0` — `agentData.stats`'tan okunmuyor, audit-trail kaybı. |
| D-5 | `reinstate()` retirement metadata'sını silmeden geri yüklemez | LOW | L174: `rmSync(retiredAgentDir, ...)` retirement geçmişini kalıcı olarak kaybeder — neden retire edildiği unutulur. |
| D-6 | Boundary check eksik — `projectRoot` symlink / `..` traversal'a karşı korumasız | MEDIUM | `path.join(this.projectRoot, AGENTS_DIR, agentId)` → eğer `agentId = "../../etc"` ise sandbox dışına çıkılabilir. |
| D-7 | `JSON.parse` try/catch sessizce `false` döner — observability sıfır | LOW | L102, L160: hata kategorisi (corrupt JSON vs. ENOENT) ayırt edilmiyor, telemetry kayıp. |
| D-8 | Senkron I/O (`readFileSync`, `writeFileSync`, `mkdirSync`, `rmSync`) — `ADR-005 (deprecated)` yöneliminden geriye dönüş | LOW | ADR-005 "Synchronous I/O" deprecated; modül buna rağmen tam-sync. Pratik blast radius düşük (retire seyrek). |

Toplam: 8 debt item, 1 HIGH / 3 MEDIUM / 4 LOW.

---

## 4. Dead Code Candidates

Grep tabanlı kanıt:

```
$ grep -rn "AgentRetirement\|evaluateForRetirement\|retire(\|reinstate(\|listRetired" src/ \
    --include="*.ts" | grep -v "agent-retirement.ts"
(boş — production tarafında hiçbir çağrı yok)
```

Aday-aday tablosu:

| Sembol | Çağıran (prod) | Çağıran (test) | Karar |
|---|---|---|---|
| `AgentRetirement` (class) | 0 | 1 (`tests/agents/agent-retirement.test.ts`) | Tüm sınıf orphan; ADR-038 işaretlenmeli |
| `evaluateForRetirement()` | 0 | 1 | Orphan |
| `retire()` | 0 | 1 | Orphan |
| `reinstate()` | 0 | 1 | Orphan |
| `listRetired()` | 0 | 1 | Orphan |
| Interface `RetirementStats` | 1 (kendi class içi) | 1 | Re-export riski yok |
| Interface `RetiredAgentRecord` | 1 (kendi class içi) | 0 | Yalnızca dosya içi |

**Sonuç:** Modülün tamamı **canlı kod yolu açısından dead code**. Test kapsamı modülü "yaşıyor" gösterir ama production runtime'a değmiyor. Sprint 188'de iki seçenek değerlendirilmeli:
- (a) `promotion-pipeline.ts` veya `sprint-reporter.ts` retro fazına wire et,
- (b) modülü ve testini sil (ADR-038 doctrine).

---

## 5. Documentation Gaps

| Eksik | Bulgu |
|---|---|
| JSDoc — sınıf düzeyi | `AgentRetirement` class'ında üst-seviye JSDoc yok; sadece dosya başında 2 satır yorum (L1-L3) |
| JSDoc — `evaluateForRetirement()` | Mevcut (L53-L57) ama "Built-in agents can be disabled but not retired" cümlesi "disable" mekanizmasına link içermiyor |
| JSDoc — `retire()` | Tek satır (L91-L92) — atomik olmadığı, crash window'u olduğu belirtilmemiş |
| JSDoc — `reinstate()` | Tek satır (L149) — retirement metadata kaybedileceği açıklanmamış (D-5 ile bağlantılı) |
| JSDoc — `listRetired()` | Tek satır (L178) — sıralama/limit garantisi yok, doc'ta belirtilmemiş |
| README/ARCH dokümanı | `docs/reference/api-surface.md` retirement sürecinden bahsetmiyor |
| Workflow dokümanı | `DECKENT.md` "Sprint Lifecycle" tablosu DECAY fazını içeriyor ama retirement DECAY ile ilişkisi yok |
| Konfigürasyon dokümanı | `RetirementConfig` (minSuccessRate 0.3, minSprints 5, minUses 10) hiçbir kullanıcı dokümanında yok |
| ADR referansı | Modül başlangıcında ADR-041 / ADR-038 referansı yok |

---

## 6. ADR Compliance Check

| ADR | Durum | Kanıt |
|---|---|---|
| ADR-001 (TypeScript + ESM) | ✅ Uyumlu | `import * as fs from 'node:fs';` ESM syntax |
| ADR-002 (Node16 Module Resolution) | ✅ Uyumlu | `node:fs`, `node:path` Node16-style; test tarafı `.js` uzantısı kullanıyor |
| ADR-005 (Synchronous I/O — **deprecated**) | ⚠️ Çelişki | Modül tamamen `readFileSync`/`writeFileSync`/`rmSync`/`mkdirSync` kullanıyor — deprecated ADR'a uyuyor ama yeni async yöneliminden geri |
| ADR-006 (spawnSync Security Pattern) | N/A | Subprocess yok |
| ADR-008 (Brain Merkezi Import) | ✅ Uyumlu | Sadece stdlib import — circular yok |
| ADR-038 (Dead Code Disposition) | ⚠️ İhlal aday | Modül 0 prod-caller — Sprint 139 audit doktrinine göre işaretlenmeli |
| ADR-039 (Self-Modifying Task Detection) | ⚠️ Risk | Modül `.deckent/agents/` altına yazar — deckent-dev projesinde `self-modifying-detector` tarafından flag edilmeli; modül discrimination bilgisini taşımıyor |
| ADR-041 (Agent Taxonomy — Vertical vs Horizontal) | ✅ Uyumlu | `source === 'builtin'` için retirement bloke ediliyor (L67) |
| ADR-046 (Brain Self-Update Hook) | N/A | Retirement self-update hook'una bağlı değil |
| ADR-009 (DEBT.md Markdown Tablo) | N/A | Modül DEBT.md yazmıyor; bu audit raporu DEBT formatına uygun |

Net: 5 uyumlu, 3 uyarı/risk, 2 N/A.

---

## 7. Refactor Recommendations

R-1. **Atomik retirement** — `retire()` içinde önce hedef dizinleri yaz, sonra `renameSync(agentDir, ...)` kullan; crash window'u ortadan kalkar. (D-3 fix)

R-2. **`sprintsParticipated` doğru oku** — `agentData.stats.sprintsParticipated as number ?? 0` haline getir; audit-trail korunsun. (D-4 fix)

R-3. **`reinstate()` metadata korusun** — `retired.json`'ı silmek yerine `restored-from-retirement.json` olarak active dizinine kopyala; tarihsel kayıt kaybolmaz. (D-5 fix)

R-4. **Path traversal koruması** — `agentId` regex validation (`/^[a-z0-9-]+$/i`) eklenmeli; `path.resolve(...).startsWith(projectRoot)` sınır kontrolü `retire()`, `reinstate()`, `listRetired()` başında. (D-6 fix)

R-5. **Async API**'a geçiş — `fs.promises` kullanımı; ADR-005 deprecated yönüyle uyumlu. (D-8 fix)

R-6. **`_agentId` ya kullan ya da kaldır** — telemetry için `console.warn('agent X retire bloke: builtin')` veya parametre kaldır. (D-2 cleanup)

R-7. **Pipeline wiring** — `promotion-pipeline.ts` içinde `sprint-reporter.ts` retro fazından sonra `AgentRetirement.evaluateForRetirement()` çağır; orphan-kod statüsünü kapat. (D-1 fix — opsiyon A)

R-8. **Veya: sil** — Eğer Sprint 188'de retirement pipeline yol haritasında değilse, modül + test silinsin (ADR-038 doctrine). (D-1 fix — opsiyon B)

---

## 8. Sprint 188 Follow-up Items

1. **Karar gerekli — pipeline wire vs. sil**: Brain `promotion-pipeline.ts` ile entegrasyon kararını sprint planında netleştirmeli. ADR-038 vs. ADR-041 ekosistem niyeti çelişiyor.
2. **R-1 hot-fix** — `retire()` atomicity bug'ı production'a girerse veri kaybı; modül wire edildiğinde D-3 öncelikli.
3. **R-4 security hardening** — `agentId` validation; path traversal CVE riskini kaldır.
4. **Documentation patch** — `docs/reference/api-surface.md` "Agent Evolution Pipeline" başlığı ekleyip `promotion-pipeline.ts`, `specialization-drift.ts`, `agent-genealogy.ts` ile birlikte `agent-retirement.ts`'yi belgele.
5. **Test sentinel** — `tests/agents/agent-retirement.test.ts` mevcut; ancak pipeline wired olunca E2E test (sprint-reporter → retirement → archive) eklenmeli.
6. **ADR-005 housekeeping** — Tüm `*Sync` çağrıları için ADR güncellemesi/yeni ADR önerisi (sync vs. async strateji netleştirme) Sprint 188 brain meeting'de.
7. **`sprintsParticipated` schema** — Agent JSON şemasında bu alan eksik; `agent.json` formatı + `outcome-tracker` çıktısı bu alanı sağlamıyor; coordinated fix gerekir.
8. **ADR-039 etiketleme** — `self-modifying-detector` modülünün `.deckent/agents/.retired/` yazımını whitelist/flag etmesi için kural.

---

## 9. Summary

`src/agents/agent-retirement.ts` mimari niyet (Agent Evolution Pipeline retirement kolu) açısından temiz tasarlanmış, 207 satır, sıfır 3rd-party bağımlılık, açık-tipli 4 public metod. Ancak **production runtime'a hiç bağlı değil** (orphan modül — 0 prod-caller, sadece kendi test dosyası tarafından tüketiliyor). Bu durum modülü ADR-038 (Dead Code Disposition) doktrini açısından kritik karara konu yapıyor.

Önceliklendirme:
- **P0** (Sprint 188): D-1 (orphan → wire-or-delete kararı), D-3 (retire atomicity), D-6 (path traversal).
- **P1**: D-4 (sprintsParticipated), D-5 (reinstate metadata kaybı), R-4 input validation.
- **P2**: ADR-005 async geçiş, doc gap'leri, telemetry/observability iyileştirmesi.

Risk profili: HIGH (1) / MEDIUM (3) / LOW (4). Refactor effort tahmini: 0.5 sprint (wire kararı + atomicity fix + security hardening). Silme alternatifi: 1 saat.

Modül **dondurulmuş bir özellik tohumu**: testle korunuyor, üretimde çalışmıyor — Sprint 188'de karar verilmediği takdirde sessiz teknik borç olarak büyümeye devam edecek.
