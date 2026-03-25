# Media Tools — Full Reference

## yt-dlp
- **Path:** `/home/node/.local/bin/yt-dlp`
- **Version:** 2026.01.31
- **Cookies:**
  - YouTube: `/home/node/.openclaw/credentials/youtube-cookies.txt` ✅
  - TikTok: `/home/node/.openclaw/credentials/tiktok-cookies.txt` ⚠️ (VPS blocked)
  - Instagram: `/home/node/.openclaw/credentials/instagram-cookies.txt` ⚠️ (API blocked)

### Usage
```bash
export PATH="/home/node/.local/bin:$PATH"
yt-dlp --cookies /home/node/.openclaw/credentials/youtube-cookies.txt [URL]
```

### Platform Status
| Platform | Direct Download | Notes |
|----------|-----------------|-------|
| YouTube | ✅ Works | Full support with cookies |
| TikTok | ❌ Blocked | VPS IP blocked, use Telegram upload |
| Instagram | ❌ Blocked | API rejects, use Telegram upload |

## ffmpeg (Static)
- **Path:** `/home/node/.local/bin/ffmpeg` + `/home/node/.local/bin/ffprobe`
- **Version:** 7.0.2-static

## Deno (JS Runtime)
- **Path:** `/home/node/.local/bin/deno`

## Notes
- Caption Agent prefers direct Telegram uploads for TikTok/Instagram content
- YouTube links can be processed directly
- Always cleanup downloaded media after analysis
