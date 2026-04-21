# Email IMAP/SMTP

## Trigger Patterns
- email, imap, smtp, inbox, send, attachment
- "read emails", "send email", "search inbox", "download attachment", "email filter"

## Overview
Expert guidance for email operations using `imapflow` (IMAP) and `nodemailer` (SMTP). Covers inbox reading, search, attachments, sending with HTML/text, and connection management.

## IMAP Connection (imapflow)
```typescript
import { ImapFlow } from 'imapflow';

const client = new ImapFlow({
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER!,
    pass: process.env.EMAIL_APP_PASSWORD!,  // Gmail: use App Password, not account password
  },
  logger: false,  // disable verbose logging in production
});

await client.connect();
```

## Read Inbox
```typescript
const lock = await client.getMailboxLock('INBOX');
try {
  // Fetch latest 10 messages
  for await (const message of client.fetch('1:10', {
    envelope: true,
    source: true,
    bodyStructure: true,
  }, { uid: false })) {
    console.log(`${message.envelope.date} — ${message.envelope.from[0].address}`);
    console.log(`  Subject: ${message.envelope.subject}`);
  }
} finally {
  lock.release();
}
```

## Search Messages
```typescript
const lock = await client.getMailboxLock('INBOX');
try {
  // Search by criteria
  const uids = await client.search({
    since: new Date('2026-04-01'),
    from: 'sender@example.com',
    subject: 'invoice',
    seen: false,  // unread only
  });
  console.log(`Found ${uids.length} matching messages`);

  // Fetch matched messages
  for await (const msg of client.fetch(uids, { envelope: true, source: true })) {
    console.log(msg.envelope.subject);
  }
} finally {
  lock.release();
}
```

## Download Attachments
```typescript
import { simpleParser } from 'mailparser';
import { writeFileSync } from 'node:fs';

const lock = await client.getMailboxLock('INBOX');
try {
  for await (const message of client.fetch('1:*', { source: true })) {
    const parsed = await simpleParser(message.source);
    for (const attachment of parsed.attachments) {
      writeFileSync(`/tmp/${attachment.filename}`, attachment.content);
      console.log(`Saved: ${attachment.filename} (${attachment.size} bytes)`);
    }
  }
} finally {
  lock.release();
}
```

## Send Email (nodemailer)
```typescript
import { createTransport } from 'nodemailer';

const transporter = createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,  // STARTTLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

// Plain text + HTML
await transporter.sendMail({
  from: '"Deckent Bot" <bot@example.com>',
  to: 'recipient@example.com',
  subject: 'Sprint Report',
  text: 'Sprint 149 complete. See attached.',
  html: '<h1>Sprint 149</h1><p>All tasks done.</p>',
  attachments: [{ filename: 'report.pdf', path: '/tmp/report.pdf' }],
});
```

## IDLE (Real-Time New Mail)
```typescript
// Listen for new messages in real-time
await client.idle();
client.on('exists', async (info) => {
  console.log(`New message in ${info.path}, total: ${info.count}`);
  // Fetch the new message
  const lock = await client.getMailboxLock(info.path);
  try {
    for await (const msg of client.fetch(`${info.count}:${info.count}`, { envelope: true })) {
      console.log(`New: ${msg.envelope.subject}`);
    }
  } finally {
    lock.release();
  }
});
```

## Error Handling
- **AUTHENTICATIONFAILED** — Wrong credentials. For Gmail, ensure App Password (not account password) and "Less secure apps" or OAuth2.
- **ECONNREFUSED** — Server unreachable. Check host/port. Gmail IMAP must be enabled in settings.
- **Mailbox lock timeout** — Always use try/finally to release locks. Never hold lock during slow operations.
- **QUOTA exceeded** — Cannot store/send. Check mailbox quota.
- **TLS errors** — Use `tls: { rejectUnauthorized: false }` only in development, never in production.

## Best Practices
- Always release mailbox locks in a finally block to prevent deadlocks.
- Use App Passwords for Gmail (2FA required) or OAuth2 for production.
- Batch fetch with UID ranges instead of fetching all messages.
- Use IDLE for real-time instead of polling (saves connections and bandwidth).
- Set `nodemailer` pool option for high-volume sending: `pool: true, maxConnections: 5`.
- Close IMAP connection when done: `await client.logout()`.
