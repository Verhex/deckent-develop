# HANDOFF v2 — dogfood go-live lane → Astra (epoch 6 → 7)

> **Bu dosya authority DEĞİLDİR.** Authority yalnız bu dizindeki receipt zincirindedir.
> `0001-prepared.json` · `receiptDigest: sha256:06a589089c52cb086d6bfee43c0432b1e299c0bda2981a22b54101b5e4debb41`
> Durum: **PREPARED** — authority hâlâ transferor'dadır (protokol §3.1).
>
> **Neden v2:** `ah-2026-09-12-opus-astra-dogfood` transferee tarafından
> `IDENTITY_MISMATCH/HOLD` ile reddedildi (kanal ENTRY 1274) ve transferor tarafından
> sequence 2'de **ABORTED** yazıldı (`sha256:f345a3f012e0630b7a8b7d4f06e1258d56f68ef576dff9e2418e9e75ff639b2d`).
> Protokol §3.5/§4.2 gereği eski receipt mutate edilmedi; `to` kimliği aynı handoff içinde
> değişemeyeceği için yeni `handoffId` açıldı. Proposed epoch 6→7 korundu (yetki geçmedi).

---

## 0. ENTRY 1274'teki itirazlar ve karşılıkları

| itiraz | karşılık |
|---|---|
| `to.sessionDigest` canlı oturumla eşleşmiyor (`ec82a08a…`) | **Düzeltildi.** Artık `sha256:a9da6833…` — Astra'nın bildirdiği değer **verbatim**, ikinci kez hash'lenmeden |
| principal digest kaynağı belirsiz | **Belirtildi** — §1 notu: `sha256("owner-account")`, tool **placeholder**'ı; runtime-resolved hesap kimliği DEĞİL |
| §4'te "state dosyası yok ⇒ koşan sprint yok" çıkarımı | **Düzeltildi** — altı sınırlı sinyal + açık residual; `runtime-liveness.json` |
| §7'de dist mtime'ın build identity sayılması | **Düzeltildi** — ürünün kendi `worktree-binary-authority` v3 otoritesi; exact fingerprint eşleşmesi |
| `filesChanged`/`verification`/`findings` boş | **Düzeltildi** — 80/6/9 kayıt, receipt'e bağlı |
| D kapsamını otomatik sahiplenme | Sahiplenilmedi; §3-D ayrı ve `owner: UNATTRIBUTED` etiketli |

> **Mekanik kök-neden (dürüstlük):** ilk paketteki uyuşmazlık dikkatsizlik değil, aracın
> boşluğuydu — `scripts/authority-handoff.mjs` yalnız **ham** değeri hash'leyebiliyordu, yani
> transferor alıcının bildirdiği digest'i taşıyamıyordu ve `--to-session` verilmeyince
> `sha256(Date.now())` yazıyordu; bu değer canlı bir oturumla **asla** eşleşemez. Ayrıca policy
> §8'in beyan ettiği `filesChanged`/`verification`/`findings` alanları sabit `[]` yazılıyordu.
> İkisi de bu oturumda **eklemeli** olarak düzeltildi (varsayılanlar değişmedi; mevcut her
> çağrı bayt-aynı çıktı üretir). Detay: `findings.json` →
> `handoff-tooling/declared-fields-unimplemented`.

## 1. Identity + trigger

| | |
|---|---|
| from | `claude-code-cli` · `claude` · `claude-opus-5` · `supervisor` |
| to | `codex-cli` · `codex` · `gpt-6-astra` · `supervisor` |
| `to.sessionDigest` | `sha256:a9da68331c114097dd2c61b8c63de94df76f4787c88bc3318865e1aef1b907f1` — **transferee-reported, verbatim** |
| `from.sessionDigest` | `sha256:f9362b58…` = `sha256("session_01CLZWPYjFHQc2vSCtAuQsWN")`, transferor'un canlı oturum kimliği |
| principalDigest (iki taraf) | `sha256("owner-account")` = `sha256:1d1549eb…` — **tool placeholder**, runtime-resolved hesap kimliği DEĞİL; iki taraf aynı owner hesabı altında çalışıyor. Ham credential/principal secret receipt'e yazılmadı. |
| epoch | **6 → 7** (sayaç global: 3→4, 4→5, 5→6 emsalleriyle ölçüldü) |
| reasonCode | `OWNER_DIRECTIVE` · authorityRef `owner-live-instruction` |

Transferor'un authority'si receipt zincirinden değil **Alperen'in canlı talimatından** geldi
(protokol §1.3 sıra-1). Bu handoff o ad-hoc grant'ı kapatıp zinciri receipt'e geri bağlar.

## 2. Authority scope

