# Google Calendar

## Trigger Patterns
- calendar, event, schedule, google, meeting, reminder
- "create event", "list meetings", "free/busy", "recurring event", "calendar sync"

## Overview
Expert guidance for integrating with Google Calendar API via `googleapis`. Covers OAuth2 service account auth, event CRUD, recurring events, free/busy queries, and watch notifications.

## Authentication
```typescript
import { google, calendar_v3 } from 'googleapis';

// Service account (server-to-server)
const auth = new google.auth.GoogleAuth({
  keyFile: '/path/to/service-account.json',
  scopes: ['https://www.googleapis.com/auth/calendar'],
});

const calendar = google.calendar({ version: 'v3', auth });

// OAuth2 (user consent)
const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const calendarOAuth = google.calendar({ version: 'v3', auth: oauth2 });
```

## List Events
```typescript
const res = await calendar.events.list({
  calendarId: 'primary',
  timeMin: new Date().toISOString(),
  timeMax: new Date(Date.now() + 7 * 86400000).toISOString(),
  singleEvents: true,        // expand recurring events
  orderBy: 'startTime',
  maxResults: 50,
});

for (const event of res.data.items ?? []) {
  const start = event.start?.dateTime ?? event.start?.date;
  console.log(`${start} — ${event.summary}`);
}
```

## Create Event
```typescript
const event: calendar_v3.Schema$Event = {
  summary: 'Sprint Review',
  description: 'Weekly sprint review meeting',
  start: { dateTime: '2026-04-21T14:00:00+03:00', timeZone: 'Europe/Istanbul' },
  end: { dateTime: '2026-04-21T15:00:00+03:00', timeZone: 'Europe/Istanbul' },
  attendees: [{ email: 'team@example.com' }],
  reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] },
};

const created = await calendar.events.insert({ calendarId: 'primary', requestBody: event });
console.log(`Created: ${created.data.htmlLink}`);
```

## Recurring Events
```typescript
const recurring: calendar_v3.Schema$Event = {
  summary: 'Daily Standup',
  start: { dateTime: '2026-04-21T09:00:00+03:00', timeZone: 'Europe/Istanbul' },
  end: { dateTime: '2026-04-21T09:15:00+03:00', timeZone: 'Europe/Istanbul' },
  recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=52'],
};
await calendar.events.insert({ calendarId: 'primary', requestBody: recurring });
```

## Free/Busy Query
```typescript
const freeBusy = await calendar.freebusy.query({
  requestBody: {
    timeMin: new Date().toISOString(),
    timeMax: new Date(Date.now() + 86400000).toISOString(),
    items: [{ id: 'primary' }, { id: 'colleague@example.com' }],
  },
});
const busy = freeBusy.data.calendars?.['primary']?.busy ?? [];
console.log(`Busy slots today: ${busy.length}`);
```

## Update and Delete
```typescript
// Update
await calendar.events.patch({
  calendarId: 'primary',
  eventId: 'abc123',
  requestBody: { summary: 'Updated Title', location: 'Room B' },
});

// Delete
await calendar.events.delete({ calendarId: 'primary', eventId: 'abc123' });
```

## Error Handling
- **401 Unauthorized** — Token expired. googleapis auto-refreshes with refresh_token set.
- **403 Forbidden** — Calendar not shared with service account. Share calendar in Google UI.
- **404 Not Found** — Event deleted or wrong calendarId. Verify before update.
- **409 Conflict** — Concurrent edit. Re-fetch event, apply changes, retry.
- **429 Rate Limited** — 1M queries/day default. Use exponential backoff.

## Best Practices
- Always set `timeZone` on start/end to avoid UTC surprises.
- Use `singleEvents: true` when listing to expand recurring events.
- Use `patch` over `update` to avoid overwriting unset fields.
- Store `etag` for optimistic concurrency on updates.
- Use push notifications (`calendar.events.watch`) instead of polling for real-time sync.
