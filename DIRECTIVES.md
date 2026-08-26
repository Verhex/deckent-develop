# DOGFOOD-SKILL EVRİMİ — DALGA-3: CORE-DOC/WORKSPACE TAZELEME (owner-onaylı planın son dalgası, 2026-08-26-gece)

## Goal

Worker'ların her spawn'da okuduğu workspace-sözleşme dokümanları (WORKER-GUIDE, TOOLS,
BOOT, IDENTITY) bugünkü motor-gerçekleriyle hizalanır ve mevcut-workspace için canonical
regen yolu kazanılır: render-kodu güncellenir (T1), `deckent sync`e workspace-kolu eklenir
(T2, skill-kolu emsali), gerçek-binary regen + project-stack doğruluğu kanıtlanır (T3).
Ürün karşılığı: her Deckent projesinde worker'lar bayat değil canlı sözleşme okur.

## Execution contract

- Kalite barı aynen: i18n-FIRST (user-facing CLI string'i yalnız getMessage en+tr),
  0-hardcode (sayı/komut/model literal'i yasak — sayılar generated-manifest/registry'den),
  hermetik test (tmpdir; VITEST_MAX_FORKS=2), mevcut-pattern (yeniden icat yok).
- Test komutların TASK-SCOPED ve TEKİLDİR (global gate yok, `&&` zinciri yok) — global
  gate'ler landing'de ana-şeritçe koşulur.
- Doğrulamanın tükettiği her authority dosyası Reads listendedir; Reads dışına yazma.
- Ürün-bug kanıtında dosyaya dokunmadan NO_GO + exact kaynak-konum (dosya adı, satır no).

## Task 1: WORKER-GUIDE/BOOT render-içeriğini motor-gerçekleriyle hizala
- Files: src/orchestra/workspace-artifacts.ts, tests/orchestra/workspace-artifacts.test.ts
- Reads: src/core/workspace-artifact-contract.ts, src/core/execution-landing-proposal.ts, src/orchestra/execution-landing-coordinator.ts, src/orchestra/spawn-backend-docker.ts, src/core/execution-recovery.ts, src/agents/worker.ts, .claude/rules/worker-default.md, .deckent/workspace/WORKER-GUIDE.md, .deckent/workspace/BOOT.md
- Priority: HIGH
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/workspace-artifacts.test.ts
### Description
renderWorkerContractSection (:245) ve renderBootSequenceSection (:235) bugünkü motor
gerçeklerinin gerisinde. Reads'teki kaynaklardan damıtarak güncelle: (a) worker sonucu
artık execution-landing-proposal akışıyla settle olur (landing-proposal-entry — coordinator
zinciri); (b) heartbeat tek-yazım + monotonic-token disiplini (worker-default kuralı +
execution-recovery monotonic seam'i); (c) spawn-tamamlanma gerçeği lastSpawnCompletion
(spawn-backend-docker) üzerinden izlenir. Metinler İngilizce-default render'dır (bu
dosyalar workspace-projection'ı; CLI-yüzeyi değil). Var olan CONTRACT-blok/digest
mekanizmasına dokunma — içerik değişince digest'i üreten mevcut akış kendisi günceller.
Mevcut test dosyasındaki pin'leri yeni içeriğe hizala; assertion zayıflatma yasak.

## Task 2: deckent sync workspace-kolu — mevcut projede canonical regen yolu
- Files: src/cli/commands/sync.ts, src/cli/helpers/messages.ts, tests/cli/sync-workspace.test.ts
- Reads: src/orchestra/workspace-artifacts.ts, src/core/workspace-artifact-contract.ts, src/cli/commands/init-steps.ts, src/cli/commands/init-templates.ts, tests/cli/sync-skill.test.ts
- Priority: HIGH
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/cli/sync-workspace.test.ts
### Description
Bugün workspace-dokümanlarını yeniden üretmenin tek yolu init — mevcut projede regen yolu
YOK. Dalga-1'in sync skill-kolu emsaliyle (aynı dosyadaki desen) `deckent sync`e
workspace-kolu ekle: managed CONTRACT-bloklarını renderer'lardan yeniden üretir, digest
uyuşuyorsa dokunmaz (idempotent), uyuşmuyorsa günceller ve değişen dosyaları raporlar;
kullanıcı-metinleri getMessage kataloğuna (en+tr). IDENTITY'nin kullanıcı-düzenlenebilir
bölgelerine DOKUNULMAZ — yalnız managed/AUTOGEN blokları yenilenir (init-templates'teki
bölge-ayrımı otorite). Test tmpdir-hermetik: sahte workspace kur, bayat blok + regen +
idempotency (ikinci koşu 0-değişiklik) pinle.

> NOT (ana-şerit landing-adımı — sprint-DIŞI): T1+T2 landed+build sonrası gerçek-binary
> `deckent sync` regen + idempotency + project-stack doğruluğu ana-şeritçe koşulur ve
> kanıt MASTER-evidence'a yazılır. Sprint yalnız T1+T2'dir.
