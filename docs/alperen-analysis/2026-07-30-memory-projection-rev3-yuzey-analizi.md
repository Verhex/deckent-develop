# Memory Projection Rev-3 — Yeni Yüzey Analizi ve Bitirme-Arkı Bağlantısı

- **Tarih:** 2026-07-30
- **Sahip:** Alperen (karar maddeleri D1-D3 onay bekliyor)
- **Girdi:** `docs/superpowers/specs/2026-07-30-provider-agnostic-memory-projection-design.md` (rev 2, commit `b1af960d`) + bugünkü instruction-katmanı değişimleri (`45ba76e0`, `4dd1282c`)
- **Amaç:** Rev-2 tasarımı bugünkü yüzey gerçeğiyle karşılaştırmak, çatışmaları hükme bağlamak, işi MASTER-PLAN bitirme/paketleme arkına bağlamak.

## 1. Bugün değişen yüzeyler (kod-gerçeği)

**`45ba76e0` — Claude tarafı sertleştirme:**
- `.claude/hooks/pretooluse-guard.mjs` (yeni, 112 satır): sert yasakların machine-enforcement'ı (`.tasks/.brain` silme deny, commit/push + kill/cleanup ask-gate, sprint canlıyken build/auth-mutation deny).
- **Stop hook düzeltildi:** `sync-core-memory.mjs --target "$HOME/.claude/projects/-home-alperen-deckent-dev/memory"` — legacy script tek-hedef modda yeniden çalışıyor; hedef = Claude'un **native auto-memory** dizini.
- `rule-generator`: `.claude` adapterında `paths:` frontmatter artık `preamble()` ile **satır-1**'de (comment-first yerleşim rolleri koşulsuz yüklüyordu — düzeltildi).
- CLAUDE.md: ölü @-import'lar → on-demand pointer'lar; `<precedence>` zinciri eklendi.

**`4dd1282c` — Codex tarafı parite:**
- `.codex/hooks/` (hooks.json + guard) + `.codex/rules/deckent-safety.rules`.
- **AGENTS.md artık açıkça "Codex Host Adapter":** CLAUDE.md ile aynı repository contract'ını taşır, byte-parity zorunluluğu yok; "`@file` import çözmeyen istemciler referans verilen dosyaları doğrudan açıp okur"; "`deckent sync` kullanıcı metnini değiştirmez; yalnız eksik Deckent referanslarını **additive** biçimde sağlar (ADR-G-004)".
- Rule-template'ler (brain/auditor/worker) yenilendi.

**MEMORY.md (dogfood authority):** 11→**14 kanun**; başlık artık "Provider/host HOME kopyaları yalnız projection'dır" + "3-Yasa tam metni + sprint kuralları = host instruction adapterı (AGENTS.md / CLAUDE.md)" diyor. Kanun-8 config-resolved mikro-task/DAG diline geçti; kanun-14 (cross-provider xverify netleştirme) eklendi.

**Yüzey envanteri (bugün itibarıyla):**

| Yüzey | Instruction dosyası | Durum |
|---|---|---|
| claude-code | `CLAUDE.md` | var — precedence'lı yeni yapı; `.claude/rules/*` generator-owned (`<!-- AUTO-START -->` canlı) |
| codex | `AGENTS.md` | var — "Codex Host Adapter" başlıklı; `.codex/rules/*` + hooks var |
| gemini-cli | `GEMINI.md` | var; `.gemini/rules/*` generator-owned |
| cursor | — | `.cursor/rules/*.mdc` generator-owned (memory.mdc henüz yok) |
| copilot | `.github/copilot-instructions.md` | **YOK** — sıfırdan oluşturulacak |

## 2. ÇATIŞMA A — ADR-G-004 "pure-adapter law" (en kritik, rev-2'de gözden kaçtı)

ADR-G-004 (**Immutable: yes**, Instruction-File Adapter & Multi-Env Generation): host instruction dosyaları **deckent-authored volatile içerik taşımaz, managed-docs DEĞİLDİR**; `ensureDeckentImport` never-overwrite garantilidir. `claude-md`/`agents-md` girdileri tam bu yüzden docs.json managed-docs'tan çıkarıldı (DOCS-PURE-ADAPTER, 2026-07-01) ve regression testleri dört adapter dosyasını managed-docs dışında pinliyor.

