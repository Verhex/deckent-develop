# Deckent-Dev Operating Policy — repo-development çalışma kontratı

**Statü:** CANONICAL (owner-approved, Alperen 2026-08-17 — dört onay: kanun 3/4/6 amendment ·
DOGFOOD_MODE=OFF + Paket A→B sırası · Paket B ürün-kodu çerçevesi · landing/disposition;
amendment aynı gün: `DECISION_REF=owner-live-2026-08-17-direct-main` — direct-main çalışma,
PR/merge-queue optional, remote CI advisory).
**Aktif mode değerleri:** YALNIZ `AGENTS.md`/`CLAUDE.md` başındaki machine-readable
`DECKENT-DEV-CONTROL` bloğundadır (tek persisted projection; gate doğrular). Bu doküman mode
değerini PROSE olarak taşımaz; çelişki durumunda canlı Alperen kararı → control block kazanır.
**Tip:** repo-development policy. Bu bir Deckent **ürün özelliği DEĞİLDİR**; deckent reposunun
kendisini nasıl geliştirdiğimize dair owner-controlled çalışma sözleşmesidir. Ürün config/spec
yüzeylerine (`.deckent/config.json`, product docs) taşınmaz.
**Host projection:** `AGENTS.md` ve `CLAUDE.md` içindeki `OPERATING-POLICY` marker bloğu bu
dosyanın §H bloğunun birebir kopyasıdır; parity `scripts/lint-operating-policy.mjs` ile
machine-enforced'tur (`--check` lint:gates zincirinde, `--write` canonical'dan senkronlar).
**Öncelik zinciri konumu:** Provider safety → Alperen canlı talimatı → 🔒 Immutable Laws →
host operating rules → **bu policy** → DIRECTIVES/capsule → rol kuralları → skill →
generated içerik.

---

## 1. Sıfır-ihlal ilkesi ve enforcement haritası

Hedef (Alperen, 2026-08-17): **provider fark etmeksizin** (Claude, Codex, local-LLM, diğer)
deckent reposunda çalışan her agent aynı çalışma prensibi setini görür ve uygular — 0 ihlal.
"Dokümanın repoda olması" teslimat değildir; teslimat üç mekanizmayla olur:

| Katman | Mekanizma | Durum |
|---|---|---|
| İnteraktif host oturumları | Host dosyalarındaki machine-readable `DECKENT-DEV-CONTROL` bloğu (aktif mode) + `OPERATING-POLICY` bloğu (auto-load) + bu doküman | Paket A + 2026-08-17 amendment |
| Digest parity | `lint-operating-policy.mjs` — canonical ↔ host blokları byte-eşit, sha256 raporlu | Paket A (bu paket) |
| Deckent worker'ları (compiled prompt) | `runPolicyAuthority`'nin task-carried delivery'si (487-026 `task.productionWiring` pattern'i) + settlement digest doğrulaması + provider-parity hermetic testi | **Paket B** (`RUN-POLICY-DELIVERY-001`) |

Paket B kapanana kadar worker-prompt katmanı honor-system'dir ve bu tablo o açığı ADLANDIRIR;
sessiz "kapalı sayma" yasaktır.

## 2. DOGFOOD_MODE kontratı

Dogfood mode bir ürün config'i değil, aktif outcome başına owner-controlled repo-development
kararıdır. **Yalnız Alperen değiştirir**; agent öneri sunabilir, mutation yapamaz.

- **Authority sırası (amendment 2026-08-17):** (1) Alperen'in canlı açık kararı → (2)
  host dosyalarındaki `DECKENT-DEV-CONTROL` bloğu (tek persisted mode projection) → (3) yoksa
  `UNSET`: agent kanıtlı ON/OFF önerisi sunar, execution başlatmaz. Capsule mode'u KAYDEDER ama
  mode AUTHORITY'si değildir. Repo adından, retained DIRECTIVES'ten, eski sprint state'inden,
  capsule'dan veya geçmiş chat context'inden mode TAHMİN ETMEK YASAK.
