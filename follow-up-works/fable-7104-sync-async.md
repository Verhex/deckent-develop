# Fable — 7099 bağlantılı 7104 sync async Git kapanışı

Owner: Alperen, canlı paralel üretim talimatı 2026-09-08.
Tek ACTIVE outcome 7099; mevcut7104 sync tesliminin event-loop regression düzeltmesi.
Silinme tetiği: root fan-in + kalıcı kanıt arşivinden sonra.

## Güncel devam — 2026-09-08T18:32Z

V5 teslimi root bağımsız review sonrası dfb4697e7 ile MAIN'e alındı.
Exact9committed blob eşleşti; main179/179test + tsc0. Candidate9actualCLI ve
ready→spawned suspension fault probe bounded timeout/owned closure PASS.
Kalıcı arşiv terminal-7104-sync-main-lOyYT6; manifest1323901f51ee10d17d51a6838624133edea60559141f41e5b14ced8c06e9dec7,
13checksum root tarafından doğrulandı. Main fullbuild58073 exit0, kaynak eşleşti;
bot593010 yeniden başladı. Eski MCP reconnect ve bütün7099 closure açık.
V1–V5 kaynak/kanıt FROZEN; yeni görev veya tekrar audit yok. ENTRY1054 sonuç bildirimi.

### Önceki v4 bulgusu — 2026-09-08T17:52Z

V4 ENTRY1049 teslimi digest doğrulandı; 15 source/compiled pin ve 174/174
test kaydı eşleşti. Root actual compiled `ready→spawned` aralığına SIGSTOP
enjekte etti: timeout50ms/grace20ms, 1807ms sonra hâlâ unresolved; yalnız
testin kendi anchor handle'ını SIGKILL etmesi spawn_error döndürdü. Timer
spawn acknowledgment SONRASINDA kuruluyor. Yeni kanıtla ENTRY1051 REVISE:
aynı dört owned dosyada lifetime deadline, bounded IPC/spawn ve cleanup.
Arşiv: `/home/alperen/deckent-recovery-20260904/terminal-7104-anchor-spawn-gap-u256J5`;
result SHA `230e592ed18995ffb6d18b6644962f5d0167205987f86da381d10fa2caec9038`.
V4 ve eski kanıtlar FROZEN; main fan-in HOLD. Yeni outcome açılmadı.

### Önceki atama

ENTRY1047 v3 teslimi alındı; ENTRY1048 aynı paket için lifetime-anchor
bağımlılığını yürütmeye verdi. V3, sonlandırılamayan alt süreci artık başarı
göstermiyor; fakat kapanış henüz kanıtlanmadı, main fan-in yok.

Özgün kapsamın bounded ekleri: `src/core/process-group-anchor.ts` ve gerekirse
`tests/core/process-group-anchor.test.ts`; consumer mevcut sync-git-process.ts,
gerçek ağaç testleri mevcut sync-async-liveness.test.ts. Önceki async mock
caller düzeltmeleri `tests/cli/sync.test.ts` ve
`tests/cli/commands/sync-onboard-upgrade-overhaul.test.ts` de teslim kapsamındadır.
Anchor kimliği/IPC handshake/target exit ayrı; stdout/stderr kontrol kanalı değil.
Git çıktıktan sonra grup sahipliği korunmalı, deadline ve parent disconnect
temizliği bounded olmalı. Kimliği bilinmeyen/reused PID'e sinyal yok. Kaçmış
session'ın sonlandığı original group boş diye iddia edilemez. Windows için
kanıtlanamayan tree closure safe-stop olur; macOS/Windows actual NOT_RUN korunur.
V1–V3 başarısız kanıtlar korunur; yalnız değişmiş v4 girdisi doğrulanır.
Ek bootstrap yolu gerekirse root exact producer→consumer bağımlılığını değerlendirir.

## Hazır ortam

- Worktree: /tmp/deckent-fable-sync-async-U290BZ
- Branch: implementation/fable-sync-async-20260908-U290BZ
- Base: ef6dc6b012bdd54853e4cb5b97536a79120634f2
- Root private build:all exit0, pre/post source eşit:
  ab2d81354e8fcd333ae0450cc360e3ffee31e8da5cec808268b800f91a0dff7a
- Build: /tmp/deckent-provider-sync-proof-IFgNWi/fable-sync-environment-build-v1-result.json
- Root dependencies readonly symlink; Dashboard dependencies private kopya.
  Install/login/auth/config/DB/runtime kopyalanmadı. Eski MCP candidate FROZEN.
