---
doc_rank: 50
status: active
last_updated: 2026-04-21
content_hash: sha256:5f1abb249c349e352483da6c6028c3a4388fc9a411322dd138e910f5de4cd7ad
---

# WhatsApp Connector — Activation Guide

## Status: Scaffold Only (Sprint 150)

The WhatsApp connector is a **scaffold** — the interface contract is established but the
connector is not yet activated. Full activation is targeted for **Sprint 153+**.

---

## Why Official Business API Only?

The unofficial `whatsapp-web.js` library is explicitly **not used** in Deckent:

- **Terms of Service violation** — WhatsApp's ToS prohibits automated/bot access via web clients
- **Session ban risk** — Accounts using unofficial automation are regularly banned
- **Maintenance fragility** — WhatsApp frequently changes its web protocol, breaking unofficial libraries

**Official WhatsApp Business API** is the only supported path.

---

## Prerequisites

1. **Meta Developer Account** — [developers.facebook.com](https://developers.facebook.com)
2. **WhatsApp Business Account** — Linked to a dedicated phone number
3. **Business Verification** — Meta reviews your business (can take 2-6 weeks)
4. **API Access Approval** — Granted after Business Verification

---

## Step-by-Step Activation

### Step 1: Create a Meta App

1. Go to [Meta Developer Portal](https://developers.facebook.com/apps)
2. Click **Create App** → Select **Business** type
3. Add **WhatsApp** product to your app
4. Note your **App ID** and **App Secret**

### Step 2: Set Up WhatsApp Business Account

1. In your Meta App dashboard → **WhatsApp** → **Getting Started**
2. Add a phone number (or use the test number Meta provides)
3. Generate a **temporary access token** (valid 24h) for testing
4. For production: generate a **permanent system user token**

### Step 3: Configure Webhook

WhatsApp sends inbound messages to your webhook endpoint.

1. In Meta App → **WhatsApp** → **Configuration** → **Webhook**
2. Set **Webhook URL**: `https://your-domain.com/api/webhooks/whatsapp/<secret>`
3. Set **Verify Token**: a secret string you choose (store in `.deck` as `WHATSAPP_VERIFY_TOKEN`)
4. Subscribe to **messages** webhook field

> **Local development**: Use [ngrok](https://ngrok.com) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) to expose localhost.

### Step 4: Store Credentials in `.deck`

Add to your project's `.deck` file:

```
WHATSAPP_TOKEN=<your-permanent-system-user-token>
WHATSAPP_PHONE_NUMBER_ID=<your-phone-number-id-from-meta>
WHATSAPP_VERIFY_TOKEN=<your-chosen-webhook-verify-token>
```

### Step 5: Configure Deckent

Add to `.deckent/config.json`:

```json
{
  "connectors": {
    "whatsapp": {
      "enabled": true,
      "token": "$DECK:WHATSAPP_TOKEN",
      "options": {
        "phoneNumberId": "$DECK:WHATSAPP_PHONE_NUMBER_ID",
        "verifyToken": "$DECK:WHATSAPP_VERIFY_TOKEN"
      }
    }
  }
}
```

### Step 6: Activate Connector (Sprint 153+)

Once the above steps are complete, the connector implementation in `src/connectors/whatsapp.ts`
will be updated to use the official [WhatsApp Business Platform API](https://developers.facebook.com/docs/whatsapp/cloud-api).

The implementation will use the Cloud API (REST) — no native SDK dependency required:

```typescript
// Sprint 152+ implementation outline:
// POST https://graph.facebook.com/v18.0/{phone-number-id}/messages
// Authorization: Bearer {token}
// Content-Type: application/json
```

---

## Rate Limits (Production Reference)

| Tier | Limit |
|------|-------|
| Test (Sandbox) | 1,000 messages/day |
| Business Verified | 100,000+ messages/day |
| Enterprise | Custom limits |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `403 Forbidden` on webhook | Verify token mismatch — check `WHATSAPP_VERIFY_TOKEN` |
| Token expired | Temporary tokens expire in 24h — generate a system user token |
| Business verification pending | Contact Meta support — typical wait: 2-6 weeks |
| Message not delivered | Check phone number is registered with WhatsApp Business |

---

## References

- [WhatsApp Cloud API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [WhatsApp Business Platform](https://developers.facebook.com/docs/whatsapp)
- [Meta Developer Portal](https://developers.facebook.com)
- [Webhook Setup Guide](https://developers.facebook.com/docs/graph-api/webhooks)
