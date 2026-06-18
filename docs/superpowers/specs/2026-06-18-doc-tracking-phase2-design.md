# Doc-Tracking Faz 2 — Tasarım Spec'i (code-drift + CI-gate + sprint-hook + MCP + dashboard)

> **Durum:** Onaylandı (Alperen, 2026-06-18) — tek spec/plan, tek merge.
> **Base:** post-merge `main` (Faz 1 inmiş, `0ffb4071`); branch `feat/doc-tracking-phase2`.
> **Önceki:** Faz 1 (`docs/superpowers/specs/2026-06-18-doc-tracking-design.md`, ADR-090) — DCR + content-hash + age sinyali + `deckent docs track scan/status/sync` CLI + `doc_tracking` tablosu. Faz 2, o motorun üstüne **code-drift sinyalini** + **3 yeni yüzeyi** (CI-gate, sprint-hook, MCP, HTTP API+dashboard) bindirir.

---

## 1. Amaç

Faz 1 motorunu tamamlamak ve doc-health'i otomasyona + insana sunmak:
1. **code-drift** sinyalini canlı yapmak (`tracks:` doc↔kod eşlemesi → git-timestamp karşılaştırması). Scorer Faz 1'de `code_drift===true` için zaten +30 ekliyor ama scanner daima `null` geçiyordu.
2. **`--check`** CI-gate — kritik-stale doc'ta non-zero exit (CI bloke edebilir).
3. **sprint-finalize hook** — sprint sonu otomatik DB-sync (config-gated, default-off).
4. **MCP** — `deckent_docs` tool'una `track-scan`/`track-status` action'ları.
5. **HTTP API + dashboard** — `GET /api/docs/health` + "Docs Health" sayfası (rank×state ısı-haritası + drill-down tablo).

## 2. Non-goals (kapsam dışı)

