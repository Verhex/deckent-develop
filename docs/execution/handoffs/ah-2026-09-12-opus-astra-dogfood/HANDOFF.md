# HANDOFF — dogfood go-live lane → Astra (epoch 6 → 7)

> **Bu dosya authority DEĞİLDİR.** Authority yalnız bu dizindeki receipt zincirindedir.
> `0001-prepared.json` · `receiptDigest: sha256:33799af0316545c0d25b633c69326fa1f8ab3bb7e16dfe7709d7a643592ee783`
> Bu dosya protokol §7'nin dokuz evidence grubunu taşır; receipt'i supersede etmez.
>
> Durum: **PREPARED** — authority hâlâ transferor'dadır. Astra `VERIFIED` yazana ve
> transferor `COMMITTED` üretene kadar devir OLMAMIŞTIR (protokol §3.1).

---

## 1. Identity + trigger

| | |
|---|---|
| from | `claude-code-cli` · provider `claude` · model `claude-opus-5` · role `supervisor` |
| to | `codex-cli` · provider `codex` · model `gpt-6-astra` · role `supervisor` |
| epoch | current **6** → proposed **7** (sayaç global; 3→4, 4→5, 5→6 emsalleriyle ölçüldü) |
| reasonCode | `OWNER_DIRECTIVE` — owner-live 2026-09-12 |
| authorityRef | `owner-live-instruction` |

Transferor'un authority'si receipt zincirinden değil, **Alperen'in canlı talimatından**
geliyordu (protokol §1.3 sıra-1: *"Alperen'in daha yeni canlı ve açık talimatı"*). Bu handoff
o ad-hoc grant'ı kapatıp zinciri yeniden receipt'e bağlar.

## 2. Authority scope

