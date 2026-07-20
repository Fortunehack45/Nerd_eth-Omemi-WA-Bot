# 🤖 Nerd-eth 1.0 — WhatsApp Multi-Purpose Bot

**Nerd-eth** is a feature-rich WhatsApp bot built with Baileys (Multi-Device). It combines AI chat, image generation, media downloading, multi-agent orchestration, status management, access control, and anti-ban safety — all in one command-driven interface.

> **Author:** Fortune Adebayo Esho  
> **Website:** [fortuneadebayo.space](https://fortuneadebayo.space)  
> **LinkedIn:** [linkedin.com/in/fortune-esho-79793b417](https://linkedin.com/in/fortune-esho-79793b417)  
> **X (Twitter):** [x.com/OnNerd_eth](https://x.com/OnNerd_eth)  

---

## 📋 Table of Contents

- [Features Overview](#features-overview)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick Start (Local)](#quick-start-local)
- [Deploy to Render](#deploy-to-render)
- [Environment Variables](#environment-variables)
- [APIs & Services Needed](#apis--services-needed)
- [Commands Reference (25 commands)](#commands-reference)
  - [General Commands](#general-commands)
  - [Persona Commands](#persona-commands)
  - [AI Commands](#ai-commands)
  - [Music Commands](#music-commands)
  - [Movie Commands](#movie-commands)
  - [Internet Search](#internet-search)
  - [File Generator](#file-generator)
  - [Media Manager](#media-manager)
  - [Unzip / Extract](#unzip--extract)
  - [Schedule Manager](#schedule-manager)
  - [Download Command](#download-command)
  - [Agent System](#agent-system)
  - [Proactive Responses](#proactive-responses)
  - [Admin Commands](#admin-commands)
  - [Profile & Memory](#profile--memory)
  - [Status Commands](#status-commands)
- [Persona System (Nerd-eth / Omemi)](#persona-system)
- [Web Dashboard](#web-dashboard)
- [Access Control System](#access-control-system)
- [Anti-Ban Features](#anti-ban-features)
- [View-Once Media Saver](#view-once-media-saver)
- [User Memory & Learning](#user-memory--learning)
- [Owner Memory Management](#owner-memory-management)
- [Multi-Agent System](#multi-agent-system)
- [Onboarding Process](#onboarding-process)
- [Troubleshooting](#troubleshooting)

---

## ✨ Features Overview

| Category | Features |
|---|---|
| **🤖 AI** | GPT chat, DALL-E 3 image generation, OpenAI & AgentRouter support |
| **🎵 Music** | Search, play/download audio, lyrics, trending, recommendations, playlists |
| **🎬 Movies** | Search, info (OMDb), trending, top-rated, similar, upcoming, recommendations |
| **📥 Download** | YouTube audio/video, TikTok info, Instagram info, Spotify tracks |
| **🧠 Agents** | Create multi-agent teams, assign roles, run parallel tasks |
| **🌐 Internet Search** | Web search (`!search`) & Wikipedia lookup — no API key needed |
| **📄 File Generator** | Generate PDF, DOCX, MD, TXT files from chat (`!generate`) |
| **📁 Media Manager** | View, send, and list any file on the server (`!media`) |
| **📦 Unzip / Extract** | Extract ZIP, RAR, TAR archives (`!unzip`) |
| **📅 Scheduler** | Recurring scheduled tasks — daily, weekly, monthly, yearly, interval (admin) |
| **🔐 Access Control** | Whitelist users per feature, admin override |
| **📸 View-Once** | Auto-save disappearing media, admin preview & management |
| **💾 Memory** | Per-user conversation history, auto-learned facts, preferences |
| **📢 Broadcast** | Send messages to all chats (admin) |
| **🛡 Anti-Ban** | Rate limiting, human typing simulation, safe mode, presence management |
| **📊 Status** | Auto-view, auto-like, post text/image/video status |
| **⚡ Terminal** | Execute shell commands from WhatsApp (admin) |
| **🔁 Always Online** | Presence keep-alive |

---

## 📁 Project Structure

```
Nerd-eth/
├── index.js                    # Entry point
├── server.js                   # Web dashboard server (Express)
├── config.js                   # Configuration loader
├── package.json                # Dependencies
├── public/
│   └── dashboard.html          # Dashboard frontend
├── .env                        # Environment variables (create this)
├── sessions/                   # WhatsApp auth session (auto-generated)
├── storage/                    # User data, view-once media, playlists, logs
│   ├── users.json              # User memory database
│   ├── conversations/          # Per-user conversation history
│   ├── notes.json              # Per-user notes and facts
│   ├── persona.json            # Active persona (Nerd-eth/Omemi)
│   ├── onboarding.json         # Onboarding completion status
│   ├── playlists.json          # Saved music playlists
│   ├── access.json             # Access control whitelist
│   ├── autoreply.json          # Auto-reply keywords
│   ├── schedules.json          # Recurring scheduled tasks
│   ├── generated/              # Generated files (PDF, DOCX, MD, TXT)
│   ├── viewonce/               # Saved view-once media
│   └── temp/                   # Temporary download files
└── src/
    ├── client.js               # WhatsApp client (Baileys)
    ├── handlers/
    │   ├── messageHandler.js   # Incoming message routing
    │   ├── commandHandler.js   # Command registration & execution
    │   └── statusHandler.js    # Status auto-view/like
    ├── commands/               # All bot commands (25 total)
    │   ├── help.js             # !help — command menu
    │   ├── ping.js             # !ping — bot status
    │   ├── ai.js               # !ai — chat with GPT
    │   ├── imagine.js          # !imagine — DALL-E image gen
    │   ├── agent.js            # !agent — multi-agent system
    │   ├── music.js            # !music — search, play, playlists
    │   ├── movie.js            # !movie — film search, info, recommendations
    │   ├── download.js         # !download — YouTube/TikTok/IG/Spotify
    │   ├── search.js           # !search — internet search (web + Wikipedia)
    │   ├── generate.js         # !generate — PDF, DOCX, MD, TXT files
    │   ├── media.js            # !media — view, send, list server files
    │   ├── unzip.js            # !unzip — extract ZIP/RAR/TAR archives
    │   ├── schedule.js         # !schedule — recurring tasks (admin)
    │   ├── broadcast.js        # !broadcast — send to all chats (admin)
    │   ├── terminal.js         # !terminal — shell commands (admin)
    │   ├── autoreply.js        # !autoreply — keyword auto-responses
    │   ├── profile.js          # !profile — user profile & memory
    │   ├── remember.js         # !remember — save/list/clear notes and facts
    │   ├── persona.js          # !persona — switch between Nerd-eth (male) and Omemi (female)
    │   ├── memoryadmin.js      # !memory — owner memory management (stats/view/edit/clear/reset)
    │   ├── knowledge.js        # !knowledge — all known users (admin)
    │   ├── provider.js         # !provider — switch AI provider
    │   ├── access.js           # !access — user whitelist (admin)
    │   ├── status.js           # !status — post status updates
    │   └── viewonce.js         # !viewonce — saved view-once media (admin)
    ├── services/
    │   ├── aiService.js        # OpenAI & AgentRouter integration
    │   ├── agentService.js     # Multi-agent orchestration
    │   ├── antiBanService.js   # Rate limiting, delays, safety
    │   ├── statusService.js    # Status posting & reactions
    │   ├── mediaService.js     # Music/movie search & info
    │   ├── memoryService.js    # User memory & learning (17 patterns)
    │   ├── accessControl.js    # Feature access management
    │   ├── downloadService.js  # YouTube/TikTok/IG/Spotify download
    │   ├── viewOnceService.js  # View-once media saving
    │   ├── schedulerService.js # Recurring task scheduler
    │   ├── searchService.js    # Web & Wikipedia search (no key needed)
    │   ├── fileGenService.js   # PDF/DOCX/MD/TXT generation
    │   ├── proactiveService.js # Auto-detect intents (greeting/thanks/farewell/help)
    │   ├── personaService.js   # Dual persona system (Nerd-eth/Omemi)
    │   └── onboardingService.js# First-time owner onboarding flow
    └── utils/
    └── utils/
        └── helpers.js          # Flag parser, pagination, formatting
```

---

## 📦 Prerequisites

- [Node.js](https://nodejs.org/) **v18+** (recommended: v20 or v22)
- A **WhatsApp account** (for QR pairing)
- (Optional) An **OpenAI API key** for AI features
- (Optional) An **OMDb API key** for movie details
- (Optional) An **AgentRouter API key** as alternative AI provider
- (Optional) `npm install adm-zip` for built-in ZIP extraction (otherwise falls back to `!terminal` commands)

---

## 🚀 Quick Start (Local)

### 1. Clone & Install

```bash
git clone <your-repo-url> Nerd-eth
cd Nerd-eth
npm install
```

### 2. Configure Environment

Open `.env` and set at minimum:

```env
BOT_NAME=Nerd-eth
OWNER_NUMBER=2348012345678          # <-- YOUR WhatsApp number (with country code)
OPENAI_API_KEY=sk-your-key-here     # <-- Get at https://platform.openai.com/api-keys
```

> 📌 **Need API keys?** Jump to [APIs & Services Needed](#-apis--services-needed--quick-reference) for step-by-step instructions on getting every key (OpenAI, AgentRouter, OMDb).

### 3. Start the Bot

```bash
npm start
```

A **QR code** will appear in the terminal. Open WhatsApp on your phone → **Linked Devices** → **Link a Device** → Scan the QR.

Once connected, you'll see:
```
WhatsApp connected successfully!
Logged in as: Your Name
```

### 4. Start Chatting

Send `!help` to the bot (or add it to a group) to see all commands.

---

## ☁️ Deploy to Render

Render is a cloud platform that hosts Node.js apps for free. Here's how to deploy Nerd-eth.

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit - Nerd-eth 1.0"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/Nerd-eth.git
git push -u origin main
```

### 2. Create a Web Service on Render

1. Go to [dashboard.render.com](https://dashboard.render.com) and click **New +** → **Web Service**
2. Connect your GitHub repository
3. Configure:

| Setting | Value |
|---|---|
| **Name** | `nerd-eth-whatsapp` (or your choice) |
| **Region** | Choose closest to you |
| **Branch** | `main` |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `node index.js` |
| **Plan** | Free |

### 3. Add Environment Variables

In the Render dashboard, go to **Environment** and add:

```env
BOT_NAME=Nerd-eth
OWNER_NUMBER=2348012345678          # Your number with country code
OPENAI_API_KEY=sk-your-key-here     # https://platform.openai.com/api-keys
```

See the full list in [Environment Variables](#environment-variables).  
See [APIs & Services Needed](#-apis--services-needed--quick-reference) for where to get every key.

### 4. Deploy

Click **Create Web Service**. Render will build and start your bot.

**⚠️ Important:** The free Render plan spins down after 15 minutes of inactivity. To keep the bot online 24/7:

- **Option A:** Use a [cron-job.org](https://cron-job.org) free cron job to ping your Render URL every 10 minutes
- **Option B:** Upgrade to a paid Render plan (Starter ~$7/month)
- **Option C:** Use [UptimeRobot](https://uptimerobot.com) free monitor to ping the service

### 5. Scan QR on Render

Since Render doesn't support interactive terminals, you need to:

1. **Deploy once** — the bot will start and fail to connect (no QR scanner)
2. **Check logs** — Render shows the QR code as ASCII in the logs
3. **Use a QR decoder** — copy the QR text from logs and decode it at [qrcode.monster](https://qrcode.monster) or any QR decoder
4. **Scan** with your WhatsApp

**Alternative:** Run locally first to generate the `sessions/` folder, then upload it to Render via a private GitHub repo or Render's persistent disk.

### 6. Persistent Storage on Render

For Render, create a **mounted disk** (paid) or use an external database. For the free tier, session files will persist as long as the service isn't restarted (which happens on each deploy).

**Better approach for Render:** Store sessions and data in a cloud storage like MongoDB Atlas or Supabase (modifications needed).

---

## 🔑 Environment Variables

All configuration is done through `.env` (local) or Render's Environment dashboard.

### Bot Settings

| Variable | Required | Default | Description |
|---|---|---|---|
| `BOT_NAME` | No | `Nerd-eth` | Bot display name used in responses |
| `OWNER_NUMBER` | **Yes** | — | Admin WhatsApp number(s). Comma-separated for multiple |
| `PREFIX` | No | `!` | Command prefix (e.g., `!help`) |

### AI — OpenAI

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | No* | — | OpenAI API key — [Get here](https://platform.openai.com/api-keys) |
| `AI_MODEL` | No | `gpt-4o` | Model: `gpt-4o`, `gpt-4`, `gpt-3.5-turbo` (cheaper) |
| `AI_TEMPERATURE` | No | `0.7` | Response creativity (0-2) |
| `AI_MAX_TOKENS` | No | `2000` | Max response length |

*\*Required if not using AgentRouter. See [how to get OpenAI key](#1-openai-api-key-for-ai-chat--image-generation).*

### AI — AgentRouter (Alternative Provider)

| Variable | Required | Default | Description |
|---|---|---|---|
| `AGENT_ROUTER_ENABLED` | No | `false` | Set `true` to use AgentRouter instead of OpenAI |
| `AGENT_ROUTER_API_KEY` | No* | — | AgentRouter key — [Get here](https://agentrouter.org/register) ($200 free) |
| `AGENT_ROUTER_BASE_URL` | No | `https://agentrouter.org/v1` | API endpoint |
| `AGENT_ROUTER_MODEL` | No | `gpt-4o` | Model to use via AgentRouter |

*\*Required if AGENT_ROUTER_ENABLED=true. See [how to get AgentRouter key](#2-agentrouter-api-key-free-alternative-to-openai).*

### Media & Movies

| Variable | Required | Default | Description |
|---|---|---|---|
| `OMDB_API_KEY` | No | — | OMDb API key — [Get free key here](https://www.omdbapi.com/apikey.aspx) |
| `DOWNLOAD_PATH` | No | `./storage` | Download directory |
| `MAX_FILE_SIZE` | No | `100` | Max file size in MB for downloads |

### Status

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTO_VIEW_STATUS` | No | `true` | Auto-view contacts' status updates |
| `AUTO_LIKE_STATUS` | No | `true` | Auto-like contacts' status updates |

### Agent System

| Variable | Required | Default | Description |
|---|---|---|---|
| `MAX_AGENTS` | No | `5` | Maximum concurrent AI agents |
| `AGENT_TIMEOUT` | No | `300000` | Agent task timeout in ms (5 min) |

### Anti-Ban

| Variable | Required | Default | Description |
|---|---|---|---|
| `ALWAYS_ONLINE` | No | `true` | Keep presence as "available" |
| `ANTI_BAN_ENABLED` | No | `true` | Enable all anti-ban measures |
| `MAX_MESSAGES_PER_CHAT` | No | `20` | Max messages per chat per minute |
| `MAX_BROADCAST_PER_HOUR` | No | `2` | Max broadcasts per hour |
| `HUMAN_TYPING` | No | `true` | Simulate typing before sending |
| `RANDOM_DELAYS` | No | `true` | Add jitter between actions |
| `SAFE_MODE` | No | `true` | Strict rate limiting + deduplication |

### User Memory

| Variable | Required | Default | Description |
|---|---|---|---|
| `MEMORY_ENABLED` | No | `true` | Enable per-user memory & learning |
| `MEMORY_MAX_HISTORY` | No | `100` | Max stored conversation turns per user |
| `MEMORY_AUTO_LEARN` | No | `true` | Auto-extract facts from conversations |

### Access Control

| Variable | Required | Default | Description |
|---|---|---|---|
| `ACCESS_ENABLED` | No | `true` | Enable feature access whitelist |
| `ACCESS_DEFAULT_FEATURES` | No | `ai,agent,imagine,download` | Default features for newly approved users |

### View-Once Media

| Variable | Required | Default | Description |
|---|---|---|---|
| `VIEW_ONCE_ENABLED` | No | `true` | Auto-save view-once messages |
| `VIEW_ONCE_NOTIFY_ADMIN` | No | `true` | Notify admin when view-once media is saved |

---

## 🔌 APIs & Services Needed — Quick Reference

Here is every service the bot needs and exactly where to get the keys.

| Service | Required? | What It Unlocks | Where to Get the Key |
|---|---|---|---|
| **OpenAI** | ✅ Highly recommended | AI chat (`!ai`), image generation (`!imagine`) | [**platform.openai.com/api-keys**](https://platform.openai.com/api-keys) |
| **AgentRouter** | ⬜ Alternative to OpenAI | Same AI features via different provider | [**agentrouter.org/register**](https://agentrouter.org/register) |
| **OMDb API** | ⬜ Optional | Detailed movie info (plot, cast, ratings, awards) | [**omdbapi.com/apikey.aspx**](https://www.omdbapi.com/apikey.aspx) |
| **WhatsApp** | ✅ Required | Bot connection & messaging | Your personal WhatsApp account (no key needed) |
| **YouTube** | ✅ Built-in | Music search, audio download, lyrics | **No key needed** — uses ytdl-core + yt-search |
| **Render** | ⬜ For hosting | 24/7 cloud deployment | [**dashboard.render.com**](https://dashboard.render.com) |

---

### 🔑 Step-by-Step: Get Your API Keys

#### 1. OpenAI API Key (For AI Chat & Image Generation)

```
Required for: !ai, !imagine, !agent, auto AI replies
```

1. Go to [**platform.openai.com/signup**](https://platform.openai.com/signup) and create an account
2. Add a payment method (or use free trial credits — new accounts get **$5–$18 free**)
3. Go to [**platform.openai.com/api-keys**](https://platform.openai.com/api-keys)
4. Click **"Create new secret key"**
5. Copy the key (it starts with `sk-...`)
6. Add to `.env`: `OPENAI_API_KEY=sk-your-key-here`

> 💡 **Free tier tip:** OpenAI gives new users free credits. With `gpt-3.5-turbo` (set `AI_MODEL=gpt-3.5-turbo`), those credits last for months of casual use.

---

#### 2. AgentRouter API Key (Free Alternative to OpenAI)

```
Required for: Same as OpenAI but via AgentRouter
```

AgentRouter is a non-profit OpenAI-compatible API gateway. New users get **$200 free credits** — no credit card required.

1. Go to [**agentrouter.org/register**](https://agentrouter.org/register) and sign up
2. Navigate to the API Keys section in your dashboard
3. Generate a new key (it starts with `ar-...`)
4. Set in `.env`:
   ```env
   AGENT_ROUTER_ENABLED=true
   AGENT_ROUTER_API_KEY=ar-your-key-here
   AGENT_ROUTER_MODEL=gpt-4o
   ```
5. When `AGENT_ROUTER_ENABLED=true`, the bot uses AgentRouter **instead of** OpenAI
6. Switch between them at runtime with: `!provider switch openai` or `!provider switch agentrouter`

> 💡 **Why use AgentRouter?** Access GPT-4, Claude, Gemini and 30+ models through one API key. $200 free credits means months of free usage.

---

#### 3. OMDb API Key (For Detailed Movie Info)

```
Required for: !movie info with full plot, cast, ratings, awards, box office
```

Without OMDb, `!movie` commands fall back to YouTube search results.

1. Go to [**omdbapi.com/apikey.aspx**](https://www.omdbapi.com/apikey.aspx)
2. Choose the **"Free"** tier ($0 — 1,000 requests/day)
3. Fill in the form and check your email for the API key
4. Add to `.env`: `OMDB_API_KEY=your-omdb-key`

> 💡 The free tier gives you **1,000 requests per day** — more than enough for personal use.

---

#### 4. Render Account (For 24/7 Hosting)

```
Required for: Deploying the bot online
```

1. Go to [**dashboard.render.com**](https://dashboard.render.com) and sign up with GitHub
2. Follow the [Deploy to Render](#deploy-to-render) guide above
3. The free tier includes:
   - **100 GB bandwidth/month** ($0 beyond that)
   - **Automatic HTTPS/SSL**
   - **Git-based deployments**
   - **15-min inactivity spin-down** (use [cron-job.org](https://cron-job.org) to keep alive)

---

#### 5. No Key Needed (Built-in)

| Service | How It Works |
|---|---|
| **YouTube Search** | Built into `!music` and `!movie` via `yt-search` package — no API key |
| **YouTube Download** | Built-in via `ytdl-core` — no API key |
| **TikTok / Instagram / Spotify** | Uses public oEmbed APIs — no API key |
| **WhatsApp Connection** | Uses Baileys library with QR code — no API key |
| **Internet Search** | `!search` uses DuckDuckGo HTML scraping + Wikipedia API — no API key |
| **File Generation** | `!generate` uses pdfkit + docx libraries — no external API needed |
| **Media Manager** | `!media` uses Node.js filesystem — no API key |

---

## 💬 Commands Reference

### General Commands

| Command | Aliases | Description |
|---|---|---|
| `!help [command]` | `h`, `menu`, `commands` | Show all commands or details about one |
| `!ping` | `p`, `uptime`, `alive` | Check bot status, uptime, and response time |

### Persona Commands (`!persona`)

Switch the bot's identity between two unique personalities — affects all responses, system prompts, and proactive messages.

| Command | Description |
|---|---|
| `!persona` | View the currently active persona |
| `!persona male` | Switch to **Nerd-eth** 🤖 (male, he/his) |
| `!persona female` | Switch to **Omemi** 👩‍💻 (female, she/her) |
| `!persona list` | Show both personas with details |

**Personas:**

| Persona | Gender | Pronouns | Style |
|---|---|---|---|
| **Nerd-eth** 🤖 | Male | he/his | Friendly, technical, passionate about tech and music |
| **Omemi** 👩‍💻 | Female | she/her | Warm, empathetic, socially aware and caring |

### AI Commands

| Command | Aliases | Description | Restriction |
|---|---|---|---|
| `!ai <question>` | `ask`, `chat`, `gpt` | Chat with GPT AI — remembers user context | `ai` |
| `!imagine <description>` | `draw`, `generate`, `img`, `dalle` | Generate image from text via DALL-E 3 | `imagine` |
| `!provider` | `ai`, `model`, `switch` | Show/switch AI provider (OpenAI ↔ AgentRouter) | — |
| `!provider switch <name>` | — | Switch provider at runtime | — |
| `!provider models` | — | List all models via AgentRouter | — |

### Music Commands (`!music`)

```
!music <subcommand> [args] [flags]
```

| Subcommand | Example | Description |
|---|---|---|
| `search` | `!music search afrobeat --limit 5 --type song` | Search for songs, channels, playlists |
| `play` | `!music play burna boy last last` | **Download and send audio file** |
| `download` | `!music download lovelier` | Alias for play (downloads audio) |
| `info` | `!music info https://youtu.be/...` | Detailed track info |
| `trending` | `!music trending --country NG` | Trending music by country |
| `lyrics` | `!music lyrics alone --artist burna boy` | Search for song lyrics |
| `recommend` | `!music recommend --mood chill --genre afro` | Recommendations by mood/genre |
| `playlist` | See below | Playlist management |

**Playlist subcommands:**

| Command | Description |
|---|---|
| `!music playlist create <name> --desc "..."` | Create a new playlist |
| `!music playlist list` | List all playlists |
| `!music playlist show <name>` | Show playlist contents |
| `!music playlist add <url> --playlist <name>` | Add a track to playlist |
| `!music playlist remove <index> --playlist <name>` | Remove a track by index |
| `!music playlist delete <name>` | Delete a playlist |

**Common flags:** `--limit/-l`, `--type/-t`, `--sort/-s`, `--country/-c`, `--artist/-a`, `--mood/-m`, `--genre/-g`

### Movie Commands (`!movie`)

```
!movie <subcommand> [args] [flags]
```

| Subcommand | Example | Description |
|---|---|---|
| `search` | `!movie search inception --year 2010 --type movie` | Search movies & series |
| `info` | `!movie info Inception --full` | Full movie details (plot, cast, ratings) |
| `trending` | `!movie trending --region US` | Trending movies by region |
| `top` | `!movie top --genre sci-fi --decade 2010s` | Top rated by genre/decade/year |
| `similar` | `!movie similar "The Matrix"` | Find similar movies |
| `upcoming` | `!movie upcoming --limit 15` | Upcoming releases |
| `recommend` | `!movie recommend --genre thriller --rating 7` | Personalized recommendations |

**Flags:** `--year/-y`, `--type/-t`, `--limit/-l`, `--region/-r`, `--genre/-g`, `--decade/-d`, `--rating/-r`, `--full/-f`

### Internet Search (`!search`)

```
!search <query> [--source web|wiki] [--limit N]
```

Search the web or Wikipedia directly from WhatsApp — no API key needed.

| Example | Description |
|---|---|
| `!search latest AI news` | General web search |
| `!search Nigeria population --source wiki` | Wikipedia article search |
| `!search JavaScript arrays --limit 3` | Limited results |

### File Generator (`!generate`)

```
!generate <pdf|docx|md|txt> <content> [--name filename]
```

Generate downloadable files from text content.

| Example | Output |
|---|---|
| `!generate md # Notes\n\n- Item 1\n- Item 2` | Markdown document |
| `!generate pdf # Report\n\nBody text here.` | Professional PDF |
| `!generate docx # Title\n\nContent --name MyDoc` | Word document |
| `!generate txt Hello World --name greeting` | Plain text file |

**Formatting tips for PDF/DOCX:** Use `#`, `##`, `###` for headings, `- text` for bullet lists, `1. text` for numbered lists, `---` for separators.

### Media Manager (`!media`)

```
!media send <path> | list [dir] | info <path> | recent
```

View, send, and manage files on the server.

| Command | Description |
|---|---|
| `!media list storage/generated` | List files in a directory |
| `!media send storage/generated/report.pdf` | Send any file as a WhatsApp message |
| `!media info storage/temp/song.mp3` | Show file details (size, dates, path) |
| `!media recent` | Show 15 most recently modified files |

### Unzip / Extract (`!unzip`)

```
!unzip <filepath> [--output dir] [--list]
```

Extract compressed archives or view their contents.

| Example | Description |
|---|---|
| `!unzip storage/downloads/archive.zip` | Extract ZIP file |
| `!unzip storage/files/data.zip --list` | List ZIP contents without extracting |
| `!unzip storage/files/backup.tar.gz --output storage/extracted` | Extract TAR.GZ to specific folder |

**Supported formats:** ZIP (built-in), RAR and TAR.GZ (requires external tools like 7-Zip on the server).

### Schedule Manager (`!schedule`) — Admin Only

```
!schedule <create|list|info|toggle|delete> [args] [flags]
```

Automate recurring messages — perfect for reminders, announcements, keep-alive pings.

| Command | Description |
|---|---|
| `!schedule create "Morning Reminder" --type daily --time 08:00` | Daily at 8 AM |
| `!schedule create "Weekend Vibes" --type weekly --day fri --time 17:00` | Every Friday at 5 PM |
| `!schedule create "Monthly Report" --type monthly --date 1 --time 09:00` | 1st of every month |
| `!schedule create "New Year" --type yearly --date 01-01 --time 00:00` | Every Jan 1st |
| `!schedule create "Keep Alive" --type interval --minutes 30` | Every 30 minutes |
| `!schedule list` | View all schedules |
| `!schedule info <id>` | Details of one schedule |
| `!schedule toggle <id>` | Pause / resume a schedule |
| `!schedule delete <id>` | Remove a schedule |

**Types:** `daily`, `weekly`, `monthly`, `yearly`, `interval` (min 10 min)

### Download Command (`!download`)

```
!download <link> [--audio] [--info]
```

| Example | Description |
|---|---|
| `!download https://youtu.be/...` | Get YouTube video info + download |
| `!download https://youtu.be/... --audio` | Download and send as audio file |
| `!download https://vm.tiktok.com/...` | Get TikTok post info |
| `!download https://instagram.com/p/... --info` | Instagram post details |
| `!download https://open.spotify.com/track/...` | Spotify track info |

### Agent System (`!agent`)

```
!agent <subcommand> [args]
```

| Subcommand | Description |
|---|---|
| `!agent create <name> <role>` | Create an agent (roles: assistant, coder, writer, researcher, terminal, general) |
| `!agent list` | List all active agents |
| `!agent ask <name> <task>` | Ask a specific agent to do something |
| `!agent all <task>` | Ask ALL agents to work on a task simultaneously |
| `!agent kill <name>` | Remove an agent |
| `!agent killall` | Remove all agents |

**Example workflow:**

```
!agent create writer1 writer
!agent create coder1 coder
!agent ask writer1 write a poem about technology
!agent all build a todo list app in node.js
```

### Proactive Responses

The bot can **automatically detect common intents** in private chats — no command prefix needed.

| Intent | Example Messages | Bot Response |
|---|---|---|
| **Greeting** | "Hi", "Hello", "Hey", "Good morning" | Friendly greeting with persona name |
| **Farewell** | "Goodbye", "Bye", "See you", "I'm leaving" | Warm farewell message |
| **Thanks** | "Thank you", "Thanks", "Appreciate it", "Good bot" | You're welcome acknowledgment |
| **Help** | "What can you do?", "Help me", "Commands", "How do I..." | Helpful commands overview |
| **Who Am I** | "Who are you?", "What are you?", "Tell me about yourself" | Persona introduction with name |
| **Ping** | "Are you there?", "You there?", "Hello?", "Hey bot" | Alive confirmation |

> Responses use the **active persona** (Nerd-eth or Omemi) — switch with `!persona`.

### Admin Commands

| Command | Aliases | Description |
|---|---|---|
| `!broadcast <message>` | `bc`, `announce`, `blast` | Send message to all chats (with anti-ban delays) |
| `!terminal <command>` | `exec`, `cmd`, `shell`, `run` | Execute shell commands on the server |
| `!schedule <subcommand>` | `sched`, `cron`, `timer`, `recurring` | Schedule recurring tasks (daily/weekly/monthly/yearly/interval) |
| `!access <subcommand>` | `permission`, `auth`, `whitelist` | Manage who can use AI features |
| `!memory` | `userdata`, `profiles` | View memory stats, edit/clear user profiles |
| `!memory stats` | — | Show memory usage statistics |
| `!memory view <id>` | — | View a user's full stored profile |
| `!memory edit <id> <field> <value>` | — | Edit a user's name, about, notes, or pushName |
| `!memory clear <id\|all>` | — | Clear a specific user's data or all users |
| `!memory resetconfirm` | — | Factory reset — wipes all users, persona, access, onboarding |
| `!knowledge` | `users`, `contacts`, `known` | View all known users and stored data |
| `!viewonce <subcommand>` | `vo`, `saved` | Manage saved view-once media |

**`!access` subcommands:**

| Command | Description |
|---|---|
| `!access list` | List all approved users |
| `!access add <number> [--features ai,agent] [--name John]` | Approve a user |
| `!access remove <number>` | Revoke a user's access |
| `!access feature <number> <name>` | Toggle a feature (ai/agent/imagine/download) |

**`!viewonce` subcommands:**

| Command | Description |
|---|---|
| `!viewonce list [--type image]` | List saved view-once media |
| `!viewonce show <id>` | View/send a saved media file |
| `!viewonce delete <id>` | Delete a saved file |
| `!viewonce stats` | Storage statistics |

### Profile & Memory

| Command | Aliases | Description |
|---|---|---|
| `!profile` | `user`, `whoami`, `memory` | View everything the bot knows about you |
| `!profile set name <value>` | — | Set your name |
| `!profile set about <text>` | — | Set about/bio |
| `!profile fact <text>` | — | Add a fact about yourself |
| `!profile tag <tag>` | — | Add a tag |
| `!profile pref <key> <value>` | — | Set a preference |
| `!remember <text>` | `note`, `note` | Save a note or fact the bot should remember |
| `!remember list` | — | View all your saved notes |
| `!remember clear` | — | Clear all your saved notes |
| `!remember recent` | — | Show recently learned facts about you |
| `!remember for <number> <text>` | — | (Admin) Save a note for another user |
| `!knowledge` | `users`, `contacts`, `known` | (Admin) View all known users |
| `!knowledge search <query>` | — | Search users by name/fact/tag |

### Status Commands

| Command | Aliases | Description |
|---|---|---|
| `!status <text>` | `story`, `sts` | Post a text status update |
| `!autoreply add <keyword>\|<response>` | `ar`, `auto` | Add keyword auto-reply |
| `!autoreply remove <keyword>` | — | Remove auto-reply |
| `!autoreply list` | — | List all auto-replies |

---

## 👤 Persona System (Nerd-eth / Omemi)

Nerd-eth features **two distinct personas** that change the bot's identity, pronouns, and communication style.

### Personas

| Persona | Gender | Pronouns | Emoji | Style |
|---|---|---|---|---|
| **Nerd-eth** 🤖 | Male | he / his | 🤖 | Friendly, technical, passionate about tech and music. Gives advice with confidence. |
| **Omemi** 👩‍💻 | Female | she / her | 👩‍💻 | Warm, empathetic, socially aware and caring. Listens first, responds with compassion. |

### How It Works

- Every response uses the active persona's **name, pronouns, and style**
- AI system prompts, proactive messages, and all command outputs reflect the active persona
- Changed via `!persona male` or `!persona female`
- Persisted in `storage/persona.json` — survives restarts

### Examples

**Nerd-eth** 🤖: *"Hey! I'm Nerd-eth. I've been diving into some cool tech lately. What's up?"*

**Omemi** 👩‍💻: *"Hi there! I'm Omemi. How are you feeling today? I'm here to help."*

---

## 🌐 Web Dashboard

Nerd-eth includes a real-time web dashboard accessible from any browser.

### Accessing the Dashboard

```
http://<your-server-ip>:3000/dashboard?pwd=<password>
```

- **Port:** 3000 (configurable via `DASHBOARD_PORT`)
- **Password:** Set via `DASHBOARD_PASSWORD` in `.env` (default: `admin`)

### Dashboard Features

| Section | Description |
|---|---|
| **Bot Status** | Online/offline indicator, uptime, active persona |
| **User Stats** | Total known users, facts stored count |
| **Recent Messages** | Last 15 messages with sender and timestamp |
| **Command Log** | Recent commands executed with user info |
| **All Users Table** | Every known user with name, about, notes, tags, join date |
| **Auto-Refresh** | Dashboard refreshes every 5 seconds |

### Configuration

```env
DASHBOARD_PORT=3000
DASHBOARD_PASSWORD=your-secure-password
```

---

## 🔐 Access Control System

Nerd-eth includes a built-in access control system that lets you decide **who can use AI-powered features**.

### How It Works

1. **Admin always has access** to everything (defined by `OWNER_NUMBER` in `.env`)
2. **Other users must be approved** via `!access add <number>`
3. **Features can be toggled individually** per user

### Features You Can Control

| Feature | Affected Commands |
|---|---|
| `ai` | `!ai`, automatic AI responses |
| `agent` | `!agent` (create, ask, multi-agent) |
| `imagine` | `!imagine` (DALL-E image gen) |
| `download` | `!download` (media downloader) |
| `all` | All of the above |

### Quick Examples

```bash
!access add 2348012345678                    # Full access
!access add 2348012345678 --features ai,download  # Limited access
!access list                                  # View all approved
!access feature 2348012345678 agent           # Toggle agent on/off
!access remove 2348012345678                  # Revoke access
```

When a non-admin without access tries a restricted command, they see:
> ⛔ You don't have access to "ai" features. Contact the bot admin.

---

## 🛡 Anti-Ban Features

Nerd-eth includes multiple safety layers to protect your WhatsApp account from being banned.

| Feature | Description |
|---|---|
| **Rate Limiting** | Caps actions per minute (AI ≤10/min, status ≤30/min, commands ≤20/min) |
| **Message Rate Per Chat** | Max 20 messages per chat per minute |
| **Human Typing Simulation** | Sends "typing..." presence with realistic delays proportional to message length |
| **Random Delays** | 300–1200ms jitter between receiving and sending messages |
| **Duplicate Detection** | Skips processing duplicate message IDs (tracks last 5000) |
| **Browser Rotation** | Random user-agent on each connection (Chrome/Firefox/Edge/Safari) |
| **Night Throttle** | Automatically slows down between midnight and 6am |
| **Broadcast Limits** | Caps broadcasts to 2/hour with 3–8s delays per recipient |
| **Status Anti-Ban** | Skips every 3rd–6th auto-like randomly, 5s cooldown between views |
| **Reconnect Jitter** | Random 3–8s delay before reconnecting after disconnect |

### Configuration

```env
ANTI_BAN_ENABLED=true
MAX_MESSAGES_PER_CHAT=20
MAX_BROADCAST_PER_HOUR=2
HUMAN_TYPING=true
RANDOM_DELAYS=true
SAFE_MODE=true
```

---

## 📸 View-Once Media Saver

Nerd-eth can **automatically save view-once images, videos, and voice notes** before they disappear.

### How It Works

1. Someone sends a view-once message to the bot
2. The bot intercepts it before it's marked as viewed
3. Downloads and saves the file to `storage/viewonce/`
4. Sends the admin a notification with the media ID

### Admin Management

```bash
!viewonce list                # Show all saved media
!viewonce list --type image   # Filter by type
!viewonce show 1712345678000  # View/send a saved file
!viewonce delete 1712345678000  # Delete a file
!viewonce stats               # Storage summary
```

### Configuration

```env
VIEW_ONCE_ENABLED=true
VIEW_ONCE_NOTIFY_ADMIN=true
```

---

## 💾 User Memory & Learning

Nerd-eth automatically builds a **profile for every user** who DMs the bot.

### What It Remembers

- **Your name** (from `my name is...` patterns)
- **Preferences** (language, style, etc.)
- **Facts** (age, location, job, likes)
- **Conversation history** (last 100 messages)
- **Tags** (manually added via `!profile tag`)

### Commands

```bash
!profile                # View your full profile
!profile set name John  # Manually set your name
!profile fact I love jazz  # Add a fact
!profile tag friend     # Add a tag
!profile pref language Spanish  # Set preference
```

The bot uses this memory to **personalize AI responses** — it knows who you are and what you like.

---

## 🗂 Owner Memory Management

As the bot owner, you have complete control over the bot's memory via the `!memory` command.

| Command | Description |
|---|---|
| `!memory stats` | View total user count, total facts stored, database health |
| `!memory view <id>` | See every detail the bot knows about a specific user (name, about, facts, notes, tags, preferences, pushName) |
| `!memory edit <id> <field> <value>` | Edit a user's stored data (supported fields: `name`, `about`, `notes`, `pushName`) |
| `!memory clear <id>` | Wipe all data for a specific user |
| `!memory clear all` | Wipe data for **all users** |
| `!memory resetconfirm` | **Factory reset** — removes all user data, persona settings, access control whitelist, and onboarding completion status |

### Example Workflow

```bash
!memory stats                        # Check memory usage
!memory view 2348012345678           # View user profile
!memory edit 2348012345678 name John # Fix a user's name
!memory clear 2348012345678          # Remove user data
```

> ⚠️ **`!memory resetconfirm`** is destructive — it deletes `storage/users.json`, `storage/persona.json`, `storage/access.json`, and `storage/onboarding.json`. The bot will re-onboard on next connection.

---

## 🧠 Multi-Agent System

Create teams of specialized AI agents that work on tasks simultaneously.

### Available Roles

| Role | Description |
|---|---|
| `assistant` | General-purpose helpful assistant |
| `coder` | Programming and code writing expert |
| `writer` | Creative writing and content creation |
| `researcher` | Factual, well-structured research |
| `terminal` | Terminal command expertise |
| `general` | Versatile all-purpose agent |

### Example

```bash
!agent create writer1 writer    # Create a writer agent
!agent create coder1 coder      # Create a coder agent
!agent list                     # See all agents
!agent ask writer1 write a poem about AI   # Ask one agent
!agent all build a calculator app in node.js  # Ask ALL agents
!agent kill writer1             # Remove an agent
```

When you use `!agent all <task>`, every active agent works on the task in parallel and returns their results.

---

## 🚀 Onboarding Process

When the bot connects for the **first time**, it walks the owner through a short onboarding flow.

### What Happens

1. **5 seconds after connect**, the bot sends a welcome message to the owner
2. **Step 1:** Choose the bot's persona — `!persona male` (Nerd-eth) or `!persona female` (Omemi)
3. **Step 2:** Explore commands — try `!help` to see everything
4. **Step 3:** Configure API keys — set `OPENAI_API_KEY` or enable AgentRouter in `.env`
5. Once all steps are acknowledged, the bot marks onboarding as **complete**

### Completion

Onboarding status is stored in `storage/onboarding.json`. Once completed, the flow **never triggers again** unless you factory reset with `!memory resetconfirm`.

### Manual Re-trigger

To re-run onboarding, delete `storage/onboarding.json` or run `!memory resetconfirm` and reconnect.

---

## 🔧 Troubleshooting

### QR Code Not Showing
- Make sure the `sessions/` folder is empty/doesn't exist
- Delete the `sessions/` folder and restart
- Check your terminal supports ASCII/QR display

### "AI is not configured"
- Set `OPENAI_API_KEY` in `.env`
- Or enable AgentRouter with `AGENT_ROUTER_ENABLED=true` and set `AGENT_ROUTER_API_KEY`
- Run `!provider` to check current provider status

### Connection Drops Frequently
- Enable anti-ban features: `ANTI_BAN_ENABLED=true`
- Enable always-online: `ALWAYS_ONLINE=true`
- Check your internet connection

### "You don't have access" Error
- Admin: Use `!access add <number>` to approve the user
- User: Ask the bot admin to grant you access

### Session Expired / Logged Out
- Delete the `sessions/` folder
- Restart the bot
- Scan the QR code again

### Audio Download Fails
- The track may be too long (>50MB)
- YouTube may block the download
- Try with a different song or use `!music play` to get the link instead

### View-Once Not Saving
- Check `VIEW_ONCE_ENABLED=true` in `.env`
- Check `storage/viewonce/` directory exists and is writable
- Check console for error messages

### Bot Slows Down at Night
- This is the **night throttle** feature — see [Anti-Ban](#anti-ban-features)
- Disable with `SAFE_MODE=false` (not recommended)

### Dashboard Not Loading
- Ensure `DASHBOARD_PORT` is not blocked by a firewall
- Check the bot is running (dashboard starts with `index.js`)
- Verify the password: `http://<ip>:<port>/dashboard?pwd=<password>`

### Persona Not Changing
- Use `!persona male` or `!persona female` (not just `!persona`)
- Check `storage/persona.json` exists and is writable
- Restart the bot if persona still doesn't switch

### Scheduler Not Firing
- Only the admin can create schedules
- Verify the schedule is enabled with `!schedule list`
- Interval type requires `--minutes` ≥ 10
- Check `storage/schedules.json` exists and is valid JSON

### File Generation Fails
- Ensure the format is one of: `pdf`, `docx`, `md`, `txt`
- PDF generation requires `pdfkit`: `npm install pdfkit`
- DOCX generation requires `docx`: `npm install docx`
- Large content may take longer to generate

---

## 📄 License

This project is for educational and personal use. Respect WhatsApp's Terms of Service. The author is not responsible for any account bans or misuse.

---

**Nerd-eth 1.0** — Built with ❤️ by [Fortune Adebayo Esho](https://fortuneadebayo.space)