- Doc↔kod **semantik** analizi — code-drift yalnız git-timestamp karşılaştırması (NG, Faz 1 ile aynı).
- Front-matter yazımının davranışını değiştirmek — Faz 1 `writeManagedFrontmatter` aynen korunur.
- `doc_tracking` tablo şemasını değiştirmek — Faz 1 şeması yeterli (`code_drift` zaten `signals` JSON'unda).
- MCP'ye yeni tool eklemek — mevcut `deckent_docs` genişletilir (Alperen kararı).
- Yeni runtime-dependency (ADR-010 korunur).

## 3. Mimari

Faz 1 `src/core/doc-tracking/` çekirdeği tek veri-kaynağı (`DocTrackingStore` → `.brain/memory.db` `doc_tracking` tablosu) olarak kalır. Faz 2 ekler:

```
core:     code-drift.ts (YENİ) ──┐
                                  ├─→ scanner.ts (code_drift wire) ─→ DocTrackingStore
CLI:      docs.ts (--check flag) ─┘                                        │
orchestra: sprint-finalizer.ts (hook) ─→ runDocsTrackScan ────────────────┤ (okur/yazar)
MCP:      deckent_docs tool (track-scan/track-status action) ─────────────┤ (okur)
API:      docs-health-endpoint.ts (YENİ) ─→ runDocsTrackStatus + agregasyon┘ (okur)
dashboard: DocsHealthPage.tsx (YENİ) ─→ GET /api/docs/health
```

Her yüzey aynı `DocTrackingStore`/`runDocsTrackScan`/`runDocsTrackStatus` API'sini kullanır — tek doğruluk kaynağı, çoğaltma yok.

## 4. Component 1 — code-drift (core)

**Yeni dosya:** `src/core/doc-tracking/code-drift.ts`

**Arayüz:**
- `resolveTrackedFiles(root: string, tracks: string[]): Promise<string[]>` — `tracks:` glob/path listesini repo-relative dosya yollarına genişletir. `git ls-files` (tracked dosyalar) çıktısını `matchGlob` ile süzer; düz path (glob değil) doğrudan eklenir. `git` yoksa → boş liste (drift hesaplanamaz).
- `computeCodeDrift(root: string, tracks: string[] | null, docLastUpdatedMs: number): Promise<boolean | null>` —
  - `tracks` boş/null → `null` (sinyal yok, skora 0 katkı).
  - Çözülen dosya yoksa → `null`.
  - Çözülen kaynak dosyalardan **herhangi birinin** `getFileGitDateAsync` > `docLastUpdatedMs` → `true`; aksi halde `false`.

**Scanner wire** (`scanner.ts`): Faz 1'de `code_drift: null` sabitti. Faz 2'de:
```
const tracked_code = Array.isArray(fm.tracks) ? fm.tracks : null;
const docMs = gitMs > 0 ? gitMs : now;  // doc'un kendi last-updated'ı
const code_drift = await computeCodeDrift(root, tracked_code, docMs);
const signals = { content_drift, code_drift, age_days };
```
Yalnız `fm.tracks` varsa hesaplanır → tracks'sız doc'larda davranış Faz 1 ile birebir aynı (`null`). Scorer değişmez.

**Performans:** `tracks`'lı doc başına bir `git ls-files` + N `git log`. Çoğu doc `tracks` taşımaz → sıfır ek maliyet. `tracks`'lı doc sayısı düşük tutulur (opsiyonel alan).

## 5. Component 2 — `--check` CI-gate (CLI)

**Değişen:** `src/cli/commands/docs.ts` (`docs track scan` action + yeni exported handler), `src/cli/helpers/messages.ts` (i18n).

- `docs track scan --check [--max-rank <n>]` — tarama sonrası: state `CRITICAL_STALE` olan (veya `priority_score >= scoring.criticalAt`) ve (opsiyonel) `doc_rank <= max-rank` doc'ları topla. Varsa: ihlal listesini bas + **`process.exitCode = 1`** (non-zero). Yoksa: temiz mesaj + exit 0.
- Yeni saf-test-edilebilir handler: `runDocsTrackCheck(root, { maxRank?: number }): { violations: Array<{path, doc_rank, state, priority_score}>; ok: boolean }` (DB'den okur, exit'i caller verir).
- i18n key'ler: `docs.track.check_clean`, `docs.track.check_violations` (en+tr).
- `--check`, `scan`'a flag olarak eklenir (tarayıp kontrol eder) — CI tek komutla scan+gate yapar.

## 6. Component 3 — sprint-finalize hook (orchestra)

**Değişen:** `src/orchestra/sprint-finalizer.ts` (`finalizeSprint()` içine, decay/archive adımları yanına — Step 12 bölgesi).

- **Config-gated, default OFF:** `config.doc_tracking?.sync_on_finalize === true` ise çalışır (kör-default-on YOK kuralı; opt-in). Config tipi `src/core/config-types.ts`'e additive `doc_tracking?: { sync_on_finalize?: boolean }` eklenir.
- Açıksa: `await runDocsTrackScan(projectRoot, { write: false, prune: false })` (DB-only sync; sprint sonu dosya-mutasyonu yok → front-matter churn'ü ve diff gürültüsü yok).
- **Fail-safe:** try/catch ile sarılır, hata → `debugLog` + devam; finalize'i ASLA bozmaz (Faz 1 cleanup hook deseni gibi).
- Import yönü: sprint-finalizer zaten orchestra; `runDocsTrackScan` `src/cli/commands/docs.ts`'te. Döngü riski olmaması için scan-handler'ı `docs.ts`'ten import etmek yerine **çekirdek `scanDocs`+`DocTrackingStore`+`loadDocTrackingConfig`'i doğrudan** çağırır (core'a bağımlılık temiz; cli→core değil orchestra→core). Gerekirse küçük bir `runDocTrackingSync(root)` helper'ı `src/core/doc-tracking/`'e eklenir (handler'ın core-saf ikizi).

## 7. Component 4 — MCP `deckent_docs` genişletme

**Değişen:** `deckent_docs` tool tanımı + handler (`src/mcp/tools/`).

- `deckent_docs` input şemasına `action` değerleri eklenir: mevcut (`add`/`remove`/`list`) + yeni `track-scan`, `track-status`.
  - `track-scan` → `runDocsTrackScan(root, { write: false, prune: false })` (MCP'den DB-only; agent dosya mutasyonu tetiklemesin) → `{count, stale}` döner.
  - `track-status` → `runDocsTrackStatus(root, { stale, rank? })` → satır listesi (JSON) döner.
- ReadOnly/Destructive meta: `track-status` read-only; `track-scan` DB-yazar (front-matter yazmaz). Mevcut `deckent_docs` meta'sına uyumlu işaretlenir.
- `DECKENT.md` MCP tool referansına action notu eklenir (doc-only, sayı 35 değişmez).

## 8. Component 5 — HTTP API + dashboard

**API — yeni dosya:** `src/api/docs-health-endpoint.ts`, `src/api/server.ts`'e route kaydı (mevcut `if (url === '/api/...')` pattern + auth-gate; tüm korumalı endpoint'ler gibi bearer/OIDC arkasında).
- `GET /api/docs/health` → `{ rows: DocStatusRow[], heatmap: HeatmapCell[], generatedAt }`.
  - `rows` = `runDocsTrackStatus(root, { stale:false })` (tüm doc'lar, rank ASC).
  - `heatmap` = rank-bucket × state agregasyonu: bucket'lar `0` / `1-10` / `11-50` / `51-94` / `95+`; her hücre `{bucket, state, count}`.
  - Agregasyon saf fonksiyon `aggregateHeatmap(rows): HeatmapCell[]` (core veya endpoint-yanı; unit-test edilir).
- Auth: korumalı (auth-gate middleware); okuma-only (GET).

**Dashboard — yeni sayfa:** `src/dashboard/src/pages/DocsHealthPage.tsx`, `src/dashboard/src/App.tsx`'e route + nav.
- Üst: **ısı-haritası** — satır = rank-bucket, sütun = state (FRESH/DRIFT/STALE/CRITICAL_STALE), hücre = sayı, **renk-kodlu** (FRESH yeşil-tonu → CRITICAL_STALE kırmızı-tonu; Tailwind). EMOJI YOK; başlık/durum ikonları **lucide-react** (örn. `FileText`, `AlertTriangle`).
- Hücre tıkla → alttaki **tablo** o bucket+state'e filtrelenir (rank/state/score/path/last_updated kolonları). Filtre temizleme + "tümü" görünümü.
- Veri: `GET /api/docs/health` (mevcut dashboard fetch + auth token pattern'i).
- Boş/yükleniyor/hata durumları ele alınır (mevcut sayfa desenleri gibi).

## 9. Config eklemeleri

- `.deckent/settings/docs.json` `tracking` bloğu — Faz 1'deki gibi (değişmez).
- `config.doc_tracking?.sync_on_finalize?: boolean` (default `false`) — sprint-hook gate'i. `config-types.ts` additive.

## 10. Hata yönetimi

- **code-drift:** `git` yok / hata → `resolveTrackedFiles` boş, `computeCodeDrift` → `null` (sinyalsiz), uydurma yok.
- **sprint-hook:** try/catch → warn+continue; finalize bozulmaz.
- **API:** store hatası → structured `500 { error }`; auth yoksa middleware `401`.
- **MCP:** handler hatası → MCP error response (mevcut pattern).
- **dashboard:** fetch hatası → hata-state UI.

## 11. Test stratejisi

- **code-drift** (`tests/core/doc-tracking/code-drift.test.ts`): tmp-git repo; tracked dosya doc'tan **yeni** → `true`; **eski** → `false`; `tracks` boş → `null`; git yok → `null`. Hermetik (tmpdir, async spawn).
- **scanner code-drift wire:** `tracks`'lı doc → `code_drift` non-null; tracks'sız → `null` (geriye-uyum).
- **`--check`** (`tests/cli/docs-track.test.ts` genişletme): kritik-stale yok → `ok:true`; var → `ok:false` + violations; `--max-rank` süzer.
- **sprint-hook** (`tests/orchestra/...` veya finalizer testine ekleme): config-off → çağrılmaz; config-on → `scanDocs` çağrılır; hata → finalize yeşil kalır (fail-safe).
- **MCP action:** `deckent_docs track-status`/`track-scan` handler gerçek DB ile veri döndürür.
- **API** (`tests/api/docs-health-endpoint.test.ts`): hermetik tmp DB; `GET /api/docs/health` 200 + rows/heatmap; auth yoksa 401; `aggregateHeatmap` unit.
- **dashboard:** component test (heatmap render + tıkla-filtrele) + **proof-of-function (Tier-1, gerçek binary):** `npm run build` (worktree-local) → `node dist/cli/entry.js serve` → `GET /api/docs/health` 200 + sayfa gerçek veri render eder. Mock-only = TECH_DEBT.

## 12. Konvansiyonlar / kısıtlar (bağlayıcı)

- **i18n-first:** Tüm yeni user-facing string `getMessage(key, lang)` (CLI). Dashboard mevcut i18n/etiket desenine uyar. API JSON (string-free).
- **ESM:** relative import `.js`.
- **No new dep (ADR-010):** glob için `matchGlob` (Faz 1), git için async spawn (ADR-087), sqlite mevcut.
- **Hermetik test:** tmpdir, async spawn, `spawnSync` YASAK (test-setup hariç), `npm run test:ci-sim` yeşil.
- **Surgical:** `entries`/MemoryStore'a dokunma; `doc_tracking` şeması değişmez; Faz 1 davranışı korunur (mevcut testler yeşil kalır).
- **Dashboard:** EMOJI YASAK, lucide-react ikon.
- **Default-off:** sprint-hook flag-gated default-off (kör-default-on yok).
- **Tier-1 proof-of-function:** API + dashboard gerçek-binary run-verify ile kapanır.

## 13. Decomposition / dosya envanteri

| Dosya | Tür | Sorumluluk |
|---|---|---|
| `src/core/doc-tracking/code-drift.ts` | YENİ | `resolveTrackedFiles` + `computeCodeDrift` |
| `src/core/doc-tracking/scanner.ts` | MODIFY | `code_drift` wire (null → computed) |
| `src/core/doc-tracking/sync.ts` (ops.) | YENİ | `runDocTrackingSync(root)` core-saf helper (sprint-hook için) |
| `src/cli/commands/docs.ts` | MODIFY | `--check` flag + `runDocsTrackCheck` |
| `src/cli/helpers/messages.ts` | MODIFY | `docs.track.check_*` i18n |
| `src/core/config-types.ts` | MODIFY | `doc_tracking?.sync_on_finalize?` |
| `src/orchestra/sprint-finalizer.ts` | MODIFY | finalize hook (fail-safe, gated) |
| `src/mcp/tools/*` (deckent_docs) | MODIFY | `track-scan`/`track-status` action |
| `src/api/docs-health-endpoint.ts` | YENİ | `GET /api/docs/health` + `aggregateHeatmap` |
| `src/api/server.ts` | MODIFY | route kaydı |
| `src/dashboard/src/pages/DocsHealthPage.tsx` | YENİ | ısı-haritası + drill-down tablo |
| `src/dashboard/src/App.tsx` | MODIFY | route + nav |
| `docs/adr/090-doc-tracking.md` | MODIFY | Faz 2 "accepted" notu (code-drift/CI-gate/sprint-hook/MCP/dashboard canlı) |
| `docs/reference/api-surface.md` | MODIFY | `/api/docs/health` + deckent_docs action + sync_on_finalize |
| `tests/...` | YENİ | her component için hermetik test |

## 14. Çıktı / merge

Tek branch `feat/doc-tracking-phase2` → TDD plan → uygula → full `test:ci-sim` yeşil + Tier-1 proof-of-function → tek merge (post-merge main'in üstüne rebase+ff, Faz 1 deseni). Merge-sonrası: MASTER-PLAN §10 "Doc-Tracking Faz 2 ✅" + ADR-090 amendment.
