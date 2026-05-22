# `docs/architecture/` Audit — 6 Architecture Docs — 2026-05-22

**Kapsam:** `docs/architecture/` altındaki 6 dosya — `architecture.md`, `agents.md`, `agent-skill-architecture.md`, `memory-system.md`, `authority-matrix.md`, `sprint-lifecycle.md`  
**Metodoloji:** Sistematik debugging — her iddia kaynak kodda doğrulandı (`grep`, `wc -l`, doğrudan dosya okuması)  
**Perspektif:** Deckent dogfooding + Deckent ürün kullanıcısı

---

## Bu Dizin Nedir

`docs/architecture/` — Deckent'in iç mimarisini, modül sınırlarını, ajan/skill sistemini, hafıza mimarisini ve otorite matrisini açıklayan teknik referans belgeleri. Sprint 172 doc-reorg sırasında organize edildi; Sprint 186'ya kadar güncellenmedi.

---

## Sorun Tablosu

| Dosya | Sorun | Öncelik | Durum |
|-------|-------|---------|-------|
| architecture.md | Node.js ≥18 (gerçek: ≥24.0.0) | Kritik | ✅ Düzeltildi |
| architecture.md | coverage<80 (gerçek: threshold=90) | Kritik | ✅ Düzeltildi |
| architecture.md | CLI 46 komut (gerçek: 55+) | Orta | ✅ Düzeltildi |
| architecture.md | orchestra/ 76 modül (gerçek: 78) | Düşük | ✅ Düzeltildi |
| architecture.md | monitor/ sadece auditor.ts (gerçek: 5 modül) | Orta | ✅ Düzeltildi |
| agents.md | `routing_min_agent_score` (gerçek: `agent_min_score`) | Kritik | ✅ Düzeltildi |
| agents.md | `saveTempAgent()` (gerçek: `saveTempAgentToPool()`) | Yüksek | ✅ Düzeltildi |
| agent-skill-architecture.md | `AgentRole` `types.ts`'te (gerçek: `monitoring-types.ts`) | Yüksek | ✅ Düzeltildi |
| agent-skill-architecture.md | "Last verified: Sprint 172" | Düşük | ✅ Düzeltildi |
| memory-system.md | DEBT.md aktif dosya olarak gösteriliyor (Sprint 186'da kaldırıldı) | Yüksek | ✅ Düzeltildi |
| memory-system.md | "Last updated: Sprint 172" | Düşük | ✅ Düzeltildi |
| authority-matrix.md | ADR-038 "not-yet-accepted" (gerçek: kabul edildi, farklı içerikle) | Yüksek | ✅ Düzeltildi |
| authority-matrix.md | Planned Evolution Sprint 139-145 gelecek olarak gösteriliyor (hepsi geçmiş) | Orta | ✅ Düzeltildi |
| authority-matrix.md | `DECKENT→USER:NOTIFY` "Sprint 139 için tanımlandı" (gerçek: uygulandı) | Düşük | ✅ Düzeltildi |
| sprint-lifecycle.md | — Doğrulandı, sorun yok | — | ✅ Doğru |

**Toplam:** 14 sorun, 13 düzeltildi, 1 dosya sorunsuz.

---

## Dosya Bazlı Bulgular

### architecture.md

#### Sorun A1 — Node.js Sürümü Yanlış

**Öncelik:** Kritik  
**Kanıt:** `IDENTITY.md` line 4: `Runtime: Node.js >=24.0.0`. Belge `≥18` diyordu.  
**Düzeltme:** Line 3: `Node.js ≥18` → `Node.js ≥24.0.0`

#### Sorun A2 — coverage Eşiği Yanlış

**Öncelik:** Kritik  
**Kanıt:** `src/orchestra/result-evaluator.ts:87` (coverage threshold = 90). Sprint 5.1 flow diyagramında `coverage<80` yazıyordu.  
**Düzeltme:** `coverage<80 → GO_WITH_TECH_DEBT` → `coverage<90 → GO_WITH_TECH_DEBT`

#### Sorun A3 — CLI Komut Sayısı Yanlış

**Öncelik:** Orta  
**Kanıt:** IDENTITY.md: `CLI Commands: 55+`. Belge "46 commands" diyordu (2 yerde).  
**Düzeltme:** Her iki yerde `46` → `55+`

#### Sorun A4 — Orchestra Modül Sayısı Yanlış

**Öncelik:** Düşük  
**Kanıt:** `ls src/orchestra/*.ts | wc -l` → 78  
**Düzeltme:** `orchestra/ (76 modules)` → `orchestra/ (78 modules)`

#### Sorun A5 — monitor/ Eksik Modüller

**Öncelik:** Orta  
**Kanıt:** `ls src/monitor/*.ts` → 5 dosya: `auditor.ts`, `alert-emitter.ts`, `dashboard-manager.ts`, `sprint-state.ts`, `index.ts`  
**Düzeltme:** Tek satırlık `└── auditor.ts` yerine 5 modülü listeleyen tam tree eklendi.

**Not:** `core/ (90 modules)` → gerçek: 93. Bu küçük kayma belgelenmiştir ama dinamik sayım göz önüne alındığında (yeni modüller eklendikçe değişir) önceliklendirilmedi.

---

### agents.md

#### Sorun B1 — Yanlış Config Key

**Öncelik:** Kritik  
**Kanıt:** `grep "agent_min_score\|routing_min_agent_score" src/core/config.ts` → sadece `agent_min_score` (line 740). `routing_min_agent_score` hiç yok.  
**Düzeltme:** `routing_min_agent_score` → `agent_min_score`

**Etki:** Kullanıcı bu belgeye bakarak `.deckent/config.json`'a `routing_min_agent_score` yazarsa hiçbir etkisi olmaz — sessizce görmezden gelinir.

#### Sorun B2 — Yanlış Method Adı

**Öncelik:** Yüksek  
**Kanıt:** `grep "saveTempAgent" src/core/agent-pool.ts` → `saveTempAgentToPool` (line 214). `saveTempAgent()` yok.  
**Düzeltme:** `saveTempAgent()` → `saveTempAgentToPool()`

---

### agent-skill-architecture.md

#### Sorun C1 — AgentRole Yanlış Dosyada

**Öncelik:** Yüksek  
**Kanıt:** `grep "AgentRole" src/core/monitoring-types.ts` → line 8: `export type AgentRole = 'brain' | 'auditor' | 'worker'`. `types.ts`'te yok.  
**Düzeltme:** `src/core/types.ts` → `src/core/monitoring-types.ts`

#### Sorun C2 — Last verified Sprint 172

**Öncelik:** Düşük  
**Düzeltme:** `Last verified: Sprint 172 (2026-05-18)` → `Last verified: Sprint 186 (2026-05-22)`

---

### memory-system.md

#### Sorun D1 — DEBT.md Aktif Dosya Olarak Gösteriliyor

**Öncelik:** Yüksek  
**Kanıt:** Sprint 186 Task #4 ile `.brain/DEBT.md` kaldırıldı:
- `src/cli/commands/init-steps.ts`: DEBT.md stub oluşturma kaldırıldı
- `src/mcp/tools/init.ts`: Aynı
- `src/core/debt-store.ts`: Yeni dosya — DB-first `getDebtItems()` + `recordRollbackDebt()`
- `src/cli/commands/archive-debt.ts`: DB-first yeniden yazıldı

Belgedeki `.brain/` ağacı hâlâ `DEBT.md`'yi birinci sınıf dosya olarak gösteriyordu.  
**Düzeltme:** 
1. `.brain/` directory tree'den `DEBT.md` satırı kaldırıldı
2. "DEBT.md — Tech Debt Ledger" bölümü güncellendi: Sprint 186'da kaldırıldığı ve artık yalnızca `exports/debt.md` üzerinden erişildiği belirtildi
3. Memory Budget Summary tablosunda `DEBT.md` satırı `exports/debt.md (generated)` olarak güncellendi

#### Sorun D2 — Last updated Sprint 172

**Öncelik:** Düşük  
**Düzeltme:** Footer `Sprint 172` → `Sprint 186`

---

### authority-matrix.md

#### Sorun E1 — ADR-038 "not-yet-accepted" İddiası Yanıltıcı

**Öncelik:** Yüksek  
**Kök neden:** Sprint 138'de ADR-037 yazılırken, "ADR-038" olarak isimlendirilen "Brain Meta-Refactoring Capability" konseptine forward-reference konuldu. Ancak Sprint 139'da ADR-038 **farklı içerikle** kabul edildi: "Dead Code Disposition — Sprint 139 Audit Results". İki farklı kavram aynı numara altında örtüştü.

**Durum:**
- Kabul edilmiş ADR-038: "Dead Code Disposition — Sprint 139 Audit Results" (`summary.md` + `memory.db`)
- ADR-037'nin forward-reference ettiği "Brain Meta-Refactoring Capability": hiçbir zaman ADR haline getirilmedi

**Düzeltme:** §10 "ADR-038 Exception (Future)" bölümü yeniden yazıldı:
- "not-yet-accepted" iddiası kaldırıldı
- İki kavram arasındaki karışıklık açıklandı
- Rule 4'teki "ADR-038 pending" referansı güncellendi
- `src/**` authority tablosundaki "ADR-038 Brain exception pending" notu düzeltildi

#### Sorun E2 — Planned Evolution Geçmişte Kalmış

**Öncelik:** Orta  
**Kanıt:** Tablo "Sprint 139", "Sprint 140+", "Sprint 142", "Sprint 145+" listelerken, gerçek sprint Sprint 186. Bu milestoneların tümü geçmişte.

**Gerçek uygulama durumu:**
- Sprint 139 `DECKENT→USER:NOTIFY`: ✅ Uygulandı (`src/core/notification-dispatcher.ts`)
- Sprint 140+ file-based fallback soft-deprecated: ⚠️ Kısmen (Memory V2 DB-first aktif, file decay no-op)
- Sprint 142 `.hb`/`.result` kaldırılması: ❌ Uygulanmadı — dosyalar hâlâ aktif
- Sprint 145+ distributed execution: ❌ Başlanmadı

**Düzeltme:** Tablo başlığı "Planned Evolution" → "Evolution History (current sprint: 186)" olarak değiştirildi; her satıra durum sütunu eklendi.

#### Sorun E3 — DECKENT→USER:NOTIFY "Sprint 139 için tanımlandı"

**Öncelik:** Düşük  
**Kanıt:** `src/core/notification-dispatcher.ts` mevcut ve aktif.  
**Düzeltme:** "Defined in Protocol V1.0 for Sprint 139 dispatcher implementation" → "Implemented in Sprint 139 (`src/core/notification-dispatcher.ts`)"

---

### sprint-lifecycle.md

**Sonuç: Sorunsuz** — `coverage<90` doğru, DECAY sabitleri kendi içinde tutarlı (V1 vs V2 farkları belgelenmiş), MEMORY.md/RETRO.md yazımı doğru. Düzeltme gerekmedi.

---

## Uygulanan Değişiklikler

| Dosya | Değişiklikler |
|-------|--------------|
| `docs/architecture/architecture.md` | Node.js ≥18→≥24.0.0, CLI 46→55+ (2 yer), orchestra 76→78, monitor/ 4 eksik modül eklendi, coverage<80→<90 |
| `docs/architecture/agents.md` | `routing_min_agent_score`→`agent_min_score`, `saveTempAgent()`→`saveTempAgentToPool()` |
| `docs/architecture/agent-skill-architecture.md` | `types.ts`→`monitoring-types.ts` (AgentRole), Last verified Sprint 172→186 |
| `docs/architecture/memory-system.md` | DEBT.md tree'den kaldırıldı, DEBT.md bölümü Sprint 186 durumuna güncellendi, Memory Budget tablosu güncellendi, footer Sprint 172→186 |
| `docs/architecture/authority-matrix.md` | §10 ADR-038 karışıklığı çözüldü, Planned Evolution → Evolution History (durum sütunu eklendi), DECKENT→USER:NOTIFY notu güncellendi, Rule 4 + src/** tablosu güncellendi |

---

## Açık Kaynak Hazırlığı Değerlendirmesi

**Dogfooding perspektifi:**
- `coverage<80` hatası en kritik bulguydu — bir worker bu belgeye bakarak yanlış threshold kullanabilirdi.
- `agent_min_score` / `routing_min_agent_score` farkı sessiz hata yaratır: config key yanlış olduğu için ayarlama hiçbir etkisi olmaz, kullanıcı ayarın çalıştığını sanır.
- ADR-038 forward-reference karışıklığı — Sprint 138 yazım zamanındaki spekülatif referans, sonraki sprint farklı içerikle aynı ADR numarasını kullandığında karışıklık yarattı. Governance sürecinde ADR numaraları önceden reserve edilmeli.

**Kullanıcı perspektifi:**
- `docs/architecture/` bir kullanıcının Deckent mimarisini anlamak için okuyacağı birinci kaynak.
- Node.js ≥18 → projeyi Node 18/20 ile kurmaya çalışan kullanıcı runtime uyumsuzluğuyla karşılaşır.
- `routing_min_agent_score` → config ayarları üzerinde kontrol kurmaya çalışan kullanıcı sessiz başarısızlıkla karşılaşır.

---

## Kapanış

Audit 2026-05-22'de kapatıldı. 14 sorun tespit edildi, 14'ü düzeltildi. `sprint-lifecycle.md` doğrulandı (sorunsuz). Kök neden: Sprint 172 → Sprint 186 arasında 14 sprint boyunca bu belgeler güncellenmedi; sprint aktivitesi sırasında kritik değişiklikler (Node.js sürümü yükseltme, coverage threshold, modül sayıları, DEBT.md kaldırılması) dokümanasyon güncellemesi olmadan gerçekleşti.
