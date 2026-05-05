# T-152-023: Beta GA Kalan 3 Gate — Realistik Durum

**Sprint:** sprint-152 (READ-ONLY audit)
**Tarih:** 2026-04-24
**Worker:** w-152-023 (opus + doc-writer + system-architect + documentation-writer)
**Referans:** `docs/ROADMAP-GOD-LEVEL.md:258-285`, `BETA-TRACKER.md:10-31`, `.brain/RETRO.md`

---

## Özet

ROADMAP §5'te listelenen 20 Beta GA gate'inin 17'si Sprint 148-151 aralığında kapandı.
Geride kalan **3 gate**: #3 (Coverage ≥85%), #13 (Messaging Trio), #15 (DeckentHub 20 Seed Skill) — her üçü için de sprint lifecycle'da **kod altyapısı neredeyse tamam** ancak **aktivasyon** aşamasında manual/kriptografik/dış-servis bağımlı kalan blocker'lar mevcut. Sprint 151 kendisi `GO_WITH_GATE_FAILURE` durumuyla kapandı (1 vitest fail), bu nedenle "Beta GA cutover" hâlâ ön-koşul olarak bu 3 gate'in birlikte çözülmesine bağlı.

**En kritik bulgu:** DeckentHub'daki 20 `signature.ed25519` dosyasının **tümü PLACEHOLDER** — gerçek Ed25519 keygen + signing pass'i yapılmamış. Gate #15 "published + signed" hedefine göre **signed** kısmı teknik olarak açılmamış.

---

## Bulgular

### Gate #3 — Coverage ≥ 85% (Hedef: 85%+, Mevcut: ~%52)

