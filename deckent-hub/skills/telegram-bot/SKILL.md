# Telegram Bot

## Trigger Patterns
- telegram, bot, chat, message, webhook
- "create bot", "send message", "handle command", "inline keyboard", "telegram webhook"

## Overview
Expert guidance for building Telegram bots with `telegraf`. Covers bot setup, command handlers, middleware, inline keyboards, webhooks, and session management.

## Bot Setup
```typescript
import { Telegraf, Context } from 'telegraf';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

// Command handler
bot.command('start', (ctx) => {
  ctx.reply(`Hello ${ctx.from.first_name}! I'm your assistant.`);
});

// Text handler
bot.on('text', (ctx) => {
  ctx.reply(`You said: ${ctx.message.text}`);
});

// Launch (long polling for dev, webhook for prod)
bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
```

## Middleware Pattern
```typescript
// Auth middleware
bot.use(async (ctx, next) => {
  const allowedUsers = new Set([123456789, 987654321]);
  if (!ctx.from || !allowedUsers.has(ctx.from.id)) {
    return ctx.reply('Unauthorized');
  }
  return next();
});

// Logging middleware
bot.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  console.log(`Response time: ${Date.now() - start}ms`);
});
```

## Inline Keyboards
```typescript
import { Markup } from 'telegraf';

bot.command('menu', (ctx) => {
  ctx.reply('Choose an option:', Markup.inlineKeyboard([
    [Markup.button.callback('Option A', 'action_a')],
    [Markup.button.callback('Option B', 'action_b')],
    [Markup.button.url('Visit Site', 'https://example.com')],
  ]));
});

bot.action('action_a', (ctx) => {
  ctx.answerCbQuery('You chose A!');
  ctx.editMessageText('You selected Option A.');
});
```

## Webhook Setup (Production)
```typescript
// Express integration
import express from 'express';
const app = express();

app.use(bot.webhookCallback('/webhook'));
bot.telegram.setWebhook('https://yourdomain.com/webhook');

app.listen(3000);
```

## File Handling
```typescript
// Receive photo
bot.on('photo', async (ctx) => {
  const photo = ctx.message.photo[ctx.message.photo.length - 1]; // highest res
  const file = await ctx.telegram.getFile(photo.file_id);
  const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  ctx.reply(`Photo received: ${url}`);
});

// Send document
await ctx.replyWithDocument({ source: '/path/to/file.pdf', filename: 'report.pdf' });
```

## Error Handling
- **409 Conflict** — Another bot instance polling. Stop other instances or use webhook.
- **429 Too Many Requests** — Rate limited. Respect `retry_after` field. Max 30 msg/sec to same chat.
- **400 Bad Request** — Invalid markup or message too long (4096 char limit).
- **Network errors** — Telegraf auto-retries on polling. For webhooks, return 200 even on error to prevent Telegram retry flood.

## Best Practices
- Use `bot.catch()` for global error handling to prevent crashes.
- Store sessions in Redis/SQLite for persistence across restarts.
- Use `ctx.replyWithChatAction('typing')` before slow operations.
- Group rate limit: max 20 msg/min per group chat.
- Always validate `ctx.from` before accessing user data.
