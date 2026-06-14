# Native Agentic REPL — Konuşan Deckent

> `deckent` komutunu argümansız çalıştırdığınızda Ink tabanlı bir TUI açılır; doğal dille konuşun, deckent araçları çağırır, sonuçları gerçek zamanlı akışla yanıtlar.

## Ne işe yarar?
- Argümansız `deckent` → Ink tabanlı interaktif agentic REPL moduna girer (Sprint 224).
- Türkçe ve İngilizce doğal dil komutlarını anlayarak MCP araçlarını ve yerleşik deckent tool'larını çağırır.
- Streaming: model yanıtı tamamlanan satır/blok birimlerinde `<Static>` kaydırma geçmişine akar (ADR-082); in-progress satır canlı gösterilir.
- Oturum geçmişi SQLite `memory.db`'ye kaydedilir; `/resume` ile önceki oturumlar yüklenebilir.
- **Araç onay kuyruğu (Sprint 285 H1 fix):** her araç çağrısı için sıralı FIFO onay modalı — tek-slot kayma hatası giderildi; birden fazla araç eşzamanlı istendiğinde `[i/N]` sırası korunur.
- **Onay modları:** `/approve suggest` (varsayılan) · `/approve auto-edit` · `/approve full-auto`.
- Ctrl-C ile aktif yanıtı iptal et; Ink exit ile çık.

## Neden önemli?
- Sprint durumu, hafıza sorgusu veya plan başlatmak için ayrı CLI komutu ezberlemek gerekmez.
- Oturum kalıcılığı: konuşma bağlamı sprint'ler arasında `memory.db` ile korunur.
- Provider-agnostic: Claude (varsayılan), Codex, Gemini aynı REPL arayüzünden erişilebilir; `/model` ve `/provider` ile çalışma anında geçiş.

## Nasıl çalışır?

```
Kullanıcı girdisi → InputBar (Ink)
      ↓
FIFO giriş kuyruğu (queue.current[])
      ↓
runChatNativeLoop()      ← provider + MCP araç döngüsü
      ↓
StreamSegmenter          ← tamamlanan satır/blok → <Static>
      ↓
Araç çağrısı onayı       ← FIFO ConfirmQueue → [y / a / N]
      ↓
persistTurn() → memory.db  ← oturum geçmişi
```

- Araçlar `tool-permissions.ts`'teki `classifyTool()` ile risk sınıflandırılır; risk seviyesine göre onay gerektirir.
- ALWAYS-CONFIRM gruptaki araçlar (kill/cleanup) `a` (always) ile toplu onaylanamaz — her zaman tek tek sorulur.
- Geçmiş komutlar ok tuşlarıyla gezilir (ring buffer, F11-003 canlı).

## Slash komutları

| Komut | Açıklama |
|-------|----------|
| `/exit` · `/quit` | REPL'den çık |
| `/clear` | Ekran geçmişini temizle |
| `/cancel` | Giriş kuyruğunu temizle |
| `/cd <yol>` | Çalışma dizinini değiştir |
| `/model <id>` | Çalışma anında model değiştir |
| `/provider <ad>` | Çalışma anında provider değiştir |
| `/approve <mod>` | Onay modunu ayarla (suggest/auto-edit/full-auto) |
| `/resume` | Önceki oturum listesinden yükle |

## Native-Agent Deneysel Modu (Opt-In)

```bash
# Varsayılan: KAPALI — standart MCP+chat döngüsü çalışır
deckent

# Native-agent modu: DECKENT_NATIVE_AGENT=1 veya --native bayrağı
DECKENT_NATIVE_AGENT=1 deckent
deckent --native
```

Native-agent modu (`src/cli/repl/native-flag.ts`) **deneyseldir ve varsayılan olarak KAPALI**. Bu mod, standart `runChatNativeLoop` yerine `createNativeEngine()` ile çalışan bir Claude SDK ajanı çalıştırır ve doğrudan araç çağrılarını yönetir. Üretim kullanımı için standart mod (bayrak olmadan) önerilir.

## Komut / Örnek

```bash
# REPL'i başlat (Ink TUI)
deckent

# Örnek REPL oturumu:
# > sprint durumu nedir?
# [deckent_status çağrısı → canlı yanıt]
#
# > son 3 sprinti listele
# [deckent_history çağrısı → özet]
#
# > docker heartbeat ile ilgili ne biliyoruz?
# [deckent_memory_query çağrısı → ADR + öğrenim sonuçları]
#
# [Araç çağrısı: dosya yazılacak]
# > y                (bu araç için izin ver)
# > a                (bu türdeki tüm araçlar için izin ver)
# > N                (reddet)
#
# > /approve auto-edit   (yazma araçlarını otomatik onayla)
# > /clear               (ekranı temizle)
# > /exit                (çık)

# Önceki oturumu sürdür
deckent chat --resume <session-id>
```

## Durum
- Olgunluk: ✅ canlı — Ink TUI, streaming, session persist, MCP dispatch, FIFO confirm queue (Sprint 224–285)
- ⚗️ Deneysel: native-agent modu (`DECKENT_NATIVE_AGENT=1` / `--native`) — opt-in, varsayılan KAPALI
- 🔜 Roadmap: tam multi-provider parity (Codex/Gemini streaming eşitliği)
- İlgili: ADR-081 · ADR-082 · ADR-083 · ADR-086
- Modüller: `src/cli/repl/app.tsx` (Ink ReplApp) · `src/cli/repl/run.tsx` (Ink entry) · `src/cli/repl/native-flag.ts` (opt-in bayrağı) · `src/cli/commands/chat-native.ts` (döngü motoru)
