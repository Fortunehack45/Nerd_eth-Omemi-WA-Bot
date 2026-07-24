# 🤖 Nerd-eth Multi-Purpose WhatsApp Bot Pro v2.5.0

> **The Ultimate Enterprise-Grade WhatsApp Automation, Media Processing, AI & Group Management Suite**  
> Developed by **Fortune Adebayo ([@OnNerd_eth](https://x.com/OnNerd_eth))**

---

## 🌟 Executive Overview

**Nerd-eth WhatsApp Bot** is a state-of-the-art, 24/7 autonomous WhatsApp automation ecosystem. Designed for high availability, zero downtime, ultra-fast response times, and maximum stealth protection against account bans, it packs 40+ specialized modules ranging from high-definition media downloading to artificial intelligence conversational agents, auto status management, ad blocking, and real-time Web UI analytics.

```
                  ┌──────────────────────────────────────────────┐
                  │       🤖 NERD-ETH WHATSAPP BOT ENGINE        │
                  └──────────────────────┬───────────────────────┘
                                         │
     ┌───────────────────┬───────────────┴───────────────┬───────────────────┐
     │                   │                               │                   │
┌────┴──────────────┐ ┌──┴───────────────┐ ┌─────────────┴──────┐ ┌──────────┴────────┐
│ 🧠 AI & Memory    │ │ 🎵 HD Media      │ │ 🛡️ Stealth & Anti │ │ 📊 Web Admin UI   │
│ • Zero-Key Public │ │ • Spotify (320k) │ │ • Dynamic Browser │ │ • Glassmorphism UI│
│ • Groq / OpenAI   │ │ • YouTube HD     │ │ • Typing Jitter   │ │ • QR Code Sync   │
│ • User Fact Store │ │ • IG / TikTok    │ │ • Rate Limit Queue│ │ • Remote Control │
└───────────────────┘ └──────────────────┘ └───────────────────┘ └───────────────────┘
```

---

## 🔥 Key Highlights & What's New

- 🎵 **Native Spotify & HD Audio Engine**:
  - Automatically fetches Spotify track metadata via OEmbed before downloading.
  - Downloads tracks in high-fidelity 320kbps MP3 format matching the exact track name (`Artist - Title.mp3`).
  - Embeds ID3v2 tags (title, artist, album) directly into the audio file using FFmpeg.
  - Sends audio as document/audio stream ensuring WhatsApp displays the real track title instead of arbitrary system hashes.
- ⚡ **Instant Response Optimization**:
  - Non-blocking asynchronous typing indicators deliver instantaneous response times across all commands.
- 🤖 **Zero-Setup AI Out-of-the-Box**:
  - Works immediately upon deployment without requiring an OpenAI or Groq API key by defaulting to public free AI providers (Pollinations AI).
  - Robust exception handling guards against missing choices or API errors, automatically routing back to backup free endpoints seamlessly.
- 🛡️ **Advanced Anti-Ban & Stealth Shield**:
  - Simulates human typing behavior with randomized micro-delays, jitter, and realistic WPM speeds.
  - Rotates safe browser fingerprints (Chrome, Firefox, Safari, Edge across Windows, macOS, Linux, and Android).
  - Outgoing rate limiter prevents account flagging during heavy chat bursts.
- 🔄 **24/7 Zero-Downtime Architecture**:
  - Active WebSocket heartbeat keep-alive (every 10s–20s) prevents silent connection drops at 50 minutes.
  - Automated internal self-ping HTTP server keeps cloud hosts (Render, Railway, VPS) continuously warm without sleep state.
- 👁️ **Silent View-Once & Status Automation**:
  - Silently backs up View-Once media directly to the bot owner's private chat.
  - Supports native emoji reactions (❤️, 😂, 👍, 🙂) to View-Once & Status broadcasts without leaking text messages in target chats.
  - Auto-views and auto-likes WhatsApp status broadcasts using native Baileys status JID lists.
- 🛑 **Status Ad & Spam Blocker**:
  - Automatically filters out sponsored posts, promoted stories, external ad metadata, and affiliate marketing spam from status feeds.

---

## 🛠️ Complete Feature Directory

### 1. 🤖 Artificial Intelligence (`!ai`, `!imagine`, `!persona`)
- **Smart Conversational AI**: Retains user conversation history and facts across private chats.
- **Provider Support**: Groq (Llama 3.1 8B), OpenAI (GPT-4o / GPT-4o-mini), AgentRouter, OpenRouter, and zero-config Public Free AI.
- **Image Generation**: Generate high-definition AI art via DALL-E / Pollinations (`!imagine <prompt>`).
- **AI Persona Customization**: Modify system prompt personality, tone, and system rules in real-time.

### 2. 📥 HD Media Downloader (`!download`, `!music`, `!movie`)
- **Spotify Downloader**: Downloads full tracks, playlists, and albums with complete ID3 tags and cover metadata.
- **YouTube HD**: Download videos up to 1080p/720p or extract audio directly (`!download <yt-link> --audio`).
- **TikTok Downloader**: Extract watermark-free HD videos and audio tracks.
- **Instagram Downloader**: Download Reels, Posts, Carousel images, and Stories.
- **Movie Direct Downloader**: YTS API + direct HD embed links (`!movie download <movie-name>`).

### 3. 👥 Group Administration (`!group`)
- **Tag All / Announce**: `@tagall` or `@hidetag` for group announcements.
- **Member Management**: Kick, add, promote, demote group participants (`!group kick @user`, `!group promote @user`).
- **Group Settings**: Lock/unlock group info or message permissions (`!group lock`, `!group unlock`).
- **Invite Link Generator**: Retrieve or reset group invite links (`!group link`, `!group revoke`).

### 4. 🎭 Reactions & Admin Self-Commands
- **Native Emoji Reactions**: Send WhatsApp reactions without sending text messages (`!react 🔥`).
- **Admin Self-Control**: Bot owner can send prefix commands (`!help`) or bare emoji shortcuts (`🎵`, `🍿`, `📸`, `🤖`) to themselves in private chat.

---

## 🚀 Quick Start & Installation

### System Requirements
- **Node.js**: v18.0.0 or higher
- **FFmpeg**: Installed and available in PATH (or via `ffmpeg-static` npm package included)
- **Python 3**: Optional (for `yt-dlp` fallback processing)

---

### Step 1: Clone Repository
```bash
git clone https://github.com/Fortunehack45/Nerd_eth-Omemi-WA-Bot.git
cd Nerd_eth-Omemi-WA-Bot
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Create a `.env` file in the root directory:
```env
BOT_NAME=Nerd-eth
OWNER_NUMBER=2348012345678
PREFIX=!
DASHBOARD_PASSWORD=Omemi

# AI Configuration (Optional - Defaults to Free Public AI)
GROQ_API_KEY=gsk_your_groq_key_here
OPENAI_API_KEY=sk_your_openai_key_here
OPENROUTER_API_KEY=or_your_openrouter_key_here

# Third-Party APIs (Optional)
BRAVE_SEARCH_API_KEY=
OMDB_API_KEY=trilogy

# System Limits & Features
MAX_FILE_SIZE=100
AUTO_VIEW_STATUS=true
AUTO_LIKE_STATUS=true
ANTI_BAN_ENABLED=true
ALWAYS_ONLINE=true
```

### Step 4: Launch the Bot
```bash
# Standard Production Start
npm start

# Development Mode with Auto-Reload
npm run dev

# Production Process Management with PM2
npm run start:pm2
```

---

## 📊 Web Admin Dashboard

The bot comes with a built-in **Billion-Dollar Administrative Dashboard** accessible via browser.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🌐 DASHBOARD URL: http://localhost:3000/dashboard?pwd=Omemi             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Dashboard Capabilities
- **Live QR Code & Pairing Code Sync**: Scan QR code or link via phone number directly from the Web UI.
- **Real-Time System Metrics**: Monitor active memory, server uptime, processed commands, connected user counts, and active AI models.
- **Feature Toggles**: Instantly enable or disable individual commands, anti-bot shields, status ad blockers, and view-once auto-saving.
- **API Key Management**: Update Groq, OpenAI, or Brave Search keys without restarting the server.
- **Live Terminal & Message Logs**: Stream active incoming messages, system alerts, and executed commands.

---

## 📜 Full Command Reference

| Command | Category | Description | Example Usage |
| :--- | :--- | :--- | :--- |
| `!ai <prompt>` | AI | Chat with the AI assistant | `!ai Explain relativity in simple terms` |
| `!imagine <prompt>` | AI | Generate AI imagery | `!imagine A futuristic cyberpunk city at night` |
| `!download <link>` | Media | Download media from YT, IG, TikTok, Spotify | `!download https://open.spotify.com/track/...` |
| `!music play <query>` | Music | Search and play high-res audio track | `!music play Burna Boy Last Last` |
| `!music search <query>`| Music | Search songs, playlists, or albums | `!music search afrobeat 2026` |
| `!music lyrics <song>` | Music | Fetch lyrics for a track | `!music lyrics Last Last --artist Burna Boy` |
| `!movie search <title>`| Movies | Search movies & series info via OMDB | `!movie search Inception` |
| `!movie download <title>`| Movies | Retrieve YTS torrents & HD stream links | `!movie download Interstellar` |
| `!group tagall` | Admin | Mention all group members | `!group tagall Important meeting starts now` |
| `!group kick @user` | Admin | Remove member from group | `!group kick @user` |
| `!viewonce` | Utility | Retrieve or reveal saved View-Once media | `!viewonce` (or reply with ❤️ / 📸) |
| `!savestatus` | Utility | Save quoted or recent status media | `!savestatus` (or reply with 🙂) |
| `!speed` | System | Run network latency and speed test | `!speed` |
| `!status` | System | Show bot uptime, host info, and memory | `!status` |
| `!stealth` | Anti-Ban | Toggle organic presence & fingerprint rotation| `!stealth on` |
| `!setkey <prov> <key>`| Admin | Update runtime API keys | `!setkey groq gsk_...` |

---

## ☁️ 24/7 Deployment Guides

### Deploy to Render / Railway / Heroku
1. Push code to your GitHub repository.
2. Create a new **Web Service** on Render / Railway.
3. Set Build Command: `npm install`
4. Set Start Command: `npm start`
5. Add Environment Variables (`OWNER_NUMBER`, `DASHBOARD_PASSWORD`, etc.).
6. Open your deployment URL to scan the QR code via Dashboard!

### Deploy with Docker
```bash
docker build -t whatsapp-bot .
docker run -d --name wa-bot -p 3000:3000 --env-file .env whatsapp-bot
```

---

## ⚖️ License

Distributed under the **MIT License**. See `LICENSE` for details.

Developed with ❤️ by **Fortune Adebayo ([@OnNerd_eth](https://x.com/OnNerd_eth))**.
