# Spotify Control

## Trigger Patterns
- spotify, music, playback, track, playlist, player
- "play song", "pause music", "search track", "list devices", "current playback"

## Overview
Expert guidance for integrating with the Spotify Web API via `spotify-web-api-node`. Covers OAuth2 PKCE auth, playback control, search, playlist management, and device transfer.

## Authentication
Spotify uses OAuth2 with scopes. Always request minimum scopes needed:
- `user-read-playback-state` — read current playback
- `user-modify-playback-state` — play, pause, skip, seek, volume
- `user-read-currently-playing` — current track info
- `playlist-modify-public` / `playlist-modify-private` — playlist CRUD
- `user-library-read` / `user-library-modify` — saved tracks

```typescript
import SpotifyWebApi from 'spotify-web-api-node';

const spotify = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: 'http://localhost:8888/callback',
});

// Token refresh pattern — always handle expiry
async function ensureToken(api: SpotifyWebApi): Promise<void> {
  const data = await api.refreshAccessToken();
  api.setAccessToken(data.body.access_token);
}
```

## Playback Control
```typescript
// Play a track on a specific device
await spotify.play({ uris: ['spotify:track:4iV5W9uYEdYUVa79Axb7Rh'], device_id: deviceId });

// Pause, skip, previous
await spotify.pause();
await spotify.skipToNext();
await spotify.skipToPrevious();

// Seek to position (ms)
await spotify.seek(30000); // 30 seconds in

// Set volume (0-100)
await spotify.setVolume(75);
```

## Search Pattern
```typescript
const results = await spotify.searchTracks('never gonna give you up', { limit: 5 });
const tracks = results.body.tracks?.items ?? [];
for (const track of tracks) {
  console.log(`${track.name} — ${track.artists.map(a => a.name).join(', ')}`);
}
```

## Device Transfer
```typescript
const devices = await spotify.getMyDevices();
const target = devices.body.devices.find(d => d.name === 'Living Room Speaker');
if (target?.id) {
  await spotify.transferMyPlayback([target.id], { play: true });
}
```

## Error Handling
- **401 Unauthorized** — Token expired. Call `refreshAccessToken()` and retry once.
- **403 Forbidden** — Missing scope or premium required. Check scopes.
- **404 Not Found** — Device went offline. Re-fetch devices before transfer.
- **429 Rate Limited** — Respect `Retry-After` header. Implement exponential backoff.
- **502/503** — Spotify API transient failure. Retry with 1-2s delay, max 3 attempts.

## Best Practices
- Cache device list for 30s to reduce API calls.
- Always check `is_playing` before toggling play/pause to avoid double-toggle.
- Use `context_uri` (album/playlist) over `uris` (individual tracks) when possible.
- Store refresh tokens securely (never in source code or client storage).
