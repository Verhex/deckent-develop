# TERMINAL-FLUENCY-HANDOFF-EPOCH6-001 — Fable 5.1 → gpt-6-astra devir dosyası (2026-09-09/10)

BASE_SHA: 5767c83e6 · MASTER: 7107 şemsiyesi (capsule değildir; devir dosyasıdır)


> **Silinme tetiği:** MASTER 7107 DONE (kabul bataryası §3 gerçek binary ile geçince) VEYA bu dosyadaki tüm açık maddeler MASTER satırına işlenip epoch-6 handoff `committed` olduğunda SİLİNİR. Kalıcı kayıt = MASTER satır-kanıtı + `docs/execution/handoffs/`.
> Owner emri (Alperen, 2026-09-10 ~01:20 Istanbul): "Haftalık limitin doluyor; Astra'nın elindeki işi bitirtelim, buradaki bilgileri toparla, dokümante et ve Astra'ya handoff ile devret."

## 1. Owner verdict ve ölçülen iki oturum (dist = 5767c83e6 build'i, Qwen3.8-27B-Q4_K_M, 131072)

Owner değerlendirmesi: **0/100 — "terminal hiç işlevsel değil, uzun işlerde local Qwen ile verim yok."** Bu verdict bağlayıcıdır; aşağıdaki "çalıştı" listesi ürünü DONE yapmaz.

| Oturum | Ne oldu | Sayılar |
|---|---|---|
| `chat-2026-09-09T21-39-06-106Z-2ar0mq` (standart) | MASTER-PLAN TERMINAL analizi; 28 araç çağrısı, 5 sahte "bağlam baskısı" checkpoint'i, ara teslim YOK; owner 1092 s'de kesti; "neredesin" sorusuna 150 s'de tam ve doğru analiz | ölçüm kesin: 13 703 token = pencerenin %10; Σ 36 108 tok; scratch checkpoints 5 |
| `chat-2026-09-09T21-40-57-374Z-4ktml3` | Aynı prompt; owner 3. çağrıda (71 s) kesti; "ne durumdasın" → 7114 formatında durum + devam + 330 s'de tam analiz | 19 381 token = %15; checkpoints 0 |
| Cursor bataryası `battery-2026-09-09T220252090Z` (7107-c, 4 yerel senaryo, ~39 dk) | harness OK; 4/4 senaryo ürün eşiklerinde FAIL | toolCalls 8–12 ✓, turnCompleted ✓ (~596 s), boot provider ✓; ilk anlatım ≤10 s ✗, ara teslim ✗ (131k), ölçüm satırı scrollback'te yok ✗ |

**Çalıştığı kanıtlanan (landed 7108/7109-b/7111/7112/7114):** boot "ölçüm otoritesi: kesin"; araç grubundan önce anlatım satırı; araç satırında hedef + süre; salt-okunur bash/grep/read için onay 0; checkpoint sonrası content-ref okuma; kesmede kısmi çıktı korunuyor + "[28 araç çağrısı / 1092 sn sonra kesildi]" satırı; "ne durumdasın" → yapılandırılmış durum.

**Çalışmadığı kanıtlanan:** (a) host-zorunlu ara teslim hiç tetiklenmedi (28 çağrı / 1092 s > 12 / 90 s); (b) %10 dolulukta 5 "bağlam baskısı" checkpoint'i; (c) `deckent_grep` 1.2 MB / 12 KB-satırlı dosyada sessizce boş döndü → model 9 awk denemesiyle sarmala girdi; (d) çağrı başına ~39 s (gizli reasoning dahil) → 28 çağrılık plan 18 dk; (e) model anlatımı EN yazdı (oturum TR).

## 2. Kök nedenler (kod satırıyla)