Rev-2'nin round-1 kararı ("native dosya + **managed blok** instruction dosyasına") bu yasayla çatışıyor: `DECKENT:CORE-MEMORY:AUTO` bloğu, her sync'te yeniden üretilen (volatile) deckent-authored içeriği CLAUDE.md/AGENTS.md/GEMINI.md içine koyar.

Kanun-2 gereği iki meşru yol:

- **A1 — ADR amendment önerisi:** ADR-G-004'e "tek, namespaced, marker-sınırlı, content-addressed memory-index bloğu" istisnası eklenir. Maliyet: immutable-ADR amendment süreci; pure-adapter garantisinin zayıflaması; DOCS-PURE-ADAPTER testlerinin yeniden şekillenmesi.
- **A2 — ADR-uyumlu redesign (ÖNERİM):** Instruction dosyalarına yalnız **kalıcı, tek-satır additive pointer** yazılır (mevcut `ensureDeckentImport` pattern'inin birebir kendisi — bir kez yazılır, asla yeniden yazılmaz): örn. `@.claude/memory/MEMORY.md`. Volatile index **projector-owned mirror'da** yaşar. AGENTS.md'nin kendi sözleşmesi zaten "import çözmeyen istemciler referans verilen dosyayı doğrudan açar" dediği için import'suz host'larda da çalışır. Cursor hedefi (`.cursor/rules/memory.mdc`) zaten generator-owned rules bölgesinde — pure-adapter kapsamı dışında, alwaysApply ile garanti yüklenir. Copilot dosyası yoktan additive oluşturulur (pointer'lı pure adapter olarak doğar).

A2'nin kazanımları: immutable ADR'ye dokunulmaz; marker-integrity/`applyManagedBlock` karmaşıklığı **tamamen düşer** (rev-2 Task 5'in yarısı siliniyor — basitleşme); `deckent sync` additive sözleşmesi korunur. Kaybı: index'in "garanti context'e gömülü" olması yerine bir dosya-okuma adımına bağlanması — Cursor'da alwaysApply rule bu boşluğu kapatır, diğer host'larda pointer + fresh-session proof (Görev 16) doğrular.

## 3. ÇATIŞMA B — Host-memory guard vs bugünkü Stop hook gerçeği

Rev-2 P0-3: `~/.claude/projects/<slug>/memory/` native writable memory → guard HOLD. Bugünkü düzeltme tam oraya projection yapıyor ve MEMORY.md başlığı HOME kopyalarını açıkça "yalnız projection" ilan ediyor (owner niyeti belli).

- **B1 — Owner-declared exception (ÖNERİM):** Guard default'u HOLD kalır; config'te `extra_targets` girdisi `{ path, acknowledged_native_overwrite: true }` biçiminde **açık beyanla** istisna olur; manifest yine zorunlu (silme yalnız owned dosyalar), böylece Claude'un kendi yazdığı topic dosyaları korunur. Bugünkü hook hedefi bu beyanla meşrulaşır.
- **B2 — Hedef taşıma:** Hook izole `~/deckent-projections/...` dizinine yazar; Claude auto-memory'ye hiç dokunulmaz. Kaybı: Claude oturumları index'i auto-memory'den almaz — bugünkü çalışan davranış geri gider.

## 4. Rev-2 → Rev-3 etki matrisi (görev bazlı)

| Rev-2 görevi | Durum | Not |
|---|---|---|
| T1 MASTER-PLAN reconciliation | **revize** | Satırlar `:437`/`:441`; bu analizle birlikte yapılıyor (aşağıda §6) |
| T2 assistant-surface registry | ayakta | `importStyle`/`coLoadedInstructionFiles` alanları A2'de de gerekli (pointer biçimi seçimi) |
| T3 config anahtarı | ayakta | Anchor satırları bayat; B1 seçilirse `extra_targets` şeması `{path, acknowledged_native_overwrite}` olur |
| T4 ownership manifest | ayakta | Değişmez — her iki karar yolunda da silme yetkisi |
| T5 blok renderer | **büyük revize** | A2'de marker/`applyManagedBlock`/link-rewrite düşer → yerine `ensureMemoryPointer` (additive tek satır, `ensureDeckentImport` pattern'i) + cursor `memory.mdc` üretici kalır |
| T6 mirror + atomic + symlink | ayakta | Değişmez |
| T7 lock + guard + deprovision | revize | Guard B1 beyan şeması; deprovision'da pointer satırı ADR-G-004 gereği **bırakılır** (never-overwrite), yalnız mirror + manifest temizlenir |
| T8 i18n | ayakta | Birkaç key düşer (marker hataları), pointer key'leri gelir |
| T9 runWorkspaceSync | ayakta | Değişmez |
| T10-T11 CLI/MCP | ayakta | Değişmez |
| T12 finalizer Step 5 | ayakta | Değişmez |
| T13 wrapper + hook | **revize** | Hook bugün zaten `--target` ile çalışıyor; wrapper artık "kırık hook fix'i" değil, "legacy tek-hedef → çok-yüzey servis" migration'ı; `--target` semantiği B kararına göre bağlanır |
| T14 dogfood + smoke | ayakta | Smoke sprint (Alperen kararı) buraya oturur |
| T15 docs | ayakta | ADR-G-004 uyum notu eklenir |
| T16 host proof | ayakta | A2'de daha da kritik (pointer'ın gerçekten yüklendiğinin canlı kanıtı) |

