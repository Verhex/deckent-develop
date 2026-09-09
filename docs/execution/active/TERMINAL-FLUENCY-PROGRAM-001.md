# TERMINAL-FLUENCY-PROGRAM-001 — Native terminal uçtan uca akıcılık (MASTER 7107)

OUTCOME_ID: TERMINAL-FLUENCY-PROGRAM-001
DOGFOOD_MODE: ON
BASE_SHA: 5767c83e6

**Owner talimatı (Alperen, 2026-09-09 12:40Z):** "deckent terminali claude code / codex / cursor
terminalleri gibi akıcı çalışmak zorunda; local-llm veya başka provider fark etmez; akış
kesintilenemez, kullanıcı yorulamaz; uzun ve sonsuz bağlam yönetimi, iş akışları uçtan uca,
modelin bağlamı ve işi kaybetmemesi, tool yüzeyi, onay akışı — bir bütün olarak."
Silinme tetiği: 7107 kabul bataryası DONE + MASTER satır-kanıtı; doküman o zaman silinir.

## 1. Ölçülen vaka (kanıt, 2026-09-09)

İki oturum, local-llm `Qwen3.8-27B-Q4_K_M`, yapılandırılmış pencere 131072, effective 131072
(`deckent local-llm status`). Görev: `@docs/MASTER-PLAN.md dokümanını oku ve analiz et`
(1.25 MB, 1972 satır, tablo satırları 10 KB+).

| Oturum | Mod | Süre | Görünür sonuç |
|---|---|---|---|
| chat-2026-09-09T10-43-01 | standart onay | ~30 dk | ~25 onay, 0 cevap, 5 checkpoint |
| chat-2026-09-09T12-21-46 | full-auto | 230 s + 263 s | 0 analiz, 4 checkpoint, 1 transport hatası, 1 kesme |

Kaynak kanıtlar: `.deckent/traces/chat-…12cdo3.jsonl` (istekler 47–57k karakter ≈ 13–17k token;
system 34.8k karakter; tool sonuçları ≤7.3 KB), `.deckent/runtime/sessions/…12cdo3/checkpoints/`
(toolCalls 4/9/13/19'da; #2 ve #4 `CHECKPOINT_RESPONSE_MISSING` deterministik fallback,
findings boş; #3 model notu "deckent_read_file DECKENT_E005 scope escape"; #1 createdAt
"2026-09-06" halüsinasyon), llama.cpp container logu 12:20–12:36Z (istek başına prompt 13–17k
token; dört üretim tam 4096 token = max_tokens; "http client error: Connection handling
canceled"), yerel sunucu probe'u (`reasoning_content` mevcut → thinking modu açık).

## 2. Kök nedenler ve paketler

| # | Kök neden (dosya:satır) | Etki | Paket |
|---|---|---|---|
| RC1 | Qwen3 thinking modunda; adapter `reasoning_content`'i yalnız aktivite olarak sayar, kontrol yok (`src/agent/provider-tooluse/openai.ts:217`); wire `max_tokens` = outputReserve 4096 hem düşünmeyi hem görünür metni kapsar (`execution-budget-policy.ts:68`) | Dört istek 4096 tokende görünür metin boş: checkpoint JSON gelmez (`session.ts:750` RESPONSE_MISSING), final cevaplar kaybolur, ~60 s/istek boşa | 7108 |
| RC2 | Tool-sonucu tavanı bayt/token karışımı (`loop.ts:505-514`, `:765-770`): rawBudget 131072 token × 0.20 × 0.75 = 19.660 "bayt" | %13 gerçek dolulukta "token-pressure" checkpoint her 4–5 çağrıda; Astra 32k provasında 6 çağrıda 2 epoch | 7109 (Cursor) |
| RC3 | `openai-compatible connect failed — fetch failed` undici cause zincirini gizler; transient retry yok (`openai.ts:193`) | Tek transport kesintisi turu öldürür, kullanıcı nedeni göremez | 7108 |
| RC4 | Deterministik checkpoint findings/nextActions boş, evidenceRefs ham content-store yolu (`session.ts:~915`); model yolu okuyamaz (DECKENT_E005); createdAt model-yazımlı | Her checkpoint sonrası sıfırdan başlama, aynı aralıkların tekrar okunması, yeni checkpoint: iş-kaybı döngüsü | 7112 |
| RC5 | Her `deckent_bash` varsayılan `shell-exec/medium` (`approval-command-classification.ts:64`), salt-okunur tanıma yok; `read_file` 10 KB satırlı dosyada işlevsiz olduğundan model bash'e düşer (13 çağrının 11'i) | Standart modda ~25 onay, 0 karşılık | 7111 |
| RC6 | Sığmayan @referans için strateji yok: "araçlı parçalı okuma" = modelin kendi tool döngüsü | Büyük doküman analizi hiç bitmez | 7113 |
| RC7 | Başlangıç preamble'ı %36 (7106, ayrı) | Küçük pencereler işlevsiz | 7106 |

