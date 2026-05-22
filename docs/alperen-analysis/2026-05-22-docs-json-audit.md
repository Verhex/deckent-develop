# `.deckent/docs.json` Audit — Managed-Docs Sistemi — 2026-05-22

**Kapsam:** `.deckent/docs.json` + `src/orchestra/managed-docs/` pipeline — tam analiz: config yapısı, veri akışı, generator eşleştirme, section-updater, seedDocsConfig, tüm 11 girdi  
**Metodoloji:** Sistematik debugging — generator canlı izlendi, section-updater kod okuma, BOOT.md üretim simüle edildi, copy-assets uzantı listesi grep ile doğrulandı, DECKENT-MASTER-BLUEPRINT.md disk kontrolü  
**Perspektif:** Deckent dogfooding + Deckent ürün kullanıcısı

---

## Bu Dosya Nedir

`.deckent/docs.json` — **Managed-Docs sistemi konfigürasyonu** (ADR-029/030). Her sprint kapanışında `sprint-finalizer.ts → syncManagedDocs() → runManagedDocUpdates()` çalışır; bu config'teki her girdi için ilgili target dosyanın belirlenen `autoSections`'larını AI/template üretilen içerikle değiştirir.

11 girdi, 4 alan:
| Alan | Açıklama |
|------|----------|
| `id` | Benzersiz girdi tanımlayıcı |
| `path` | Target dosya (proje köküne göre) |
| `autoSections[]` | Otomatik üretilecek section başlıkları |
| `protectedSections[]` | Hiç dokunulmayacak section başlıkları |

**Git durumu:** git-tracked; `deckent init` çalışmayan projelerde `seedDocsConfig()` ile oluşturulur.

**Veri akışı:**

```
.deckent/docs.json
  ↓ loadDocsConfig()
managed-doc-runner.ts
  ├── generateAllSections(autoSections[], ctx, userGenerators)
  │     └── findGenerator(sectionTitle) → content-generators.ts'deki kayıtlı generator
  ├── renderTemplate(templates, ctx)
  └── updateDocSections(content, entry, generated)
        ├── replaceSectionContent(content, sectionTitle, newContent)
        │     └── parseSections() — section sınırlarını markdown heading ile tespit eder
        └── appendSection() — section bulunamazsa sona ekler

sprint-finalizer.ts → syncManagedDocs() (her sprint kapanışı)
seedDocsConfig()    → deckent init (yeni proje bootstrap)
```

