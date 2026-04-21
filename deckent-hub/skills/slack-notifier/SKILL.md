# Slack Notifier Skill

## Trigger Patterns
- "send Slack message", "notify channel", "post to Slack"
- "webhook notification", "Block Kit message", "Slack alert"
- Any task involving Slack messaging or webhook integration

## Webhook (Simplest Approach)

### Incoming Webhook
```typescript
async function sendWebhook(webhookUrl: string, text: string, blocks?: SlackBlock[]): Promise<void> {
  const payload: Record<string, unknown> = { text };
  if (blocks) payload.blocks = blocks;

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Slack webhook ${res.status}: ${await res.text()}`);
}
```

## Web API (Full Control)

### Client Setup
```typescript
import { WebClient, type ChatPostMessageResponse } from '@slack/web-api';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
```

### Send Message
```typescript
async function postMessage(channel: string, text: string, blocks?: SlackBlock[]): Promise<string> {
  const result: ChatPostMessageResponse = await slack.chat.postMessage({
    channel,
    text, // Fallback for notifications
    blocks,
  });
  return result.ts!; // Message timestamp (used as ID)
}
```

### Thread Reply
```typescript
async function replyInThread(channel: string, threadTs: string, text: string): Promise<void> {
  await slack.chat.postMessage({ channel, text, thread_ts: threadTs });
}
```

### Update Existing Message
```typescript
async function updateMessage(channel: string, ts: string, text: string, blocks?: SlackBlock[]): Promise<void> {
  await slack.chat.update({ channel, ts, text, blocks });
}
```

## Block Kit Patterns

### Status Notification Block
```typescript
function buildStatusBlock(title: string, status: 'success' | 'failure' | 'warning', details: string): SlackBlock[] {
  const emoji = { success: ':white_check_mark:', failure: ':x:', warning: ':warning:' }[status];
  return [
    { type: 'header', text: { type: 'plain_text', text: `${title}` } },
    { type: 'section', text: { type: 'mrkdwn', text: `${emoji} *Status:* ${status}\n${details}` } },
    { type: 'divider' },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `Sent by Deckent at ${new Date().toISOString()}` }] },
  ];
}
```

### Action Button Block
```typescript
function buildActionBlock(text: string, actions: Array<{ label: string; value: string }>): SlackBlock[] {
  return [
    { type: 'section', text: { type: 'mrkdwn', text } },
    {
      type: 'actions',
      elements: actions.map(a => ({
        type: 'button',
        text: { type: 'plain_text', text: a.label },
        value: a.value,
        action_id: `action_${a.value}`,
      })),
    },
  ];
}
```

## Error Handling
- **invalid_auth**: Bot token invalid or revoked. Check SLACK_BOT_TOKEN.
- **channel_not_found**: Bot not invited to channel. Run `/invite @bot` in the channel first.
- **not_in_channel**: Same as above. Bot must be a member to post.
- **rate_limited**: Slack returns `Retry-After` header (seconds). Respect it strictly.
- **too_many_attachments**: Max 50 blocks per message. Split into multiple messages.

## Best Practices
- Always provide `text` alongside `blocks` — it serves as the notification fallback.
- Use webhooks for simple one-way notifications; use Web API for interactive workflows.
- Channel IDs (C0123...) are more reliable than channel names which can change.
- For high-volume notifications, batch into a single message with blocks rather than spamming.
- Store message `ts` for later updates (e.g., "Deploy started" -> "Deploy complete").
- Use thread replies for detailed logs to keep the main channel clean.
