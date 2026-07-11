# Affected-Tests Gate — Kullanım Rehberi

`verify:affected` gate'i, bir değişiklik-setinin **hangi test dosyalarını gerçekten
etkilediğini** statik bir ESM import-graph üzerinden hesaplar ve yalnız onları koşar.
İki script'ten oluşur:

- **`scripts/affected-tests.mjs`** (resolver, born-400-001) — saf `değişen-dosya →
  etkilenen-test` fonksiyonu. Git'e hiç dokunmaz; changed-file listesini caller'dan alır.
- **`scripts/ccverify-affected.mjs`** (gate-runner, born-400-002) — `npm run
  verify:affected` bunu çalıştırır. Git'ten changed-file'ları toplar, resolver'ı
  (`computeAffectedTests`/`parseChangedList`) import edip çağırır, sonra `npx vitest
  run <affected-dosyalar>` spawn eder.

## 1. Ne işe yarar

Bir PR/commit'te değişen dosyaların **transitif olarak import ettiği** `tests/**`
altındaki her `.test.ts`/`.test.tsx` dosyasını bulur — yani "bu değişiklik hangi
testleri kırabilir?" sorusunun cevabı. Tarama `src/**`, `tests/**` ve `scripts/**`
üzerinde statik bir reverse-import-index kurarak yapılır (regex tabanlı; TS parser
kullanılmaz — yorum-içi false-positive kabul edilir, çünkü **kaçırılan bir test,
fazladan koşulan bir testten daha kötü**).

Bu gate'in çözdüğü kök-sorun: **blast-radius-ıskalama** sınıfı — bir değişikliğin
etkilediği testlerin bir kısmı koşulmadan "yeşil" görünmesi. Reverse-graph
over-inclusive tasarlandığı için (bkz. Bölüm 4), amaç hiçbir etkilenen testi
atlamamaktır; fazladan test koşmak kabul edilebilir maliyettir.

`scripts/**` de graph'ın bir parçasıdır (born-606 kapanış-fix) — gate-script'lerinin
kendisi de load-bearing kabul edilir; `scripts/` graph dışında bırakılsaydı
"scripts değişti → 0 affected" gibi bir eksiltme üretirdi.

## 2. Komutlar

Temel çağrı (origin/main base default):

```
npm run verify:affected
```

Bu, `node scripts/ccverify-affected.mjs` çalıştırır ve varsayılan olarak şu
changed-file kaynaklarının **birleşimini** (union) kullanır (`--changed` verilmediyse):

- `git diff --name-only <base>...HEAD` (merge-base range diff)
- `git diff --name-only HEAD` (working-tree diff, staged dahil — düz `git diff` staged'i kaçırır)
- `git ls-files --others --exclude-standard` (untracked yeni dosyalar)

`<base>` varsayılanı `origin/main`'dir; çözülemezse (örn. origin'siz bir kullanıcı
klonu) sessizce boş liste üretmez — hard-error + `--base HEAD~1` önerisiyle durur.

npm script'ine ekstra flag geçmek için `--` ayracını kullanın:

- **`-- --changed <dosyalar>`** — git'e hiç dokunmadan, virgül/newline ayraçlı bir
  dosya listesini doğrudan changed-set olarak kullanır (hermetik-test yolu; testler
  bunu kullanır). Örn: `npm run verify:affected -- --changed src/a.ts,src/b.ts`
- **`-- --list`** — etkilenen test yollarını (satır satır) yazdırır, exit 0. Hiçbir
  şey koşmaz; affected-set boyutundan bağımsız her zaman çalışır (saf bilgi modu).
