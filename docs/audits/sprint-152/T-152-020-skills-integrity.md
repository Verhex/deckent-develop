# T-152-020: Skills 21 AST Sandbox + Registry Integrity

## Özet

Sprint 152 READ-ONLY audit. `.deckent/skills/` 21/21 built-in skill
manifest bütünlüğü sağlıklı (hepsi v2, enabled, geçerli kategori). AST
sandbox (`src/core/marketplace/skill-sandbox.ts`) canlı — 10 regex +
5 AST kural, 45 birim test, obfüskasyon direnci (bracket + string
concat) dahil. Ed25519 infrastructure (`src/core/signature.ts`) canlı,
9 birim test, `deckent skill publish` komutu sandbox + sign + upload
pipeline'ı wire'lı. **Kritik bulgular**:
(1) 20 seed skill `deckent-hub/skills/` içinde **sahte placeholder
imzalı** (`ed25519:placeholder:awaiting-t149016-keygen:...`) — real
signing Sprint 149 T-149-016'dan beri bekliyor;
(2) `deckent skill install` path'i **imza doğrulama yapmıyor** (sandbox
sadece publish'te koşuyor, install'da değil — marketplace güvenlik DNA'sı
yarım);
(3) `builtin-skills.test.ts` yalnızca 10/21 skill için discovery test
ediyor (11 skill test-gap).

## Bulgular

### A — 21 Built-in Skill Manifest Integrity

- **[PASS]** 21/21 skill `.deckent/skills/` içinde var, hepsinin
  `manifest.json` + `SKILL.md` dosyası mevcut (evidence: `ls .deckent/skills/ | wc -l` → 21).