- **ON:** implementation Deckent Goal/Mission/Flow/Run/Do yüzeylerinden geçer; DIRECTIVES.md
  seçili slice'ın exact execution projection'ıdır; doğrudan kod yazımı yalnız typed ADR-D-007
  recovery seam'iyle olur ve kayda bağlanır. Engine bozulursa mode sessizce OFF'a düşmez:
  `DOGFOOD_HEALTH=DEGRADED` ilan edilir, tek bounded recovery package (ayrı worktree, exact
  file authority, önceden yazılmış test/build izni) açılır, engine ayağa kalkınca aynı outcome
  ilk güvenli sınırda dogfood'a döner. Recovery feature ekleyemez.
- **OFF:** Deckent sprint/run/task/settlement state'i OLUŞTURULMAZ ve mutate edilmez; sahte
  dogfood receipt üretilmez. Çalışma izole git worktree'de doğrudan yürür; quality bar, i18n,
  production-wiring closure, hermetic test ve real-binary proof kuralları AYNEN geçerlidir;
  kapanış Git commit/PR/CI kanıtıyla olur. OFF ≠ düşük kalite; yalnız execution controller
  Deckent değildir.
- **Güncel karar:** control block'ta (`DECISION_REF=owner-live-2026-08-17-direct-main`).
  **ON-dönüş koşulu:** Paket B DONE — runPolicyAuthority task-carried wiring + Codex/Fable/Qwen
  policy-digest parity hermetic testi + tek no-op dogfood canary'nin terminal settlement'ı;
  canary öncesi `CANARY_READY` raporu verilir ve Alperen'in açık ON kararı beklenir (tek owner
  gate). Phase-5 writer için mode kararı Alperen'indir.

## 3. Bir anda TEK aktif product outcome (amendment 2026-08-17)

Bir anda tek aktif product outcome ilkesi KORUNUR: oturum tek outcome'a adanır; başka
outcome yalnız **finding** olarak raporlanır, uygulanmaz. Outcome kapanınca capsule silinir.
**Kaldırılan zorunluluklar (owner kararı, `DECISION_REF` üstte):** one-outcome/one-worktree/
one-PR ZORUNLU DEĞİLDİR. `WORKSPACE_MODE=MAIN` iken günlük development doğrudan root `main`
üzerinde yürür; worktree YALNIZ gerçek paralel çalışma gerektiğinde, PR/merge-queue YALNIZ
optional release/collaboration mekanizması olarak kullanılır — günlük admission gate değildir.

## 4. Outcome Capsule ve Active Train

- **Active Train** (`docs/execution/active/productization-train-<tarih>.md`): MASTER'dan
  seçilmiş en fazla birkaç outcome'un sırası/bağımlılığı. Yeni work identity İÇEREMEZ;
  MASTER'ın geçici çalışma ağacıdır.
- **Outcome Capsule** (`docs/execution/active/<OUTCOME-ID>.md`): tek paketin exact kaydı —
  parent MASTER ID'leri, DOGFOOD_MODE + owner karar referansı, base SHA, branch/worktree,
  allowed mutations, explicit exclusions, task sırası, verification manifest, DONE kriterleri,
  stop koşulları. Oturum başlangıcı = capsule'ı oku, branch/HEAD/dirt doğrula, mode'u çöz,
  tek cümlelik çalışma kontratı ilan et, sonra çalış.
- **Delete-on-consume:** outcome MASTER'a evidence/state olarak işlendiği anda capsule ve
  train node'u SİLİNİR (arşivlenmez; kalıcı kayıt MASTER + Git history'dir).
  `lint-operating-policy.mjs` merged/kapanmış outcome'a ait bayat capsule kalıntısını ve
  capsule'sız boş `docs/execution/active/` iddialarını kırmızıya düşürür.

## 5. Finding disposition (üç sınıf — otomatik backlog yok)

