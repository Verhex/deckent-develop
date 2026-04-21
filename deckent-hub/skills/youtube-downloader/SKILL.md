# YouTube Downloader Skill

## Trigger Patterns
- youtube, download, video, audio, yt-dlp, convert
- "download youtube video", "extract audio", "convert to mp3", "get video info"

## Legal Notice
This skill wraps yt-dlp for personal, fair-use downloads. Users are solely responsible for compliance with YouTube Terms of Service and applicable copyright law. Do not use for redistribution of copyrighted content.

## Core Expertise

### Prerequisites
yt-dlp must be installed on the system:
```bash
# macOS
brew install yt-dlp ffmpeg

# Linux
pip install yt-dlp
sudo apt install ffmpeg

# Check version
yt-dlp --version
```

### Basic Download Patterns
```typescript
import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

// Download best quality video+audio
function downloadVideo(url: string, outputDir: string): string {
  const cmd = `yt-dlp -o "${outputDir}/%(title)s.%(ext)s" --merge-output-format mp4 "${url}"`;
  const result = execSync(cmd, { encoding: 'utf-8', timeout: 300_000 });
  return result;
}

// Download audio only (MP3)
function downloadAudio(url: string, outputDir: string): string {
  const cmd = `yt-dlp -x --audio-format mp3 --audio-quality 0 -o "${outputDir}/%(title)s.%(ext)s" "${url}"`;
  return execSync(cmd, { encoding: 'utf-8', timeout: 300_000 });
}

// Download with progress tracking (spawn for streaming output)
function downloadWithProgress(url: string, outputDir: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', [
      '--newline', '--progress',
      '-o', `${outputDir}/%(title)s.%(ext)s`,
      url,
    ]);
    proc.stdout.on('data', (data: Buffer) => {
      const line = data.toString();
      const match = line.match(/(\d+\.?\d*)%/);
      if (match) onProgress(parseFloat(match[1]));
    });
    proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`yt-dlp exit ${code}`)));
  });
}
```

### Video Information (No Download)
```typescript
// Get metadata as JSON
function getVideoInfo(url: string): Record<string, unknown> {
  const result = execSync(`yt-dlp --dump-json --no-download "${url}"`, {
    encoding: 'utf-8',
    timeout: 30_000,
  });
  return JSON.parse(result);
}

// List available formats
function listFormats(url: string): string {
  return execSync(`yt-dlp --list-formats "${url}"`, { encoding: 'utf-8' });
}
```

### Advanced Patterns
```typescript
// Download specific format (e.g., 1080p)
`yt-dlp -f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" "${url}"`

// Download playlist (with index in filename)
`yt-dlp -o "%(playlist_index)s - %(title)s.%(ext)s" --yes-playlist "${url}"`

// Download subtitles
`yt-dlp --write-subs --sub-lang en,tr --convert-subs srt "${url}"`

// Limit download speed (useful for background tasks)
`yt-dlp --limit-rate 5M "${url}"`

// Download thumbnail
`yt-dlp --write-thumbnail --skip-download "${url}"`
```

### Error Handling
- **Video unavailable:** yt-dlp exits non-zero. Parse stderr for "Video unavailable" or "Private video".
- **Age-restricted:** May require cookies. Use `--cookies-from-browser chrome` or `--cookies cookies.txt`.
- **Geo-restricted:** Use `--geo-bypass` flag or provide `--proxy`.
- **Rate limiting:** YouTube may throttle. Use `--sleep-interval 5 --max-sleep-interval 30`.
- **ffmpeg missing:** Audio conversion and format merging require ffmpeg. Check with `which ffmpeg`.
- **Timeout:** Large videos can take minutes. Set generous timeout (300s+) or use spawn for streaming.

### Best Practices
- Always use `--no-overwrites` to avoid re-downloading existing files.
- Use `--restrict-filenames` for safe cross-platform filenames.
- For playlists, use `--download-archive downloaded.txt` to track completed downloads.
- Sanitize URLs before passing to shell commands (prevent injection).
- Use spawn (not execSync) for large downloads to avoid blocking and to stream progress.