Bildirimler (7105-b ile düzeltildi, e7b32aaf8): "Genişletilmiş referans içeriği…" etiketi
yanlış attribution'du; gerçek tetik RC2.

## 3. Kabul bataryası (7107 DONE koşulu; gerçek binary, owner canlı test + Astra XVerify)

1. Local Qwen 131072 ve 32768 pencerede, standart ve full-auto modda MASTER-PLAN senaryosu
   ≤10 dk içinde görünür yapılandırılmış analiz üretir.
2. İlk 20 tool çağrısında sahte bağlam checkpoint'i 0; gerçek baskıda checkpoint typed gerekçeyle
   (/context'te retainedTokens/capTokens/windowTokens).
3. Standart modda salt-okunur okuma/arama onay istemez; yazma/exec/git-mutation ister; çok-çağrılı
   turda tek gruplu kart.
4. Checkpoint sonrası aynı tool+args tekrarı 0; trail epoch açılışında görünür; content-ref
   okunabilir; createdAt host.
5. Thinking: checkpoint JSON ilk denemede; tükenme typed notice + tek retry; "düşünüyor… N token".
6. Transport kesintisi: sınıf + cause + tek retry + dürüst mesaj; tur ölmez.
7. Aynı batarya Claude/Codex provider ile akış-farksız (provider'a özel literal yok).

## 4. Lane'ler ve durum

| Paket | Yürütücü | Worktree | Durum |
|---|---|---|---|
| 7108 reasoning + transport | Fable ajanı | /home/alperen/deckent-lane-7108 | LANDED d07c3b4db + 0fd94b77e (7108-b) |
| 7109 tool-bütçe birimleri | Cursor + main session | /home/alperen/deckent-cursor-7109b | LANDED d4046bdcb (7109-b, 2026-09-09) — gerçek Qwen kabul owner |
| 7111 salt-okunur onay + read_file | Fable ajanı | /home/alperen/deckent-lane-7111 | LANDED f3d3e2ceb + b4de8a1df (7111-b, Astra A7d CONFIRMED) |
| 7112 checkpoint sürekliliği | Fable ajanı | /home/alperen/deckent-lane-7110 (proof/7110) | LANDED b6f8f4549 |
| 7106 preamble (revize) | Astra | /tmp/deckent-7106-preamble-revised-20260909 | bağımsız review |
| 7113 büyük referans digest | Astra | /tmp/deckent-7113-{a,b}-astra-20260909 | A LANDED 06e33bb66; B LANDED 7c64f3c8d; C/D/E OPEN |
| 7114 etkileşim akışı | Fable ajanı + Opus araştırma | /home/alperen/deckent-lane-7114 | LANDED f2dbb0db3; araştırma follow-up-works/research-terminal-ecosystem-7114.md; gerçek Qwen kabul owner |

Landing sırası: 7106 → 7109 → 7108 → 7111 → 7112 (aynı dosyalara dokunanlar sıralı fan-in,
her biri main HEAD üstünde kuru-prova + baseline ayrımı, ders 34) → build → owner canlı test →
Astra XVerify → 7107 kabul.

## DONE
- §3 kabul bataryası gerçek binary (Qwen 131k + 32k, standart + full-auto) ile PASS; owner canlı test kabulü + farklı-provider XVerify receipt.
- MASTER 7107 DONE; bu dosya silinme tetiğiyle silinmiş.