- **RC-A — ara teslim, anlatımla sıfırlanıyor.** `src/agent/interim-deliverable.ts:104-106` `settleRound()`: son teslimden beri biriken görünür metin ≥ `interimAnswerMinChars` (200) ise `delivered++` ve sayaçlar sıfırlanır. Araçlar arası 100–300 karakterlik anlatım satırları 2 turda 200'ü aşıyor → 12 çağrı / 90 s sınırı hiç dolmuyor. "Delivered" yalnız host'un istediği yapılandırılmış ara yanıt (INTERIM_DELIVERABLE_INSTRUCTION'a cevap) veya final cevap sayılmalı; anlatım sayılmamalı. Ayrıca süre sınırı (90 s) çağrı arası değil, son teslimden itibaren duvar saati olmalı.
- **RC-B — tur-içi araç sonucu tavanı sahte baskı üretiyor.** `src/core/execution-budget-policy.ts:110-111` `maxToolResultShareOfContext 0.05`, `maxTurnToolResultShareOfContext 0.20`; `src/agent/loop.ts:824` `turnCapTokens - retained < desired` → `token-pressure` checkpoint. 131k'da tur tavanı ~26k token; 4–6 KB'lık 5 okuma bunu dolduruyor; mesaj kullanıcıya "bağlam sınırına yaklaştı" diyor (yanlış: pencere %10). Öneri 7109-d: tavan yerine **eski araç sonuçlarını dilimleyip content-ref'e düşürme** (checkpoint/epoch değil, tek mesaj kırpma), pencere doluluğu gerçekten %75'e gelmeden checkpoint yok; mesaj metni gerçeği söylesin.
- **RC-C — `deckent_grep` uzun satırda boş sonuç.** 1.2 MB dosyada 12 KB satırlar; araç satır-uzunluk/çıktı tavanı yüzünden eşleşmeleri düşürüyor ve hata yerine boş dönüyor. Dürüst hata (`LINE_TOO_LONG`, eşleşen satır numaraları + kırpılmış önizleme) şart; aynı sınıf `native-read-file` outline/search yolunda kontrol edilmeli (7111-c).
- **RC-D — yerel model gecikmesi tur başına değil, çağrı başına ödeniyor.** ~39 s/çağrı. Çözüm mimari: (1) çağrı sayısını düşüren araçlar (tek çağrıda çok aralık okuma, `read_many`, tablo satır-indeks özeti = 7113 D/E), (2) tur başına sert araç çağrısı tavanı (`maxToolCallsPerTurn`, config) dolunca **zorunlu cevap**, (3) checkpoint'lerde `/no_think` (araştırma KV-10), (4) "önce cevap ver, sonra derinleş" sözleşmesi.
- **RC-E — anlatım dili.** `identity.ts` narrationContractSection TR üretiyor ama model EN yazdı; sözleşmeye "oturum dilinde yaz" ve INTERIM instruction'a dil ekle (küçük).
- **RC-F — sarmal (workaround spiral).** Aynı hedefe 3 ardışık başarısız araç denemesi sonrası host "dur ve elindekiyle cevapla" enjekte etmeli (ekosistemde yok; 7114-b).

## 3. Açık işler (öneri sırası; MASTER admission owner'da)

1. **7114-b (P0)** — RC-A + RC-F + RC-E: delivered semantiği, duvar-saati sınırı, `maxToolCallsPerTurn` zorunlu cevap, sarmal dedektörü, dil. Kabul: oturum 1 senaryosunda ≤90 s'de ara teslim, ≤12 çağrıda cevap.
2. **7109-d (P0)** — RC-B: tur tavanı yerine sonuç kırpma; checkpoint yalnız gerçek doluluk; mesaj metni gerçek. Kabul: %10 dolulukta checkpoint 0.
3. **7111-c (P1)** — RC-C grep/outline dürüst hata + uzun satır desteği.
4. **7109-c landing** — Cursor READY (ENTRY 83) ama değişiklikler **ana ağaçta uncommitted**: `src/cli/repl/native-transport.ts`, `src/cli/repl/run.tsx`, `tests/cli/native-transport-measurement-root.test.ts` (18/18). Review + canlı sıfır-fark kanıtı (measured == usage.prompt_tokens, thinking off/on) + owner commit gate.
5. **7107-c landing** — Cursor READY (ENTRY 82; worktree `/home/alperen/deckent-cursor-7107`, 14/14, evidence FAIL 4/4). Review + owner gate; batarya bundan sonra 7114-b/7109-d'nin kabul aracı.
6. **7113 C** — Astra READY (ENTRY 1198; `/tmp/deckent-7113-c-astra-20260910`, 22 dosya, 262/262). Astra kendi işini XVerify edemez (aynı provider yasağı): bağımsız review Cursor (grok/sol) veya owner-kabul; landing owner gate. D/E açık; 7113'ün asıl ürün değeri E'de (1.25 MB gerçek terminal kabulü).
7. **Bağlam boyutu kararı** — `follow-up-works/research-terminal-ecosystem-7114.md` §4: büyütme; 65536 + `--rope-scale 2.0` profili öneri. Owner kararı bekliyor; kod işi yok.
8. **Owner bulguları (iş değil):** `git prune` (gc.log), `tests/core/constants.test.ts` dirty fix, lint-cli-mcp-parity kırmızı, hermeticity harness:412, 9+ eski test kırmızısı, dirty `src/core/model-registry.ts` (gpt-6-astra katalog girişi, hiç stage edilmedi).

## 4. Custody haritası (2026-09-10 01:2x Istanbul)

- main HEAD 5767c83e6 = origin/main; dist = bu HEAD build'i (build:all 00:3x, bot PID yeniden başlatıldı `node dist/cli/entry.js bot listen`).
- Ana ağaç dirty (commit edilmemiş): Cursor 7109-c (3 dosya, madde 4) + önceden var olan owner-bulgu dosyaları (`src/core/model-registry.ts`, `src/core/pricing-data-baseline.json`, 12 test dosyası, docs/exports). Hiçbiri bu devirle stage edilmedi.
- Worktree'ler: `deckent-lane-7108/7110/7111/7114` (landed, silinebilir — owner kararı), `deckent-cursor-7109b` (landed, silinebilir), `deckent-cursor-7107` (7107-c READY), `/tmp/deckent-7113-{a,b,c}-astra-*` (A/B landed, C READY), `scratchpad/fanin-dry` (geçici).
- Kanallar: `communication.md` (Fable⇄Astra, son ENTRY 1198 Astra), `iletisim.md` (Fable⇄Cursor, son ENTRY 82/83 Cursor). Devir sonrası Astra her iki kanalın okuyucusu; Cursor'a "to=gpt-6-astra" yazması söylenecek.
- llama.cpp router: `Qwen3.8-27B-Q4_K_M` loaded (models-max 1); `--parallel 1` → eşzamanlı test/batarya sıraya girer.
- Araştırma raporu: `follow-up-works/research-terminal-ecosystem-7114.md` (silinme tetiği başlıkta).

## 5. Devir

Receipt: `docs/execution/handoffs/ah-2026-09-10-fable-astra-terminal/` (prepared → Astra verified → committed). Epoch 5 (Fable) → 6 (Astra). Alperen gate'leri değişmez: commit/push · kill/cleanup · MASTER admission · mode/authority.

## DONE
- Epoch-6 handoff receipt `committed` (prepared → Astra verified → committed) under docs/execution/handoffs/ah-2026-09-10-fable-astra-terminal/.
- §3 açık maddelerinin her biri MASTER satırına işlenmiş (admission owner) veya owner tarafından reddedilmiş.
- Bu dosya silinme tetiğiyle silinmiş.
