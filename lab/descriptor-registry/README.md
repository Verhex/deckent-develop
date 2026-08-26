# Config Descriptor Registry — Faz-B Prototype

Bu dizin, `CONFIG-TRUTH-001` için Faz-A tasarımını executable bir registry prototipine
dönüştürür. Tamamı lab sınırındadır: production authority değildir, production dosyası üretmez,
runtime'a bağlanmaz ve repo build/test zincirine katılmaz.

## Kapsam

- `registry.mjs`: 20 temsilci config descriptor'ı; basit, nested, array, finite/dynamic
  record, union, imported alias ve discriminated union örnekleri.
- `model.mjs`: fail-closed schema compiler, canonicalization, digest, census ve TypeNode renderer.
- `messages.mjs`: registry alanları ve generated docs için eş en/tr message catalogları.
- `generate-types.mjs`: aynı registry'den authored ve resolved TypeScript projections.
- `generate-metadata-docs.mjs`: CONFIG_METADATA-benzeri JSON/TypeScript metadata ile en/tr
  schema dokümanları.
- `equality-check.mjs`: gerçek `src/core/config-types.ts` dosyasını salt-okur; 20 authored path'in
  type, presence ve record-key grammar eşitliğini source line evidence ile raporlar.
- `verify.mjs`: schema negatif-kontratlarını, generator determinizmini, committed outputları,
  source eşitliğini, census/digest zincirini ve varsa versioned handoff receipt'ini doğrular.

`generated/` içeriği commit edilen, yeniden üretilebilir kanıttır; hiçbir generator bu dizinin
dışına yazamaz. Atomic write + deterministic ordering kullanılır.

## Bağımsız koşum

Repository kökünden Node.js 24+ ile çalıştır:

```sh
node lab/descriptor-registry/generate-types.mjs --check
node lab/descriptor-registry/generate-metadata-docs.mjs --check
node lab/descriptor-registry/equality-check.mjs --check
node lab/descriptor-registry/verify.mjs
```

Bu komutlar yalnız Node built-in modüllerini kullanır; `npm install`, `npm run build` veya
`npm test` gerektirmez. Generated dosyaları bilinçli registry değişikliğinden sonra yenilemek için:

```sh
node lab/descriptor-registry/generate.mjs --write
node lab/descriptor-registry/equality-check.mjs --write
node lab/descriptor-registry/verify.mjs
```

`--check`, eksik/stale outputta non-zero; equality check herhangi bir type/presence/key driftinde
non-zero; `verify.mjs` tüm kontratlarda fail-closed davranır.

## Semantik sınırlar

- Authored projection, kullanıcı tarafından yazılabilen sparse şekli; resolved projection,
  resolver/policy sonrası tüketici şekli önerisini temsil eder.
- Default taxonomy değerleri production kararı değildir. Özellikle `CFG-011_OWNER_PROPOSAL`
  provenance'lı `mode`, `memory_budget`, `decay_after_sprints`, `spawn_backend` ve
  `docker_timeout` değerleri Faz-A karar girdileridir; owner receipt olmadan product cutover
  authority'si kazanmaz.
- Equality checker TypeScript compiler yerine bounded, comment/string-aware structural reader
  kullanır. Kapsadığı 20 path için fail-loud'dur; bütün 1.000+ semantic leaf evrenini kapsadığı
  iddiasında bulunmaz.
- Generated TypeScript yalnız contract demonstrator'dır. Production `src/core/config-types.ts`,
  runtime schema/default resolver, CLI, Dashboard ve docs için wiring yapılmamıştır.
- Secret material descriptor'ına default koymak compiler tarafından reddedilir; metadata yalnız
  sensitivity sınıfı taşır, secret değer üretmez veya okumaz.
