# Spotify Playlist Skill

## Trigger Patterns
- playlist, spotify, track, album, curate, mix
- "create playlist", "add tracks", "reorder playlist", "search spotify", "get recommendations"

## Core Expertise

### Client Setup
```typescript
import SpotifyWebApi from 'spotify-web-api-node';

const spotify = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: 'http://localhost:8888/callback',
});

// Set access token (from OAuth flow or refresh)
spotify.setAccessToken(accessToken);
spotify.setRefreshToken(refreshToken);

// Auto-refresh pattern
async function ensureToken(): Promise<void> {
  const data = await spotify.refreshAccessToken();
  spotify.setAccessToken(data.body.access_token);
}
```

### Playlist CRUD
```typescript
// Create a playlist
const playlist = await spotify.createPlaylist('Sprint 149 Focus', {
  description: 'Coding focus tracks',
  public: false,
  collaborative: false,
});

// Add tracks by URI
await spotify.addTracksToPlaylist(playlist.body.id, [
  'spotify:track:4iV5W9uYEdYUVa79Axb7Rh',
  'spotify:track:1301WleyT98MSxVHPZCA6M',
]);

// Get playlist tracks (paginated)
let offset = 0;
const allTracks: SpotifyApi.PlaylistTrackObject[] = [];
let batch;
do {
  batch = await spotify.getPlaylistTracks(playlistId, { offset, limit: 100 });
  allTracks.push(...batch.body.items);
  offset += 100;
} while (batch.body.next);

// Reorder tracks (move track at position 3 to position 0)
await spotify.reorderTracksInPlaylist(playlistId, 3, 0, { range_length: 1 });

// Remove tracks
await spotify.removeTracksFromPlaylist(playlistId, [
  { uri: 'spotify:track:4iV5W9uYEdYUVa79Axb7Rh' },
]);
```

### Search & Discovery
```typescript
// Search tracks
const results = await spotify.searchTracks('lofi hip hop', { limit: 20, market: 'TR' });

// Get recommendations based on seed tracks/artists/genres
const recs = await spotify.getRecommendations({
  seed_tracks: ['4iV5W9uYEdYUVa79Axb7Rh'],
  seed_genres: ['focus'],
  target_energy: 0.4,
  target_tempo: 100,
  limit: 30,
});

// Get audio features for analysis
const features = await spotify.getAudioFeaturesForTracks([trackId1, trackId2]);
```

### Error Handling
- **Rate limits:** Spotify uses 429 with `Retry-After` header. Always respect it.
- **Token expiry:** Access tokens expire in 1 hour. Always implement refresh flow.
- **Market restrictions:** Some tracks are unavailable in certain markets. Use `market` parameter.
- **Playlist limits:** Max 10,000 tracks per playlist. Max 100 tracks per `addTracksToPlaylist` call.
- **Duplicate tracks:** `addTracksToPlaylist` allows duplicates silently. Check before adding.
- **OAuth scopes:** Playlist modification requires `playlist-modify-public` or `playlist-modify-private`.

### Best Practices
- Store tokens in `.deck` file: `$DECK:SPOTIFY_CLIENT_ID`, `$DECK:SPOTIFY_CLIENT_SECRET`.
- Use `playlist-modify-private` scope for personal playlists.
- Batch track additions in groups of 100 (API limit per request).
- Use `snapshot_id` from playlist responses for optimistic concurrency on reorder/remove.
- For genre-based curation, use `getAvailableGenreSeeds()` to discover valid genre strings.