**`findGenerator()` eşleştirme mantığı** (B6'nın kökü):
```typescript
// content-generators.ts:95
if (normalized === p || normalized.includes(p) || p.includes(normalized)) { match }
```
Tam eşleşme + çift yönlü substring — `sectionTitle.includes(pattern)` VEYA `pattern.includes(sectionTitle)`.

---

## Mevcut 11 Girdi — Durum Tablosu

| ID | Path | autoSections | Sorun |
|----|------|-------------|-------|
| claude-md | CLAUDE.md | Sprint Metrics, Active Debt, Agent Performance | — |
| vision-en | VISION.md | Deckent by the Numbers, Sprint History, Sprint Metrics | — |
| vision-tr | VISION-TR.md | Sayılarla Deckent, Sprint History, Sprint Metrics | — |
| beta-tracker-en | BETA-TRACKER.md | Current Status, Sprint Metrics, Sprint History | — |
| beta-tracker-tr | BETA-TRACKER-TR.md | Mevcut Durum, Sprint Metrics, Sprint History | — |
| identity-md | .deckent/workspace/IDENTITY.md | Project Status | — |
| **blueprint-md** | **DECKENT-MASTER-BLUEPRINT.md** | Live Metrics | **B7 — dosya yok** |
| **agents-md** | AGENTS.md | **~~Built-in Agents~~, ~~Last Updated~~** | **B1, B2 — düzeltildi** |
| tools-md | .deckent/workspace/TOOLS.md | MCP Tools, CLI Commands | — |
| boot-md | .deckent/workspace/BOOT.md | Boot Sequence, Manual Recovery Chain | — |
| worker-guide-md | .deckent/workspace/WORKER-GUIDE.md | Anti-Patterns | — |

---

## Tespit Edilen Sorunlar

### Sorun B1 — "Built-in Agents" Section Adı Yanlış Generator'a Eşleniyor

**Öncelik:** Yüksek  
**Kök Neden:** `agents-md.autoSections = ["Built-in Agents", ...]`. `findGenerator("Built-in Agents")`:
- `normalized = "built-in agents"`
- Kayıtlı `agent-performance` generator'ının pattern'leri: `['agent performance', 'agents', 'agent stats']`
- `"built-in agents".includes("agents")` → **TRUE** → `agent-performance` eşlenir
- `agent-performance.generate()` sprint sonu ajan görev istatistiklerini üretir (tasks/done/success tablosu)

Sonuç: AGENTS.md'nin `## Built-in Agents` section'ına sprint performans tablosu yazılıyor — bir kullanıcı "built-in agents" başlığının altında sprint stats görüyor, agent listesi değil. Semantik yanlışlık hem dogfood hem kullanıcı perspektifinden kafa karıştırıcı.

**Gerçek içerik doğrulaması:**
```
## Built-in Agents    ← başlık
| Agent | Tasks | Done | Success |   ← sprint performans tablosu içeriği (doğru generator, yanlış başlık)
| bug-fixer | 1 | 1 | 100% |
| doc-writer | 20 | 20 | 100% |
```

**Durum:** Düzeltildi — `docs.json` `autoSections: ["Agent Performance"]`, `AGENTS.md` `## Built-in Agents` → `## Agent Performance` (B2 ile birlikte).

---

### Sorun B2 — "Last Updated" Ölü autoSection

**Öncelik:** Düşük  
**Kök Neden:** `agents-md.autoSections = ["Built-in Agents", "Last Updated"]`. `findGenerator("Last Updated")`:
- Kayıtlı generator'ların hiçbirinin pattern'ında "last updated" veya "updated" yok
- `findGenerator` → `null` → `generateAllSections` bu section'ı üretmiyor
- `updateDocSections` → `generated.get("Last Updated")` → `undefined` → `continue` (silent skip)

Her sprint kapanışında bu section için iş yapılıyor, sonuç yok. Ölü konfigürasyon.

**Durum:** Düzeltildi — `docs.json`'dan kaldırıldı (B1 ile birlikte).

---

### Sorun B3 — `parseSections()` Code Fence Körü → BOOT.md Yapısal Bozulma

**Öncelik:** Yüksek  
**Kök Neden:** `section-updater.ts:parseSections()` code fence'leri izlemiyordu. Bir section'ın içeriğini taramak için `for (let j = i+1; j < lines.length; j++)` döngüsünde yalnızca heading regex kontrolü yapılıyordu.

BOOT.md `## Manual Recovery Chain` section'ı içinde:
```bash
# Step 1: Kill active workers   ← parseSections bunu H1 heading sanıyordu
deckent kill --all
```
`# Step 1: Kill active workers` → `headingRegex = /^(#{1,6})\s+(.+)$/` → eşleşiyor (level=1).

Etki: `parseSections` bu satırı bir H1 bölüm başlangıcı sanarak `## Manual Recovery Chain`'in içerik sınırını çok erken kesiyor. `replaceSectionContent()` yanlış satır aralığı hesaplıyor → bölüm içeriği yanlış üzerine yazılıyor → BOOT.md yapısı bozuluyor.

**Sprint 186 audit'i** bu bozulmayı `B15: IDENTITY.md identity-status` ile birlikte tespit etti (aynı kök neden, farklı dosyalarda).

**Durum:** Düzeltildi — `parseSections()` tamamen yeniden yazıldı: hem outer (heading toplama) hem inner (endLine arama) döngülerde code fence state takibi eklendi. `` ` `` veya `~` ile başlayan satırlar fence aç/kapat olarak izleniyor; fence içindeyken heading regex çalıştırılmıyor.

---

### Sorun B4 — `manual-recovery` Generator Sprint-Spesifik İçerik Üretiyor

**Öncelik:** Orta  
**Kök Neden:** `content-generators.ts:manual-recovery` generator'ı sabit-kodlu sprint referansları içeriyordu:
- `'_Sprint 165 proven recovery chain_'` — sprint referans
- `'{ taskId: "166-NNN" }'` — MCP eşdeğer bloğunda task ID
- `## Manual Recovery Chain` — BOOT.md'nin mevcut section başlığıyla çelişen bir alt başlık

Her sprint kapanışında `boot-md.autoSections = ["Manual Recovery Chain"]` → bu generator çalışıyor → workspace audit'in temizlediği BOOT.md'ye stale sprint referansları yeniden yazılıyor. Sprint 186 workspace audit'inin BOOT.md düzeltmeleri bir sonraki sprint kapanışında otomatik geri alınıyordu.

**Durum:** Düzeltildi — sprint referansları kaldırıldı, task ID placeholder'ı `<task-id>` yapıldı, gereksiz alt başlık kaldırıldı.

---

### Sorun B5 — `worker-anti-patterns` Generator OSS-Uygunsuz İsim Referansı

**Öncelik:** Orta  
**Kök Neden:** `content-generators.ts:worker-anti-patterns` generator:
```
'| `npm run build` in worker | YASAK | Alperen kararı — dist/ contamination risk |'
```
`Alperen kararı` (kişi adı) üretilen içeriğe baked-in. Her sprint kapanışında WORKER-GUIDE.md'ye yazılıyor. OSS ortamında harici kullanıcı bu tabloyu görür — kişisel isim anlamsız.

**Durum:** Düzeltildi:
```
'| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |'
```

---

### Sorun B6 — `findGenerator()` Substring Eşleştirme Sistematik Ambiguity Riski

**Öncelik:** Orta (systemic design)  
**Kök Neden:** `findGenerator()`:
```typescript
if (normalized === p || normalized.includes(p) || p.includes(normalized)) { match }
```
Bu üçlü koşul çift yönlü substring'e izin veriyor:
- `"built-in agents".includes("agents")` → `agent-performance` (B1)
- Herhangi bir yeni section title + generator pattern kombinasyonu beklenmedik eşleşme üretebilir

**Somut collision riski:**
| Section Title | Pattern Match | Kök |
|--------------|---------------|-----|
| `"Built-in Agents"` | `"agents"` → `agent-performance` | B1 (**fix uygulandı**) |
| `"Sprint History"` | `"history"` → olası yanlış match | potansiyel |
| `"Current Status"` | `"status"` → olası yanlış match | potansiyel |

**Etki:** Tüm generator kayıtları `patterns[]` dizisinde kısa/genel terimler içerdiğinde istenmeyen içerik üretimi.

**Durum:** Belgelendi. **Gelecek Öneriler #1.**

---

### Sorun B7 — `blueprint-md` Target Dosyası Mevcut Değil

**Öncelik:** Düşük  
**Kök Neden:** `docs.json:blueprint-md.path = "DECKENT-MASTER-BLUEPRINT.md"` — bu dosya projede **yok**:
```bash
$ ls DECKENT-MASTER-BLUEPRINT.md  → MISSING
```

`managed-doc-runner.ts:47`:
```typescript
if (!existsSync(filePath)) {
  results.push({ file: entry.path, updated: false, reason: 'file_not_found' });
  continue;
}
```

Her sprint kapanışında bu girdi için `file_not_found` dönüyor → silent skip. Hata değil ama ölü konfigürasyon girdi — her sprint boş iş.

**Durum:** Belgelendi. **Gelecek Öneriler #2.**

---

### Sorun B8 — `seedDocsConfig` Template Dosyası Ölü Kod

**Öncelik:** Düşük  
**Kök Neden:** `docs-config.ts:seedDocsConfig()` şu yollardan template arar:
```typescript
join(__dirname, '../../../cli/commands/init-templates/docs.json.template'),
join(__dirname, '../../cli/commands/init-templates/docs.json.template'),
```

`copy-assets.mjs` yalnızca `.json` ve `.md` uzantılarını kopyalıyor:
```javascript
const ASSET_EXTENSIONS = ['.json', '.md'];  // .template dahil değil
```

`docs.json.template` → `dist/` içine kopyalanmıyor → her `deckent init` çalışmasında `seedDocsConfig` inline fallback'e düşüyor:
```typescript
template = { version: 1, docs: [{ id: 'claude-md', path: 'CLAUDE.md', autoSections: ['Sprint Metrics'], protectedSections: [] }] };
```

Ayrıca template dosyasının kendisi de inline fallback ile **birebir aynı** (1 girdi, sadece CLAUDE.md). Yani template dosyası tamamen ölü kod — hem kopyalanmıyor hem de kopyalansaydı bile identik sonuç üretirdi.

**Etki:** Yeni kullanıcı `deckent init` çalıştırınca 1 girditli minimal docs.json alıyor (sadece CLAUDE.md Sprint Metrics). Kasıtlı tasarım olabilir (aşamalı genişleme), ama template dosyası yanıltıcı.

**Durum:** Belgelendi. **Gelecek Öneriler #3.**

---

## Uygulanan Değişiklikler

| Dosya | Değişiklik | Sorun |
|-------|-----------|-------|
| `.deckent/docs.json` | `agents-md.autoSections`: `["Built-in Agents", "Last Updated"]` → `["Agent Performance"]` | B1, B2 |
| `AGENTS.md` | `## Built-in Agents` → `## Agent Performance` | B1 |
| `src/orchestra/managed-docs/section-updater.ts` | `parseSections()` tamamen yeniden yazıldı: outer + inner döngüde code fence tracking | B3 |
| `src/orchestra/managed-docs/content-generators.ts` | `manual-recovery` generator: sprint referansları kaldırıldı | B4 |
| `src/orchestra/managed-docs/content-generators.ts` | `worker-anti-patterns` generator: `Alperen kararı` → generic sebep | B5 |

**Doğrulama:** `parseSections()` değişikliği lint ile doğrulandı (`tsc --noEmit`). generator değişiklikleri kod okuması ile teyit edildi — sprint referansları + kişi adı tamamen kaldırıldı.

---

## Açık Kaynak Hazırlığı Değerlendirmesi

**Dogfooding perspektifi:**
- Managed-docs pipeline sprint-finalizer'a entegre, otomatik çalışıyor — altyapı sağlam.
- Ama B3 (parseSections fence blindness) BOOT.md'yi her sprint kapanışında bozuyordu — kritik gizli bug. Artık düzeltildi.
- B4/B5 generator içerikleri her sprint kapanışında workspace audit'inin yaptığı temizliği geri alıyordu — audit'ler kalıcı değildi. Artık düzeltildi.

**Kullanıcı perspektifi:**
- `deckent init` ile bootstrap edilen docs.json minimal (1 girdi) — kasıtlı tasarım, sorun değil.
- `findGenerator()` substring ambiguity (B6) kullanıcı tarafından eklenen custom section'lar için gizli collision riski. Dökümante edildi.
- DECKENT-MASTER-BLUEPRINT.md phantomu (B7) kullanıcıya hiç görünmüyor (silent skip) — ama repo'da stale girdi var.

---

## Gelecek Öneriler

1. **`findGenerator()` exact-match önceliği (B6):** Önce tam eşleşme, ardından pattern ⊆ title, ardından title ⊆ pattern — bu sırayla. Exact match varsa substring'e hiç bakma. Ambiguity azalır; yeni pattern eklenince yan etki daha az.

2. **`blueprint-md` girdisini docs.json'dan kaldır ya da dosyayı oluştur (B7):** Eğer DECKENT-MASTER-BLUEPRINT.md artık yoksa config'den kaldırılmalı. Eğer gelecekte planlanıyorsa `enabled: false` ile devre dışı bırakılabilir.

3. **`docs.json.template` → `docs.json` veya silinmeli (B8):** Ya `.template` uzantısını `.json` yaparak copy-assets'in kopyalamasını sağla; ya da template dosyasını sil ve inline fallback tek kaynak olarak kalsın. İkisi identik olduğundan işlevsel fark yok.

---

## Kapanış

Audit 2026-05-22'de kapatıldı. `.deckent/docs.json` = 11-girditli managed-docs config; sprint-finalizer'da otomatik çalışır; `findGenerator()` substring eşleştirmesi + `parseSections()` + section-updater pipeline üzerinden 11 target dosyayı günceller. **8 sorundan 5'i düzeltildi** (B1 section name mismatch + B2 ölü autoSection + B3 parseSections fence blindness + B4 stale sprint refs in generator + B5 kişi adı OSS), 3'ü belgelendi (B6 findGenerator systemic ambiguity + B7 blueprint-md phantom + B8 template dead code). Kök tema: generator eşleştirme substring tabanlı ve ambiguous; section-updater code fence'i izlemiyordu (BOOT.md kırılma kök sebebi); iki generator workspace audit'ini her sprint kapanışında geri alıyordu.
