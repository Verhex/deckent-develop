# Codex Prefix-Mimarisi — 7094 WORKER-PROMPT-COST codex ayağı (tasarım)

> solution-architect kimliğiyle. Ölçüm-tarihi 2026-08-21; codex-cli 0.148.0.
> Owner-şartı: bu doküman tasarım-mühürlüdür; uygulama ve sonuç AYRI mühür alır.

## (a) Ölçülmüş envanter-özeti

- Gerçek prompt-kompozisyonu (host, `codex debug prompt-input`, deterministik —
  3 koşuda sha-özdeş): **43.169B / 5 kalem**. Kalem[0] developer 17.706B
  (skills+apps+permissions), kalem[1-2] multi-agent kimlik 2.535B, kalem[3]
  **user 22.926B** (recommended_plugins 3.272 + **repo AGENTS.md ~18.852** +
  environment_context 802), kalem[4] gerçek prompt.
- `codex exec` aynı şekli taşıyor (355 rollout'luk gerçek session-store kanıtı).
- **Cache zaten çalışıyor:** sprint-497 canlı verisi input 174.820'nin
  140.032'si cached (%80 hit). OpenAI prompt-caching otomatik; GPT-5.6+ katı
  **1.024-token minimum** + **exact-prefix** + tek TTL 30m; cached=0.1×.
- Tek etkili AGENTS.md-bastırma kolu (ölçülmüş): `-c project_doc_max_bytes=0`
  → **−18.766B**. Diğer kollar: permissions −9.168, env-ctx −845, apps −646.
  Kombine −%68 (43.169→13.763) ve enjekte marker byte-0'da.
- **Ö1 deneyi (gerçek-binary, bu repo):** `-c model_instructions_file=<f>` ile
  shell-tool ÇALIŞTI (exit-0) ve marker-talimatı final-mesajda uygulandı →
  kanal tool-protokolünü kırmıyor (R2 kapandı). Kanıt: scratchpad/o1-exp/out.jsonl
  (turn.completed usage: in 23.995 / cached 16.896).
- Claude-emsal seam'leri hazır: buildWorkerCoreSystemPrompt provider-agnostik;
  content-addressed `.tasks/.worker-core-<digest>.md` emit-deseni
  (spawn-backend-docker:5866-5896); spec-override ternary (:5900-5902) tek
  genişleme-noktası; `coreExternalized` provider-gate'i task-builder:2740-2745.

## (b) İlkeler

1. **Kararlı-prefix > küçük-prefix.** F2a emsali: daraltma cacheWrite'ı patlatıp
   maliyeti +%20-38 ARTIRDI. Her kol tek-değişkenli A/B + `measuredHitRatio`
   (cost-calculator:371) ile doğrulanmadan kalıcılaşmaz; 1.024-token tabanının
   altına inilmez.
2. **Authority-inversion kapanır (R1):** repo AGENTS.md'si owner/brain-yönetişim
   metnidir; worker'a user-role'de gitmesi maliyetten bağımsız yanlıştır.
   Worker'ın gerçekten işine yarayan bloklar (architecture/commands/gotchas
   sınıfı) deckent-owned core'a SEÇİLMİŞ olarak taşınır — "hepsi ya hiçbiri" değil.
3. **İçerik argv'ye binmez (R3):** core-içerik yalnız content-addressed dosyayla
   taşınır (`model_instructions_file` + mevcut `.worker-core-<digest>.md`);
   `developer_instructions` inline-kanalı KULLANILMAZ.