- **Outcome:** `RECOVERY-DO-DOGFOOD-001` · iş-akışındaki hedef: MASTER satır 120 `STATE-RETENTION-001` (OPEN)
- **Goal/Mission/Flow/Run:** `n/a` — lane `deckent do` ile sürülüyor
- **Includes:** epoch-7 tek yürütücülük + yedi openAction + dirty grup **A** ve **B**
- **Excludes:** owner-only kararlar · **grup C (Cursor terminal lane)** · **grup D (atfedilemeyen)** · admit edilmemiş iş

## 3. Repo state

`branch=main` · `HEAD=ae87e898613928ca314b5179484982b6bdb6d69f` · upstream **ahead 1** ·
commit/push YOK · dirty **80 yol**.

Tam manifest: **`files-changed.json`** (`sha256:283c7a52fdde36cdc98e641cb438c3f0cfbb2c8935a806964b6e0965b6e45c34`),
her satırda `path` · `gitStatus` · `sha256` · `group` · `owner`.

| grup | adet | sahip |
|---|---|---|
| **A** | 27 | transferor (bu oturum) — BUG-A…BUG-H motor düzeltmeleri + testler + doküman |
| **A+B** | 1 | **ÇAKIŞMA:** `src/core/config-types.ts` — hem transferor (`max_tier`) hem sprint-747 worker'ı (rotation policy bloğu) |
| **B** | 5 | sprint-747 worker efekti (elle yazılmadı; motor üretti) |
| **C** | 33 | **Cursor terminal lane — transferor sahiplenmiyor** |
| **D** | 14 | **ATFEDİLEMEYEN** — commit öncesi atıf gerekir; kanal 1272/1273 `start.ts` ve container-registry atfında kullanılabilir |

Silinen 1 yol için `sha256: null` (içerik yok).

## 4. Live runtime — sınırlı kanıt, ispat DEĞİL

Kaynak: **`runtime-liveness.json`** (`sha256:eca214175a721a54f0017614c3b8900ad9ed94176cc396a5901aaa37b0ef0be9`)

| yüzey | kanıt | okuma |
|---|---|---|
| sprint-state | `.deckent/sprint-state.json` yok | hiçbir sprint ACTIVE iddiasında değil |
| pid-liveness | `.deckent/pids/*.pid` yok (yalnız `*.snapshot.json`) | canlılık iddiası tutan süreç yok |
| heartbeat | `.tasks/*.hb` yok | worker heartbeat dosyası yok |
| task projection | `.tasks/` yalnız 5 × `.task-cas-*.previous` | aktif görev projeksiyonu yok |
| container | `docker ps` → yalnız `local-llm Up 3 days (healthy)` | deckent worker/sprint konteyneri yok |
| run-flow | `6de757f8…` son olay `RUN_FAILED` @01:56:19.747Z, `RUN_STARTED` hiç yazılmamış | son koşu yürütme başlamadan öldü |

> **Residual (açık):** Bu altı sinyal tek bir andaki disk/daemon gözlemidir. Başka bir host'ta,
> başka bir checkout'ta veya hiç artefakt yazmayan bir süreçte canlı worker olmadığını
> **ispatlamaz**. Başka yerdeki liveness: **UNKNOWN**.
>
> **Orphan şüphesi (açık etiketli):** `w-747-001` / görev `747-001` — `deckent resume sprint-747`
> `missing_file, yaş 92dk` ile bayat bildirdi; süreç yok, `.pid` temizlenmiş, snapshot duruyor.

## 5. Approvals

`deckent approvals list` @2026-09-12T11:20Z → bekleyen istek yok, federe kutu boş.
Devralan adına hiçbir karar verilmedi.

## 6. Verification

Kaynak: **`verification.json`** (`sha256:18c4e3d0759c99a7419eba77362453bcb1df29324dbca242b42bf90a0b535844`) —
6 kayıt, her biri `command` · `exitCode` · `logRef` · `logSha256`.

| sınıf | kapsam | sonuç |
|---|---|---|
| `LOCAL_VERIFIED` | bu oturumun 7 test dosyası | **96/96**, exit 0 → `verify-session-tests.log` |
| `LOCAL_VERIFIED` | `tsc --noEmit` | temiz, exit 0 → `verify-tsc.log` |
| `PRE_EXISTING_RED` | `planner-override-precedence` + `brain-planning-precedence` | **9 kırmızı**, exit 1 → `verify-preexisting-red.log`. Hepsi `E_PRODUCTION_WIRING_REQUIRED`. **Baseline yöntemi:** transferor iki değişmiş kaynağını kenara kopyalayıp `git checkout --` ile HEAD'e aldı ve yeniden koştu → **aynı 9 kırmızı**. Bu oturumun eseri değil. |
| `BUILD_IDENTITY_VERIFIED` | source ↔ dist | aşağıda §7 |
| `NOT_RUN` | remote CI | REMOTE_ADVISORY çalıştırılmadı |
| `NOT_CLOSED` | provider call + usage + settlement | `RUN_FAILED`; worker `.result` yok; `productionWiringEvidence` hiç gözlemlenmedi |

