---
doc_rank: 40
status: active
last_updated: 2026-06-18
content_hash: <managed>
title: "Doc-Tracking — DCR + Multi-Signal Staleness Design Spec"
---

# Doc-Tracking: Documentation Tracking & Staleness Design Spec

> **Status:** APPROVED (brainstorming 2026-06-18) — implementation pending.
> **ADR:** introduces **ADR-090** (Documentation Tracking & Staleness).
> **Approach:** A — core module + dedicated `doc_tracking` DB table + CLI + sprint-finalize hook + (Phase 2) MCP/dashboard.

---

## 1. Problem & Goals

Projelerde/süreçlerde dokümantasyon karmaşıklaşıyor: hangi doküman güncel, hangisi koddan geride, hangisi önemli — körlemesine. Amaç: her (geçici-olmayan) `.md` dokümanına **içerik-hash + son-güncelleme zamanı + sayısal önem-kodu (DCR)** vererek, bunları **memory.db'de** izleyip **çok-sinyalli stale tespiti** yapan, takip/öneri/analizi besleyen bir mekanizma.

**Goals**
- G1 — Her izlenen doc için kanonik metadata: `content_hash`, `last_updated`, `doc_rank` (DCR), `status`.
- G2 — Metadata **hem front-matter'da (insan-okur)** hem **memory.db'de (sorgulanabilir ayna)**.
- G3 — **Çok-sinyalli stale skoru:** content-drift + code-drift (opsiyonel) + yaş, `doc_rank` ile ağırlıklı.
- G4 — **DCR auto-default + override:** path→rank haritası varsayılan atar, front-matter ezer; 0=en kritik, sonsuz seviye.
- G5 — **Geçici doc'lar hashlenmez** (`scratch/`, `status: draft|temp`).
- G6 — `deckent docs track` CLI (scan/status/sync) + sprint-finalize otomatik sync.
- G7 — i18n-FIRST, hermetik testler, tsc temiz, CI yeşil, mevcut altyapıyı yeniden kullan (sıfır yeni runtime-dep).