## 5. Bitirme/paketleme arkı bağlantısı

- `npm run release` zinciri **zaten** `lint:master-plan` + `docs:ref:check` + `validate:publish` içeriyor; memory-projection'ın doc/generated-reference işleri (T15) doğrudan bu gate'lere yazar.
- **TRUTH kolonu:** 190 `MEMORY-AUTHORITY-001` (OPEN) + 230 `MEMORY-SYNC-001` (OPEN) bu işin ta kendisi; 200 `MEMORY-TRUTH-001` (BLOCKED, 190'a bağlı) bu iş bitince açılır.
- **PRODUCT/RELEASE kolonu:** 6120 `SURFACE-PARITY-001` (BLOCKED) "her use-case canonical service + supported surfaces" ister — `runWorkspaceSync` tam bu sözleşmenin memory-sync örneği; 8050 `DOCS-PRODUCT-001` → 8060 `RELEASE-001` zincirine T15 üzerinden girdi verir.
- Yani bu iş, bitirme arkının TRUTH tabanındaki iki OPEN P0 satırını kapatan ve SURFACE-PARITY'ye ilk canonical-service kanıtını veren adımdır.

## 6. MASTER-PLAN iş maddesi (bu analizle eklendi)

- **Yeni satır 235 `MEMORY-SURFACE-PROJECTION-001`** — rev-3 beş-yüzey projection implementasyonu; DependsOn: 190+230; acceptance D1-D3 kararlarına ve ADR-G-004 uyumuna bağlı (satır metni MASTER-PLAN'da).
- **190 not güncellemesi:** hook'un 2026-07-30 tek-hedef fix'i + tasarım/analiz referansı.
- **230 acceptance düzeltmesi:** "backup/restore" kriteri kaldırıldı → "one-way only + typed forbidden modes" (onaylı rev-2 kararı); Cursor+Copilot kapsamı eklendi.

## 7. Karar maddeleri (Alperen)

- **D1 — ADR-G-004 yolu:** A2 (pointer-based uyumlu redesign — önerim) mi, A1 (amendment önerisi) mi?
- **D2 — Host-memory istisnası:** B1 (owner-declared `acknowledged_native_overwrite` — önerim) mi, B2 (izole hedefe taşıma) mı?
- **D3 — Rev-3 spec revizyonu:** D1+D2 kararlarıyla spec'i rev-3'e çekip planı güncelleme onayı; ardından smoke sprint (T14 dilimiyle) başlatılması.