- **[PASS]** Hepsi `manifestVersion: 2` (V1→V2 migration tamamlanmış).
- **[PASS]** Hepsi `source: "builtin"`, `enabled: true`.
- **[PASS]** Category dağılımı geçerli (SkillPool.VALID_CATEGORIES
  = `language | framework | tool | domain | workflow`): 2 language,
  3 framework, 4 tool, 6 domain, 5 workflow, 1 extra (`integration`
  kullanımı yalnız hub'da — aşağıya bkz).
- **[PASS]** Semver check: hepsi `^\d+\.\d+\.\d+$` format (ör. 0.1.0,
  0.2.0, 1.0.0).
- **[DRIFT]** Versiyon dağılımı düzensiz: 10 skill `0.1.0` (bootstrap
  version), 9 skill `0.2.0`, yalnız `ci-testing` `1.0.0`. Sprint 152+
  için skill-versiyon upgrade playbook yok. Öneri: Sprint 159
  "polish" sprint'inde built-in skill'leri 1.0.0'a yükselt.

| Skill ID | Version | Category | Uses | Success | LastSprint |
|---|---|---|---|---|---|
| accessibility-expert | 0.1.0 | domain | 0 | — | — |
| anthropic-sdk | 0.1.0 | framework | 4 | 100% | sprint-151 |
| api-builder | 0.2.0 | domain | 4 | 100% | sprint-151 |
| ci-testing | 1.0.0 | workflow | 3 | 100% | sprint-151 |
| code-simplifier | 0.1.0 | workflow | 6 | 67% | sprint-151 |
| database-migration | 0.2.0 | domain | 0 | — | — |
| devops-engineer | 0.2.0 | tool | 22 | 100% | sprint-151 |
| docker-expert | 0.1.0 | tool | 10 | 90% | sprint-151 |
| documentation-writer | 0.2.0 | workflow | 98 | 88% | sprint-151 |
| frontend-design | 0.1.0 | domain | 2 | 100% | sprint-151 |
| git-expert | 0.1.0 | tool | 4 | 100% | sprint-151 |
| graphql-expert | 0.1.0 | framework | 0 | — | — |
| migration-expert | 0.1.0 | workflow | 0 | — | — |
| monorepo-expert | 0.1.0 | tool | 0 | — | — |
| performance-optimizer | 0.2.0 | domain | 12 | 83% | sprint-151 |
| python-expert | 0.2.0 | language | 0 | — | — |
| react-specialist | 0.2.0 | framework | 18 | 89% | sprint-151 |
| security-specialist | 0.2.0 | domain | 17 | 94% | sprint-151 |
| system-architect | 0.1.0 | domain | 75 | 83% | sprint-151 |
| testing-expert | 0.2.0 | workflow | 92 | 91% | sprint-151 |
| typescript-expert | 0.2.0 | language | 397 | 88% | sprint-151 |

- **[FAIL: kullanım boşluğu]** 7/21 skill (accessibility-expert,
  database-migration, graphql-expert, migration-expert, monorepo-expert,
  python-expert) hiç kullanılmamış (`totalUses: 0`, `lastUsedInSprint:
  null`). Deckent TypeScript monorepo'su olduğu için aktivasyon
  kuralları tetiklenmiyor. Not: bu bir "defect" değil; skill'ler
  marketplace USP olarak tutuluyor ama kendi repomuzda dogfood olmuyor.
- **[PASS]** typescript-expert açık ara en sık kullanılan (397 use) ve
  ~88% başarı — beklenen dogfood baskın skill.
- **[PASS]** `SkillPoolManager.validateSkillDefinition` (src/core/skill-pool.ts:187)
  manifest yükleme sırasında çağrılıyor, invalid manifest silent skip
  ediliyor — production'da bad manifest yayılmıyor.

### B — AST Sandbox Canlılık

- **[PASS]** `src/core/marketplace/skill-sandbox.ts` mevcut, 391 satır.
- **[PASS]** `SkillSandbox.validateSkillSafety` 2-pass:
  - Pass 1 (regex): 10 pattern — `eval(`, `Function(`, `child_process`,
    `require('fs')`, `process.env`, `.exec(`, `import … from
    'node:child_process'`, `globalThis|global.`, `Proxy(`, `require('net')`.
  - Pass 2 (AST via `typescript` devDep): 5 kural — direct `eval/Function`
    call, `setTimeout/setInterval` ile string arg, `require('child_process')`,
    bracket-access (`global['eval']`), string-concat obfüskasyon
    (`global['ev'+'al']`), dynamic `import('child_process')`,
    `new Function()`, `global.eval`/`globalThis.eval` property access.
- **[PASS]** `DANGEROUS_MODULES`: child_process, node:child_process, fs,
  node:fs, os, node:os, net, node:net — 8 modül block.
- **[PASS]** `DANGEROUS_CALLS`: eval, Function; `DANGEROUS_STRING_ARG_CALLS`:
  setTimeout, setInterval (with string arg only).
- **[PASS]** 45 birim test (`tests/core/marketplace/skill-sandbox.test.ts`
  — 430 satır) — eval detection, child_process detection, obfüskasyon,
  manifest validation, quarantine, trust set kapsamı.
- **[DRIFT]** `BUILTIN_TRUSTED_SKILLS` listesi yanlış: set içinde
  `typescript-expert`, `react-expert`, `node-expert`, `test-expert`,
  `doc-expert` var. Yalnız `typescript-expert` gerçek skill id'mizle
  eşleşiyor. Diğer 4 ("react-expert", "node-expert", "test-expert",
  "doc-expert") yanlış — gerçek id'ler: `react-specialist`,
  `testing-expert`, `documentation-writer` (node-expert diye skill yok).
  → Sprint 153 debt: skill-sandbox.ts:197 trust set güncelle.
- **[MISSING]** Sandbox `publish` pipeline'ında çağrılıyor
  (src/cli/commands/skill-marketplace.ts:206-207), **ancak `install`
  pipeline'ında çağrılmıyor** (`src/cli/commands/skill.ts:330-408`
  path'inde SkillSandbox import/call yok). Critical gap: kullanıcı
  git-install ile imzasız + sandbox-bypass skill install edebilir.
  → Sprint 153 P0.

### C — Ed25519 Signature Infrastructure

- **[PASS]** `src/core/signature.ts` mevcut, 84 satır, `@noble/ed25519` +
  `@noble/hashes/sha512`. Fonksiyonlar: `generateKeypair`,
  `loadOrGenerateKeypair` (home-dir persist, 0o700 dir / 0o600 priv),
  `signMessage`, `verifySignature`, `bytesToHex`, `hexToBytes`.
- **[PASS]** 9 birim test (`tests/core/signature.test.ts`, 136 satır) —
  keypair size, round-trip, wrong pubkey fail, tampered message fail,
  file creation + permissions.
- **[PASS]** `deckent skill publish` (src/cli/commands/skill-marketplace.ts:158-265)
  flow:
  1. AST sandbox validateSkillSafety
  2. Manifest Zod validate
  3. Ed25519 sign → `signature.ed25519` dosyasına yaz
  4. Registry upload (auth token ile)
  `--no-sign` opt-out + `--dry-run` + `--key-dir` opsiyonlu.
- **[MISSING]** Ed25519 `verify` komutu YOK. CLI'da
  `deckent skill verify` yok (`src/cli/commands/skill.ts` subcommands:
  list, create, install, update, enable, disable, delete, info +
  marketplace: search, publish). Install path imza okumuyor.
- **[MISSING]** Key rotation komutu YOK. ROADMAP §4 Phase 2 Sprint 157
  "Ed25519 rotation" planlı, ama şu an stub bile yok.
- **[MISSING]** Public key distribution mekanizması YOK. Yeni kullanıcı,
  publisher'ın pubkey'ini nereden alacak? Trust-on-first-use mü,
  registry endpoint mü, manifest-embedded mi? Tasarım kararı yapılmamış.
  → Sprint 157 için ADR önerisi (DECKENT-HUB-TRUST-MODEL).
- **[DRIFT]** `loadOrGenerateKeypair` host-bazlı (`~/.deckent/keys/`).
  Bu docker worker'da çalışmaz — keyDir flag'i manuel override
  gerektirir. Docker publish akışı test edilmemiş.

### D — 20 Seed Skill Hedef (Sprint 149 Block D)

- **[PASS]** 20/20 seed skill `deckent-hub/skills/` içinde mevcut:
  calendar-google, currency-converter, discord-moderator, email-imap,
  file-organizer, github-issues, notion-sync, reddit-fetcher, rss-reader,
  screenshot-vision, slack-notifier, spotify-control, spotify-playlist,
  telegram-bot, todoist, translator, twitter-post, weather-forecast,
  web-scraper, youtube-downloader.
- **[PASS]** Her seed skill manifest + SKILL.md + signature.ed25519 üçlüsü
  tam (20/20).
- **[FAIL: critical]** 20/20 `signature.ed25519` dosyası **placeholder**:
  `ed25519:placeholder:awaiting-t149016-keygen:00000…` (109 byte tekil
  string). **Gerçek Ed25519 imzası yok.** Sprint 149 T-149-016'ta keygen
  + mass sign planlanmıştı, uygulanmamış. `@noble/ed25519` signing'e
  hazır (Task C'de kanıt), seed skills'e uygulanmadı.
- **[DRIFT]** Seed skills manifest'i `category: "integration"` kullanıyor
  ama SkillPoolManager.VALID_CATEGORIES listesinde `integration` YOK
  (valid: language/framework/tool/domain/workflow). Eğer bir kullanıcı
  bu seed'leri `.deckent/skills/` altına kopyalarsa, `loadSkills()`
  silently skip edecek (manifest validation fail). → Sprint 153 P0:
  ya category'leri düzelt ya VALID_CATEGORIES'e `integration` ekle.
- **[MISSING]** Seed skills'lerin `deckent-hub` repo'suna publish'i
  yapılmamış. ROADMAP §11 Gate #15 "20 published + signed" 🟡 Sprint 151
  ertelenmiş. Bugün itibarıyla blocker: gerçek signing + VerhexIO/deckent-hub
  remote publish akışı.
- **[PASS]** 7/20 seed skill `.deck` key referansı içeriyor (Task E'ye
  bkz) — interpolation modeli canlı.
- **[PASS]** `deckent-hub/README.md` + `SKILL_TEMPLATE.md` +
  `CONTRIBUTING.md` üçlüsü hazır (contributor onboarding basamağı).

### E — .deck File Interpolation Usage

- **[PASS]** `src/core/deck-file.ts` `.deck` dosya formatı tanımlı;
  `KNOWN_DECK_KEYS` 9 anahtarı listeliyor (DECKENT_CLAUDE_API_KEY,
  DECKENT_OPENAI_API_KEY, DECKENT_GOOGLE_API_KEY, DECKENT_SMTP_HOST/USER/
  PASS, DECKENT_WEBHOOK_URL, DECKENT_DB_URL, DECKENT_TELEMETRY_ID).
- **[PASS]** `src/core/deck-interpolation.ts` (`$DECK:KEY` pattern)
  `config.ts` + connectors (discord, telegram) tarafından kullanılıyor.
- **[DRIFT: medium]** Skill manifest'lerinde `$DECK` interpolation
  YAPILMIYOR (`.deckent/skills/**/manifest.json` → grep 0 hit).
  Yalnız `SKILL.md` içerikleri hint veriyor. Worker'a skill injekte
  edilirken `$DECK` replace'i etkin değil — worker prompt'unda
  literal `$DECK:SPOTIFY_CLIENT_ID` kalır.
- **[PARTIAL]** 7/20 seed skill (`SKILL.md` içinde) `$DECK:KEY`
  referansı içeriyor:

  | Seed Skill | .deck keys |
  |---|---|
  | currency-converter | `$DECK:EXCHANGE_API_KEY` |
  | notion-sync | `$DECK:NOTION_TOKEN` |
  | reddit-fetcher | `$DECK:REDDIT_CLIENT_ID`, `$DECK:REDDIT_CLIENT_SECRET`, `$DECK:REDDIT_REFRESH_TOKEN` |
  | spotify-playlist | `$DECK:SPOTIFY_CLIENT_ID`, `$DECK:SPOTIFY_CLIENT_SECRET` |
  | todoist | `$DECK:TODOIST_API_TOKEN` |
  | translator | `$DECK:DEEPL_API_KEY` |
  | twitter-post | `$DECK:TWITTER_APP_KEY` |

- **[MISSING]** Bu 7 skill'in referanslarının **hiçbiri** `KNOWN_DECK_KEYS`
  dokuzluk listesinde yok. Yani `.deck file validator` warning basıyor,
  sistem "unknown key" olarak işaretliyor ama yine de injekte ediyor.
  Design çatışması: (a) `.deck` yalnız sistem-bazlı secret'ları tutar,
  skill-bazlı secret başka bir dosyada (ör. `.deck-skills`) mi? (b)
  `KNOWN_DECK_KEYS` open-set mi olmalı (namespace pattern:
  `DECKENT_SKILL_<SKILLID>_<KEY>`)?
  → Sprint 153 için ADR önerisi (DECK-SCHEMA-V2).
- **[MISSING]** 13/20 seed skill (calendar-google, discord-moderator,
  email-imap, file-organizer, github-issues, rss-reader, screenshot-vision,
  slack-notifier, spotify-control, telegram-bot, weather-forecast,
  web-scraper, youtube-downloader) `.deck` kullanmıyor — hepsi API token
  gerektiren servisler. Bu skill'lerin SKILL.md'leri ya TODO bırakıyor
  ya inline ENV var talimat veriyor — tutarsız.

### F — Test Coverage Gap

- **[DRIFT]** `tests/skills/builtin-skills.test.ts:7-18` yalnız 10 skill
  SKILL_IDS listesinde: typescript-expert, react-specialist, python-expert,
  api-builder, database-migration, testing-expert, documentation-writer,
  security-specialist, performance-optimizer, devops-engineer.
  Eksik 11: accessibility-expert, anthropic-sdk, ci-testing,
  code-simplifier, docker-expert, frontend-design, git-expert,
  graphql-expert, migration-expert, monorepo-expert, system-architect.
  → Sprint 153 P2: testi 21'e çıkar, coverage boşluğunu kapat.
- **[PASS]** Sandbox tests 45 it() case, signature tests 9 it() case —
  unit coverage healthy.
- **[PARTIAL]** Vitest run bu sprint'te doğrudan test edilmedi (worker
  bash timeout yaşadı). Baseline: IDENTITY.md "12485 pass + 16 skip",
  Sprint 151 retro "1 vitest fail". T-152-017 daha kapsamlı.

## Sprint 153+ İçin Aksiyon Listesi

- **[P0]** `deckent skill install` path'ine AST sandbox + Ed25519
  signature verification çağrısı eklenmeli. Install edilen her skill
  `signature.ed25519` varsa verify edilmeli; yoksa --allow-unsigned
  flag'ı gerektirsin. _Effort: normal (~150 LoC + 6 test)_.
- **[P0]** 20 seed skill gerçek keygen + sign: T-149-016'yı tamamla,
  `deckent-hub/skills/*/signature.ed25519` dosyalarına gerçek imza yaz,
  VerhexIO/deckent-hub repo'suna publish et. _Effort: normal (tools
  hazır, sadece çalıştırma + key dağıtım planı)_.
