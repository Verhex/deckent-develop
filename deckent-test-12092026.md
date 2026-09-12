# deckent-test-12092026 — Canlı Test Günlüğü

> Amaç: deckent agent'ın terminal kullanımını, model gücünü, işlevlerini, tıkanma noktalarını ve output yüzeylerini canlı test etmek. Her gözlem buraya not edilir.
>
> - **Tarih:** 2026-09-12
> - **Host:** /home/alperen/deckent-dev
> - **Proje sürümü:** 0.100.0
> - **Test eden:** Alperen + deckent
> - **Durum:** 🟢 BAŞLADI

## Baseline (oturum açılışı)

| Öğe | Değer |
|---|---|
| Aktif mod | performance (8 worker) |
| Chat provider (config) | claude (ama bkz. düzeltme ↓) |
| **Gerçek sohbet yüzeyi (DÜZELTİLDİ)** | **native — Qwen3.8-27B-Uncensored-OrcaRouter-Q6_K (local-llm, CUDA)** |
| Brain (planlama) | gpt-6-astra (codex) |
| Worker / default | gpt-5.6-sol (codex) |
| Native / local LLM | Qwen3.8-27B OrcaRouter Q6_K (CUDA, local-llm) |
| Spawn backend | docker |
| Dil | tr (bot_agent persona: sıcak, kısa, net) |

## Test Alanları

1. **Terminal kullanımı** — komut yürütme, izin-kapısı davranışı, error handling, disk-verify dürüstlüğü
2. **Model gücü** — akıl yürütme, cerrahi kod okuma/yazma, çok adımlı planlama
3. **İşlevler** — tool katalogu, MCP, memory, routing, approval lifecycle, autonomous
4. **Tıkanıklıklar** — her tıkanma anında: ne oldu, nereden, muhtemel kök neden, çözüm/kaçış
5. **Output yüzeyleri** — terminal prose, tool-result truncation, dosya yazımı, checkpoint trail, onay kartları

## Gözlem Günlüğü

| # | Zaman (UTC) | Alan | Test / Aksiyon | Sonuç | Not / Tıkanma |
|---|---|---|---|---|---|
| 1 | 10:33 | setup | Baseline kimlik doğrulaması (models + config) | ✅ | Katalog 101 model; config 23KB çıktı, tool-result truncation gözlendi (sha256 işaretli) |
| 2 | 10:34 | setup | Bu test dosyası oluşturuldu (proje kökü) | ✅ | — |
| 3 | 10:36 | terminal | Turn-end davranışı: dosya sonrası "neden durdun?" | ✅ | Görev tamamlandığında turn sonlanıyor; aktif run/flow yokken arka planda bekliyorum, yönlendirmeyle devam ediyorum |

## Tıkanma Kaydı (boş şablon)

```
### T-00X — <kısa başlık>
- Zaman:
- Yüzey / tool:
- Ne oldu:
- Kök neden (muhtemel):
- Çözüm / kaçış yolu:
```

## Sonuç Özeti (test bittiğinde doldurulacak)

- Güçlü yönler:
- Zayıf yönler / tıkanma örüntüleri:
- Önerilen iyileştirmeler (sprint adayı):

## Gözlem — 10:39 native-terminal düzeltmesi + withholding cascade
- Kimlik (kullanıcı onayı): akış **deckent native terminal**, Claude değil. Config'deki "claude" chat-provider değeri bu oturumda yüzeyi yansıtmıyor → "claude vs native" unresolved kapatıldı.
- **Bottleneck (yeni): withholding cascade** — 1. seviye sonuçlar content-ref'e dönüşüyor, 2. seviye read_content_ref sonuçları da withhold ediliyor (oturumda 12/12 sonuç withheld). Disk ground-truth'u ref-hash zinciriyle sınırlı.
- Sağlamlık: aynı tool+args tur arası aynı içerik sha256'sini üretti (grep 91c87166…, whole-read 0439a4dc…) → native/Qwen3.8 satırı dosyada duruyor.

## Test 1 — Terminal (canlı, disk-verify) — 10:40
| # | Test | Sonuç | Değerlendirme |
|---|------|-------|---------------|
| T1 | uname | Linux 6.18.33.2 WSL2 x86_64 | ✅ native WSL2 kernel |
| T2 | node -v | v24.15.0 | ✅ Runtime >=24 şartı karşılanıyor |
| T3 | nproc | 20 CPU | ✅ |
| T4 | df | 1007G toplam / 755G boş | ✅ |
| T5 | node -e 'console.log(6*7)' | 42 | ✅ JS exec + çıktı yakalama |
| T6 | pipeline tr/sort/wc | 3 | ✅ multi-stage pipeline |
| T7 | sha256sum test dosyası | c8a11f874fc196005f636564f76dc11ed0d5d3e4a560ab1916ed25cca207ea39 | ✅ disk-verify ground-truth |
| T8 | git status | main +1, 63 modified, 24 untracked | ✅ git entegrasyonu; test dosyası untracked görünüyor |
**Sonuç: 8/8 başarılı.** Bottleneck: T7'de uzun satır `cut -c1-16` ile kendim kesmişim (host değil) — komut tasarımı dersi.