## 7. SSOT + build

**Build identity — mtime çıkarımı DEĞİL.** Ürünün kendi otoritesi
(`src/cli/worktree-binary-authority.ts`, `BUILD_IDENTITY_SCHEMA_VERSION=3`) ile ölçüldü:

```
canlı buildSourceTreeIdentity(root).sourceTreeSha256
  = 5f5fb64f043fa6fa1eb74fa8a76ff7b44f8096c6e4990f61afbc1dc14b10045a  (1465 dosya)
dist/build-identity.json .sourceTreeSha256
  = 5f5fb64f043fa6fa1eb74fa8a76ff7b44f8096c6e4990f61afbc1dc14b10045a  (1465 dosya)
→ MATCH  ⇒  BUILD_IDENTITY_VERIFIED
sourceRootSha256       = b38d9cf37034a57aa4d557c91b0974cab13ae243f91a6c053611dddebefb5f27
nativeSourceTreeSha256 = sha256:ef06f44f070e07061cacb7672e0812a88f44a8235e7002f338c2786f32d69a8d
```

Son build komutu `npm run build:all` **exit 0** @2026-09-12T04:37Z.
`scripts/*.mjs` (bu oturumdaki authority-handoff değişikliği dahil) derlenen kaynak kümesinin
**dışındadır** ve doğrudan çalıştırılır — rebuild gerektirmez. Host restart gereksinimi hakkında
iddia **yok**; MCP gibi long-lived süreçlerin kendi restart disiplini ayrıdır.

- **MASTER:** yeni satır açılmadı — finding otomatik iş değildir (Kanun 4 amendment).
- **current-flow.md:** `LANE: DOGFOOD CANLI` + handoff pointer.
- **durum-raporu.md:** EK-2 / EK-3 / EK-4, 1272 satır.
- **Config:** `.deckent/config.json` `modes.performance.max_tier=standard` — **gitignored/yerel**;
  `src/core/mode-presets.ts` shipped preset'ine dokunulmadı.

## 8. Honesty + findings

Kaynak: **`findings.json`** (`sha256:a7d154cd4d2c074ee71e9f83f285c602c41860fa5d3e6c098e85f648e449a4de`) — 9 kayıt.

| sınıf | reasonCode |
|---|---|
| `BLOCKS_CURRENT_DONE` | `BULGU-M/sprint-747-settlement-no-supported-surface` |
| `BLOCKS_CURRENT_DONE` | `BUG-F/end-to-end-unproven` |
| `RELATED_BUT_NONBLOCKING` | `BULGU-N/settlement-predicate-branch-too-narrow` |
| `RELATED_BUT_NONBLOCKING` | `kosum-7a/receipt-pre-dispatch-write-undiagnosed` |
| `RELATED_BUT_NONBLOCKING` | `BULGU-L/recover-dry-run-preview-understates` |
| `RELATED_BUT_NONBLOCKING` | `handoff-tooling/declared-fields-unimplemented` |
| `RELATED_BUT_NONBLOCKING` | `BULGU-E-F-I-J-K/open-owner-decisions` |
| `UNRELATED` | `dirty-group-D-unattributed` |
| `UNRELATED` | `pre-existing-type-error` |

**Bilerek yapılmayan:** `.deckent/sprint-state.json` elle yazılmadı — uydurma kalıcı run durumu
kilidi açardı ama settlement otoritesini sahtelerdi.

## 9. Open actions

Bağlayıcı sıra `0001-prepared.json` → `openActions`'tadır.
**recommendedNextAction:** BULGU-M'i çöz — 747-001 settle olmadan hiçbir `deckent do` PLAN'ı geçemez.

---

## Astra için devralma sırası (protokol §6)

1. `to` identity'sini kendi runtime identity'nle **exact** eşleştir
   (`sessionDigest` artık senin bildirdiğin değer).
2. `0001-prepared.json` digest'ini bağımsız yeniden hesapla → beklenen
   `sha256:06a589089c52cb086d6bfee43c0432b1e299c0bda2981a22b54101b5e4debb41`.
3. Dört manifest digest'ini doğrula (§3/§4/§6/§8 başlıklarında verildi).
4. `node scripts/authority-handoff.mjs verify --handoff ah-2026-09-12-opus-astra-dogfood-v2 …`
5. Blocker varsa `HOLD` yaz — kendini promote ETME.
6. Transferor `COMMITTED` yazana kadar authority transferor'dadır; transferor commit
   üretemezse tek yol owner-authorized `RECOVERY_COMMITTED` (protokol §3.3).
