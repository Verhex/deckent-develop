# DEBT-370-CLOSE — sprint-370 debt kalanı (371-006)

Sprint 371, Task 371-006. Sprint-370'in tek `GO_WITH_TECH_DEBT` sonucunun (370-006,
DOCS-FEATURES-5) debt-gerekçesini disk-üzerinde doğrulayıp, kapatılabilir olanı kapatan,
kapatılamayanı gerekçesiyle dokümante eden kapanış notu. Kaynak: `.brain/archive/sprint-370-tasks/task-370-006.result`
+ `.json`, `docs/features/README.md` (mevcut/önce), 3 yeni feature-doc'un header'ları,
`docs/MASTER-PLAN.md`, `src/core/config-types.ts`, ve `docs/analysis/debt-close-369.md`
(çapraz-referans — bir kalem orada zaten kayıtlı).

## 370-006 (DOCS-FEATURES-5) — debt-gerekçesi: **KAPANDI (README-index)** + 2 kalem dokümante (scope-dışı)

**Açık kalan gerekçe (370-006.result):** görev tanımı "3 feature-doc + README-index güncelle"
istiyordu, ama görevin kendi kanonik `scope.filesWrite` listesi yalnız 3 doc dosyasını
(`computer-use-contract.md`, `connect-auth-state.md`, `vscode-panel.md`) içeriyordu —
`docs/features/README.md` o listede YOKTU. Worker, "write-list tek otorite, kapsam-dışı ihtiyaç
elle düzenlenmez, not edilir" talimatına uyarak README.md'ye dokunmadı ve bunu `docImpact` olarak
bıraktı: İçindekiler tablosuna 3 satır (feature adı / config anahtarı / default / doküman linki)
eklenmesi gereken, küçük/mekanik bir takip-işi.

