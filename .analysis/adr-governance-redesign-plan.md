# ADR Governance Redesign — 4-Katman Taksonomi + DB/Index Restructure (PLAN)

> **Status:** PLAN — fork'lar Alperen-kararı bekliyor. **Backup ✓** `.brain/memory.db.backup-2026-06-29` (14.3MB, byte-birebir + WAL + SHM).
> **Tarih:** 2026-06-29 · **Kaynak:** Alperen yön (4-katman ADR) + `.analysis/adr-095-terminal-first-pivot-draft.md` + `docs/MASTER-PLAN.md`.
> İrreversibility: ADR'ler `.brain/memory.db`'de (SSOT) — değişim yalnız-Alperen-onayı; bu plan onay-kapılı ilerler.

## 1. 4-Katman ADR Taksonomisi (Alperen tasarımı)

| Sınıf | Ne | Kim yazar / besler | Değişir mi | Nereye gelir | Kim uyar |
|---|---|---|---|---|---|
| **ADR-G** (Global / Anayasa) | Deckent'in çekirdek işlev kanunları (worker/brain/auditor/nervous + tüm sistem). LLM'ler **ihlal edemez**. | **Yalnız yayımlayıcı, ana repodan** | **HAYIR** (immutable) | global kurulum + her proje kurulumu | dogfood **+** user (solo→enterprise, milyon-ölçek) |
| **ADR-D** (Dogfooding / Dev) | Deckent'in kendini-geliştirme kuralları (contributor'lar). | Yayımlayıcı + contributor | revize edilir (onaylı) | **dev kurulum** (`deckent@dev` / `upgrade @dev`) | deckent reposuna katkı sağlayanlar |
| **ADR-UG** (User Global) | Kullanıcının global ADR'leri (Windows/tüm-projeler). | **Kullanıcı** | kullanıcı yönetir | user global kurulum | deckent gözetir; worker/brain/auditor uyar |
| **ADR-UP** (User Project) | O projeye özel ADR'ler. | **Kullanıcı** | kullanıcı yönetir | proje kurulumu | deckent gözetir; worker/brain/auditor uyar |

**Davranış:** deckent kullanıldığı ortama göre **kendini evrimleştirir** — ADR-U'lara uymak için **customize tool'lar** geliştirir + ana repoya katkı sağlar. Kullanıcı ADR'lerini **native chat + desktop app + tüm ortamlardan** kolayca yönetir.

## 2. Mevcut ~89 ADR → G/D ayrımı (review'in özü)
Tüm mevcut ADR'ler deckent-internal → her biri **G** veya **D**'ye ayrılır. Önerilen kriter (review'de onaylanacak):
- **ADR-G = "deckent motoru ÇALIŞIRKEN nasıl davranır + LLM ne ihlal etmez"** (runtime/orchestration kontratı, güvenlik/RBAC, eval-bütünlüğü, memory-mimari, izolasyon, self-modify guard, capability/governance, nervous, approval, provider-nötrlük-davranışı, proof-of-function). **User'a da gelir, kullanıcıyı etkiler.**
- **ADR-D = "deckent NASIL İNŞA edilir"** (dil TS/ESM, module-resolution, test vitest, tek-runtime-dep, kod-yapısı/god-object-split/import-yönü, async-I/O & test-hermeticity, ADR-format konvansiyonu, CI-hermeticity). **Yalnız contributor'a gelir.**
- **Borderline** (review çözer): ADR-013 (DECKENT.md adapter), ADR-008 (Brain central import), ADR-022 (CLI/MCP parity), ADR-010 (tek-dep), ADR-029/030 (managed-docs) — gerekçeyle G/D atanır.

Her ADR için review çıktısı: `eski-no · başlık · özet · önerilen-sınıf(G/D)+gerekçe · pivot-çakışması?(EVET/HAYIR+neden) · evrim/nihaileşme-önerisi · önerilen-yeni-no`.

## 3. Numaralandırma (öneri — fork-3)
- **A (önerilen):** sınıf-içi yeniden-numara → `ADR-G-001..N`, `ADR-D-001..M` + **eski→yeni crosswalk** tablosu. Temiz anayasa; U sınıfları runtime'da doğar (boş başlar).
- **B:** eski-no + sınıf-prefix → `ADR-G-037`, `ADR-D-001` (eski numara korunur, daha az kopukluk).

## 4. Enforcement Sistemi (yeni iş — MASTER-PLAN'a)
- **ADR-G enforcement engine:** immutable + publisher-fed + **runtime validation/tool/kod-koruması** (LLM çıktısı ADR-G'yi ihlal edemez). Mevcut temel: auditor `checkADRCompliance` (advisory) + `authority-matrix` + ADR-094 flag-gated enforcement → bunları **hard, layered** yap.
- **ADR-U yönetimi:** kullanıcı create/edit (native-chat/desktop/CLI/MCP); deckent ADR-U'ya göre **customize tool** üretir.
- **Install wiring:** global-install + project-install ADR-G'yi seed eder; `@dev` install ADR-D'yi ekler; user-install ADR-UG/UP iskeletini açar.
- **Katman çözümü (precedence):** ADR-G (immutable) > ADR-UG/UP (user) > ADR-D (dev) — çakışmada G kazanır; user, deckent-G'yi ihlal edemez ama kendi katmanını sıkılaştırabilir.

## 5. memory.db Schema/Index Restructure (KARAR GEREKİYOR — fork-1)
- **A (önerilen):** **better-sqlite'ı evrimleştir** — `entries`'e `adr_class`(G/D/UG/UP) · `scope`(global/project) · `immutable` · `source`(publisher/user) · `enforcement_level` ekle; **FTS5 koru** (class/scope-aware recall + index rebuild); **vector katmanı sonra opt-in** (`sqlite-vec`, local-embedding Ollama, never-calls-home). → ADR-010 (tek-dep) + SQLite-kalır + never-calls-home moat **korunur**.
- **B:** **Vector DB'ye geç** (LanceDB/Chroma/Qdrant-embedded) — semantik recall güçlü, ama **yeni runtime-dep (ADR-010 gerilimi)** + migration riski + never-calls-home için local-embedding şart.
- **C:** **Hibrit** — better-sqlite ana SSOT + ayrı local-vector-index şimdi (iki-store senkron yükü).
- _Not: schema migration deckent better-sqlite3 ile kod-içi yapılır; backup bunu korur._

## 6. Fazlı Plan (adım adım)
- **Faz 0 ✓** memory.db backup (bugün-tarihli, doğrulandı).
- **Faz 1** Tüm ~89 ADR'yi oku+analiz et → tek reviewable tablo (sınıf/çakışma/evrim/yeni-no). Paralel ajanlar. _(framework-confirm sonrası)_
- **Faz 2** Alperen review/ayar (G/D atamaları + çakışma kararları — onaylı, irreversible).
- **Faz 3** Implement: schema migration (memory.db) + renumber + re-export (`.brain/exports` + `docs/adr`) + index rebuild + crosswalk. _(build + `/mcp restart` gated)_
- **Faz 4** Enforcement engine + ADR-U yönetimi + install-wiring → MASTER-PLAN kalemleri (GOV pillar).

## 7. Fork'lar (Alperen kararı → sonra Faz 1)
1. **DB stratejisi:** A (sqlite-evrim, önerilen) / B (vector-migrate) / C (hibrit).
2. **Review teslim:** tam-deliverable (önerilen) / etaplı-batch / tek-tek-interaktif.
3. **Numaralandırma:** sınıf-içi-renumber+crosswalk (önerilen) / eski-no+prefix.