- **Outcome:** `RECOVERY-DO-DOGFOOD-001` (dogfood yürütme lane'i)
- **İş-akışındaki hedef:** MASTER satır 120 `STATE-RETENTION-001` (OPEN)
- **Goal/Mission/Flow/Run:** `n/a` — lane `deckent do` ile sürülüyor, kalıcı flow yok
- **Includes:** epoch-7 tek yürütücülük + aşağıdaki yedi openAction
- **Excludes:** owner-only kararlar (BULGU-M seçeneği, commit/push, predicate genişletmesi),
  **Cursor terminal lane'i (7099/7107)**, admit edilmemiş iş

## 3. Repo state

`branch=main` · `HEAD=ae87e8986` · dirty=**78 yol** · upstream: push YOK, commit YOK.

Dirty dosyalar iş-bazlı gruplanmıştır. **Bu oturumun sahiplendiği yalnız A ve B'dir.**

**A — bu oturumun motor düzeltmeleri (BUG-A…BUG-H)**

```
src/orchestra/model-selector.ts                      (BUG-G: Layer 1c tavan)
src/orchestra/planner.ts                             (BUG-H: 8 yutan catch)
src/orchestra/prompt-god-template.ts                 (BUG-F: worker result contract)
src/orchestra/production-wiring-host-proof-runner.ts (BUG-A: parseHarnessFailureReason)
src/orchestra/sprint-pid-manager.ts                  (BUG-C: dropSnapshot)
src/orchestra/sprint-finalizer.ts                    (BUG-C call-site)
src/orchestra/spawn-failure-authority.ts             (BUG-C call-site)
src/orchestra/sprint-recovery-operation.ts           (BUG-C call-site)
src/orchestra/sprint-runner-entry.ts                 (BUG-C call-site)
src/orchestra/sprint-controller.ts                   (BUG-D: sealed archive read)
src/core/sprint-archive.ts                           (BUG-D: readArchivedSprintTerminalOutcome)
src/core/config.ts                                   (BUG-E: planner memory profile)
src/core/config-types.ts                             (BUG-G: PlanModeConfig.max_tier) *
src/core/production-wiring-host-proof.ts             (BUG-B: metrics-retention identity)
scripts/production-wiring-host-proof-harness.mjs     (BUG-A/B: typed stderr + profil)
scripts/metrics-retention-host-proof-observer.mjs    (BUG-B: gözlemci)
DIRECTIVES.md                                        (harness sha256 × 30 tazelendi)
durum-raporu.md · follow-up-works/current-flow.md    (bulgu kaydı)

tests/orchestra/production-wiring-host-proof-failure-reason.test.ts   (YENİ, 13)
tests/orchestra/archived-sprint-terminal-disposition.test.ts          (YENİ, 11)
tests/orchestra/production-wiring-worker-result-contract.test.ts      (YENİ, 10)
tests/orchestra/model-selector-max-tier.test.ts                       (YENİ, 8)
tests/core/memory-read-planner-profile.test.ts                        (YENİ, 10)
tests/orchestra/sprint-pid-manager.test.ts                            (varsayılan ters çevrildi)
tests/orchestra/production-wiring-prompt.test.ts                      (assertion sıkılaştırıldı)
```

**B — sprint-747 worker'ının indirdiği efekt (elle yazılmadı; dogfood koşusu üretti)**

```
src/core/observability.ts              +67
src/core/observability-rotation.ts     +511
src/core/config-types.ts               +42   * (A ile AYNI dosya — iki yazar)
tests/core/observability.test.ts · observability-rotation.test.ts   (değiştirildi)
tests/core/observability-rotation-tenant.test.ts                    (YENİ, worker yazdı)
```

> `*` **Çakışma uyarısı:** `src/core/config-types.ts`'i hem worker (rotation policy bloğu)
> hem transferor (`max_tier`) değiştirdi. Commit ayrıştırılacaksa bu dosya tek dosyada iki
> ayrı iş taşıyor.

**C — Cursor terminal lane'i (BU OTURUMUN İŞİ DEĞİL, sahiplenilmiyor)**

`src/cli/repl/*` (14) · `tests/cli/repl/*` (12) · `src/core/terminal-workline-contract.ts` ·
`src/cli/helpers/message-catalog/cli-terminal-slash.ts` ·
`docs/design/DECKENT-TERMINAL-SINGLE-SURFACE.md` · `tests/cli/native-agent-bridge.test.ts`

**D — atfedilemeyen, önceden kirli** (Astra commit öncesi atıf yapmalı)

`src/agent/guards/shell-risk.ts` · `src/agent/identity.ts` · `src/cli/commands/start.ts` ·
`src/cli/helpers/messages.ts` · `src/orchestra/spawn-backend-docker.ts` ·
`scripts/gen-production-wiring-block.mjs` · `docs/SPRINT-LOG.md` · `tests/agent/shell-risk.test.ts`

## 4. Live runtime (yalnız disk kanıtı)

| yüzey | disk kanıtı | okuma |
|---|---|---|
| canlı sprint süreci | `.deckent/sprint-state.json` **YOK** | koşan sprint yok |
| `.tasks/` | yalnız 5 `.task-cas-*.previous` | aktif görev dosyası yok |
| sprint-747 görev artefaktı | `.deckent/archive/sprints/sprint-747/tasks/preserved/` (3 dosya) | `reason: "non-terminal"`, `restorePath: ".tasks"` |
| sprint-747 checkpoint | `.deckent/sprint-747-checkpoint.json` + `-seq` | korundu, `sha256:fb9825d1…` |
| sprint-747 arşiv terminal mührü | **yok** (`readArchivedSprintTerminalOutcome → null`) | 747 terminal DEĞİL |
| sprint-746 arşiv terminal mührü | `ABORTED` | 746 settle |
| PID snapshot | `.deckent/pids/sprint-747.snapshot.json` (03:55) | BUG-C canlı kanıtı |
| son run-flow | `6de757f8…` → `RUN_FAILED` @01:56:19Z, **`RUN_STARTED` yok** | worker'a hiç ulaşılmadı |

**Orphan şüphesi (açık etiketli):** `resume` çıktısı `w-747-001` worker'ını
`missing_file, yaş 92dk` ile bayat işaretledi. Süreç yok; `.pid` temizlenmiş, snapshot duruyor.

## 5. Approvals

`deckent approvals list` → **"Bekleyen onay isteği yok"**; federe kutu da boş.
Bu handoff sırasında hiçbir onay devralan adına verilmedi.

## 6. Verification

| sınıf | sonuç |
|---|---|
| LOCAL_VERIFIED | scoped vitest, bu oturumun 7 dosyası: **96/96 yeşil** |
| LOCAL_VERIFIED | model-selector ailesi (4 dosya): **41/41 yeşil** |
| LOCAL_VERIFIED | `npx tsc --noEmit` temiz |
| REMOTE_ADVISORY | çalıştırılmadı |
| **önceden kırmızı (benim değil)** | `planner-override-precedence` + `brain-planning-precedence` **9 kırmızı** — hepsi `E_PRODUCTION_WIRING_REQUIRED`. Dosyalarımı HEAD'e alıp ölçtüm: **değişikliğim olmadan da 9 kırmızı.** |
| **önceden kırmızı (benim değil)** | `tests/orchestra/production-wiring-prompt.test.ts:251` tip hatası (`2 \| 1` → `2`) — diff'im 180 civarında, o satıra dokunmadım |

Provider call + usage + settlement zinciri: **kapanmadı.** Son koşu worker'a ulaşmadığı için
`.result` yok; `productionWiringEvidence` hiç gözlemlenmedi.

## 7. SSOT + build

- **MASTER:** yeni satır açılmadı. Bu turun çıktısı finding'dir; Kanun 4 amendment'ı gereği
  finding otomatik MASTER satırı DEĞİLDİR — owner admission gerekir.
- **current-flow.md:** `LANE: DOGFOOD CANLI` bölümü güncel (17 maddelik tablo).
- **durum-raporu.md:** EK-2 (motor düzeltmeleri) · EK-3 (747 settlement + tier tavanı) ·
  EK-4 (koşum-7 + BULGU-M/N). 1272 satır.
- **Build:** `npm run build:all` **exit 0** @ 04:37. `dist/` mtime 04:37, tüm değişmiş
  kaynaklardan yeni ⇒ **source↔dist identity SAĞLAM**, restart gerekmiyor.
- **Config:** `.deckent/config.json` `modes.performance.max_tier=standard` — **gitignored,
  yerel**. `src/core/mode-presets.ts` shipped preset'ine DOKUNULMADI.

## 8. Honesty + findings

| sınıf | finding |
|---|---|
| `BLOCKS_CURRENT_DONE` | **BULGU-M** — sprint-747 settlement'ı için desteklenen yüzey yok; her `deckent do` PLAN'da ölüyor |
| `BLOCKS_CURRENT_DONE` | **BUG-F uçtan uca kanıtsız** — worker `.result`'ı hiç gözlemlenmedi |
| `RELATED_BUT_NONBLOCKING` | **BULGU-N** — `isDecidedExactSettlementHold` 11 koddan 1'ini kabul ediyor; ölçüldü: 747'yi tek başına çözmez (arşiv mührü `null`) |
| `RELATED_BUT_NONBLOCKING` | koşum-7a `INVOCATION_RECEIPT_PRE_DISPATCH_WRITE_FAILED` — tekrarlamadı, **teşhis edilmedi** |
| `RELATED_BUT_NONBLOCKING` | **BULGU-L** — `recover --dry-run` önizlemesi `--force`'un işini eksik gösteriyor |
| `RELATED_BUT_NONBLOCKING` | BULGU-E/F (düz `start` × exact-Docker), BULGU-I (container registry), BULGU-J (read-model bayatlığı), BULGU-K (`runs --diff`) |
| `UNRELATED` | §3-D atfedilemeyen kirli dosyalar |

**Yarım bırakılanlar, açıkça:**
- BUG-F yalnız prompt'a indi; davranışsal kanıtı yok.
- BUG-H yutulan nedeni açığa çıkarır ama **7a hatasını çözmez**.
- BULGU-N kanıt tablosu yazıldı, **uygulanmadı** (ikinci outcome + güvenlik predicate'i).
- Hiçbir şey commit edilmedi.

**Bilerek yapılmayan:** `.deckent/sprint-state.json` elle yazılmadı. Uydurma kalıcı run durumu
kilidi açardı ama settlement otoritesini sahtelerdi.

## 9. Open actions (receipt'teki sıra bağlayıcıdır)

Devralan **yalnız** `0001-prepared.json` → `openActions` üzerinden devam eder. Özet:

1. **BULGU-M (BLOKE)** — 747 settlement'ı. Denenen ve tükenen yedi yüzey + mekanizma
   `durum-raporu.md` EK-4 §3'te. Üç owner seçeneği orada.
2. BUG-F'i worker'a gerçekten ulaşan tam bir döngüyle kanıtla.
3. 7a makbuz hatası teşhis edilmedi — tekrarlarsa BUG-H artık kodu adlandırır.
4. BULGU-N uygulanmadı; kanıt tablosu EK-4 §4.
5. Hiçbir şey commit değil (78 kirli yol; §3'teki A/B/C/D ayrımına dikkat).
6. `max_tier=standard` yerel; shipped default olup olmayacağı owner kararı.
7. BULGU-E/F/I/J/K/L açık owner-karar bulguları.

**recommendedNextAction:** BULGU-M'i çöz — 747-001 settle olmadan hiçbir `deckent do`
PLAN'ı geçemez.

---

## Astra için devralma sırası (protokol §6)

1. `to` identity'sinin kendi runtime identity'sinle **exact** eşleştiğini kanıtla.
2. `0001-prepared.json` digest'ini bağımsız yeniden hesapla.
3. Disk kanıtını doğrula (§4 tablosu).
4. `node scripts/authority-handoff.mjs verify --handoff ah-2026-09-12-opus-astra-dogfood …`
5. Blocker varsa `HOLD` yaz — kendini promote ETME.
6. Transferor `COMMITTED` yazana kadar authority hâlâ transferor'dadır. Transferor commit
   üretemezse tek yol **owner-authorized `RECOVERY_COMMITTED`**'dır (protokol §3.3).