**Kapatma (bugün, `docs/features/README.md` — bu görevin `scope.filesWrite`'ında):**
İçindekiler tablosuna, 3 doc'un kendi header'larından (Config/Default alanları) okunan bilgiyle
3 satır eklendi:

| Feature | Config anahtarı | Default | Doküman |
|---------|-----------------|---------|---------|
| Computer-Use Contract — TOOL-CU dilim-1 sözleşme katmanı | `computer_use.*` | off | [computer-use-contract.md](computer-use-contract.md) |
| Connect Auth-State — config-tabanlı, ağsız kimlik-doğrulama raporu | (yok — her zaman çalışır, read-only) | on | [connect-auth-state.md](connect-auth-state.md) |
| VS Code Panel — TERM-RPC bridge/data/refresh soy-zinciri | (yok — extension-seviyesi kod) | n/a | [vscode-panel.md](vscode-panel.md) |

Doğrulama: `git diff --stat docs/features/README.md` → yalnız 3 satır eklendi (+3/-0), mevcut
4 satır ve "Yazım kuralları" bölümü değişmedi. `node scripts/lint-links.mjs` → tüm dosyalar
dahil kırık link yok (aşağıdaki Özet Tablo'da tekrar teyit).

**Sonuç: README-index boşluğu gerçekten kapatılmış.** goCriteria'nın "index güncelle" kısmı
artık disk-üzerinde doğru.

### Kapatılamayan kalem 1 — `docs/MASTER-PLAN.md` satır 52 + 64 task-ID drift'i (hâlâ açık)

370-006'nın `vscode-panel.md` dokümanı, `docs/MASTER-PLAN.md`'nin CHAT-IDE (Sıra-64) satırının
VS Code ext dilim-1'i **yanlış task-ID** (`363-013`) ile andığını, disk-doğrulanmış gerçek
ID'nin `363-012` (VSCODE-EXT-1) olduğunu tespit etmişti. Bugün yeniden doğrulandı — drift hâlâ
orada, **iki** satırda:

- `docs/MASTER-PLAN.md:52` (TERM-RPC, Sıra-54): "...4. tüketici VS Code ext dilim-1 (**363-013**)"
- `docs/MASTER-PLAN.md:64` (CHAT-IDE, Sıra-64): "...→ **363-013** DONE (dilim-1): webview-panel + rpc-bridge..."

Kanıt (bugün, disk-üzerinde):
- `.brain/archive/sprint-363-tasks/task-363-012.json` → `title: "VSCODE-EXT-1 — CHAT-IDE
  gerçek-impl dilim-1 (Sıra-64)"`, açıklama "webview-panel (status+limits+approvals read-only
  — TERM-RPC http-client'ıyla; RPC'nin ÜÇÜNCÜ tüketicisi) + rpc-bridge" — dilim-1'in kendisi.
- `.brain/archive/sprint-363-tasks/task-363-013.json` → `title: "TOOLCU-DESIGN — computer-use/
  browser pack tasarım-notu (Sıra-83, P2)"` — tamamen ilgisiz, ayrı bir Sıra (83) ve konu
  (computer-use tasarım-notu, `docs/design/tool-cu-pack.md`).
- `src/extensions/vscode/src/rpc-bridge.ts:2` ve `src/extensions/vscode/src/deckent-panel.ts:2`
  — her ikisinin kendi başlık yorumu da "Sıra-64 / Task 363-012" diyor (dosyaların kendi
  yazarları doğru ID'yi kullanmış; drift yalnız MASTER-PLAN.md'de).

`docs/MASTER-PLAN.md` bu görevin (371-006) `scope.filesWrite` listesinde YOK — bu yüzden
düzeltme burada yapılmadı, yalnız (ilk kez, 370-006'nın kendi doc'unun ötesinde resmi olarak)
kayda geçirildi. **docImpact:** ayrı, mekanik bir takip-görevi (write scope: `docs/MASTER-PLAN.md`)
satır 52 ve 64'teki her iki `363-013` referansını `363-012` ile değiştirmeli — kod-tarafında
hiçbir değişiklik gerekmiyor, salt metin-düzeltmesi.

### Kapatılamayan kalem 2 — `src/core/config-types.ts:1248-1259` bayat JSDoc (hâlâ açık, ÖNCEDEN kayıtlı)

370-006'nın `computer-use-contract.md` dokümanı, `ResolvedConfig.computer_use` alanının JSDoc
yorumunun "type-only pass-through today ... do not yet assign this field" dediğini ama
`config.ts`'nin gerçek `loadConfig`/`mergeConfigs` pass-through'unu (satır ~1720-1723, ~2450-2451)
çoktan eklediğini, dolayısıyla yorumun bayat olduğunu not etmişti.

Bugün doğrulandı: yorum hâlâ aynı ("type-only pass-through today... not yet wired into
config.ts's resolvers", satır 1248-1259) — düzelmemiş. **Ancak bu YENİ bir bulgu değil** —
`docs/analysis/debt-close-369.md`'nin "369-005 (TOOL-CU-DILIM-1)" bölümü "Kapatılamayan
ilk artık-boşluk" olarak bunu zaten aynı satır-aralığıyla kaydetmiş ve aynı takip-görevi
önerisini yapmıştı (write scope: `src/core/config-types.ts`, JSDoc'u `config.ts`'nin
gerçek pass-through'una göre güncelle). `src/core/` bu görevin de `scope.filesWrite`'ı dışında
— tekrar dokümante ediliyor (çapraz-referans için), ama **yeni bir duplike takip-görevi
önerilmiyor**; debt-close-369.md'deki öneri hâlâ geçerli ve tek kaynak.

## Özet Tablo

| Debt | Durum | Kanıt |
|---|---|---|
| 370-006 README-index boşluğu (3 satır eksik) | **KAPANDI** | docs/features/README.md İçindekiler tablosu, `git diff --stat` +3/-0, lint:link temiz |
| MASTER-PLAN.md satır 52+64 task-ID drift (363-013 → olması gereken 363-012) | Dokümante edildi (scope-dışı, ilk kez resmi kayıt) | task-363-012.json / task-363-013.json başlıkları; rpc-bridge.ts:2, deckent-panel.ts:2 kendi header'ları |
| config-types.ts:1248-1259 bayat JSDoc (computer_use pass-through) | Dokümante edildi (scope-dışı, ÖNCEDEN debt-close-369.md'de kayıtlı — çapraz-referans, yeni öneri değil) | config-types.ts:1248-1259; debt-close-369.md "369-005" bölümü |