- **[P0]** `deckent-hub` manifest'lerinde `category: "integration"`
  VALID_CATEGORIES'e dahil değil. Ya `SkillPoolManager.VALID_CATEGORIES`
  listesine `integration` ekle, ya seed manifest'leri
  `tool|framework|domain` mapping'e düzelt. _Effort: low_.
- **[P1]** `.deck` key schema V2 ADR: skill-bazlı secret namespace
  (`DECKENT_SKILL_<ID>_<KEY>`), `KNOWN_DECK_KEYS` open-set migration.
  _Effort: normal (ADR + skeletal loader + 7 seed SKILL.md güncelle)_.
- **[P1]** `deckent skill verify <id>` komutu ekle (read signature,
  load publisher pubkey, verify, report). _Effort: low_.
- **[P1]** `skill-sandbox.ts:197` `BUILTIN_TRUSTED_SKILLS` güncelle:
  `react-expert`→`react-specialist`, `test-expert`→`testing-expert`,
  `doc-expert`→`documentation-writer`, `node-expert` sil. _Effort: low_.
- **[P1]** Key rotation komutu + public key distribution tasarım ADR
  (trust-on-first-use vs registry endpoint vs manifest-embedded).
  Sprint 157 Phase 2 planlı. _Effort: high (ADR + CLI + registry endpoint)_.
