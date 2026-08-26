# LANE-BRIEF — CONFIG DESCRIPTOR REGISTRY (G1B öncüsü) · lane/descriptor-registry-20260826

> Protokol: `docs/governance/parallel-lane-protocol.md` (bu worktree'de mevcut — ÖNCE OKU).
> Şerit sahibi: Codex. Ana-şerit: Claude (kernel + MASTER + merge yetkisi ondadır).
> Owner: Alperen. Bu brief şeridin yazım-sözleşmesidir; dışına çıkma.

## Görev (iki fazlı — ANALİZ ÖNCE)

Konu: **Config Descriptor Registry** — MASTER 470 CONFIG-TRUTH-001 / audit G1B'nin çekirdeği:
TS authored/resolved tipler, runtime schema, defaults, CONFIG_METADATA, CLI discovery,
Dashboard form-katalog ve en/tr şema-dokümanlarının TEK canonical descriptor-registry'den
ÜRETİLMESİ. Bugün hepsi el-yazımı ve drift'li (kanıt: config-completion audit — 141 root /
1002 semantic leaf / 1146 union path; CONFIG_METADATA 55/49 eksik; truth-gate 589
expected-red, CI'a bağlı değil).

### Faz-A — ANALİZ + PLAN (bunu bitirmeden koda geçme)
Çıktı dizini: `docs/audits/descriptor-registry-2026-08-26/`
1. Kaynak-okuma: `src/core/config-types.ts`, `src/core/config.ts` (createDefaultConfig +
   resolver bölgeleri), `CONFIG_METADATA` tüketicileri, `scripts/lint-config-truth.mjs`,
   Dashboard `CONFIG_FIELDS`, `docs/en/reference/configuration-schema.md` (+tr) ve
   audit-korpusu: branch `audit/config-completion-20260825` commit `d2e9a1247`
   (`docs/audits/config-completion-2026-08-25/` — özellikle CONFIG-FIELD-MATRIX,
   field-universe.json sayımları, CFG-011/012/014/021 bulguları).
2. `DESIGN.md`: descriptor-şeması önerisi — alan başına: path, authored/resolved tip,
   presence (optional / required / required_when_parent_present), default-taksonomisi
   (NO_DEFAULT / EFFECTIVE_DEFAULT / STARTER_VALUE / SAFETY_FALLBACK / POLICY_INHERITED /
   PLATFORM_RESOLVED), lifecycle (ACTIVE / OPT_IN / DEPRECATED / INTERNAL / RESERVED /
   PLATFORM_UNSUPPORTED / REMOVED), impact-sınıfı (hot-reload / next-run / restart),
   sensitivity (secret-redaction için), en/tr açıklama anahtarları, üretilecek artefakt
   listesi. İmported-alias / mapped-type / record / array / discriminated-union / dynamic
   namespace kapsaması AÇIKÇA çözülmeli (audit'in 449→1002 açılımı).
3. `PLAN.md`: aşamalı üretim planı (registry-veri-modeli → generator'lar → equality-gate →
   mevcut el-yazımı artefaktların kademeli emekliliği), her aşamada kabul-ölçütü + hangi
   MASTER satırını güçlendirdiği (470 ana; 4210/471 cross-link). MVP YASAK (LAW 3) —
   milyon-ölçek/cross-platform baştan; ama aşamalandırma serbest.
4. `verify-artifacts.mjs`: kendi artefaktlarının fail-closed doğrulayıcısı (dosya varlığı +
   sayım-tutarlılığı + digest'ler; config-audit'teki emsalin küçüğü).
5. `HANDOFF.md`: versioned teslim-özeti (ne okundu, sayımlar, açık sorular, owner-karar
   adayları — özellikle CFG-011 6-çelişen-default kararına girdi hazırla).

### Faz-B — PROTOTİP (yalnız Faz-A bitince)
Çıktı dizini: `lab/descriptor-registry/`
1. Registry veri-modeli + ~20 temsilci alanlık örnek-registry (basit + nested + record +
   union + dynamic birer örnek dahil).
2. İki generator prototipi: (a) TS-tip-üreteci (authored+resolved interface çıktısı),
   (b) metadata/doc-üreteci (CONFIG_METADATA-benzeri + en/tr şema-tablosu). Çıktılar
   `lab/descriptor-registry/generated/` altına — ÜRETİM DOSYALARINA YAZMA.
3. `equality-check.mjs` prototipi: gerçek `src/core/config-types.ts`'i SALT-OKUYUP örnek-20
   alan için registry↔kod eşitliğini raporlar (drift-listesi çıktısı).
4. Kendi test/koşum talimatı `lab/descriptor-registry/README.md`'de (node ile bağımsız
   koşulur; repo build/test zincirine DOKUNMA).

## WRITE-ALLOWLIST (yapısal sınır — tek istisna yok)
- `docs/audits/descriptor-registry-2026-08-26/**`
- `lab/descriptor-registry/**`
- `LANE-BRIEF.md` (yalnız durum-notu ekleri), `LANE-STATUS.md`

YASAK: `src/**`, `tests/**`, `scripts/**`, `package.json`, `docs/MASTER-PLAN.md`, `docs/en|tr/**`,
`.deckent/**`, `.brain/**`, `DIRECTIVES.md`. Üretim dosyasında değişiklik gerekirse:
FINDING yaz (exact dosya:satır + önerilen diff), UYGULAMA.

## Oturum ritüeli
- Başlangıç: `git fetch origin && git rebase origin/main` (çakışırsa DUR ve raporla).
- Bitiş: commit (Türkçe, `lane(descriptor-registry): …` öneki) + `git push -u origin
  lane/descriptor-registry-20260826` + `LANE-STATUS.md` güncelle.
- Commit/merge/push'u MAIN'e ASLA yapma; MASTER'a yazma; sprint/deckent-state mutasyonu yok.
- Kalite barı aynen: i18n-first (prototip çıktılarında en/tr çifti), 0-hardcode ilkesine
  saygı, dürüst raporlama (varsayım etiketsiz söylenmez).

## Teslim
Faz-A ve Faz-B ayrı ayrı teslim edilebilir. Teslim = push + HANDOFF.md + tek-mesaj özet
(validator sonucu + digest'ler). Admission ve main'e eritme ana-şeridin işidir
(protokol §6); senin branch'in referans-kanıt olarak korunur.