**Non-Goals**
- NG1 — Doküman İÇERİĞİNİ üretmek/yeniden-yazmak (bu managed-docs'un işi, ADR-029/030).
- NG2 — Otomatik doc düzeltmek/güncellemek. Mekanizma **tespit + raporlar**; düzeltmeyi insan/Brain yapar.
- NG3 — Doc↔kod semantik analizi. code-drift yalnız git-timestamp karşılaştırması (opsiyonel `tracks:` mapping ile).

---

## 2. Reuse Map (mevcut altyapı — yeniden kullan)

| İhtiyaç | Mevcut | Karar |
|---|---|---|
| İçerik fingerprint | `src/orchestra/managed-docs/doc-cache.ts::contentHash()` (SHA-1) | SHA-256'ya yükselt (yeni `hashBody()`), `sha256:` prefix. doc-cache'in SHA-1 kullanımı dokunulmaz (geriye-uyum). |
| Son-güncelleme zamanı | `src/cli/commands/sync.ts::getFileGitDate()` | Ortak util'e taşı (`src/core/doc-tracking/git-date.ts`) veya export'u re-use et; mtime fallback dahil. |
| DB & migration | `src/core/memory-store.ts::applyAdditiveMigrations()` (PRAGMA-guard) | Yeni `doc_tracking` tablosu additive migration ile. `entries` tablosuna DOKUNMA. |
| Doc kayıt deseni | `.deckent/settings/docs.json` + `docs-config.ts` | `rankMap` + `trackIgnore` + `noFrontmatter` alanlarını additive ekle (mevcut managed-docs alanları korunur). |
| Sprint-aware cache | `doc-cache.ts` (entryHash+fileHash+sprintId) | scan ucuzlatmak için aynı cache deseni (opsiyonel optimizasyon). |
| i18n | `src/cli/helpers/messages.ts::getMessage(key,lang)` (en/tr) | Tüm user-facing string buradan. Modüller string-free. |

**Yeni kod:** `src/core/doc-tracking/{types,scanner,frontmatter,rank-resolver,stale-scorer,store,git-date}.ts` + CLI `register` + i18n key'leri + ADR-090.

---

## 3. Data Model

### 3.1 Front-matter şeması (kanonik)
```yaml
---
doc_rank: 10                  # DCR — 0=en kritik (core); sonsuz seviye (0..N tamsayı)
status: active                # active | draft | temp | frozen | superseded
last_updated: 2026-06-18      # son commit git author-date (YYYY-MM-DD); untracked → mtime/bugün
content_hash: sha256:abc123…  # GÖVDE hash'i (front-matter HARİÇ); makine-yönetimli, elle düzenleme
tracks:                       # OPSİYONEL — code-drift için doc↔kaynak glob/path eşlemesi
  - "src/core/routing-engine.ts"
---
```

**Kanonik kurallar:**
- **Yönetilen alanlar:** yalnız `doc_rank`, `status`, `last_updated`, `content_hash`. Mevcut diğer front-matter anahtarları (`title`, `method`, vb.) **korunur**, sıralaması bozulmaz.
- **Hash = gövde hash'i.** `content_hash`, dosyanın baştaki YAML front-matter bloğu HARİÇ kalan gövdesinin SHA-256'sıdır. Sebep: `last_updated`/`doc_rank` değişince hash değişmesin → sonsuz churn-loop yok. Hash öncesi normalize: CRLF→LF, dosya-sonu tek `\n`. (Front-matter içindeki `content_hash` satırı hash'e zaten girmez çünkü front-matter komple hariç.)
- **Geçici → hashlenmez:** `status ∈ {draft, temp}` veya `scratch/` altındaki doc → `content_hash` yazılmaz/`<temp>`, stale-skoruna girmez (EXEMPT).
- **Front-matter parse kuralı:** front-matter, dosyanın **1. satırı tam olarak `---`** ise ve sonraki bir `---` ile kapanıyorsa geçerlidir. Aksi halde front-matter YOK kabul edilir (örn. ADR'ler `# ADR-…` ile başlar → leading `---` yok → mekanizma yeni bir blok **prepend** eder, içindeki sonraki `---` ayraçları front-matter sanılmaz).

### 3.2 DB tablosu (`doc_tracking`)
```sql
CREATE TABLE IF NOT EXISTS doc_tracking (
  path          TEXT PRIMARY KEY,   -- repo-relative POSIX path
  content_hash  TEXT,               -- sha256:… (gövde) | null (EXEMPT/temp)
  last_updated  TEXT,               -- ISO8601 (git author-date | mtime fallback)
  doc_rank      INTEGER,            -- DCR (0..N)
  status        TEXT,               -- active|draft|temp|frozen|superseded
  stale_score   REAL,               -- 0..100 (signal severity, rank-bağımsız)
  priority_score REAL,              -- stale_score * rankWeight (sıralama için)
  state         TEXT,               -- FRESH|DRIFT|STALE|CRITICAL_STALE|EXEMPT
  signals       TEXT,               -- JSON {content_drift:bool, code_drift:bool|null, age_days:int}
  tracked_code  TEXT,               -- JSON string[] (tracks globs) | null
  first_seen    TEXT,               -- ISO8601 (ilk kayıt)
  last_scanned  TEXT                -- ISO8601 (son scan)
);
```
- Migration: `applyAdditiveMigrations()` içinde `CREATE TABLE IF NOT EXISTS` (idempotent, fresh+reopen güvenli). `entries`/FTS/relations **değişmez**.
- Doc silinirse: row korunur, `state` hesaplamada "dosya yok" → opsiyonel `--prune` ile temizlenir (silme audit'i log'lanır). Default prune YAPMAZ (kayıp-önleme).

---

## 4. DCR — Rank Resolution

Öncelik (yüksek kazanır):
1. Front-matter `doc_rank` (explicit override).
2. `.deckent/docs.json → rankMap` glob eşleşmesi (en-spesifik glob kazanır).
3. Hiçbiri yoksa → `defaultRank` (config, varsayılan `50`).

**Varsayılan `rankMap` (config'te, ayarlanabilir):**
```json
{
  "rankMap": {
    "CLAUDE.md": 0, "DECKENT.md": 0, "AGENTS.md": 0,
    "docs/DOC-POLICY.md": 0, "docs/MASTER-PLAN.md": 0,
    "docs/adr/**": 1,
    "docs/reference/**": 10,
    "docs/guide/**": 20, "docs/development/**": 20,
    "docs/architecture/**": 5,
    "docs/analysis/**": 90,
    "docs/customer/**": 95, "docs/launch/**": 95
  },
  "defaultRank": 50
}
```
- **DCR = Document Criticality Rank** (front-matter alanı `doc_rank`). 0=en kritik, sonsuz üst sınır.
- Validasyon: `doc_rank` tamsayı ≥ 0 olmalı; negatif/NaN → uyarı + `defaultRank`.

---

## 5. Scope + Ignore

- Kapsam: repo kökünden `**/*.md` (tüm repo).
- Muafiyet: `.deckent/docs.json → trackIgnore` glob listesi. **Varsayılan ignore:**
  `node_modules/**`, `dist/**`, `.git/**`, `**/worktrees/**`, `.brain/exports/**`, `.brain/archive/**`, `**/archive/**`, `scratch/**`, `coverage/**`, `**/*.template.md`.
- **Geçici (tracked-but-not-hashed):** `scratch/**` veya `status ∈ {draft,temp}` → DB'ye `state=EXEMPT`, `content_hash=null`, stale'e girmez. (Kullanıcı isteği: geçici doc hashlenmez.)
- **noFrontmatter listesi** (config): front-matter enjeksiyonu yapısal olarak riskli dosyalar → **DB-only** izlenir (front-matter YAZILMAZ). Varsayılan: `CLAUDE.md`, `DECKENT.md`, `AGENTS.md`, `GEMINI.md`, ve Tier-2 managed-docs (docs.json'da kayıtlı auto-section'lı doc'lar). Sebep: `@import` / managed auto-section çakışma riski. Bu doc'lar yine de hash+timestamp+rank ile DB'de izlenir.

---

## 6. Multi-Signal Stale Scoring

Üç sinyal → `stale_score` (0..100, rank-bağımsız severity) + `priority_score` (sıralama) + `state`. **Tüm sabitler config'te (`scoring` bloğu), magic-number yok.**

### 6.1 Sinyaller
- **content_drift** (binary): DB `content_hash` ≠ yeniden-hesaplanan gövde hash. (İlk scan'de doc yeni → drift=false, baseline kaydedilir.)
- **code_drift** (binary | null): yalnız `tracks` doluysa hesaplanır. `tracks` glob'larının çözdüğü kaynak dosyalardan herhangi birinin git author-date'i > doc `last_updated` → true. `tracks` yoksa → null (skora 0 katkı).
- **age_days** (int): `now − last_updated` (gün).

### 6.2 Skor (varsayılan ağırlıklar)
```
scoring.weights      = { content: 50, code: 30, ageMax: 20 }   // toplam 100
scoring.ageThreshold = max(14, round(30 + doc_rank * 1.5))     // rank-duyarlı, gün; cap 365
ageComponent = clamp(age_days / ageThreshold(rank), 0, 1) * scoring.weights.ageMax
raw          = (content_drift ? 50 : 0) + (code_drift === true ? 30 : 0) + ageComponent
stale_score  = clamp(raw, 0, 100)

rankWeight     = 1 + (MAXRANK - min(doc_rank, MAXRANK)) / MAXRANK   // MAXRANK=100 → rank0:2.0, rank100:1.0
priority_score = clamp(stale_score * rankWeight, 0, 100)
```
> Rank-duyarlı eşik: core doc (rank 0) 30 günde bayatlamaya başlar; customer doc (rank 95) ~172 gün tolere. Düşük-kod = daha agresif uyarı (rankWeight).

### 6.3 State türetimi (deterministik)
```
if status ∈ {draft, temp, frozen, superseded}        → EXEMPT
elif stale_score == 0                                 → FRESH
elif priority_score >= scoring.criticalAt (default 80)→ CRITICAL_STALE
elif priority_score >= scoring.staleAt   (default 50) OR age_days > ageThreshold(rank) → STALE
else                                                  → DRIFT
```
(`frozen`/`superseded` = bilinçli dondurulmuş → uyarma. `draft`/`temp` = geçici → izle ama skorlama.)

---

## 7. Components (her biri tek-sorumluluk, string-free, küçük dosya)

`src/core/doc-tracking/`:
- **`types.ts`** — `DocRecord`, `DocSignals`, `DocState`, `ScanResult`, `DocTrackingConfig` arayüzleri.
- **`git-date.ts`** — `getFileGitDate(root, path)` (sync.ts'teki util buraya, `core/`'a taşınır; `cli/commands/sync.ts` buradan import eder → DRY + **ADR-008 doğru import yönü**: cli→core, asla core→cli). async `spawn`, mtime fallback, ADR-087 uyumlu.
- **`frontmatter.ts`** — `parseFrontmatter(content)` / `writeManagedFrontmatter(content, fields)`. Sadece yönetilen alanları günceller, gerisini korur, idempotent. Malformed YAML → throw etmez, `{ ok:false }` döner.
- **`rank-resolver.ts`** — `resolveRank(path, frontmatter, config)`: override → rankMap → defaultRank.
- **`stale-scorer.ts`** — `score(record, signals, config)`: §6 saf fonksiyon (I/O yok, kolay test).
- **`scanner.ts`** — `scanDocs(root, config, opts)`: glob `**/*.md` − ignore → her doc için (read, frontmatter, hash gövde, git-date, rank, signals, score), opsiyonel front-matter yaz, `DocRecord[]` döndür. Saf-okuma modu (`opts.write=false`).
- **`store.ts`** — `DocTrackingStore` (memory-store'u sarar): `upsertDoc()`, `getAll()`, `getStale(minState)`, `getByRank()`, `pruneDeleted()`. Tablo migration burada init.
- CLI: `src/cli/commands/docs.ts` (mevcut `docs` komutuna `track` alt-grubu).

### Veri akışı
```
deckent docs track scan
  → loadDocTrackingConfig(.deckent/docs.json)
  → scanner.scanDocs(root, config, {write:true})
       per doc: read → frontmatter.parse → hashBody → git-date → rank-resolver
                → (prev hash DB'den) signals → stale-scorer.score
                → frontmatter.writeManaged (noFrontmatter değilse) 
  → store.upsertDoc(record)  (her doc)
  → store.pruneDeleted()     (yalnız --prune)
  → rapor (getMessage ile, en/tr)
```

---

## 8. Execution / Integration

- **CLI** (`deckent docs track …`):
  - `scan` — tam tarama: hash+timestamp+rank hesapla, front-matter yaz, DB sync. `--no-write` (front-matter'a dokunma, yalnız DB), `--prune` (silinmiş doc row'larını temizle).
  - `status` — rapor: rank + state'e göre tablo; `--stale` (yalnız DRIFT+), `--rank <n>` filtre, `--json`.
  - `sync` — yalnız DB güncelle (front-matter yazma).
  - `--check` (Faz 2) — CI gate: `priority_score >= criticalAt` doc varsa non-zero exit.
- **Sprint-finalize hook:** managed-doc-runner'dan **sonra** `scanDocs({write:true})` çağrılır → DB sprint-sonu durumu yansıtır. (Mevcut sprint-aware cache ile ucuz; değişmeyen doc atlanır.)
- **MCP + dashboard (Faz 2):** `deckent_docs` genişletmesi veya yeni read-only tool + dashboard "Docs Health" sayfası (rank × state ısı-haritası).

---

## 9. i18n

Tüm user-facing string `getMessage(key, lang)` üzerinden (en default, tr). Yeni key'ler (örnek): `docs.track.scanned`, `docs.track.staleHeader`, `docs.track.criticalWarn`, `docs.track.exemptSkipped`, `docs.track.pruned`. Modüller (scanner/scorer/store) string-free; CLI label enjekte eder.

---

## 10. Error Handling & Edge Cases

- Git yok/untracked dosya → `getFileGitDate` mtime fallback; hâlâ yoksa `last_updated = bugün`.
- Okunamayan/binary/çok-büyük (`> sizeCap`, default 2 MB) `.md` → atla + uyarı (DB'ye dokunma).
- Malformed mevcut front-matter → front-matter yazma adımı atlanır (uyarı), ama DB-record yine de **tüm-dosya** hash'iyle yazılır (veri kaybı yok).
- noFrontmatter doc → front-matter yazılmaz, DB-only.
- İlk scan (baseline) → content_drift=false (karşılaştıracak prev-hash yok), kayıt oluşturulur.
- Concurrent scan → DB upsert idempotent; PRIMARY KEY(path) son-yazan kazanır.

---

## 11. Testing Strategy (TDD, hermetik — ADR-087)

- **Hermetik:** tüm fixture `os.tmpdir()` altında (sahte repo + .md'ler + sahte git veya mtime), `afterEach` temizler. Proje kökü/HOME'a yazma yok.
- **Git mock:** async `spawn` mock'lanır (spawnSync YASAK). git-yok yolu da test edilir (mtime fallback).
- **Saf-fonksiyon testleri:** `stale-scorer` ve `rank-resolver` I/O'suz → tablo-bazlı (FRESH/DRIFT/STALE/CRITICAL_STALE/EXEMPT senaryoları, rank-eşik sınırları, geçici-muafiyet).
- **Gerçek-davranış (mock-only YASAK):** scan sonrası gerçek front-matter byte'ları assert (idempotent: 2. scan değişiklik yapmaz), gerçek `doc_tracking` row'ları assert, gerçek hash gövde-only (front-matter değişince hash sabit) assert.
- **Migration:** fresh DB + reopen idempotent; `entries` tablosu bozulmadı assert.
- tsc --noEmit temiz; ilgili suite + `npm run test:ci-sim` yeşil.

---

## 12. Governance

- **ADR-090: Documentation Tracking & Staleness** — DCR (sayısal sonsuz-seviyeli önem kodu) + body-content-hash + multi-signal stale + front-matter↔memory.db ayna. DOC-POLICY.md'nin 4-katmanlı tiering'ini sayısal genelleştirir (Tier ≈ rank-bant).
- DOC-POLICY.md'ye not: yeni front-matter alanları makine-yönetimli (rule#1 — elle düzenleme).
- `docs/reference/api-surface.md`: `doc_tracking` tablo şeması + docs.json yeni alanları (`rankMap`, `trackIgnore`, `noFrontmatter`, `defaultRank`, `scoring`) dokümante edilir.

---

## 13. Phasing (god-level ama YAGNI)

**Faz 1 (bu spec'in çekirdeği):**
- `doc-tracking/` modülü (types, git-date, frontmatter, rank-resolver, stale-scorer, scanner, store).
- `doc_tracking` tablosu (additive migration).
- docs.json additive alanları + varsayılan config.
- content-drift + age sinyalleri + DCR + front-matter↔DB ayna.
- **`stale-scorer` code-drift-hazır yazılır** (saf fonksiyon `code_drift: bool|null` kabul eder) ama `tracks:` çözümü + git-karşılaştırma wiring'i Faz 2 → Faz 1'de `code_drift` daima `null` (content+age etkin).
- `deckent docs track scan|status|sync` CLI + i18n.
- ADR-090 + api-surface güncellemesi.
- TDD, hermetik, tsc temiz, CI yeşil.

**Faz 2 (ayrı spec/sprint):**
- code-drift (`tracks:` mapping) tam.
- `--check` CI gate + sprint-finalize hook wire.
- MCP tool + dashboard "Docs Health".

---

## 14. Open Questions

Yok — 4 mimari çatal brainstorming'de çözüldü (staleness=çok-sinyalli, storage=front-matter+db, scope=tüm-repo+ignore, rank=auto+override). İsim `doc_rank`/DCR onaylı.