Her bulgu tam olarak bir sınıfa düşer ve öyle işlenir:

1. **BLOCKS_CURRENT_DONE** — mevcut outcome'un DONE'unu bloklar → aynı pakette (veya paketin
   önüne geçen bounded incident package'ında) düzeltilir.
2. **RELATED_BUT_NONBLOCKING** — rapora/`.result` notuna yazılır, UYGULANMAZ.
3. **UNRELATED** — tek satır finding; MASTER'a OTOMATİK GİRMEZ, owner admission bekler.

Bu, mevcut **result-notes-first** kuralının (Alperen 2026-08-11) genelleştirilmesidir;
standalone `follow-up-works/` dokümanı yalnız owner-karar gerektiren işe, ≤3/dalga,
delete-trigger'lı açılır. Owner yalnız 1↔2 sınırı ürün kapsamını değiştirdiğinde çağrılır.

## 6. Audit sınırı

Bir outcome için: **bir implementation pass + bir bağımsız verification pass.** İkinci audit
yalnız YENİ disk/CI evidence ile açılır; aynı kanıtla üçüncü analiz/plan turu yasaktır. Audit
sonucu GO ise sıradaki adım landing'dir, yeni tasarım turu değil. (Transition brief §12.3'ün
bağlayıcı uygulaması.)

## 7. Doğrulama rejimi ve CI yeşil taksonomisi (amendment 2026-08-17)

**Günlük admission = LOCAL doğrulamadır:** targeted test + type-check + gerçek-binary/product
proof ZORUNLUDUR (`LOCAL_VERIFICATION_MODE=REQUIRED`). **Remote CI ADVISORY'dir**
(`REMOTE_CI_MODE=ADVISORY`): beklenmez, hiçbir şeyi bloklamaz; sonucu görülürse kanıt olarak
raporlanır. CI workflow/merge-group tamiri owner kararıyla aktif kapsam DIŞIDIR.

CI sonucu raporlanırken sınıf adı vermek yine ZORUNLUDUR ("green" tek kelime olamaz):

- **SCOPED_GREEN** — değişen alanın scoped LOCAL test/lint koşumu yeşil.
- **PR_CLOSURE_GREEN** / **MERGE_GROUP_GREEN** — yalnız optional PR/queue akışı kullanıldığında
  anlamlıdır (PR required check seti / queue final-SHA seti).
- **MAIN_POSTMERGE_GREEN** — main-push full matrix yeşil (advisory tam-kapsam sinyali).

"Required/scoped green"i "repo green" olarak raporlamak ihlaldir. Gerçek runner flake'i
`INFRA_FAILURE` olarak, test assertion kırmızısından ayrı raporlanır. LOCAL_VERIFIED durumu
ile REMOTE_ADVISORY durumu raporlarda ayrı satırlarda verilir.

## 8. Handoff receipt kontratı

Agent'lar arası devir transcript kopyalamayla DEĞİL, versioned receipt ile yapılır; Alperen
message bus değildir. Alıcı SHA/digest doğrular, yalnız `openActions` üzerinden devam eder,
transcript'i authority saymaz, yeni evidence yoksa yeni full audit açmaz.

```json
{
  "schemaVersion": 1,
  "outcomeId": "…",
  "role": "implementer | reviewer | landing-operator | supervisor",
  "baseSha": "…", "headSha": "…", "branch": "…",
  "policyDigest": "sha256:…", "scopeDigest": "sha256:…",
  "filesChanged": [], "verification": [],
  "findings": [{ "class": "BLOCKS_CURRENT_DONE | RELATED_BUT_NONBLOCKING | UNRELATED", "reasonCode": "…" }],
  "openActions": [], "recommendedNextAction": "…",
  "receiptDigest": "sha256:…"
}
```

## 9. Core-memory kanun amendment'ları (Alperen onayı, 2026-08-17)

