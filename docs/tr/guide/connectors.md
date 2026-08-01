# Connectors

## Product-user perspektifi

Connectors; notification, approval, chat turn, media ve seçili capability'leri Deckent ile messaging system'leri arasında taşır. Project authority üzerinde adapter'dırlar; message remote geldi diye execution authority olmazlar. [Kanıt: identity contract `.deckent/workspace/IDENTITY.md:8-10`; connector principal resolution `src/connectors/connector-bootstrap.ts:206-245`]

Public connector ID union Discord, Telegram, WhatsApp, Slack ve email içerir. General bot bootstrap `notify_connectors` üzerinden Telegram, Discord ve WhatsApp'ı aktif olarak dener; bu ağaçtaki Slack/Teams dosyaları üçlü bot bootstrap'ın üyesi değil approval client'tır. [Kanıt: `src/connectors/types.ts:12,82-143`; `src/connectors/connector-bootstrap.ts:177-203`; `src/connectors/approval-slack.ts`; `src/connectors/approval-teams.ts`]

## Configuration ve secrets

Connector startup `notify_connectors` tarafından; bot media/voice/capability behavior `bot_capabilities` tarafından drive edilir; per-user authority identity configuration ve `.deckent/identity.db` kullanabilir. Secret token'lar committed plaintext yerine Deckent secret interpolation ile temsil edilebilir. [Kanıt: `src/core/config.ts:2242-2269`; `src/connectors/connector-bootstrap.ts:52-53,206-245`; `src/connectors/identity/identity-store.ts:19-114`; `src/core/deck-interpolation.ts:1-31`]

Misconfigured connector'lar lazy-load edilir ve whole bootstrap'ı crash etmek yerine error ile skip edilir. Bu availability-oriented fail-safe behavior'dır; inbound identity resolution ise error yakalayıp principal döndürmez, yani authorization sonucu fail-closed'dur. [Kanıt: `src/connectors/connector-bootstrap.ts:1-11,184-203,206-245`]

## Telegram — ⚠️ kısmi

Telegram adapter grammY kullanır; text, media, voice, callback, HTML-formatted output, file download ve optional voice processing destekler. Bot path approved screenshot/mail operation'ları için artifact store ve capability registry paylaşabilir. [Kanıt: `src/connectors/telegram.ts:108-333`; `src/connectors/connector-bootstrap.ts:94-175,521-558`; `src/connectors/capabilities/`]

Code ve command wiring canlıdır; audit Telegram message göndermedi veya external credential probe etmedi. Bu yüzden status end-to-end certified değil partial'dır. [Kanıt: audit'te external connector run yok]

## Discord — ⚠️ kısmi

Discord adapter, `discord.js` optional olduğu için lazy-load edilir; missing dependency log-and-skip behavior üretir. Enabled olduğunda bot bootstrap'a katılır. [Kanıt: `package.json:128-131`; `src/connectors/connector-bootstrap.ts:1-11,182-203`; `src/connectors/discord.ts`]

Audit'te Discord session başlatılmadı. [Kanıt: audit run ledger, 2026-08-01]

## WhatsApp — 🔜 roadmap

WhatsApp açıkça scaffold'dur. Disabled startup no-op; enabled startup activation message ile throw eder; send her zaman throw eder; health her zaman false'tur. Güncel product behavior teslim etmez. [Kanıt: `src/connectors/whatsapp.ts:1-67`]

Source unofficial `whatsapp-web.js` yolunu bilinçli reddeder ve official Business API approval path'i adlandırır. Source comment'lerindeki historical sprint target'ları current delivery promise değildir. [Kanıt: `src/connectors/whatsapp.ts:4-11`; `src/connectors/whatsapp-README.md`]

## Bot lifecycle

Help ile doğrulanan command'lar `deckent bot listen|start|stop|status`'tur. `listen` foreground çalışır; `start` detached listener launch eder; status/stop PID record kullanır. [Kanıt: `src/cli/commands/bot.ts:194-260,310-344`; real help audit]

Gerçek read-only `bot status`, PID 2085721 ile running daemon bildirdi. Bu observation'ı herhangi bir connector'ın authenticated veya healthy olduğunun proof'u saymayın. [Kanıt: real output, 2026-08-01]

## Project gateway

Gateway; project registration, pairing, binding ve project başına child runtime sunar. Current listener özellikle Telegram yükler, pairing/access check uygular ve project session'larını supervise eder. [Kanıt: `src/connectors/gateway/gateway-daemon.ts:38-105`; `src/connectors/gateway/gateway-router.ts:20-93`; `src/connectors/gateway/runtime-supervisor.ts`]

Inline approval callback'leri current gateway listener'da açıkça deferred'dır; button'lar sessizce route edilmez. Status `⚠️ kısmi`. [Kanıt: `src/connectors/gateway/gateway-daemon.ts:87-90`]

Gerçek `gateway status`, “not running” döndürdü. CLI pair list/approve/reject de sunar; birkaç gateway child help description'ı boş kalır—known CLI documentation defect. [Kanıt: real output ve help audit, 2026-08-01; `src/cli/commands/gateway.ts:89-164`]

## Voice ve media

Voice capability level'da default-off'tur. Explicit enabled olduğunda bot startup local veya OpenAI voice adapter oluşturur ve health check koşar; inbound Telegram voice indirilebilir, transcribe edilebilir ve detected language ile route edilebilir. Failure, poller'ı crash etmeden honest error'a degrade olur. [Kanıt: `src/cli/commands/bot.ts:81-189`; `src/connectors/voice/health.ts:53-93`; `src/connectors/connector-bootstrap.ts:133-175`]

## Dogfood / repository gerçeği

| Capability | State | Limitation |
|---|---|---|
| Telegram bot code | ⚠️ kısmi | wired; audit'te live message proof yok |
| Discord bot code | ⚠️ kısmi | optional dependency ve live session proof yok |
| WhatsApp | 🔜 roadmap | scaffold enabled iken throw eder |
| Gateway | ⚠️ kısmi | Telegram-bound listener; callback approval deferred |
| Identity store | ✅ canlı code/schema | current DB snapshot'ta sıfır row; live sender proof yok |
| Bot daemon | ✅ running snapshot | PID gözlendi; PAZARTESI stop/identity-guard ve stale PID cleanup defect'leri kaydeder |

Owner approval olmadan live bot/sprint stop veya clean etmeyin. [Kanıt: `AGENTS.md:69-108`; `PAZARTESI.md:48-49`]