- **[DRIFT]** — `BETA-TRACKER.md:18` → `🔄 52.1% → target` (line coverage 52.1%, hedef 85% — 33 puan açık)
- **[DRIFT]** — `.deckent/ci-baseline.json:8` → `"coverage": 0` (Sprint 152 start'ında baseline sıfır; `"tscPassed": true, "testCount": 0`). Baseline tests henüz çalışmadığı için gerçek değeri temsil etmiyor — `.brain/RETRO.md:19` "Coverage 13.0%" Sprint 151 sonu ağırlıklı ortalama, gate ölçütü değil.
- **[PASS on strategy]** — `DIRECTIVES.md:356` → "Coverage %52 mevcut, %85 Beta GA gate'i (#3 'Phase 2' ertelendi) — Sprint 160+ hedef". Deferral bilinçli strateji.
- **[PASS]** — `ROADMAP-GOD-LEVEL.md:266` → Gate #3 durumu `🔄 Phase 2` (uzun vadeli, Sprint 160+).
- **[PASS]** — `vitest.config.ts:8-22` → V8 coverage provider yapılandırılmış, `test:coverage` script (`package.json:23`) mevcut → coverage CI altyapısı sorunsuz, sadece hedef yüksek.
- **[FAIL]** — Sprint 151 gate audit `GO_WITH_GATE_FAILURE` çıktı (`.brain/RETRO.md:94-96` → "vitest: 1 failing tests"). Coverage ölçülmeden önce **test suite'inin %100 yeşil olması gerekiyor**. Bu Gate #3'ten önce Gate #2'nin kalıcı stabilleşmesini zorunlu kılıyor.
- **[DRIFT]** — `IDENTITY.md` "Coverage: 89.33%" iddiası ile `BETA-TRACKER.md:18` "%52.1" arasında **~37 puan delta**. IDENTITY.md büyük ihtimalen stale (Sprint 140 öncesi V8 threshold değişmiş olabilir) — **Sprint 153 P0 doctor task'ı: tek coverage numarası authoritative olmalı**.

**Alternatif Analizi (yoğun coverage sprint'i vs Phase 2 erteleme):**

| Strateji | Lehte | Aleyhte |
|----------|-------|---------|
| **Phase 2 Sprint 160+ erteleme (mevcut)** | Launch momentum kaybolmaz, community/messaging öncelik; pragmatik | Beta GA "feature-complete" narrative'ini %52 coverage ile desteklemek zor; community ilk bug triage'da "unstable" algısı |
| **Yoğun coverage sprint'i (Sprint 153-155)** | Beta GA "%85 coverage" badge'ini kazanır; hub'a PR'lar için yüksek-bar emsali; regression tolerance yükselir | Sprint 153 WhatsApp + Slack + Email IMAP/SMTP planı (`ROADMAP:210`) askıya alınır; messaging window kaçar; OpenClaw rekabet avantajı erir |
| **Hybrid (haftada 2 gün coverage, 3 gün feature)** | Momentum + tedrici yükselme | Koordinasyon yükü; tempo karışır |

**Öneri:** Phase 2 deferral stratejisi korunmalı, ancak **her sprint +3-4 puan coverage** hedefi sprint DoD'ına eklenmeli (Sprint 160'a kadar 52→85 = 33 puan / 8 sprint = ~4 puan/sprint — ulaşılabilir).

---

### Gate #13 — Messaging Trio (Discord + Telegram canlı; WhatsApp hazırlık)

- **[PASS]** — Discord adapter: `src/connectors/discord.ts:1-74` — discord.js Client login, on('messageCreate'), sendMessage(), health probe (ws.status). **Bağımlılık:** `package.json:79` `discord.js ^14.26.3`.
- **[PASS]** — Telegram adapter: `src/connectors/telegram.ts:1-112` — Telegraf instance, dynamic import (100-111), on('text'), sendMessage(), health probe. **Bağımlılık:** `package.json:63` `telegraf ^4.16.0`.
- **[SCAFFOLD]** — WhatsApp adapter: `src/connectors/whatsapp.ts:29-40` — kodda `throws "Sprint 149 scaffold only"`, `isHealthy()` hep false. `src/connectors/whatsapp-README.md:53-117` Meta Business API setup rehberi hazır. **ROADMAP §8 risk matrisi:368 "WhatsApp Business API red (Orta olasılık, Orta etki)"** — deployment Meta onayına bağlı.
- **[PASS]** — Pool + router: `src/connectors/connector-pool.ts` (paralel manager), `src/connectors/incoming-router.ts` (webhook dispatcher), `src/connectors/base-connector.ts:18-80` `IMessageConnector` abstract interface tanımlı.
- **[PASS]** — Deploy scripts: `scripts/deploy-discord.sh` (~185 satır, `--check`/`--smoke`/`--help` flag'leri), `scripts/deploy-telegram.sh` (curl + token doğrulaması, smoke test). Her ikisi de **Alperen tarafından manuel çalıştırılır — CI'da otomatik değil**.
- **[PASS]** — Secret yönetimi: `src/connectors/discord.ts:4` "bot token via `.deck` file ($DECK:DISCORD_TOKEN)" — ADR-014 `.deck` secret file system ile entegre.
- **[PASS]** — Testler: `tests/connectors/base-connector.test.ts`, `tests/connectors/connector-pool.test.ts`, `tests/orchestra/connector.test.ts`, `tests/e2e/notify-sprint-lifecycle.test.ts` — 4 test dosyası mevcut.
- **[PASS]** — Sprint 151 retro `.brain/RETRO.md:71` → T-151-007 "Discord Server Launch + Initial..." DONE (75 puan). T-151-005 Telegram Bot Deploy DONE (75). T-151-004 Discord Bot Deploy GO_WITH_TECH_DEBT (60 puan — prereq doğrulama eksik).
- **[MISSING]** — **Canlı smoke kanıt eksik:** Sprint 151 retro'da "DONE" işaretli olsa da Discord/Telegram kanallarına gerçek mesaj gönderilip alındığına dair **runtime log** repo'da yok. `tests/e2e/notify-sprint-lifecycle.test.ts` (eğer çalışıyorsa) muhtemelen mock üzerinde.
- **[BLOCKER]** — `DIRECTIVES.md:362` → "Discord/Telegram deploy (TD), WhatsApp Business API red riski (Sprint 153 hedefi). Bot credentials Alperen elle" — gate kapanması **Alperen'in gerçek token'ları `.deck` dosyasına koyup manuel smoke yapmasına** bağlı.
- **[DRIFT]** — `.brain/RETRO.md:73` Discord Bot Deploy için agent confidence 70 (correctness), scope 100, completeness 75 — "prereq kontrolünde `../deckent-public` dizini bulunamadı" türü handoff debt'i var (RETRO.md:84 notes'u).

**Realistic ETA Gate #13:**

| Bileşen | Durum | ETA |
|---------|-------|-----|
| Discord kod + deploy script | ✅ Ready | Sprint 151 (kapandı) |
| Telegram kod + deploy script | ✅ Ready | Sprint 151 (kapandı) |
| Discord bot **canlı mesaj kanıtı** | 🟡 Manual | **Sprint 152 out-of-sprint (Alperen token deploy)** |
| Telegram bot **canlı mesaj kanıtı** | 🟡 Manual | **Sprint 152 out-of-sprint (Alperen token deploy)** |
| WhatsApp Business API activation | 🔴 External | **Sprint 153-155 (Meta onay süresi 1-3 hafta)** |

**Gate #13 kapanma koşulu:** Discord + Telegram smoke tamamlanırsa `🟢 2/3 PARTIAL`; WhatsApp Meta red'i gelirse `🟡 SCAFFOLD-ONLY` ile **sürümlü kapatılabilir** (ROADMAP §4 Phase 2 Sprint 153 WhatsApp activation hedefi ile).

---

### Gate #15 — DeckentHub 20 Seed Skill + Ed25519

- **[PASS]** — 20 seed skill dizini: `deckent-hub/skills/` altında tam **20 klasör** var: calendar-google, currency-converter, discord-moderator, email-imap, file-organizer, github-issues, notion-sync, reddit-fetcher, rss-reader, screenshot-vision, slack-notifier, spotify-control, spotify-playlist, telegram-bot, todoist, translator, twitter-post, weather-forecast, web-scraper, youtube-downloader (`ROADMAP:98` listesiyle %100 match).
- **[PASS]** — Her skill dizininde: `SKILL.md`, `manifest.json`, `signature.ed25519` — 60 dosya toplam. Örnek: `deckent-hub/skills/spotify-control/manifest.json:1-15` tam manifest V2 (id, version, activation rules, entrypoint, category, triggers, stackDetection).
- **[PASS]** — Ed25519 signing infra: `src/core/signature.ts:1-84` — `@noble/ed25519 + sha512` import (5-6), `generateKeypair()` (25-29), `loadOrGenerateKeypair()` persists to `~/.deckent/keys/` (34-55), `signMessage()` hex-encoded (60-64), `verifySignature()` (69-77). **Tam çalışan API.**
- **[PASS]** — Dependency: `package.json:59` `@noble/ed25519 ^2.3.0`.
- **[PASS]** — CLI publish: `src/cli/commands/skill-marketplace.ts:1-227` — `deckent skill publish <skillPath>` komutu; AST sandbox scan (206), Ed25519 sign unless `--no-sign` (218-227), signature → `signature.ed25519`.
- **[PASS]** — Marketplace altyapısı: `src/core/marketplace/` 5 modül — registry-client.ts, marketplace-auth.ts, skill-sandbox.ts, rating-system.ts, dependency-resolver.ts. Registry URL `src/core/marketplace/registry-client.ts:59` → `https://registry.deckent.dev` (hardcoded default).
- **[FAIL]** — **Signature PLACEHOLDER skandalı**: Tüm 20+1=21 `signature.ed25519` dosyası içinde `ed25519:placeholder:awaiting-t149016-keygen:0000...000` **PLACEHOLDER** yazıyor. `grep -L "placeholder" signature.ed25519` → **0 gerçek signature**. Gate #15 hedefi "20 published + **signed**" — **signed kısmı fiilen açılmamış**, sadece infra çalışıyor.
- **[DRIFT]** — ROADMAP §4 Phase 2 Sprint 157'de "CI auto-signature + Ed25519 rotation" (`ROADMAP:214`) — bu da keygen sorununun hâlâ açık olduğunu implicit doğruluyor.
- **[PASS]** — Hub repo yapısı: `deckent-hub/CONTRIBUTING.md`, `README.md`, `SKILL_TEMPLATE.md` + `.github/workflows/validate-skill.yml` (AST + manifest CI checker).
- **[PASS]** — Sprint 151 retro `.brain/RETRO.md:68` → T-151-002 "Public Repo Flip — VerhexIO/deckent-dev → VerhexIO/deckent" GO_WITH_TECH_DEBT (60 puan). Notes (`.brain/RETRO.md:84`): "`../deckent-public` dizini mevcut değil — Alperen'in önce git clone yapması gerekiyor". **Handoff debt**: repo public flip tamamlanmadı.
- **[MISSING]** — **`VerhexIO/deckent-hub` public GitHub repo'sunun CANLI olduğuna dair kanıt repo içinde bulunamadı**. Sadece `docs/release/public-repo-flip-handoff.md:73` "deckent-hub 384 KB ✅ Include" planlaması var. Alperen manuel push yapmadıysa hub public değil.
- **[MISSING]** — `https://registry.deckent.dev` registry endpoint'inin gerçekten ayağa kalkmış olduğuna dair canlı health check bulunamadı. Sadece client kodu mevcut.
- **[DRIFT]** — `docs/CHANGELOG.md:57` → "VerhexIO/deckent-hub Repo Create + Templates (completed with tech debt)" — tech debt kalıntısı değinilmemiş.

**Realistic ETA Gate #15:**

| Bileşen | Durum | ETA |
|---------|-------|-----|
| 20 seed skill dizinleri + manifest | ✅ Ready | Sprint 150 (kapandı) |
| Ed25519 sign/verify code | ✅ Ready | Sprint 149 T-149-016 |
| CLI `deckent skill publish` | ✅ Ready | Sprint 150 |
| **Gerçek keypair keygen** | 🔴 Missing | **Sprint 153-154 (~2 gün effort)** |
| **20 signature.ed25519 real signing pass** | 🔴 Missing | **Sprint 153-154 (her skill için `deckent skill publish --local-sign`)** |
| `VerhexIO/deckent-hub` public repo live | 🟡 Handoff | **Sprint 152-153 (Alperen manual git push)** |
| `registry.deckent.dev` endpoint live | 🟡 Unknown | **Sprint 153-157 (deployment audit gerekli)** |

**Gate #15 kapanma koşulu:** Keygen + 20 skill real-sign + public repo flip + registry endpoint smoke → **minimum 3 işlem dizisi**. ROADMAP §4 Phase 2 Sprint 157 `DeckentHub moderation queue + CI auto-signature + Ed25519 rotation` bu çalışmanın kalıcı halkasını tanımlıyor.

---

## Sprint 153+ İçin Aksiyon Listesi

### Gate #3 — Coverage
- **[P1]** Sprint 153 doctor task'ı: IDENTITY.md "Coverage: 89.33%" vs BETA-TRACKER "%52.1" arasındaki delta'yı tek authoritative kaynakla kapat (effort: 1 task, ~30dk).
- **[P2]** Sprint 153-160 her sprint DoD'una "+3-4 puan coverage" eklensin (effort: planning-only).
- **[P0]** Sprint 153'te Sprint 151 residual "vitest 1 fail" mutlaka kapatılsın — yoksa coverage ölçümü anlamsız (effort: 1 task, T-151-013 devam).

### Gate #13 — Messaging
- **[P0]** Sprint 152 sonu **out-of-sprint**: Alperen `.deck` DISCORD_TOKEN + TELEGRAM_TOKEN yapılandırması + `scripts/deploy-discord.sh --smoke` + `scripts/deploy-telegram.sh` manuel smoke (effort: Alperen 15-30dk, kod yok).
- **[P0]** Sprint 153 T-153-MESSAGING-SMOKE-EVIDENCE: Discord + Telegram kanalına test mesajı gönder, ekran görüntüsü veya log → `docs/audits/sprint-153/messaging-live-evidence.md` (effort: 1 task, docs-only).
- **[P0]** Sprint 153 WhatsApp Business API başvurusu + webhook deploy (`ROADMAP:210`, effort: 3-5 task, Meta onay 1-3 hafta).
- **[P1]** Sprint 154+ Slack connector + Email IMAP/SMTP connector (ROADMAP Phase 2 matrix, effort: 4-6 task/sprint).

### Gate #15 — DeckentHub
- **[P0]** Sprint 153 T-153-KEYGEN: Gerçek Ed25519 keypair oluştur (`deckent skill sign --init` veya benzeri), `~/.deckent/keys/` persist, public key → `deckent-hub/keys/deckent-signing.pub` (effort: 1 task).
- **[P0]** Sprint 153 T-153-REAL-SIGN: 20 skill için real signing pass (`for dir in deckent-hub/skills/*/; do deckent skill publish --local-sign "$dir"; done`), placeholder → real sig delta (effort: 1 task).
- **[P0]** Sprint 153 T-153-HUB-FLIP: `VerhexIO/deckent-hub` public GitHub push (handoff debt, effort: Alperen 15dk out-of-sprint).
- **[P1]** Sprint 154 T-154-REGISTRY-SMOKE: `registry.deckent.dev` canlı smoke + CI moderation workflow trigger (effort: 2 task).
- **[P2]** Sprint 157 `DeckentHub moderation queue + CI auto-signature + Ed25519 rotation` (ROADMAP planlı, effort: 10 task sprint).

### Meta — Beta GA Narrative
- **[P1]** Sprint 153 openingde BETA-TRACKER güncellenmeli — şu an 2026-04-20 stamp, Sprint 151 öncesi kalmış (effort: 1 task docs-only).
- **[P0]** Beta GA cutover karar revize: "17/20 kapandı, 3 kalan infrastructure-ready ama activation-pending" → `v1.0.0-beta.2` tag'i **soft-release** önerisi (WhatsApp ve full-signing Phase 2'ye dağılır, Discord/Telegram canlı smoke + partial signing ile beta.2 tag'i Sprint 153 sonu).

---

## Kanıt Ekleri

### Komut Çıktıları

**`ls /workspace/deckent-hub/skills/ | wc -l`** → 20
**`find /workspace/deckent-hub/skills -name "signature.ed25519" | wc -l`** → 20
**`grep -L "placeholder" /workspace/deckent-hub/skills/*/signature.ed25519 | wc -l`** → 0 (hiç gerçek sig yok)
**`ls /workspace/src/connectors/`** → 8 dosya (base-connector.ts, connector-pool.ts, discord.ts, incoming-router.ts, telegram.ts, types.ts, whatsapp-README.md, whatsapp.ts)
**`ls /workspace/scripts/ | grep deploy-`** → deploy-discord.sh, deploy-telegram.sh
**`cat .deckent/ci-baseline.json`** → `{"sprintId":"sprint-152","baseline":{"tscPassed":true,"testCount":0,"testPassed":0,"testFailed":0,"coverage":0,...}}`

### Dosya:Satır Referansları

| Bulgu | Dosya:Satır |
|-------|-------------|
| Gate matrix | `docs/ROADMAP-GOD-LEVEL.md:258-285` |
| Coverage defer strategy | `DIRECTIVES.md:356` |
| Coverage 52.1% | `BETA-TRACKER.md:18` |
| Discord adapter | `src/connectors/discord.ts:1-74` |
| Telegram adapter | `src/connectors/telegram.ts:1-112` |
| WhatsApp scaffold | `src/connectors/whatsapp.ts:29-40` |
| Ed25519 sign API | `src/core/signature.ts:1-84` |
| CLI publish | `src/cli/commands/skill-marketplace.ts:1-227` |
| Registry URL | `src/core/marketplace/registry-client.ts:59` |
| Signature placeholder | `deckent-hub/skills/*/signature.ed25519` (21 dosya, hepsi placeholder) |
| Sprint 151 messaging retros | `.brain/RETRO.md:70-73,87-90` |
| Public repo flip TD | `.brain/RETRO.md:68,84` |
| Gate failure (Sprint 151) | `.brain/RETRO.md:93-96` |

### Özet Tablo

| Gate | Hedef | Mevcut | Durum | ETA |
|------|-------|--------|-------|-----|
| **#3 Coverage** | ≥85% | ~%52 | 🔄 Phase 2 defer (bilinçli) | Sprint 160+ (her sprint +3-4 puan) |
| **#13 Messaging trio** | Discord+Telegram canlı + WhatsApp scaffold | Kod %100 ready, canlı smoke eksik, WhatsApp Meta onay bekliyor | 🟡 PARTIAL | Sprint 152-153 Discord/Telegram smoke + Sprint 153-155 WhatsApp |
| **#15 Hub 20 seed skill** | 20 published + signed | 20/20 manifest ✅ + 0/20 **real signature** | 🟡 PARTIAL (signed eksik) | Sprint 153 keygen + real-sign pass + repo flip |

---

**Son Değerlendirme:** 3 gate'in de **altyapısı üretim-seviyesinde**; kapanma engeli tamamen **runtime/manuel/dış-servis** aşamalarında. Beta GA cutover'ın "v1.0.0-beta.1" etiketi Sprint 150'de atılmış olsa da, "feature-complete GA" narrative'i için bu 3 gate'in ek `v1.0.0-beta.2` (Sprint 153 sonu) ile kapanması gerçekçi. Önerilen strateji: **soft-release + incremental gate closure** (full-GA `v1.0.0` etiketi Sprint 157-160 bandında). Coverage uzun kuyruk olarak kalmalı, messaging ve hub Sprint 153-157 penceresinde öncelikli.
