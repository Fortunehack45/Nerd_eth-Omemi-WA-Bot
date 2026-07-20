# 🤖 Nerd-eth WhatsApp Bot

A powerful, feature-rich multi-purpose WhatsApp bot built with [Baileys](https://github.com/WhiskeySockets/Baileys). Supports AI chat, HD media downloads, movie finder with direct download links, internet search, auto-status viewing, view-once reveal, and much more.

---

## ✨ Features

| Category | Features |
|----------|----------|
| 🤖 **AI Chat** | Chat with AI (Groq free / OpenAI), persistent memory, persona |
| 📥 **Downloads** | YouTube HD, TikTok HD, Instagram, Spotify MP3 |
| 🎬 **Movies** | Search, info, trending, download links (YTS torrent) |
| 🎵 **Music** | YouTube search/download, lyrics, trending, playlists |
| 🔍 **Search** | DuckDuckGo / Brave Search / Wikipedia |
| 👁 **View-Once** | Auto-save & reveal view-once media |
| 📊 **Status** | Auto-view & auto-like contacts' status updates |
| 🔐 **Access Control** | Grant/revoke features per user |
| 👑 **Admin** | Self-commands, API key management, broadcast |
| 🤖 **Agents** | Multi-step AI agents |
| 📅 **Scheduler** | Schedule messages |
| 🧠 **Memory** | Remembers user facts across conversations |

---

## 🚀 Quick Setup

### 1. Install Node.js
Download and install Node.js v18+ from https://nodejs.org

### 2. Clone or download the bot
```bash
git clone https://github.com/Fortunehack45/Nerd_eth-Omemi-WA-Bot.git
cd whatsapp-bot
```

### 3. Install dependencies
```bash
npm install
```

### 4. Configure environment
Edit the `.env` file:
```env
BOT_NAME=Nerd-eth
OWNER_NUMBER=234XXXXXXXXXX   # Your phone number with country code (no +)
PREFIX=!

# Free AI (Groq) — Get key at https://console.groq.com
GROQ_API_KEY=gsk-your-groq-api-key
```

### 5. Start the bot
```bash
npm start
```

Scan the QR code shown in the terminal with WhatsApp → Linked Devices → Link a Device.

---

## 🔑 API Keys (All Free)

| Service | How to get | Required? |
|---------|-----------|-----------|
| **Groq AI** | https://console.groq.com → API Keys | **Recommended** (free, fast) |
| **OpenAI** | https://platform.openai.com | Optional (for GPT-4) |
| **Brave Search** | https://api.search.brave.com | Optional (2000 free/mo) |
| **OMDB Movies** | Pre-configured (`trilogy` key included) | Auto-configured |

> 💡 **No credit card needed for Groq!** Just sign up and create a free API key.

---

## 📋 All Commands

### 🤖 AI Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!ai <question>` | Chat with AI | `!ai What is the meaning of life?` |
| `!ask <question>` | Same as !ai | `!ask Explain quantum computing` |
| `!imagine <prompt>` | Generate image (needs OpenAI) | `!imagine a cat astronaut` |
| `!persona` | Manage AI persona | `!persona set friendly` |

> 💡 In private chat, you can just send a message without any prefix and the bot will respond!

---

### 📥 Download Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!download <url>` | Download media (video, HD by default) | `!download https://youtu.be/abc` |
| `!download <url> --audio` | Download as audio only | `!download https://youtu.be/abc --audio` |
| `!download <url> --info` | Show info without downloading | `!download https://youtu.be/abc --info` |
| `!dl <url>` | Short alias | `!dl https://vm.tiktok.com/abc` |

**Supported platforms:**
- 🎬 **YouTube** — HD video (1080p/720p default)
- 🎵 **Spotify** — Track audio (MP3)
- 📱 **TikTok** — HD video without watermark
- 📸 **Instagram** — Posts, Reels (public only)

---

### 🎵 Music Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!music search <query>` | Search YouTube music | `!music search Burna Boy` |
| `!music play <query>` | Download & send audio | `!music play Alone by Burna Boy` |
| `!music play <spotify url>` | Download Spotify track | `!music play https://open.spotify.com/track/...` |
| `!music trending --country NG` | Trending by country | `!music trending --country NG` |
| `!music lyrics <song>` | Find lyrics | `!music lyrics Lovelier` |
| `!music info <url>` | Track details | `!music info https://youtu.be/abc` |
| `!music recommend --genre afrobeats` | Recommendations | `!music recommend --genre afro` |
| `!music playlist create my-jams` | Create playlist | `!music playlist create my-jams` |
| `!music playlist add <url> -p my-jams` | Add to playlist | `!music playlist add https://youtu.be/... -p my-jams` |
| `!music playlist list` | List playlists | `!music playlist list` |
| `!music playlist show my-jams` | Show playlist | `!music playlist show my-jams` |

---

### 🎬 Movie Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!movie search <query>` | Search movies | `!movie search Inception` |
| `!movie info <title>` | Detailed movie info | `!movie info The Dark Knight` |
| `!movie download <title>` | **Direct download links** (YTS torrent) | `!movie download Inception` |
| `!movie trending` | Trending movies | `!movie trending --region NG` |
| `!movie top --genre action` | Top rated by genre | `!movie top --genre action --decade 2010s` |
| `!movie similar <title>` | Similar movies | `!movie similar Avatar` |
| `!movie upcoming` | Upcoming releases | `!movie upcoming` |
| `!movie recommend --genre thriller` | Recommendations | `!movie recommend --genre horror --year 2024` |

> 💡 **Movie Download** uses the YTS public API and provides torrent/magnet links. Use a torrent client like qBittorrent or uTorrent to download.

---

### 🔍 Search Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!search <query>` | Search the web | `!search latest AI news Nigeria` |
| `!search <query> --source wiki` | Wikipedia search | `!search Nigeria --source wiki` |
| `!google <query>` | Same as !search | `!google best restaurants Lagos` |
| `!wiki <query>` | Wikipedia shortcut | `!wiki quantum physics` |

---

### 👁 View-Once Commands (Admin)

| Command | Description |
|---------|-------------|
| `!viewonce list` | List all saved view-once media |
| `!viewonce show <id>` | Send saved view-once media |
| `!viewonce delete <id>` | Delete a saved media |
| `!viewonce stats` | Storage statistics |
| `!viewonce list --type image` | Filter by type |

> 💡 View-once media is **automatically saved** when someone sends you a view-once message. Admin gets a notification.

---

### 📊 Status Commands

Auto-view and auto-like are enabled by default. The bot automatically views and reacts to contacts' status updates.

| Config | Description |
|--------|-------------|
| `AUTO_VIEW_STATUS=true` | Auto-view status updates |
| `AUTO_LIKE_STATUS=true` | Auto-like with ❤️ emoji |

---

### 🔐 Access Control Commands (Admin)

| Command | Description | Example |
|---------|-------------|---------|
| `!access list` | List approved users | `!access list` |
| `!access add <number>` | Approve a user | `!access add 2348012345678` |
| `!access add <number> --features ai,download --name John` | Add with specific features | |
| `!access remove <number>` | Remove user access | `!access remove 2348012345678` |
| `!access check <number>` | Check user permissions | `!access check 2348012345678` |
| `!access setfeatures <number> ai,download,movie` | Set user features | |
| `!access feature <number> movie` | Toggle a feature | |

**Available features:** `ai`, `agent`, `imagine`, `download`, `movie`, `music`, `search`, `all`

> 💡 Admin always has full access. Access control only affects other users.

---

### 🔑 API Key Management (Admin)

| Command | Description | Example |
|---------|-------------|---------|
| `!setkey groq <key>` | Set Groq AI key | `!setkey groq gsk-abc123...` |
| `!setkey openai <key>` | Set OpenAI key | `!setkey openai sk-proj-abc...` |
| `!setkey brave <key>` | Set Brave Search key | `!setkey brave BSA-abc...` |
| `!setkey show` | Show current provider | `!setkey show` |
| `!setkey test` | Test AI connection | `!setkey test` |

> 💡 Changes take effect immediately — no restart needed! Keys are also saved to `.env`.

---

### 👑 Admin Self-Commands

Send any command **to yourself** in WhatsApp and the bot will respond. This works because `emitOwnEvents` is enabled.

**Example:** Open WhatsApp on your phone → send `!ping` to yourself → the bot replies.

This lets you:
- Test commands without bothering other users
- Manage the bot remotely
- Change settings on the go

---

### 📅 Schedule Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!schedule list` | List scheduled tasks | `!schedule list` |
| `!schedule add "msg" --time "10:00"` | Schedule a message | |
| `!schedule delete <id>` | Delete a task | |

---

### 🧠 Memory & Profile Commands

| Command | Description |
|---------|-------------|
| `!profile` | View what the bot knows about you |
| `!profile set name <name>` | Set your name |
| `!remember <fact>` | Tell the bot something to remember |
| `!forget` | Clear your profile |

---

### 📡 Broadcast (Admin)

| Command | Description |
|---------|-------------|
| `!broadcast <message>` | Send to all contacts (rate limited) |
| `!broadcast --delay 5` | With custom delay between sends |

---

### 🛠 Other Commands

| Command | Description |
|---------|-------------|
| `!ping` | Check if bot is online |
| `!help` | Show all commands |
| `!help <command>` | Help for specific command |
| `!status <text>` | Post a WhatsApp status |
| `!unzip <file>` | Unzip a file |
| `!terminal <cmd>` | Run terminal commands (admin) |
| `!autoreply add <keyword> <reply>` | Add auto-reply |
| `!generate` | Generate files (PDF, DOCX) |
| `!knowledge` | Access knowledge base |

---

## ⚙️ Configuration Reference

All configuration is in the `.env` file:

```env
# Bot basics
BOT_NAME=Nerd-eth
OWNER_NUMBER=234XXXXXXXXXX    # Multiple admins: 234XXX,234YYY
PREFIX=!

# AI — Groq (FREE! Get key at https://console.groq.com)
GROQ_API_KEY=gsk-your-key-here
GROQ_MODEL=llama-3.1-8b-instant   # or llama-3.3-70b-versatile for smarter

# AI — OpenAI (Optional)
OPENAI_API_KEY=sk-your-key-here
AI_MODEL=gpt-4o-mini

# Downloads
DOWNLOAD_PATH=./storage
MAX_FILE_SIZE=100          # Max file size in MB

# Status auto-view
AUTO_VIEW_STATUS=true
AUTO_LIKE_STATUS=true

# Anti-ban protection
ANTI_BAN_ENABLED=true
HUMAN_TYPING=true           # Simulate human typing
RANDOM_DELAYS=true          # Add random delays
ALWAYS_ONLINE=true          # Stay online

# Access control
ACCESS_ENABLED=true         # Set false to allow everyone
ACCESS_DEFAULT_FEATURES=ai,download,movie,music,search

# View-once media
VIEW_ONCE_ENABLED=true
VIEW_ONCE_NOTIFY_ADMIN=true   # Notify admin when saved

# Brave Search (optional, 2000 free/month)
BRAVE_SEARCH_API_KEY=       # Leave empty to use DuckDuckGo

# Movie API
OMDB_API_KEY=trilogy        # Free key included
```

---

## 🏗 Project Structure

```
whatsapp-bot/
├── index.js                 # Entry point
├── config.js                # Config loader
├── .env                     # Environment variables
├── server.js                # Dashboard web server
├── src/
│   ├── client.js            # WhatsApp connection
│   ├── commands/            # All bot commands (25+)
│   │   ├── ai.js            # AI chat
│   │   ├── download.js      # Media downloads
│   │   ├── movie.js         # Movie commands
│   │   ├── music.js         # Music commands
│   │   ├── search.js        # Internet search
│   │   ├── viewonce.js      # View-once management
│   │   ├── access.js        # Access control
│   │   ├── setkey.js        # API key management
│   │   └── ...              # More commands
│   ├── handlers/
│   │   ├── messageHandler.js
│   │   ├── commandHandler.js
│   │   └── statusHandler.js
│   ├── services/
│   │   ├── aiService.js     # Groq/OpenAI/OpenRouter
│   │   ├── downloadService.js # YouTube/TikTok/Instagram/Spotify
│   │   ├── mediaService.js  # Music/Movie search + YTS download
│   │   ├── searchService.js # Web/Brave/Wikipedia search
│   │   ├── viewOnceService.js
│   │   ├── statusService.js
│   │   ├── accessControl.js
│   │   └── ...
│   └── utils/
│       └── helpers.js
└── storage/                 # Downloads, data, viewonce
```

---

## 🔧 Troubleshooting

### Bot not responding to my commands?
1. Make sure `OWNER_NUMBER` in `.env` is your number with country code (no `+`)
2. Restart the bot after editing `.env`
3. Send `!ping` to test

### AI not working?
1. Get a free Groq key at https://console.groq.com
2. Add it to `.env`: `GROQ_API_KEY=gsk-...`
3. Or use: `!setkey groq gsk-your-key`
4. Test with: `!setkey test`

### Download not working?
- YouTube: Make sure the video is not age-restricted
- Instagram: Only works for **public** posts
- Spotify: Uses YouTube as backend, so needs internet
- TikTok: Some private videos may not work

### View-once not being saved?
- Make sure `VIEW_ONCE_ENABLED=true` in `.env`
- The sender must send it directly to you (not in a group where you're not admin)
- Check `!viewonce list` to see saved media

### Bot keeps disconnecting?
- This is normal — it will auto-reconnect
- The session is saved in `sessions/` folder
- To reset: delete the `sessions/` folder and restart

---

## 📜 License

MIT License — Free to use, modify, and distribute.

---

## 🤝 Contributing

Pull requests welcome! For major changes, open an issue first.

---

*Made with ❤️ by Nerd-eth*