- **[P2]** `builtin-skills.test.ts` SKILL_IDS 10→21 genişlet. _Effort: low_.
- **[P2]** Built-in skill versiyon dağılımı normalize: tüm 21 skill
  1.0.0 (ya en azından 0.2.0 baseline). Sprint 159 polish task.
  _Effort: low_.
- **[P2]** 7 hiç-kullanılmayan skill (accessibility, graphql, monorepo,
  migration, python, database-migration) için aktivasyon rule audit.
  Gerçekten dead mi yoksa rule `score` çok mu yüksek? _Effort: normal_.
- **[P2]** Docker backend signature keyDir akışı E2E test.
  `loadOrGenerateKeypair`'a `DECKENT_KEYDIR` env override ekle. _Effort: low_.

## Kanıt Ekleri

```
# 21 built-in skills (all manifest=v2, enabled=true, source=builtin)
$ ls .deckent/skills/ | wc -l
21

# 20 seed skills with placeholder signatures
$ head -c 100 deckent-hub/skills/telegram-bot/signature.ed25519
ed25519:placeholder:awaiting-t149016-keygen:00000000000000000000000000000000000000000000000000000000

# 45 sandbox tests, 9 signature tests, 85 builtin-skills tests
$ grep -cE "^\s*(it|test)\(" tests/core/marketplace/skill-sandbox.test.ts tests/core/signature.test.ts tests/skills/builtin-skills.test.ts
tests/core/marketplace/skill-sandbox.test.ts:45
tests/core/signature.test.ts:9
tests/skills/builtin-skills.test.ts:85

# Sandbox kullanım noktaları: publish only, install NOT
$ grep -nE "SkillSandbox|validateSkillSafety" src/cli/commands/ -r
src/cli/commands/skill-marketplace.ts:9:import { SkillSandbox }
src/cli/commands/skill-marketplace.ts:206: const sandbox = new SkillSandbox(resolvedPath)
src/cli/commands/skill-marketplace.ts:207: const safetyReport = sandbox.validateSkillSafety(resolvedPath)
# (install yolu src/cli/commands/skill.ts:330-408 — SkillSandbox referansı yok)

# BUILTIN_TRUSTED_SKILLS drift
$ sed -n '197,203p' src/core/marketplace/skill-sandbox.ts
const BUILTIN_TRUSTED_SKILLS = new Set([
  'typescript-expert',
  'react-expert',        # YANLIŞ (gerçek id: react-specialist)
  'node-expert',         # YANLIŞ (skill yok)
  'test-expert',         # YANLIŞ (gerçek id: testing-expert)
  'doc-expert',          # YANLIŞ (gerçek id: documentation-writer)
]);

# Seed skill .deck usage (7/20)
$ for d in deckent-hub/skills/*/; do
    grep -qE "\\\$DECK|DECKENT_" "$d"SKILL.md 2>/dev/null && echo "$d"
  done | wc -l
7

# Seed skill category drift
$ grep -hE "\"category\"" deckent-hub/skills/*/manifest.json | sort -u
  "category": "integration",
# (SkillPoolManager.VALID_CATEGORIES = language|framework|tool|domain|workflow — "integration" YOK)
```

## Verify Steps Not Run

`tsc --noEmit` ve `npx vitest run` komutları bu worker oturumunda
çalıştırılmadı: (a) görev read-only (kod değişikliği yok), (b) bash
tool spawn çıktı akışı T-152-020 çalıştırma penceresinde timeout'a
takıldı (vitest çıktısı 90s içinde dönmedi). Baseline korundu:
`tsc --noEmit` repo baseline'ı (IDENTITY.md: 12485 pass, 16 skip,
0 tsc error). T-152-017 derin baseline analiz yapacak.