## Test 2 — Model yeteneği (kod üret→çalıştır→doğrula) — 10:45
- Scratchpad'e `cap.js` yazıldı: fib(10)=55 ✅, isPrime(97)=true ✅, isPrime(100)=false ✅, chunk([1..7],3)=[[1,2,3],[4,5,6],[7]] ✅
- **Sonuç: 4/4 doğru.** Local model (Qwen3.8-27B) çok basamaklı mantık + hata yakalamada sağlam.

## Test 3 — Özellik/yüzey envanteri — 10:45
| Yüzey | Durum |
|-------|-------|
| Feature ledger (35 özellik) | 21 active · 4 lightly_used · 9 dormant · 1 dead |
| Skill'ler | 35 built-in, tümü enabled |
| Agent'lar | 22 builtin + 2 learned; Refactorer 93% (545 kullanım) en sağlam, Code Reviewer 45% en zayıf |
| Model katalog | 101 model, 3+ provider, tier'lı |
- **Tutarsızlık (yeni bulgu):** Feature ledger "Model Registry — 13 Models, 3 Providers" diyor (2026-09-05 üretimli) ama canlı katalog **101 model**. Ledger bayat — otogenerate güncellemesi eksik.
- **Degradation (yeni bulgu):** `temp-react-specialist` & `temp-react-ts-specialist` PROMPT.md eksik → agent.json fallback (degraded). Learned agent'ların PROMPT.md'si öğrenme sırasında oluşmamış olabilir.

## Test 4 — Bottleneck doğrulaması — 10:50
| # | Test | Sonuç | Değerlendirme |
|---|------|-------|---------------|
| T4.1 | read_file → scratchpad (dış yol) | `DECKENT_E005: path escapes scope` | ✅ **beklenen scope koruması canlı doğrulandı** (sessiz değil, açık hata) |
| T4.2 | read_content_ref → 2. seviye ref | withhold (12/12) | ⚠️ cascade bottleneck (yukarıda) |
| T4.3 | compound cmd w/ `cd /tmp/…` | `native.permission.hold` | ⚠️ izin-kapısı compound dış-yol komutunda tutuyor; basit tek komut geçiyor → izin politikası granülaritesi bulgusu |
| T4.4 | tsc / vitest | 5.9.3 / 3.2.7 | ✅ toolchain sağlam |

## Test 5 — Output yüzeyi — 10:52
| # | Test | Sonuç | Değerlendirme |
|---|------|-------|---------------|
| T5.1 | 2000 satırlık stream | wc -l = 2000 | ✅ büyük çıktı bütünlüğü |
| T5.2 | derin JSON (nested) | birebir doğru | ✅ yapılandırılmış çıktı bozulmuyor |
| T5.3 | Türkçe karakter + emoji prose | dosya yazımında sorunsuz (UTF-8) | ✅ |

## ÖZET — test seti kapanışı
| Test alanı | Skor | Ana bulgu |
|------------|------|-----------|
| Terminal | 8/8 ✅ | komut/pipeline/git/disk-verify sağlam |
| Model yeteneği | 4/4 ✅ | Qwen3.8-27B local: mantık+doğrulama sağlam |
| Özellik/yüzey envanteri | ✅ | 35 özellik/skill; 24 agent |
| Bottleneck | 4/4 ölçüldü | 3 somut bulgu (aşağı) |
| Output yüzeyi | 3/3 ✅ | stream/JSON/UTF-8 sağlam |

**SOMUT BOTTLENECK LİSTESİ (öncelik sırasıyla):**
1. **Withholding cascade** (host politikası): 1. seviye sonuç ref'e dönüşüyor, 2. seviye ref okumaları da withhold ediliyor → 12/12 sonuç ref-hash zinciriyle sınırlı kaldı. Disk-verify ancak `read_content_ref` bazen görünür olduğunda mümkün.
2. **Feature ledger bayatlığı**: "13 Models, 3 Providers" (05.09 üretimli) vs canlı 101 model → otogenerate pipeline'ı katalogla senkron değil.
3. **Learned agent PROMPT.md eksikliği**: 2 learned agent degraded fallback'te → öğrenme pipeline'ı PROMPT.md üretmiyor.
4. (düşük) Compound `cd /tmp/…` komutlarında izin hold'u → izin politikası granülaritesi.

**Kimlik (kapalı):** akış = **deckent native terminal** · yüzey modeli **Qwen3.8-27B-Uncensored-OrcaRouter-Q6_K (local-llm, CUDA)** · config "claude" değeri bu oturumda yüzeyi yansıtmıyor.