- AGENTS/DECKENT/ilgili skill ve mevcut7104 sözleşmesini oku.
  Manuel owner-approved ADR-D-007 kapsamı; mode değişmez, run yaratılmaz.

## İş ve exact scope

Kaynak kanıtı: src/cli/commands/sync.ts:286 ls-tree ve :309 diff yeni spawnSync
call site. Ratchet baseline genişlemez. Normal sync çağrıları da event loop'u
bloklamadan aynı typed provenance/aggregate sonucunu üretmeli.

Write:
- src/cli/commands/sync.ts: Git subprocess zincirini async çevir;
  getChangedFiles → collectGitChanges → runSync / registerSync consumers;
  aynı dosyanın getFileGitDate/getLastSprintTimestamp/isGitRepo/probeCommitsSince/
  getCommitsSince zinciri de gerekiyorsa async taşınır. Tüm await tüketicileri bağla.
- src/cli/helpers/sync-git-process.ts (yalnız mevcut async Git mekanizması bu
  timeout/output/typed-result sözleşmesini karşılamıyorsa yeni dar adapter).
- tests/cli/commands/sync.test.ts
- tests/cli/sync-git-detection.test.ts
- tests/cli/sync-aggregate.test.ts
- tests/cli/sync-truth.test.ts
- tests/cli/sync-async-liveness.test.ts (yeni).
- proof/sync-async/**.

Diğer source/tests, src/cli/helpers/messages.ts, CLI catalog/aliases, MCP,
autonomous/custody/finalizer, lint baseline/registry, package files, docs/MASTER,
main/index/auth/memory.db/runtime READ_ONLY. Ek exact çağıran zorunluysa kanıtla
root'a bildir; aynı işi büyütmek için bağımsız modüller açma. Main fan-in rootta.

## Semantik korunacak

- unavailable Git sonucu zero changes gibi görünmez; mevcut issue codes korunur.
- SHA-1 ve SHA-256 root-history fallback; rename/add/delete/modified sınıfları.
- commitCount güvenli tamsayı doğrulaması (async reject semantiği açık).
- CLI --json tek belge stdout, warnings stderr; EN/TR metin mevcut katalogdan.
- Missing-baseline gerçek conflict'e dönmez; source provenance ve aggregate bozulmaz.
- Async spawn shell:false, arg-array; mevcut platform process termination adapter.
  Timeout/output overflow/signal/ENOENT/nonzero exit açık unavailable/HOLD olur.
  Kesilmiş Git stdout parse edilip başarılı dosya listesi sayılmaz.
- Timeout sonrası child terminal/reap kanıtı; bilinmeyen child üstüne retry yok.
  Mevcut sabit10s timeout davranışını sessiz gevşetme.
- Paralel Git fırtınası yaratma; tek senkron zinciri kontrollü await'e dönüştür.
  Yeni provider/auth/budget policy veya repo-wide async refactor yok.

## Tek teslim döngüsü

1. Eski kaynak + exact diff/pins; focused regression ve typed subprocess tests.
2. Aynı hedefli testlerde gerçek private Git repo SHA1/SHA256, no-git,
   empty-history, missing/invalid since, paths with spaces/Unicode ve rename.
3. Async liveness: geciken disposable child sırasında event loop/abort ilerler;
   timeout, output overflow, signal, reap doğrulanır (mock-only yetmez).
4. tsc --noEmit, scoped sync battery, lint-no-spawnsync baseline değiştirmeden.
   Önceden var unrelated failure ayrı sınıf, bu iki yeni callsite kalmamalı.
5. Private build ALLOW → canonical build; actual compiled sync EN/TR JSON/text
   yalnız disposable repo/HOME/DECKENT_HOME/XDG'de, main/realdogfood'a dokunmadan.
   Yeni kaynak/input varsa bir fresh proof; başarısız eski kanıtlar korunur.
6. Raw stdout/stderr, command/exit, child-dead, source/build/runner pre/post SHA,
   değişen exactfiles ve residualHOLD tek FINAL_DELIVERY.

Tek ağır test/build process; maxWorkers1, heap3072MiB. Build/komut10dk,
stream2MiB upper bound; proof childpool en çok2, kaynak yetmezse1.
macOS/Windows test edilmediyse NOT_RUN; Linux sonucu tüm platformkanıtı değil.
Başka provider self-XVerify veya canonical DONE/receipt yazma.
Kanal communication.md; yalnız anlamlı teslim/engel, ACK/watcher döngüsü gerekmez.