4. **Fail-closed'a karşı fail-soft sınırı:** `--strict-config` spawn'a
   EKLENMEZ (R7 — tanınmayan anahtar worker'ı öldürür); `-c` kolları codex'in
   kendi şemasında VALID-kanıtlı anahtarlarla sınırlıdır (envanter matrisi).
5. **Prefix-volatilite kaynakları sabitlenir (R5):** codex sürümü Dockerfile'da
   PİNLENİR; core dosyası content-addressed kalır; volatil environment_context
   zaten kuyruktadır — önüne enjeksiyon yapılmaz.
6. **ADR-G-027 aynen:** atanmış skill/ADR gövdesi kesilmez; optimize edilen
   taşıma-kanalı ve keşif-kataloglarıdır, worker-erişimi değil.

## (c) Hedef mimari (tipli sözleşme)

- `ProviderCommandSpec`'e opsiyonel alan: `systemPromptCoreArgs?: (hostCorePath:
  string, containerCorePath: string) => string[]` — codex için
  `['-c', 'model_instructions_file=<containerCorePath>']` üretir; claude'un
  mevcut `--system-prompt-file` bileşimi de zamanla bu alana taşınabilir
  (bu dalgada claude yolu DEĞİŞMEZ — davranış-koruma).
- `ProviderCommandSpec`'e opsiyonel alan: `contextSuppressionArgs?: string[]` —
  codex: `['-c','project_doc_max_bytes=0']` (C1-kolu; default'u config-bayrağı
  belirler). Diğer kollar (permissions/env-ctx/apps) AYRI bayraklar altında,
  default KAPALI, canary-ölçümle açılır.
- Config (prompt-bloğu): `codex_core_channel: boolean` (default FALSE — kör
  default-on yasak; canary sonrası owner-kararıyla TRUE),
  `codex_suppress_project_doc: boolean` (default FALSE, aynı kural).
- `coreExternalized` gate'i: `task.provider === 'claude'` sabiti yerine
  "spec.systemPromptCoreArgs tanımlı VE provider-bayrağı açık" yüklemi —
  yetenek-tabanlı, provider-adı-hardcode'suz (KANUN 10 ruhu; provider-adı
  yalnız spec-tablosunda yaşar).
- Emit-yolu: mevcut content-addressed `.worker-core-<digest>.md` AYNEN;
  spec-override ternary'si provider-nötr hale gelir (spec alanı varsa uygula).
- Dockerfile: `npm i -g @openai/codex@<pinli-sürüm>`; worker-image-check
  sürüm-drift'ini raporlar.
- Pricing: `gpt-5.6-*` registry-girişlerine açık `cache_read_input_token_cost`
  (bugün 0.1×-fallback'e örtük güven var; açık-veri 0-hardcode'la çelişmez —
  kaynak yine registry).

## (d) Kullanıcı-yolculuğu (worker-koşusu örneği)

1. Scheduler task için `buildWorkerCoreSystemPrompt` üretir (bugünkü gibi).
2. Docker-backend digest'ler, `.tasks/.worker-core-ab12….md` yazar (varsa atlar).
3. Codex argv: `codex exec --skip-git-repo-check --json -c
   model_instructions_file=/workspace/.tasks/.worker-core-ab12….md
   [-c project_doc_max_bytes=0] -c model_reasoning_effort=high --model gpt-5.6-sol`
   — prompt yine stdin'den.
4. Worker çekirdek-disiplini base-instructions-katmanında alır; AGENTS.md
   user-role'e HİÇ girmez (bayrak açıksa); inline T0-blokları prompttan düşer
   (coreExternalized artık codex'te de true).
5. Sonraki worker aynı core-digest'i paylaşır → exact-prefix korunur → cache-hit.

## (e) Dilim planı + çıkış-kanıtları

- **T3 (arayüz-mührü, ÖNCE):** provider-command-spec alanları + testleri.
  Kanıt: spec-testi yeşil; claude-argv BAYT-AYNI (regresyon-pin).
- **T7 (şema-mührü, ÖNCE):** config-types + config default'ları (FALSE).
  Kanıt: config-testi; default-kapalı davranış bayt-aynı.
- **T2 (tek-sahip):** spawn-backend-docker — ternary provider-nötrleşir +
  codex core-emit + suppression-args bileşimi. Kanıt: mount/argv pinleri;
  bayrak-kapalı bayt-aynı.
- **T5:** task-builder gate'i yetenek-tabanlı + scheduler/sprint-spawner
  dokunuşları + tmux.ts ölü-seam kararı (tüket ya da kaldır). Kanıt: codex-task
  prompt'unda inline-core YOK + core-dosya argv'de VAR pinleri.
- **T4:** registry cache-read fiyat-girişleri. Kanıt: cost-calculator pini.
- **T6:** Dockerfile sürüm-pin + image-check. Kanıt: rebuild'de sürüm sabit.
- **T8 (SON, gerçek-binary):** tek-codex-task canary — `.prompt`'ta çekirdek
  inline YOK, `turn.completed.usage`'da cached-oran ölçümü; ardından bayrak-açık
  küçük sprint A/B (measuredHitRatio + USD).

## (f) Kapsam-dışı + owner-karar noktaları

- KAPSAM-DIŞI: permissions/env-ctx/apps bastırma-kollarının default-ON'u
  (ayrı canary); claude-yolunun spec-alanına taşınması; `prompt_cache_key`
  yönetimi (codex-knob'u bulunamadı — 15rpm/anahtar bandı izlenir);
  subprocess/tmux backend'lerine codex-core taşınması.
- OWNER-KARAR: bayrakların default-TRUE'ya çekilmesi (canary-verisiyle);
  AGENTS.md'den core'a taşınacak "seçilmiş-özet" içerik-listesi.

## (g) Mühür planı

Tasarım: bu doküman xverify (author claude → verifier codex). Uygulama: dalga
sonu tek mühür (değişen-dosya dilimleriyle). Sonuç: T8 canary-kanıt dosyası +
measuredHitRatio A/B mührü. HOLD/UNCLEAR kapanış değildir.
