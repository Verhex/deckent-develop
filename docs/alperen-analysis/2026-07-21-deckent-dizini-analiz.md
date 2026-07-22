# 2026-07-21 — `.deckent/` Dizini Kapsamlı Analiz (kim okur · kim yazar · ref-haritası)

> **Amaç:** Repo-temizlik programının `.deckent/` ayağı — proje-state dizininin TÜM girdileri için
> amaç + YAZAN + OKUYAN + git-track durumu + canlılık. İş-planı Alperen bu dokümandan çıkaracak.
> **Yöntem:** disk-envanteri (du/find/mtime) + 3 bağımsız keşif (kod-tüketici haritası ·
> kök-dosya içerik-peek · büyük-dizin derinlemesi) + yük-taşıyan iddialarda el-teyidi.
> **Yalnız analiz — aksiyon yok; kararlar Alperen'den.** Kardeş-defter:
> `2026-07-21-dokuman-temizlik-karar-tablosu.md` (#15).

---

## 0. Genel resim

- **Toplam: 306MB / ~51 kök-girdi.** Boyutun ~%95'i beş kaynakta: `traces/` 140M · `archive/` 73M ·
  `recently-works/` 31M · `settings/` 21M (tamamı tek log) · `runtime/` 20M.
- **Path-mimarisi:** merkezî enumerated path-modülü YOK. `src/core/state-paths.ts` yalnız kök-resolver
  (`DECKENT_HOME` > `<root>/.deckent` > `~/.deckent`); alt-yol sabitlerinin çoğu `src/core/constants.ts:7-53`,
  geri kalanı serbest `join(root,'.deckent',...)`. state-paths'in KENDİ dokümanı "~150 call-site hâlâ
  hardcode" diyor — migration yarım.
- **Git-track profili:** bilinçli-tracked küme (agents 48 · skills 112 · docs/core-memory 14 ·
  workspace 4 · i18n 2 · settings 5 + 7 tekil dosya) + **kazara-tracked anomalisi** (`runtime/` 113 dosya —
  §4.1) + ignore-inert çakışmaları (§4.2).

## 1. DİZİNLER (24) — amaç / yazan / okuyan / track / canlılık

| alt-yol | boyut | amaç | YAZAN | OKUYAN | tracked? | canlılık |
|---|---|---|---|---|---|---|
| `agents/` | 416K / 50 | built-in+temp agent manifest/PROMPT (24 dizin) | `agent-manifest-sync.ts:22`, `agent-prompt-sync.ts:23` | `agent-pool.ts`, `mcp/tools/agent-list.ts`, `lint-manifests.mjs` | **E (48)** — bilinçli; ignore yalnız `temp-*/` | CANLI (07-18); `src/core/builtins/agents` (21) kurulu-kopyası + `archive/` + 2 `temp-*` fazlası |
| `skills/` | 696K / 112 | built-in+kurulu skill'ler (31 dizin, SKILL.md+manifest) | `skill-pool.ts:513,528` | `skill-pool.ts:320`, `skill-marketplace.ts:66` | **E (112)** — bilinçli | CANLI (07-10); builtins/skills (31) ile birebir |
| `settings/` | **21M** / 6 | config-yakını JSON'lar + resource-log | `session-registry.ts:27`, `tool-schema-override.ts:78`, resource-log emitter | `cost-config-loader.ts:414`, managed-docs (docs.json) | KISMÎ (5) | CANLI; **21M'in tamamı `resource-log.jsonl`** (98.025 satır, 06-10→07-20, rotasyonsuz) |
| `runtime/` | 20M / 1999 | ephemeral per-run state: `jobs/` 8.2M·463d · `evaluations/` 6.3M·1424d (sprint-162→455) · `scheduler-shadow/` 4.1M · `run-flow-store/` · `tool-inventory/` · `decisions/` | `api/server.ts:1960`, `task-builder.ts:1833`, `scheduler-journal.ts:18` | `run-flow-inbox.ts`, `run-state-feed.ts:69`, `scheduler-shadow-retention.ts:32` | **KISMÎ (113) — ANOMALİ §4.1** | CANLI ama budamasız: `evaluations/sprint-<400` **111 donmuş dizin**, `jobs/` sprint-095'e (May-12) dek eski descriptor |
| `routing/` | 11M / 401 | routing öğrenme-state: `learnings.json` 216K · `evolved-rules.json` · `vocabulary.json` · `outcomes/` 352d (sprint-068→455) · `decisions/` 44d · `decisions-v3/` 1d | `rule-evolver.ts:202`, `sprint-spawner.ts:145`, `routing/journal.ts:18` | `api/server.ts:980`, `routing-distribution.mjs:71` | H (gitignore:52) | CANLI (learnings 07-20); **`outcomes/sprint-<400` = 298 donmuş dosya** |
| `nervous/` | 1.4M / 267 | Nervous System runtime (ADR-040): 5 kök-log + `nervous-ipc/` 178d + `panic-ipc/` 84d | `NERVOUS_*` (constants:39-44), `action-handlers.ts`, `observer.ts` | `observer.ts:79`, `mcp/tools/nervous.ts:32`, `cli/commands/nervous.ts` | H | CANLI; **birikim: `nervous-ipc/resolved` 178 (temizlenmemiş) + `panic-ipc/pending` 69 dosya 06-07'den beri STUCK** |
| `autonomous/` | 96K / 7 | autonomous-mode state: `autonomous.db`(+shm/wal) · backlog/pending/decisions.json · reactive-inbox | `cli/commands/autonomous.ts:78`, `api/autonomous-endpoint.ts:42`, `reactive-endpoint.ts:40` | `process.ts:29`, `orchestra/autonomous/runtime-loop.ts` | KISMÎ (2: db+decisions) | KARIŞIK — db canlı (shm 07-20); `backlog.json` 06-19 donmuş, pending/decisions **boş (3B)** |
| `prompts/` | **8.5M** / 1 | tek dosya: `injection-audit.jsonl` — ADR-recall/prompt-injection audit (22.473 satır, 07-01→07-20) | `task-builder.ts:42` (append) | aynı store | H (gitignore:221) | CANLI, rotasyonsuz |
| `i18n/` | 20K / 2 | init-scaffold locale (en/tr.json) — kullanıcı-editable | `init-steps.ts:563-564` (writeIfNotExists) | **grep=0** (runtime i18n compiled-in: `messages.ts`) | **E (2)** | BAYAT (05-22/26); okuyan yok |
| `docs/core-memory/` | 68K / 15 | kalıcı-kanun/feedback md mirror (MEMORY.md + law_* + feedback_*) | **`scripts/sync-core-memory.mjs`** (el-teyit — ajanın "orphan" iddiası ÇÜRÜDÜ) | `sync-to-product.mjs`, `tests/cli/at-ref.test.ts`, test | **E (14)** | CANLI (07-21 bugün) |
| `workspace/` | 28K / 4 | worker-onboarding: IDENTITY.md (CLAUDE.md @-import!) · TOOLS · BOOT · WORKER-GUIDE | `mcp/tools/init.ts:178-179`, init-steps | `agent/identity.ts:61`, `stack-detector.ts:218` | **E (4)** | CANLI (IDENTITY 07-20) |
| `plugins/` | 40K / 7 | plugin drop-in (code-reviewer/doc-writer/test-runner ×{manifest+SKILL}) | init (dizin), `plugin-loader.ts` | `plugin-loader.ts` | yalnız `.gitkeep` | BAYAT — manifest'ler 05-12 (70 gün) |
| `archive/` | **73M** / 2568 | sprint-arşivi: `sprints/` 299 × `sprint-NNN/` (134→445; 6-dosya set, tarball'lı) + `metrics/` (444→455 .gz) | sprint-finalizer/retention | `backfill-sprint-log-rows.mjs:391` | H (gitignore:38,204) | metrics-ucu canlı; **sprint-134…~399 tamamı donmuş; 278 tarball = 53M** |
| `recently-works/` | **31M** / 82 | pre-archive staging: sprint-446→455 setleri + `autonomous-events.jsonl` | `RECENT_WORKS_DIR` (constants:53), finalizer | `audit.ts:229,241`, autonomous | H (gitignore:100) | CANLI; **`autonomous-events.jsonl` 19.3M / 56.920 satır, 06-19'dan beri DONMUŞ = dizinin %62'si** |
| `recovery-snapshots/` | 896K / 2 | cleanup-öncesi onaylı tam-yedek (sprint-454 tar.gz + sha256) | **kod-yazıcı bulunamadı (grep=0; el-teyitli)** — muhtemel operatör/CC-oturumu adımı | yalnız `ci-sim-snapshot.mjs:9` state-listesi | H | en-son-tek-snapshot deseni (07-20); birikim yok |
| `traces/` | **140M** / 5 | training/chat trace: `sprint-worker.jsonl` **89.5M** (07-11→20, canlı) · `extracted-general` **42M** + `extracted-aligned` **11.8M** (06-14 DONMUŞ) · 2 chat (07-07) | `agent/trace-recorder.ts` | `cli/repl/run.tsx:974`, `extract-traces.mjs:46` | H (gitignore:79) | KARIŞIK — tek başına `.deckent`'in %46'sı; extracted-çifti 53.8M salt yük |
| `stats/` | 20K / 2 | catalog-stats.json + routing-cells.json (öğrenme sidecar) | `agent-pool.ts:440`, `skill-pool.ts:236`, `learning-cells.ts:40` | aynı modüller | H (gitignore:229) | CANLI (sprint-455 referanslı) |
| `crashes/` | 20K / 4 | crash-log: 3× `write EPIPE` (07-07/08) + 1× `EADDRINUSE :3179` (07-18) | `error-handler.ts:116` | **grep=0** (operatör-okur) | H | yarı-canlı; incelendi → silinebilir-aday |
| `cache/` | 8K / 1 | `managed-docs-cache.json` (ADR-031 doc-runner hash cache) | `doc-cache.ts:12` (+ pricing global ~/.deckent) | aynı | H (gitignore:78) | CANLI (dosya 07-20; dizin-mtime 05-12 yanıltıcı) |
| `pids/` | boş | per-sprint pid dosyaları | `sprint-pid-manager.ts:43`, `finalize.ts:315` | `orphan-cleaner.ts:283,293` | H | BOŞ = temiz (rotasyon çalışıyor) |
| `approvals/` | boş | approval-store CAS kayıtları | `approval-store.ts:234`, `approval-masking.ts:26` | aynı store | H (gitignore:222) | BOŞ |
| `artifacts/` | boş | chat capability artifact'ları | `connectors/capabilities/artifacts.ts:26` | aynı | H | BOŞ |
| `bot-actions/` | boş | bot action store | `bot-action-store.ts:114` | aynı | H | BOŞ |

## 2. KÖK DOSYALAR (~26) — amaç / tüketici / canlılık

| dosya | boyut·mtime | amaç + tüketici | canlılık |
|---|---|---|---|
| `config.json` | 9.1K · 07-20 | ana config (`last_sprint_id: sprint-455`, canonical model-ID'ler, openrouter bloğu). Yazan `core/config.ts`; okuyan config/cli/mcp/nervous | **CANLI** |
| `config.json.bak.{07-12,07-19,07-20}` | 3×~9K | migration-öncesi timestamped yedek — `config-migration.ts:314` üretir + kendi rotasyonu var (:359-369). Diff: sprint-430/449/452 geride + **kısa→canonical model-ID migration'ı 07-20 08:58-14:29 arasında olmuş** + openrouter/log_path yeni | 3'ü de BAYAT-yedek |
| `cost-config.json` | 15K · 07-02 | pricing baseline (ADR-033 offline-first; `_last_updated: 2026-04-15` bundled). `cost-config-loader.ts` okur | CANLI (tracked) |
| `settings.local.json` | 124B · 07-06 | chat-permission allow-list; `chat-permissions.ts:24` | CANLI |
| `DIRECTIVES-features.md` | 11K · 06-26 | tamamlanmış tek-seferlik "20 feature-sunum dokümanı" direktifi; **kod-tüketicisi grep=0, yine de tracked** | **ORPHAN-ADAY** |
| `HEARTBEAT.md` | 92B · 06-26 | heartbeat checklist (tsc+vitest); `heartbeat-daemon.ts:18` OKUR (operatör-yazar) | statik-canlı |
| `sprint-428/429-tool-inventory.txt` | 2×29B · 07-12 | LEGACY yol (`sprint-phases.ts:900`); yeni canonical `runtime/tool-inventory/`. İkisi **bayt-özdeş duplicate** | BAYAT artık |
| `sprint-436/446/454-checkpoint-seq` | 1B'lik sayaçlar | `sprint-checkpoint.ts:148` yazar; `sprint-file-retention.ts:49` temizler — 436/446 retention'dan kaçmış | 436/446 BAYAT |
| `identity.db` (+shm/wal) | 20K · 06-27 | sosyal-connector kimlik SQLite (ADR-092; `pending_verify`+`social_identity`); `connector-bootstrap.ts:630` | idle (WAL boş) |
| `audit-key` | 64B · **05-20** | terminal audit-integrity HMAC key (`audit-integrity.ts:69` yoksa üretir) | statik secret |
| `.keyring` | 65B · 06-01 | credential-encryption master-key (`credential-encryption.ts:27`) | statik secret |
| `pause-state.json` | 218B · 07-14 | sprint-pause durumu (`sprint-utils.ts:40`) — **hâlâ sprint-436 "paused" diyor, sistem 455'te** | BAYAT-çelişik |
| `run-gate.json` | 357B · **05-12** | gate-sonucu snapshot'ı — **kod-tüketicisi grep=0 (el-teyitli) + TRACKED + içeriği bugünle çelişik** (`metricsJsonlExists:true, lineCount:3` derken metrics.jsonl 0B) | **ORPHAN + tutarsız** |
| `truth-baseline.json` | 186B · 07-11 | half-wire truth ratchet (born-640b); `truth.ts:42` yazar, `mcp/tools/truth.ts:31` okur | CANLI |
| `ground-truth-overrides.json` | 42B · **05-22** | auditor override whitelist — `auditor.ts:1022`, `planner.ts:1525`, `task-builder.ts:730` OKUR; içerik boş `[]`, 60 gündür hiç kullanılmamış | tracked, boş |
| `project-stack.json` | 1.3K · 07-19 | stack-detect cache (`stack-detector.ts:9`) | CANLI |
| `provider-cache.json` | 186B · 07-20 | provider discovery cache (`start.ts:45`) | CANLI |
| `builtins-drift-baseline.json` | 2.3K · 07-14 | builtins↔`.deckent` kopyası drift-ratchet'ı (`builtins-drift-check.mjs`; testli) | CANLI |
| `capability-audit.jsonl` | 149B · 06-28 | capability audit-log — **tek satır** (06-28 screenshot); yazan `capabilities/execute.ts:14`, okuyan grep=0; **jsonl-runtime-log olmasına rağmen tracked** | yarı-orphan |
| `metrics.jsonl` | **0B** · 07-20 | METRIC_EMIT sink; `audit.ts:450` okur, `observer.ts:79` noise-filtreler | boşaltılmış (bkz. §4.5) |
| `notify-log.jsonl` | 463K · 07-20 | notification file-sink (`notify-bootstrap.ts:30`) — **1703 satır, 06-05→07-20 (sprint-231→455)**; okuyan grep=0 | canlı ama rotasyonsuz |

## 3. Orphan-adaylar (el-teyitli) + tek-yönlüler

**Tam orphan (kod ne yazar ne okur):**
1. `DIRECTIVES-features.md` — grep=0; tamamlanmış iş-spec'i; **tracked**.
2. `run-gate.json` — grep=0; **tracked** (gitignore `*-gate.json`:141 düz adı kapsamıyor → sızmış).
3. `recovery-snapshots/` — yazıcı-literal grep=0 (`recovery-snapshots`/`owner-approved`/`pre-cleanup`
   src+scripts'te yok); tek anış ci-sim state-listesi. Muhtemel operatör/CC-adımı; tek-snapshot deseni zararsız.

**Düzeltme (Kanun-3):** keşif-ajanının "`docs/core-memory` orphan" iddiası **YANLIŞ** çıktı — el-teyit:
`scripts/sync-core-memory.mjs` (+testi) yazar, `sync-to-product.mjs` + `tests/cli/at-ref.test.ts` tüketir.
Ajanın grep'i yalnız `src/` kapsıyordu.

**Tek-yönlü (yarı-orphan; bilgi-notu):** `HEARTBEAT.md` + `ground-truth-overrides.json` (yazan=operatör) ·
`crashes/` + `capability-audit.jsonl` + `notify-log.jsonl` (okuyan yok) · `i18n/` (init-scaffold, okuyan yok).

## 4. Anomaliler ve tutarsızlıklar

1. **`runtime/` altında 113 kazara-tracked dosya** — 75 `evaluations/` + 38 `scheduler-shadow/`; ikisi de
   `23b595b0` "FAZ 3 runtime/ purpose-folder" commit'inde `create mode` ile girmiş. `evaluations/` için
   `.gitignore:116` kuralı AYNI commit'te eklendi ama gitignore tracked-dosyayı etkilemez (**ignore-inert**);
   `scheduler-shadow/` için kural hiç yok. Dizin tasarımca "ephemeral/never tracked" → track niyet-dışı.
2. **İkinci ignore-inert:** `settings/docs.json` — gitignore:94'te ignore ama tracked.
3. **`run-gate.json`** — orphan + tracked + içerik bugünle çelişik (§2).
4. **`pause-state.json`** — sprint-436 pause'unu (5-ardışık-NO_GO cost-önlemi, 07-13) hâlâ taşıyor; sistem 455'te.
5. **`metrics.jsonl` 0B** ama run-gate `lineCount:3` diyor → truncate edilmiş; run-gate bayat.
6. **`sprint-428` = `sprint-429` tool-inventory** bayt-özdeş duplicate; legacy-yol (canonical: `runtime/tool-inventory/`).
7. **`nervous/panic-ipc/pending` 69 dosya 06-07'den beri STUCK** (asla resolve edilmemiş);
   `nervous-ipc/resolved` 178 dosya silinmeden birikmiş.
8. **Rotasyonsuz append-log'lar (4):** `settings/resource-log.jsonl` 21.7M/98K satır ·
   `traces/sprint-worker.jsonl` 89.5M/280 satır (satır başına ~300KB transcript!) ·
   `prompts/injection-audit.jsonl` 8.9M/22.5K · `notify-log.jsonl` 463K/1703.
9. **state-paths migration yarım** — ~150 call-site hardcode `join(root,'.deckent')` (modülün kendi notu).
10. **`routing/decisions-v3/` neredeyse boş** (1 dosya, 72K) — V3 shadow-decision biriktirme fiilen dolmamış
    (routing-v3 ana-motor olduğu hâlde; Alan-1 analiziyle birlikte okunmalı).

## 5. Şişkinlik + temizlik-aday alt-kümeler

> **✅ Karar-turu (Alperen 2026-07-21):** T1 **SİL** · T2 **buda** · T3 OK · T4 **SİL** · T5-T12 OK.
> **T2 parametre-cevabı:** `sprint_file_retention.keep_last_n` config-default **10** (`config.ts:1531`;
> modül-fallback 2) VAR — ama yalnız `recently-works` staging→arşiv taşıma-penceresini yönetir;
> `archive/sprints/`in kendisini budayan mekanizma YOK (bu yüzden 299 sprint birikti) → arşiv-budama
> **yeni policy** gerektirir, T10 rotasyon-born ailesine eklendi. **Yalnız-dokümantasyon; iş sonra.**

| # | Aday | Kazanç | Kanıt/Not |
|---|---|---|---|
| T1 | `traces/extracted-general.jsonl` + `extracted-aligned.jsonl` | **53.8M** | 06-14'ten beri donmuş training-extract; üretici `extract-traces.mjs` durur, yeniden üretilebilir |
| T2 | `archive/sprints/sprint-134…~399` (eski sprint'ler; özellikle 278 tarball=53M) | ~40-50M | tamamı donmuş (May–Haz); politika-kararı: kaç sprint geriye tutulur? |
| T3 | `settings/resource-log.jsonl` rotasyon/truncate | ~21M | 98K satır/40 gün; `cost-config-loader.ts:414` OKUYUCUsu var → kör-truncate değil, rotasyon-politikası |
| T4 | `recently-works/autonomous-events.jsonl` | **19.3M** | 06-19'dan donmuş; canlı sprint-akışıyla ilgisiz |
| T5 | `runtime/evaluations/sprint-<400` (111 dizin) + `runtime/jobs/` eski descriptor'lar (sprint-095'e dek) | ~5-10M | budama-politikası yok; retention modülü var (`scheduler-shadow-retention.ts` benzeri desen genişletilebilir) |
| T6 | `routing/outcomes/sprint-<400` (298 dosya) | ~3M | donmuş; öğrenme learnings.json'a damıtılmış durumda |
| T7 | `nervous/` IPC hijyeni: panic-pending 69 STUCK incele+kapat · nervous-resolved 178 buda | küçük ama sağlık | stuck-pending işlev-sorunu da olabilir (neden resolve edilmemiş?) |
| T8 | Kök bayat-dosya süpürmesi: 3× config.bak · sprint-428/429-inventory · 436/446-checkpoint-seq · pause-state · capability-audit tek-kayıt · crashes 4 log | ~50K (hijyen) | hepsi içerik-incelemeli, üstte gerekçeli |
| T9 | **Git-hijyen dilimi:** `runtime/` 113 dosya untrack (`git rm --cached`) + `settings/docs.json` karar (ignore'u mu kaldır, track'i mi?) + `run-gate.json` untrack+sil + `DIRECTIVES-features.md` karar | repo-temizliği | ignore-inert çifti kalıcı çözülür |
| T10 | Rotasyon-mekanizması (kalıcı çözüm): 4 rotasyonsuz log'a boyut/yaş-tavanlı rotasyon | tekrar-birikimi önler | ERRORS.md 600-satır-pencere deseni emsal; **born-adayı (temizlik değil, özellik)** |
| T11 | `prompts/injection-audit.jsonl` rotasyona dahil | 8.9M | T10 kapsamında |
| T12 | `plugins/` 3 örnek-plugin güncelliği (05-12 manifest) | — | silme değil güncellik-sorusu |

**Dokunma (CANLI):** `runtime/{jobs,evaluations}` son sprint'ler · `recently-works/sprint-45x-*` ·
`nervous/` kök-logları · `routing/{learnings,evolved-rules,vocabulary}.json` · `skills/`+`agents/`
(drift-ratchet'lı builtins-kopyası) · `stats/` · `workspace/` · `docs/core-memory/` · son recovery-snapshot.

## 6. Güvenlik yan-notu

Keşif sırasında bir alt-ajan `.keyring` + `audit-key` dosyalarının ilk baytlarını okudu (oturum-içi
görünürlük; bu dokümana secret İÇERİK yazılmadı). İki dosya da gitignore'lu lokal secret; ikisi de
"yoksa yeniden üret" desenli (`credential-encryption.ts:27`, `audit-integrity.ts:69`).
**✅ Alperen-kararı (2026-07-21): sorun değil — rotasyon GEREKSİZ; kayıt-amaçlı dokümante edildi, aksiyon yok.**
