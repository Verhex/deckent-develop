# R45-B — Owner yetkilendirmesi: layer-shims baseline yeniden çapalama (Alperen, 2026-09-15)

R45-A dört kalemi uygulandı; policy/parity/MASTER üretici yeşil. Tam lint yalnız
`scripts/lint-layer-shims.mjs` (ADR-D-004 ratchet) gate'inde kırmızı: 19 bulgu.

**Atıf (Fable, kaynak: gate `--json` çıktısı × `git status` dirty kümesi, r45/LAYER-SHIMS-DELTA.json):**
- 5 `new-crossing` (mcp>cli): 4'ü HEAD'de değişmemiş dosyalar (`checkpoint.ts`, `run.ts`,
  `start.ts`, `status.ts`), yani main'de zaten vardı; 1'i bizim (`description-catalog.ts`
  parity düzeltmesiyle sembol listesi `getMessageLanguages` ile büyüdü).
- 5 `baseline-reduction-requires-shrink`: çözülmüş atomlar, `--shrink-baseline` ile meşru.
- 6 `scc-growth`: eklenen 30 dosyanın 25'i HEAD'de değişmemiş (agent/session, cli/sync, repl,
  orchestra acceptance/cross-verify/debt, core observability/operation-catalog vb.); bizim payımız
  5 dosya: `exact-docker-release-outcome.ts`, `task-result-authority.ts`, `result-evaluator.ts`,
  `task-attempt-custody-store.ts`, `execution-effect-persistence-contract.ts`.
- 3 `scc-reduction-requires-shrink`: shrink ile meşru.
Sonuç: ratchet baseline'ı (2026-07) bakımsız; main bu gate'te zaten kırmızı.

**Owner kararı:** baseline 2026-09-15 refaktör cutover'ında bugünkü grafa yeniden çapalanır;
refaktör bu baseline'ı KÜÇÜLTMEKLE ölçülür. Bu ADR-D-004 authority mutasyonudur ve amendment
satırıyla kayda geçer; borç silinmez, r45'e taşınır.

## Adımlar (sırayla, başka düzeltme yetkisi yok)
1. **Delta kanıtı.** `node scripts/lint-layer-shims.mjs --json` çıktısı olduğu gibi
   `r45/LAYER-SHIMS-DELTA.json`; `r45/OPEN-ITEMS.md`'ye tek kalem:
   `LAYER-D004-REBASE-20260915 | RELATED_BUT_NONBLOCKING | .deckent/settings/layer-shims.json |
   ADR-D-004 ratchet 2026-09-15'te yeniden çapalandı; 19 bulgu (5 crossing, 6 SCC büyümesi;
   5'i R31–R45, 25'i pre-existing) refaktörün katmanlama kilometre taşına devredildi | R45-B`.
2. **Önce shrink.** `node scripts/lint-layer-shims.mjs --shrink-baseline` (çözülmüş 5 atom + 3
   SCC düşer; atomik yazım). Çıktı r45/layer-shims-shrink.log.
3. **Yeniden çapalama.** Registry'de `baseline` anahtarı KALDIRILIR (yalnız o anahtar; `shims`,
   `topology`, `authority`, `ownership`, `sourcePolicy`, `manifestContract` aynen), ardından
   `node scripts/lint-layer-shims.mjs --init-baseline` (script "baseline already exists"
   derse anahtar kaldırılmamıştır; elle baseline yazılmaz). Çıktı r45/layer-shims-init.log;
   eski baseline (atoms 90 / sccs 17) r45/layer-shims-baseline-before.json olarak saklanır.
4. **ADR-D-004 amendment.** `docs/adr/adr-d-004-brain-central-import.md` sonuna, mevcut
   "## Amendment (2026-07-06)" kalıbıyla:
   `## Amendment (2026-09-15) — refactor-cutover baseline re-anchor` · Status: accepted ·
   içerik: neden (bakımsız ratchet, main kırmızı), ne (baseline_before → baseline_after atom/SCC
   sayıları, r45/LAYER-SHIMS-DELTA.json), sınır (kontrat C1–C4 ve topology DEĞİŞMEDİ; yalnız
   ölçüm çapası taşındı), taahhüt (refaktör katmanlama kilometre taşı bu baseline'ı küçültür;
   büyüme yine fail-closed). `DECISION_REF=owner-live-2026-09-15-refactor-cutover-dogfood-off`.
   `node scripts/lint-adr-sync.mjs` / `npm run lint:adr` yeşil.
5. **Doğrulama.** `npm run lint` tamamı yeşil (layer-shims dahil), konsolide test tek koşum
   (tekrar), `build:all`, binary kimliği. Kırmızı sürerse dur; yeni düzeltme yetkisi yok.
6. **Commit eşlemesi.** Registry + ADR amendment → commit 5 (`docs(policy)`), mesajda
   "ADR-D-004 baseline re-anchored at refactor cutover; delta in r45". Diğer commit'ler
   CUTOVER-PACKAGE K7 sırasıyla; ardından `git push origin main`; status boş; RESULT.md güncelle;
   CUTOVER-PACKAGE.md, AUTHORIZATION-20260915.md ve bu dosya silinir.

Sınırlar: `shims` listesine yeni istisna EKLENMEZ (description-catalog atomu yeni baseline'a
girer), `topology` yeniden yazılmaz, hiçbir döngü şimdi kırılmaz, ADR kontratı değişmez.
