# Builtins Drift Inventory — 2026-07-11 (Sprint 406, Task 406-001, MASTER-PLAN 502 dilim-1)

> **Kapsam:** `.deckent/{agents,skills}` (bu repo'nun kendi CANLI dogfood kataloğu — sprint'ler
> agent/skill seçimini doğrudan buradan okur) ↔ `src/core/builtins/{agents,skills}` (npm paketine
> giden, `deckent init`'in taze bir kullanıcı projesine tohumladığı kopya). **Bu dilim MERGE/karar
> UYGULAMASI yapmaz** — hangi tarafın kanonik olduğu Alperen'in kararı (goNogo.nogo). Burada olan:
> (1) mekanik, tekrar-koşulabilir bir gate (`scripts/builtins-drift-check.mjs`), (2) bugünün
> gerçek drift durumunun tam, örneklenmemiş envanteri + her dosya için git-iz + tek-cümle
> kanoniklik-önerisi (gerekçeli).
>
> **Yöntem:** `node scripts/builtins-drift-check.mjs --json` — iki ağacı dosya-dosya karşılaştırır.
> JSON dosyaları (`agent.json`/`manifest.json`) recursive key-sort + top-level `stats` alanı
> normalize edilerek (605 stats-sidecar taşınması sonrası saf gürültü) derin-eşitlik ile
> karşılaştırılır. Metin dosyaları (`PROMPT.md`/`SKILL.md`) tam-eşitlik + (farklıysa) bağımlılıksız
> bir LCS satır-diff'i ile karşılaştırılır. Sonuçlar `tests/scripts/builtins-drift-check.test.ts`
> içinde hem hermetik fixture'larla hem de gerçek-ağaç salt-okunur bir "RED-önce" kanıtıyla
> (secure-coding `entrypoint` eksikliği) doğrulanmıştır.
>
> **Bugünün gerçek sayıları** (2026-07-11, script canlı-koşusu): toplam **53 drift-öğesi**
> (only-in-.deckent: **0**, only-in-builtins: **4**, content-diff: **49**) + **1 excluded**
> (`.deckent/skills/docs` — bkz. §2, gerçek bir skill değil).

## 0. Context — Neden Bu Şekiller Drift Ediyor (kaynak-koddan doğrulanmış)

Öneriler bu üç mekanizmaya dayanıyor — her satırda tekrar türetmemek için burada bir kere:

1. **Agent builtin-fallback (371-001, `src/core/agent-pool.ts` `_loadBuiltinFallback`).**
   `.deckent/agents/<id>/agent.json` hiç materyalize edilmemiş bir builtin agent, sadece
   `PROMPT.md`'den sentezlenen minimal bir tanımla runtime'da pool-görünür yapılır. Yorum satırı
   açıkça: *"Only the "PROMPT.md with no agent.json anywhere" gap is this task's actual scope
   (369-003's 3 new agents)"* — yani **api-designer / i18n-specialist / observability-engineer'in
   `agent.json`'ı OLMAMASI bug DEĞİL, kasıtlı tasarım.**
2. **Skill builtin-fallback + sentez (aynı 371-001, `src/core/skill-pool.ts`
   `_loadBuiltinFallback` + `synthesizeSkillManifest`).** Aynı desen, ama önemli bir fark:
   fallback yalnız builtins'te **hiç `manifest.json` yoksa** devreye girer (`if (files.some(f =>
   f.name === MANIFEST_FILENAME)) continue;`) ve sentezlediği manifest **generic/inert**'tir
   (`priority: 5`, boş `triggers`, `createDefaultActivationConfig()` — küratörlü değil). Yani bir
   skill'in `.deckent`'te küratörlü bir manifest'i (gerçek `triggers`, özel `activation.rules`,
   yüksek `priority`) varken builtins'te **hiç manifest'i yoksa**, üretime giden kopya "çalışır ama
   generic" bir fallback alır — küratörlü ayar sessizce kaybolur. Bu bir çökme değil, bir
   **kalite-kaybı**.
3. **Doc-tracking managed frontmatter (`src/core/doc-tracking/`).** `doc_rank` / `status` /
   `last_updated` / `content_hash` bloğu, repo'nun doc-health tarayıcısının (`scanner.ts` +
   `frontmatter.ts`) `.md` dosyalarına yazdığı yönetilen bir blok. Tarayıcı görünüşe göre `src/**`
   altını kapsıyor (dolayısıyla `src/core/builtins/**/*.md` bloğu alıyor) ama `.deckent/**/*.md`'yi
   KAPSAMIYOR (dev workspace, "doc" olarak izlenmiyor) — bu yüzden PROMPT.md/SKILL.md'lerin
   **büyük çoğunluğundaki** fark tam olarak bu 6-7 satırlık blok, gövde metni AYNI. Kozmetik ama
   yine de gerçek bir drift — script'in yutmaması gerekiyordu, yutmadı.

## 1. Özet Sayılar

| Kategori | agents | skills | Toplam |
|---|---:|---:|---:|
| excluded (ne manifest ne doc — gerçek katalog öğesi değil) | 0 | 1 | 1 |
| only-in-.deckent | 0 | 0 | 0 |
| only-in-builtins | 3 | 1 | 4 |
| content-diff (manifest veya doc) | 21 | 28 | 49 |
| **Toplam drift-öğesi** | **24** | **29** | **53** |

## 2. Excluded (1) — Gerçek Bir Katalog Öğesi Değil

| Öğe | Neden excluded |
|---|---|
| `.deckent/skills/docs/` | Ne `manifest.json` ne `SKILL.md` var — içinde tek şey `core-memory/*.md` (bu repo'nun kendi dogfood edilen otomatik-memory export'u: `feedback_*`/`project_*`/`user_*` md dosyaları + `MEMORY.md`). Skill-bundling sistemiyle ilgisi yok; skill-katalog evreninden hariç tutuldu, sessizce yok sayılmadı. |

## 3. Only-in-Builtins (4) — Sadece Builtins'te Var

| Kategori | Öğe | Var olan dosya | Son commit (builtins) | Öneri |
|---|---|---|---|---|
| agent | `api-designer` | PROMPT.md (agent.json YOK) | `ea87df64` 2026-07-05 sprint-369 | **KORU — kasıtlı** (bkz. §0.1). agent.json eklemek gereksiz. |
| agent | `i18n-specialist` | PROMPT.md (agent.json YOK) | `ea87df64` 2026-07-05 sprint-369 | **KORU — kasıtlı**, aynı gerekçe. |
| agent | `observability-engineer` | PROMPT.md (agent.json YOK) | `ea87df64` 2026-07-05 sprint-369 | **KORU — kasıtlı**, aynı gerekçe. |
| skill | `observability` | SKILL.md (manifest.json YOK, ne .deckent'te ne builtins'te) | `220a66f5` 2026-07-05 sprint-368 | **Alperen'in çağrısı**: fallback bugün çalışıyor (generic manifest ile), ama bu repo'nun kendi sprint'leri de hiç küratörlü bir `observability` manifest'i görmedi. İstenen davranış küratörlü bir manifest ise, bir `.deckent/skills/observability/manifest.json` yazılması follow-up. |

## 4. agent.json İçerik-Farkı — Gerçek Routing-Davranışı Drift'i (6)

**Bu en yüksek-öncelikli grup**: `stats` dışında, `activation.rules` (görev-seçim skorlama mantığı)
gerçekten farklı — iki taraf da aynı sprint'te seçilebilirlik açısından FARKLI davranır. Tek yönlü
bir "biri diğerinin supersetı" durumu değil; her satır kendi kararını gerektiriyor.

| Öğe | `.deckent` son commit | `builtins` son commit | Fark özeti | Öneri |
|---|---|---|---|---|
| `architect` | `2b75e807` 2026-07-11 sprint-405 | `9c054a60` 2026-04-21 sprint-150 | `.deckent` implementation-intent kuralı da içeriyor (`score:6, intent.primary=implementation`), builtins'te yok | **Alperen'in çağrısı** — builtins 3 ay eski (sprint-150), muhtemelen `.deckent` daha güncel ama davranış-değişikliği gözden geçirilmeli |
| `architecture-planner` | `2b75e807` 2026-07-11 | `9c054a60` 2026-04-21 | `.deckent`: `intent.primary=architecture` kuralı; builtins: `domains.$contains=architecture` kuralı (farklı eşleşme şekli) | **Alperen'in çağrısı** — anlam kayması (intent vs domain eşleşmesi), rastgele seçim değil |
| `data-engineer` | `2b75e807` 2026-07-11 | `9c054a60` 2026-04-21 | `.deckent`: 2 ayrı kural (db-domain=8, migration-intent=6); builtins: TEK birleşik kural (db-domain VE implementation-intent ikisi de gerekli=10) — builtins çok daha DAR eşleşiyor | **Alperen'in çağrısı** — builtins'in dar kuralı muhtemelen istenmeyen bir daralma (migration-intent-only görevler artık data-engineer'ı hiç tetiklemez) |
| `integration-engineer` | `5ea71738` 2026-07-10 born-601 | `70fe74be` 2026-07-03 sprint-361 | `.deckent`: tek `$or` kuralı (connectors/messaging/integrations hepsi=8); builtins: 3 ayrı kural, farklı skorlar (8/8/6) | **Alperen'in çağrısı** |
| `refactorer` | `2b75e807` 2026-07-11 | `9c054a60` 2026-04-21 | `.deckent` ek olarak `intent.primary=implementation, score=7` kuralı içeriyor, builtins'te yok | **Alperen'in çağrısı** — builtins daha dar |
| `terminal-ux-engineer` | `2b75e807` 2026-07-11 | `70fe74be` 2026-07-03 | `.deckent`: tek `$or` kuralı (terminal-ui/cli hepsi=6); builtins: 2 ayrı kural (terminal-ui=8, cli=6) | **Alperen'in çağrısı** |

## 5. skill manifest.json İçerik-Farkı (5)

| Öğe | `.deckent` son commit | `builtins` son commit | Fark | Öneri |
|---|---|---|---|---|
| `code-simplifier` | `2b75e807` 2026-07-11 | `9c054a60` 2026-04-21 | `activation.rules` farklı (agent grubuyla aynı desen) | **Alperen'in çağrısı** |
| `database-migration` | `2b75e807` 2026-07-11 | `9c054a60` 2026-04-21 | `activation.rules` farklı | **Alperen'in çağrısı** |
| `git-expert` | `2b75e807` 2026-07-11 | `9c054a60` 2026-04-21 | `activation.rules` farklı | **Alperen'in çağrısı** |
| `monorepo-expert` | `2b75e807` 2026-07-11 | `9c054a60` 2026-04-21 | `activation.rules` farklı | **Alperen'in çağrısı** |
| `secure-coding` | `2b75e807` 2026-07-11 | `2b75e807` 2026-07-11 (**aynı commit, hâlâ farklı**) | Sadece `entrypoint: "SKILL.md"` alanı — `.deckent`'te VAR, builtins'te YOK. `skill-pool.ts`'nin kendi yorumu bunu doğruluyor ("at least one shipped manifest (secure-coding) omits a required field"). | **MERGE: builtins ← .deckent önerilir** — `entrypoint` muhtemelen skill-loader'ın hangi dosyayı enjekte edeceğini bulmasında kullanılıyor; eksikliği üretimde gerçek bir işlevsellik kaybı riski. **RED-önce kanıt dosyası** — bkz. test suite'in son `describe` bloğu. |

## 6. skill manifest.json Presence-Mismatch — Küratörlü Manifest Kaybı (2)

Bkz. §0.2: fallback bugün "çalışıyor" ama generic/inert bir manifest üretiyor — gerçek küratörlü
ayar (`priority`, gerçek `triggers`, özel `activation.rules`) üretime hiç ulaşmıyor.

| Öğe | `.deckent` son commit | builtins | `.deckent`'teki küratörlü ayar (kaybolan) | Öneri |
|---|---|---|---|---|
| `api-design` | `2b75e807` 2026-07-11 sprint-405 | manifest.json YOK (SKILL.md var) | gerçek `triggers`, özel `activation.rules`, tuned `priority` | **MERGE: builtins ← .deckent** — end-user üretim kopyası bugün generic fallback alıyor |
| `i18n-quality` | `ae84a4f9` 2026-07-10 born-589..593 | manifest.json YOK (SKILL.md var) | aynı desen | **MERGE: builtins ← .deckent** |

## 7. Agent PROMPT.md — Sadece doc-tracking Frontmatter Farkı (10)

Gövde metni **birebir aynı** (frontmatter çıkarıldıktan sonra doğrulandı) — tek fark builtins'in
taşıdığı `doc_rank`/`status`/`last_updated`/`content_hash` bloğu (bkz. §0.3). Kozmetik, ama script
bunu "aynı" saymadı — doğru davranış.

| Öğe | `.deckent` son commit | `builtins` son commit |
|---|---|---|
| `accessibility-auditor` | `d642c482` 2026-04-06 | `238f9e02` 2026-06-19 |
| `api-builder` | `8365c0e2` 2026-03-22 | `238f9e02` 2026-06-19 |
| `architect` | `42b1d493` 2026-07-08 | `238f9e02` 2026-06-19 |
| `architecture-planner` | `5ed4d301` 2026-04-06 | `238f9e02` 2026-06-19 |
| `code-reviewer` | `42b1d493` 2026-07-08 | `238f9e02` 2026-06-19 |
| `data-engineer` | `d642c482` 2026-04-06 | `238f9e02` 2026-06-19 |
| `doc-writer` | `42b1d493` 2026-07-08 | `238f9e02` 2026-06-19 |
| `frontend-designer` | `d642c482` 2026-04-06 | `238f9e02` 2026-06-19 |
| `performance-analyzer` | `8365c0e2` 2026-03-22 | `238f9e02` 2026-06-19 |
| `security-auditor` | `ec91a409` 2026-07-01 | `ec91a409` 2026-07-01 (**aynı commit**, yine de frontmatter builtins'te var / .deckent'te yok) |

**Öneri (10'u da):** MERGE gerektirmiyor — frontmatter builtins-özel bir doc-health mekanizması,
`.deckent`'e eklenmesi gerekmiyor (kapsam dışı, `.deckent` zaten izlenmiyor). Bilgi amaçlı
"drift" olarak grandfather edilmesi (baseline'a alınması) yeterli.

## 8. Agent PROMPT.md — Frontmatter + GERÇEK Gövde Drift'i (5)

Bunlar §7'den farklı: frontmatter bloğunun YANINDA gövde metninde de gerçek, bağımsız düzenlemeler
var — iki yönlü (bazı satırlarda `.deckent` daha güncel, bazılarında builtins daha güncel).

| Öğe | `.deckent` son commit | `builtins` son commit | Gövde farkı |
|---|---|---|---|
| `bug-fixer` | `42b1d493` 2026-07-08 (prompt-revamp/F1.1) | `ec91a409` 2026-07-01 | `.deckent` verify-adımını "targeted test file(s)... treat pre-existing unrelated failures as out of scope" olarak netleştirmiş; builtins hâlâ eski/genel "project-configured verify scope" ifadesini taşıyor — **`.deckent` daha güncel** |
| `ci-guardian` | `ec91a409` 2026-07-01 | `ec91a409` 2026-07-01 (**aynı commit**) | builtins'te fazladan bir `<!-- ci-context -->` HTML yorumu var, `.deckent`'te yok — kozmetik, anlamsız |
| `devops-engineer` | `d642c482` 2026-04-06 | `708a72a1` 2026-06-20 (ADR-001-W Node-24 sweep) | `.deckent`: "Node.js versions (18.x, 20.x, 22.x)" (BAYAT); builtins: "(24.x, 26.x)" — **builtins daha güncel** (ters yön!) |
| `migration-specialist` | `ec91a409` 2026-07-01 | `708a72a1` 2026-06-20 | İKİ ayrı fark: (a) verify-adımı ifadesi — `.deckent` daha güncel (aynı §bug-fixer deseni); (b) Node örneği "18→20" (`.deckent`, BAYAT) vs "22→24" (builtins, daha güncel) — **karışık, dosya-içi bile iki yönlü** |
| `refactorer` | `bd993e34` 2026-07-08 (prompt-revamp/LP-9) | `bd993e34` 2026-07-08 (**aynı commit**) | `.deckent` verify-adımını netleştirmiş (targeted-test ifadesi), builtins eski genel ifadeyi koruyor — **`.deckent` daha güncel** |

**Öneri (5'i de): Alperen'in çağrısı, satır-satır MERGE gerekebilir** (basit bir yönde kopyalama
YETMEZ — `migration-specialist` ve `devops-engineer` gösteriyor ki builtins bazı yerlerde
`.deckent`'ten DAHA güncel; kör bir "`.deckent` kazanır" kopyası Node-24 düzeltmesini geri
alır). Önerilen yaklaşım: bu 5 dosya için elle 3-way review (frontmatter hariç, gövde satır-satır).

## 9. Skill SKILL.md — Sadece doc-tracking Frontmatter Farkı (21)

Aynı §0.3/§7 deseni — gövde metni birebir aynı, doğrulandı (frontmatter çıkarıldıktan sonra).

| Öğe | `.deckent` son commit | `builtins` son commit |
|---|---|---|
| `accessibility-expert` | `8efcf2b8` 2026-06-04 | `238f9e02` 2026-06-19 |
| `anthropic-sdk` | `8efcf2b8` 2026-06-04 | `238f9e02` 2026-06-19 |
| `api-builder` | `c5bde9c8` 2026-05-24 | `238f9e02` 2026-06-19 |
| `ci-testing` | `8efcf2b8` 2026-06-04 | `238f9e02` 2026-06-19 |
| `code-simplifier` | `8efcf2b8` 2026-06-04 | `238f9e02` 2026-06-19 |
| `database-migration` | `8efcf2b8` 2026-06-04 | `238f9e02` 2026-06-19 |
| `devops-engineer` | `8efcf2b8` 2026-06-04 | `238f9e02` 2026-06-19 |
| `docker-expert` | `8efcf2b8` 2026-06-04 | `238f9e02` 2026-06-19 |
| `documentation-writer` | `8efcf2b8` 2026-06-04 | `238f9e02` 2026-06-19 |
| `frontend-design` | `8efcf2b8` 2026-06-04 | `238f9e02` 2026-06-19 |
| `git-expert` | `45927662` 2026-06-13 | `238f9e02` 2026-06-19 |
| `graphql-expert` | `8efcf2b8` 2026-06-04 | `238f9e02` 2026-06-19 |
| `migration-expert` | `45927662` 2026-06-13 | `238f9e02` 2026-06-19 |
| `monorepo-expert` | `8efcf2b8` 2026-06-04 | `238f9e02` 2026-06-19 |
| `performance-optimizer` | `8efcf2b8` 2026-06-04 | `238f9e02` 2026-06-19 |
| `python-expert` | `8efcf2b8` 2026-06-04 | `238f9e02` 2026-06-19 |
| `react-specialist` | `c5bde9c8` 2026-05-24 | `238f9e02` 2026-06-19 |
| `security-specialist` | `c5bde9c8` 2026-05-24 | `238f9e02` 2026-06-19 |
| `system-architect` | `8efcf2b8` 2026-06-04 | `238f9e02` 2026-06-19 |
| `testing-expert` | `ec91a409` 2026-07-01 | `ec91a409` 2026-07-01 (**aynı commit**) |
| `typescript-expert` | `ec91a409` 2026-07-01 | `ec91a409` 2026-07-01 (**aynı commit**) |

**Öneri (21'i de):** §7 ile aynı — MERGE gerekmiyor, bilgi amaçlı grandfather.

## 10. Karar-Tablosu (Alperen için özet)

| Grup | Öğe sayısı | Önerilen aksiyon | Aciliyet |
|---|---:|---|---|
| §5 secure-coding `entrypoint` eksik | 1 | MERGE: builtins ← .deckent | **Yüksek** — üretimde işlevsellik riski (RED-önce kanıt) |
| §6 api-design / i18n-quality manifest kaybı | 2 | MERGE: builtins ← .deckent | **Yüksek** — küratörlü routing üretime hiç ulaşmıyor |
| §4 agent activation.rules drift | 6 | Satır-satır review, Alperen kararı | Orta — canlı routing davranışını değiştirir |
| §5 diğer skill activation.rules drift | 4 | Satır-satır review, Alperen kararı | Orta |
| §8 gövde-drift (verify-ifadesi + Node-versiyon) | 5 | 3-way manuel merge (kör kopya YETMEZ) | Orta — iki yönlü drift, otomatik çözülemez |
| §3 only-in-builtins (3 agent) | 3 | KORU — kasıtlı, aksiyon yok | Düşük |
| §3 only-in-builtins (observability skill) | 1 | Follow-up: küratörlü manifest yazılsın mı? | Düşük |
| §7 + §9 frontmatter-only | 31 | Grandfather (aksiyon yok) | Yok |
| §2 excluded (docs) | 1 | Yok — gerçek skill değil | Yok |

## 11. Follow-ups / Kapsam-Dışı Notlar

- **Baseline dosyası henüz yazılmadı.** `.deckent/builtins-drift-baseline.json` bu task'ın
  `scope.filesWrite` listesinde YOK — script `--write` ile bu dosyayı üretebilir ama bunu bu
  task içinde gerçek repo'ya karşı ÇALIŞTIRMADIM (kapsam-dışı bir dosya yazmış olurdum). Brain/
  Alperen, yukarıdaki karar-tablosunu gözden geçirdikten sonra `node scripts/builtins-drift-check.mjs
  --write` çalıştırıp baseline'ı pinlemeli — ancak MERGE kararları uygulanmadan pinlenirse, o
  MERGE'ler sonrasında ilgili anahtarlar "resolved" (bilgi amaçlı) düşecek, bu beklenen davranış.
- **`package.json` wiring yapılmadı** (kapsam dışı) — gate hazır olduğunda `"lint:builtins-drift":
  "node scripts/builtins-drift-check.mjs --check"` + `lint:gates` zincirine eklenmesi ayrı bir
  follow-up (package.json bu task'ın write-scope'unda değil).
- Bu envanterdeki tüm git-commit referansları `git log -1 --format='%h %ad %s' --date=short --
  <path>` ile üretildi (hem `.deckent` hem `src/core/builtins` tarafı için ayrı ayrı).