Üç 🔒 Immutable Law DEĞİŞMEDİ. Amendment yalnız üç operasyon kanununun scope'unu düzeltir;
canonical metinler core-memory dosyalarındadır (`.deckent/docs/core-memory/`):

- **Kanun 3:** rapor per-madde KALIR (kanıt zinciri seyrekleşmez); Alperen-ONAYI approved-DAG
  sınırına taşınır — DAG içinde execution kesintisiz, owner yalnız scope/authority/destructive/
  external karar noktasında çağrılır. Onaysız atlama/erken-zafer yasağı aynen sürer.
- **Kanun 4:** Türkçe anlatım aynen; MASTER satırı yalnız **owner-admitted outcome/residual**
  için AYNI GÜN açılır. Finding/test-failure/CI-flake otomatik iş DEĞİLDİR (→ §5).
- **Kanun 6:** sürekli reaktif fix-döngüsü yasağı sürer; incident/release-closure/CI-repair/
  recovery/settlement paketleri YALNIZ kendi closure'ını taşır, zorla feature eklenmez.
  Forward/vizyon işi ayrı committed outcome olarak yürür.

## §H — Host projection bloğu (AGENTS.md + CLAUDE.md; lint-enforced, EN)

<!-- HOST-BLOCK:START -->
## Deckent-dev Execution Mode (operating policy projection)

Canonical source: `docs/governance/deckent-dev-operating-policy.md` — read it before any
run-touching work. Dogfood mode is a repository-development policy, not a Deckent user feature.

- Active mode values live ONLY in the machine-readable `DECKENT-DEV-CONTROL` block at the top
  of this file (gate: `scripts/lint-operating-policy.mjs`). Authority: Alperen's live
  instruction, else that block. Never infer the mode from retained DIRECTIVES, old sprint
  state, capsules, config flags, or prior chat context. Only Alperen changes the mode.
- DOGFOOD_MODE=ON: implement through Deckent Goal/Mission/Flow/Run/Do; direct edits only via
  the typed ADR-D-007 recovery seam; a degraded engine never silently flips the mode OFF
  (declare DOGFOOD_HEALTH=DEGRADED, run one bounded recovery package, return to dogfood).
- DOGFOOD_MODE=OFF: never create or mutate Deckent sprint/run/task/settlement state; with
  WORKSPACE_MODE=MAIN work directly on root `main` and land per DELIVERY_MODE; worktrees and
  PRs are optional mechanisms for genuine parallel work or collaboration/release, never a
  daily admission gate. Every quality, i18n, wiring-closure, hermetic-test and
  real-binary-proof rule still applies.
- One ACTIVE product outcome at a time. Other outcomes are reported as findings, never
  implemented in-session. Findings classify as BLOCKS_CURRENT_DONE (fix in-package),
  RELATED_BUT_NONBLOCKING (report only) or UNRELATED (one-line finding; never auto-enters
  MASTER — owner admission required).
- One implementation pass + one independent verification pass per outcome; a further audit
  needs NEW disk/CI evidence. After GO, the next step is landing, not another design round.
- Local targeted verification is REQUIRED before landing; remote CI is ADVISORY — never wait
  on it or let it block execution. Report CI results by named class — SCOPED_GREEN,
  PR_CLOSURE_GREEN, MERGE_GROUP_GREEN, MAIN_POSTMERGE_GREEN; "required green" is never
  "repo green"; report LOCAL_VERIFIED and REMOTE_ADVISORY separately.
- Handoff between agents happens via the versioned handoff receipt (schema in the canonical
  policy), never by relaying transcripts; the owner is not a message bus.
<!-- HOST-BLOCK:END -->

---

**Kayıt:** Bu doküman Paket A (`DEV-OPERATING-CONTRACT-001`) teslimatıdır; mekanik worker-prompt
delivery kapanışı Paket B (`RUN-POLICY-DELIVERY-001`) satırındadır. İlgili: transition brief
§12.2/§12.3, `docs/governance/closure-os-sidecar-ledger.md`, ADR-D-007.