- **`-- --dry-run`** — gerçekte koşacak `npx vitest run <dosyalar>` komut(lar)ını
  (chunk'lanmışsa hepsini) yazdırır, koşmadan, exit 0.
- **`-- --base <ref>`** — merge-base referansını değiştirir (default `origin/main`).
- **`-- --root <path>`** — proje kökünü değiştirir (default `process.cwd()`).
- **`-- --max-files N`** — varsayılan **400**. Affected-set bu sayıyı aşarsa, gate
  kısmi bir subset koşmayı **reddeder** (false-confidence riski) — stderr'e Türkçe bir
  yönlendirme mesajı basar ("suite'in çoğu etkilenmiş, tam-suite koş") ve **exit 2**
  ile çıkar. Bkz. Bölüm 5 için canlı bir örnek.

Varsayılan (flag'siz) mod: affected-set boşsa `0 affected` yazıp exit 0; aşımda
Bölüm 5'teki gibi exit 2; aksi halde `npx vitest run <affected-dosyalar>` spawn
edilir ve child'ın exit code'u **birebir** döndürülür. Affected-liste, Windows
`cmd.exe`'nin ~8191 karakter argv sınırına karşı ~6KB'lık chunk'lara bölünüp
sıralı (paralel değil — her `vitest run` kendi worker fork'larını açar) koşulur;
herhangi bir chunk sıfırdan farklı exit verirse toplam sonuç da sıfırdan farklı olur.

`--help` diye bir flag **yoktur** — tanınmayan flag'ler sessizce yok sayılır ve
davranış varsayılan moda düşer.

## 3. `scripts/affected-tests.mjs --json` çıktı-alanları

Resolver'ın kendisi de bağımsız bir CLI'dır:

```
node scripts/affected-tests.mjs --changed src/a.ts,src/b.ts [--root <path>] [--json]
git diff --name-only main... | node scripts/affected-tests.mjs
```

`--json` ile `computeAffectedTests()`'in ham çıktısı basılır:

```json
{
  "changed": ["src/a.ts", "src/b.ts"],
  "affected": ["tests/a.test.ts", "tests/x.test.ts"],
  "graphStats": {
    "filesScanned": 3186,
    "edgesResolved": 12328,
    "unresolvedImports": 8634,
    "deletedChangedFiles": 0
  }
}
```

- **`changed`** — girdi olarak verilen changed-file listesinin posix-normalize edilmiş,
  root'a göre relative hali.
- **`affected`** — bulunan etkilenen test dosyaları (sıralı).
- **`graphStats.filesScanned`** — `src/`+`tests/`+`scripts/` altında taranan toplam dosya sayısı.
- **`graphStats.edgesResolved`** — statik olarak çözülebilen import-edge sayısı.
- **`graphStats.unresolvedImports`** — çözülemeyen specifier sayısı (bkz. Bölüm 4 —
  bu alan bilinen-eksik sınıflarının **dürüst istatistiğidir**, sessizce yutulmaz).
- **`graphStats.deletedChangedFiles`** — changed-listede olup disk'te artık var
  olmayan (silinmiş) dosya sayısı. Silinen bir dosya, hâlâ onu literal referans eden
  bir importer'ın affected-set'e girmesi için resolvable-evrene dahil edilir (silme =
  en riskli değişiklik sınıfı, atlanmaz).

`ccverify-affected.mjs` (gate-runner) katmanında `--json` flag'i **yoktur** — bu
sadece resolver'ın kendi CLI'ında mevcuttur.

## 4. Bilinen-eksikler

Resolver, regex-tabanlı statik bir tarayıcıdır; şu sınıflar **yapısal olarak
görünmezdir** (script doc-comment'inden, olduğu gibi):

1. **`readFileSync`-tabanlı composition-pin testleri** (~15 dosya) — src metnini
   `import` yerine doğrudan dosya-okuma ile okuyan testler. Hedefe hiçbir statik
   `import`/`export`/`vi.mock` anahtar-kelimesi dokunmadığı için tarayıcı bunu göremez.
2. **Fixture-JSON yol-okuyanlar** — bir test, çalışma zamanında bir JSON içeriğinden
   bir dosya yolu çözüyorsa, taranacak statik bir specifier yoktur.
3. **Template-literal dynamic import** (`` import(`...`) ``) — varlığı tespit edilir
   ve `unresolvedImports`'u artırır, ama şablon-literal'den hedef statik olarak
   çözülemez.
4. **`@/`-alias specifier'lar** (örn. `tests/docs/github-pages-deploy.test.ts`) —
   bare/aliased specifier'lar `unresolvedImports`'a doğru şekilde sayılır; tsconfig
   `paths` alias çözümü **implemente değildir** (yalnız relative-specifier çözümü,
   ADR-D-001 Node16/nodenext gereği).

Kapanmış bir madde (dürüstlük için not, artık aktif eksik değil): `scripts/**`
importları — born-606 Brain-fix ile evrene dahil edildi; `.mjs`/`.cjs` specifier'lar
artık çözülüyor ve `scripts/` değişikliklerinin etkilediği testler bulunuyor.

CommonJS `require()` kasıtlı olarak taranmaz — proje ESM-only'dir (ADR-D-001) ve bu,
spec'in edge-pattern kümesinin parçası değildir.

## 5. Ne zaman tam-suite koşmalı

Gate, `--max-files` guard'ı (default 400) sayesinde bunu **kendisi** işaretler:
affected-set bu eşiği aşarsa kısmi-koşuyu reddedip tam-suite'e yönlendirir.

Canlı bir örnek — `src/orchestra/scheduler-truth.ts` bir **core-hub** dosyasıdır
(born-610 SCHEDULER-SINGLE-TRUTH kapsamında değişti); tek başına değişmesi bile:

```
$ node scripts/affected-tests.mjs --changed src/orchestra/scheduler-truth.ts --json
# → affected.length === 674

$ npm run verify:affected -- --changed src/orchestra/scheduler-truth.ts
[ccverify-affected] affected-set 674 dosya > --max-files 400 —
suite'in çoğu etkilenmiş, tam-suite koş (npx vitest run). Guard exit 2.
```

674 > 400 olduğu için gate kısmi bir subset koşmaz (false-confidence riski) — bunun
yerine exit 2 ile honest bir tam-suite yönlendirmesi verir. Genel kural: `src/core/`,
`src/orchestra/` gibi çok-referanslı **core-hub** modüllerde yapılan bir değişiklik,
affected-set'i default eşiğin üzerine taşıma ihtimali yüksektir — bu durumda gate zaten
otomatik olarak tam-suite'e (`npx vitest run`) yönlendirir; ayrıca manuel karar
vermeye gerek yoktur.
