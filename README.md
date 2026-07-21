<div align="center">

<img src="https://iili.io/Cwvlxwv.png" alt="Nerd-eth Bot Logo" width="130" style="border-radius: 24px;"/>

# 🤖 Nerd-eth — Multi-Purpose WhatsApp AI Bot & Admin Dashboard

**Enterprise-grade WhatsApp automation with AI Chat, HD Media Downloads, Group Management, Stealth Mode, Anti-Bot Protection, View-Once Vault, and a Glassmorphic Web Control Panel.**

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Multi--Device-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://web.whatsapp.com)
[![License](https://img.shields.io/badge/License-MIT-4f46e5?style=for-the-badge)](LICENSE)
[![AI](https://img.shields.io/badge/AI-Groq%20%7C%20OpenAI%20%7C%20OpenRouter-a855f7?style=for-the-badge&logo=openai&logoColor=white)](https://groq.com)
[![Version](https://img.shields.io/badge/Version-2.0.0-f59e0b?style=for-the-badge)](package.json)
[![Portfolio](https://img.shields.io/badge/Portfolio-Fortune__Adebayo-6366f1?style=for-the-badge&logo=googlechrome&logoColor=white)](https://fortuneadebayo.space/)
[![Creator](https://img.shields.io/badge/Creator-%40OnNerd__eth-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/OnNerd_eth)

---

🌐 **Portfolio:** [fortuneadebayo.space](https://fortuneadebayo.space/)
&nbsp;|&nbsp;
📲 **WhatsApp Support:** [+234 916 768 9200](https://wa.me/2349167689200?text=Hi%20Nerd-eth%2C%20I%20need%20help%20with%20the%20bot!)
&nbsp;|&nbsp;
𝕏 **Follow:** [@OnNerd_eth](https://x.com/OnNerd_eth)
&nbsp;|&nbsp;
⭐ **Star this repo if it helped you!**

</div>

---

## 📖 Table of Contents

1. [What is Nerd-eth?](#-what-is-nerd-eth)
2. [Core Features Overview](#-core-features-overview)
3. [Quick Start (Zero Config)](#-quick-start-zero-config)
4. [Admin Web Dashboard](#-admin-web-dashboard)
5. [Complete Command Reference](#-complete-command-reference)
   - [AI & Intelligence Commands](#-ai--intelligence-commands)
   - [Media Downloader Commands](#-media-downloader-commands)
   - [View-Once Media Vault](#-view-once-media-vault)
   - [Group Management Commands](#-group-management-commands)
   - [Anti-Bot Protection](#-anti-bot-protection)
   - [Stealth Mode (Anti-Detection)](#-stealth-mode--anti-detection)
   - [Feature & Command Control](#-feature--command-control)
   - [Search & Information](#-search--information)
   - [Scheduling & Broadcast](#-scheduling--broadcast)
   - [Profile & Utility Commands](#-profile--utility-commands)
   - [System & Admin Commands](#-system--admin-commands)
6. [Environment Variables](#%EF%B8%8F-environment-variables-100-optional)
7. [Project Architecture](#%EF%B8%8F-project-architecture)
8. [Deployment Guide](#-deployment-guide)
9. [Security & Anti-Ban System](#-security--anti-ban-system)
10. [FAQ & Troubleshooting](#-faq--troubleshooting)
11. [Contributing & Support](#-contributing--support)
12. [License](#-license)

---

## 🌟 What is Nerd-eth?

**Nerd-eth** is a feature-packed, self-hosted WhatsApp bot built on the [Baileys](https://github.com/WhiskeySockets/Baileys) WebSocket library. It is engineered for **zero-configuration deployment** — just clone, install, start, and scan. No API keys required to get started.

The bot connects to WhatsApp via the official **Multi-Device** protocol (same technology used by WhatsApp Web), making it reliable, fast, and session-persistent across restarts.

### ✨ Why Choose Nerd-eth?

| Feature | Nerd-eth | Other Bots |
|---|---|---|
| Zero config setup | ✅ Works out of the box | ❌ Requires manual setup |
| Auto owner detection | ✅ Auto-detected on scan | ❌ Must hardcode number |
| Built-in free AI | ✅ Groq + public endpoints | ❌ Requires paid API keys |
| Anti-bot protection | ✅ Built-in engine | ❌ Not included |
| Stealth / anti-detection | ✅ Advanced mode | ❌ Not included |
| View-once auto-vault | ✅ Auto-save on receive | ❌ Manual only |
| Self-admin group bypass | ✅ 3-method escalation | ❌ Not included |
| Real C++ speed test | ✅ Native socket engine | ❌ API-based only |
| Glassmorphic dashboard | ✅ Full web control panel | ❌ Basic or none |
| Mobile-first dashboard | ✅ Responsive + bottom nav | ❌ Desktop only |

---

## 🚀 Core Features Overview

### 🤖 AI & Intelligence
- Multi-provider AI chat: **Groq (Llama 3.1)**, **OpenAI (GPT-4o)**, **OpenRouter** — auto-fallback chain
- AI image generation (`!imagine`)
- Agent mode for long multi-step tasks (`!agent`)
- Persistent conversation memory — remembers users across sessions
- User knowledge database — learn and recall facts about users
- Switchable AI personas (`!persona`)

### 📥 HD Media Downloads
- **YouTube**: 1080p / 720p HD video + MP3 audio extraction
- **TikTok**: No-watermark video downloads
- **Instagram**: Reels, Posts, Stories
- **Spotify**: MP3 audio (metadata-matched)
- **Twitter/X**: Video downloads
- **Facebook**: Video downloads

### 📸 View-Once Media Vault
- Auto-saves ALL view-once messages the moment they arrive
- Works whether the message is **opened or unopened**
- Reply to any view-once + `!viewonce show` for instant reveal
- Persistent encrypted vault with listing, searching, and deletion
- Notifies owner privately when view-once media is saved

### 👑 Group Administration
- `!nuke` — Mass-remove ALL members from a group
- `!selfadmin` — 3-method escalation bypass to self-promote as group admin
- `!promote` / `!demote` — Promote/demote any group member
- `!tagall` — Mention every group member in one message
- `!groupinfo` — Detailed group metadata & admin listing
- `!link` — Fetch and post the group invite link

### 🛡️ Anti-Bot Protection
- Automatically detects and blocks requests from other WhatsApp bots
- Pattern matching: Baileys ID signatures (`BAE5...`, `3EB0...`), bot text patterns
- Manual blocklist management
- Works in both **DMs and Group Chats**
- Logs all blocked bot events for admin review

### 🥷 Stealth Mode (Anti-Detection)
- **Browser Fingerprint Rotation** — randomizes fingerprint every 24h
- **Human Typing Delays** — simulates real WPM typing speed (50–120 WPM)
- **Read Receipt Delay** — delays replies like a human reading a message
- **Presence Spoofing** — randomizes online/composing/paused/offline states
- **Message ID Spoofing** — generates human-like message IDs (avoids bot patterns)
- **Aggressive Mode** — maximum stealth with extended behavioral jitter

### 📡 Real Internet Speed Test
- Embedded native C++ socket benchmark engine (`SpeedTestEngine.exe`)
- Cloudflare CDN fallback for cross-platform compatibility
- Reports **Download (Mbps)**, **Upload (Mbps)**, and **Ping (ms)** in real-time
- Accessible via `!speed` command OR Admin Dashboard

### 🎛️ Admin Web Dashboard
- Glassmorphism 2.0 UI with animated ambient glows
- Live connection status, uptime, and real-time log stream
- Feature toggle switches (enable/disable any command or feature)
- API key management panel (Groq, OpenAI, OpenRouter, Brave Search)
- WhatsApp QR code + 8-digit pairing code generator
- Internet Speed Test visualizer with Mbps gauges
- User access management (grant/revoke command access per user)
- Mobile-first with bottom navigation bar
- Creator direct contact (WhatsApp + X/Twitter)

---

## ⚡ Quick Start (Zero Config)

### Prerequisites
- **Node.js v18+** ([Download](https://nodejs.org))
- **npm** (comes with Node.js)
- A WhatsApp account to link

### Step 1 — Clone & Install

```bash
git clone https://github.com/Fortunehack45/Nerd_eth-Omemi-WA-Bot.git
cd Nerd_eth-Omemi-WA-Bot
npm install
```

### Step 2 — Start the Bot

```bash
npm start
```

Or with auto-restart on file changes (development):

```bash
npm run dev
```

### Step 3 — Connect WhatsApp

The bot opens a web dashboard and prints a terminal QR code simultaneously.

#### Option A — QR Code (Recommended)
1. Open `http://localhost:3000/dashboard` in your browser
2. Enter password: `Omemi` (or `DASHBOARD_PASSWORD` from `.env`)
3. Navigate to **QR & Link Phone** tab
4. Scan the QR code in WhatsApp → **Linked Devices** → **Link a Device**

#### Option B — Pairing Code (No Camera Needed)
1. Open `http://localhost:3000/dashboard`
2. Go to **QR & Link Phone** → Enter your phone number with country code (e.g. `2348012345678`)
3. Click **Generate Pairing Code**
4. Enter the 8-character code in WhatsApp → **Linked Devices** → **Link with phone number**

> 💡 **No `.env` file needed!** The connected phone number is automatically detected as the bot owner and granted full admin privileges on first scan.

---

## 🎛️ Admin Web Dashboard

Access the full-featured admin control panel at:

```
http://localhost:3000/dashboard
```

**Default Password:** `Omemi`

### Dashboard Sections

#### 🏠 Home — Metrics & Status
- **Bot Connection Status** — Live online/offline badge with pulse indicator
- **Uptime Counter** — Real-time session uptime display
- **Message Stats** — Incoming messages and commands executed
- **Quick Toolbar** — One-click access to Speed Test, AI Test, and API Keys

#### ⚡ Feature & Command Switcher
Toggle any feature or command live without restarting:

| Feature | What it controls |
|---|---|
| `ai` | AI chat and conversation memory |
| `schedule` | Scheduled broadcasts & cron messages |
| `status` | Auto-view and auto-like WhatsApp statuses |
| `viewonce` | View-once media auto-save vault |
| `antibot` | Anti-bot request blocking engine |
| `stealth` | Stealth mode / anti-detection system |

You can also disable/enable **any specific command** by name (e.g. `music`, `download`, `nuke`).

#### 🔑 API Keys Panel
Configure AI and search providers without touching files:
- **Groq API Key** — Free at [console.groq.com](https://console.groq.com)
- **OpenAI API Key** — [platform.openai.com](https://platform.openai.com)
- **OpenRouter API Key** — [openrouter.ai](https://openrouter.ai)
- **Brave Search API Key** — [api.search.brave.com](https://api.search.brave.com)

#### 📲 QR & Pairing Code
- Live QR code display with WhatsApp logo overlay
- Instant pairing code generator (no camera required)
- Session reset button (clears auth for fresh QR link)

#### 📋 Real-Time Logs
- Live terminal log stream from the bot process
- Color-coded command executions, errors, and connection events
- 1-click clipboard copy for sharing logs

#### 💬 Creator Support
Direct contact buttons for bug reports, feature requests, or questions:
- **WhatsApp:** [+234 916 768 9200](https://wa.me/2349167689200)
- **X (Twitter):** [@OnNerd_eth](https://x.com/OnNerd_eth)

---

## 📋 Complete Command Reference

> **Prefix:** `!` (customizable via `.env`)
> **Admin-only commands** require the sender to be the bot owner or a configured admin number.

---

### 🤖 AI & Intelligence Commands

| Command | Access | Description | Example |
|---------|--------|-------------|---------|
| `!ai <query>` | Public | Chat with AI (auto-selects best provider) | `!ai Explain blockchain in simple terms` |
| `!ask <query>` | Public | Alias for AI chat | `!ask What is the capital of Nigeria?` |
| `!agent <task>` | Restricted | Run multi-step AI agent task | `!agent Research latest AI news and summarize` |
| `!imagine <prompt>` | Restricted | AI image generation | `!imagine A dragon flying over Lagos at sunset` |
| `!persona <name>` | Public | Switch AI persona | `!persona omemi` |
| `!persona list` | Public | View available personas | `!persona list` |
| `!provider` | Admin | Switch AI provider | `!provider groq` |
| `!provider list` | Admin | List available AI providers | `!provider list` |
| `!setkey groq <key>` | Admin | Set Groq API key live | `!setkey groq gsk-your-key` |
| `!setkey openai <key>` | Admin | Set OpenAI API key live | `!setkey openai sk-your-key` |
| `!remember <fact>` | Public | Store a memory about yourself | `!remember I am a software engineer` |
| `!knowledge` | Admin | View stored user knowledge base | `!knowledge` |
| `!memoryadmin list` | Admin | View all user memory entries | `!memoryadmin list` |
| `!memoryadmin clear` | Admin | Clear all conversation memory | `!memoryadmin clear` |

---

### 📥 Media Downloader Commands

| Command | Access | Description | Example |
|---------|--------|-------------|---------|
| `!download <url>` | Public | Download HD video from any platform | `!download https://youtu.be/dQw4w9WgXcQ` |
| `!download <url> --audio` | Public | Download MP3 audio only | `!download https://youtu.be/... --audio` |
| `!dl <url>` | Public | Download shortcut alias | `!dl https://vm.tiktok.com/...` |
| `!music search <query>` | Public | Search for music by artist/title | `!music search Davido Fall` |
| `!music play <query>` | Public | Download and send a music track | `!music play Burna Boy Last Last` |
| `!music lyrics <query>` | Public | Get song lyrics | `!music lyrics Wizkid Essence` |
| `!movie search <title>` | Public | Search movie database | `!movie search Inception` |
| `!movie info <title>` | Public | Detailed movie info & plot | `!movie info Interstellar` |
| `!movie download <title>` | Public | Stream/torrent links | `!movie download Avatar` |
| `!movie trending` | Public | Trending movies right now | `!movie trending` |
| `!media <url>` | Public | Universal media downloader | `!media https://instagram.com/reel/...` |
| `!search <query>` | Public | Web search (Brave / DuckDuckGo fallback) | `!search Nigeria tech news` |
| `!generate pdf <text>` | Public | Generate a PDF document | `!generate pdf My report content here` |
| `!generate docx <text>` | Public | Generate a Word document | `!generate docx Meeting minutes` |
| `!unzip` | Public | Unzip a sent ZIP file (reply to file) | Reply to ZIP → `!unzip` |

**Supported Download Platforms:**
- 🎬 **YouTube** — 1080p / 720p video + MP3 audio
- 🎵 **Spotify** — MP3 audio download
- 📱 **TikTok** — No-watermark video
- 📸 **Instagram** — Reels, Posts, Stories
- 🐦 **Twitter/X** — Video clips
- 📘 **Facebook** — Video clips

---

### 📸 View-Once Media Vault

The bot **automatically saves all view-once messages** as they arrive — whether opened or not. No manual trigger needed.

| Command | Access | Description | Example |
|---------|--------|-------------|---------|
| `!viewonce show` | Admin | Show most recently saved view-once | `!viewonce show` |
| `!viewonce show <id>` | Admin | Show a specific view-once by ID | `!viewonce show 1721534678000` |
| `!viewonce list` | Admin | List all saved view-once media | `!viewonce list` |
| `!viewonce list --type image` | Admin | Filter by media type | `!viewonce list --type video` |
| `!viewonce delete <id>` | Admin | Delete a saved entry | `!viewonce delete 1721534678000` |
| `!viewonce stats` | Admin | Show storage usage & totals | `!viewonce stats` |
| `!vo` | Admin | Shortcut alias for `!viewonce` | `!vo show` |
| `!saved` | Admin | Alias for `!viewonce list` | `!saved` |

**💡 Reply-to Shortcut:**
> Reply to **any view-once message** with `!viewonce show` and the bot will instantly decrypt and send you the media — even if it's already been "opened".

**Supported Media Types:** Images, Videos, Voice Notes, Audio Files, Documents

---

### 👑 Group Management Commands

All group commands require admin privileges.

| Command | Access | Description | Example |
|---------|--------|-------------|---------|
| `!nuke --confirm` | Admin | **Mass kick** ALL non-admin members | `!nuke --confirm` |
| `!selfadmin` | Admin | 🔥 **Bypass** — Auto-escalate bot to Group Admin | `!selfadmin` |
| `!adminme` | Admin | Promote yourself to Group Admin | `!adminme` |
| `!promote @user` | Admin | Promote a member to Group Admin | `!promote @John` |
| `!demote @user` | Admin | Demote a Group Admin to regular member | `!demote @John` |
| `!tagall <msg>` | Admin | Mention all group members | `!tagall Meeting starts in 5 mins!` |
| `!everyone <msg>` | Admin | Alias for `!tagall` | `!everyone Important update!` |
| `!groupinfo` | Admin | Show detailed group info & admins | `!groupinfo` |
| `!ginfo` | Admin | Alias for `!groupinfo` | `!ginfo` |
| `!link` | Admin | Get & post the group invite link | `!link` |

#### 🔥 Self-Admin Bypass (`!selfadmin`) — How It Works

When the bot is not a group admin, `!selfadmin` attempts 3 escalation methods:

1. **Method 1 — Direct API Promotion**: Attempts `groupParticipantsUpdate` with the bot's own JID
2. **Method 2 — Creator-Level Escalation**: Attempts promotion via group creator permissions
3. **Method 3 — Clone Group**: Creates a new group (where bot is automatically the Owner/Admin), invites all members, and posts the new group invite link

> ⚠️ WhatsApp's protocol strictly enforces admin permissions. Method 3 (Clone) is the most reliable bypass when the bot is a regular member.

---

### 🛡️ Anti-Bot Protection

Blocks automated bots from spamming your bot with requests — works in both DMs and groups.

| Command | Access | Description | Example |
|---------|--------|-------------|---------|
| `!antibot on` | Admin | Enable Anti-Bot Protection | `!antibot on` |
| `!antibot off` | Admin | Disable Anti-Bot Protection | `!antibot off` |
| `!antibot add <number>` | Admin | Manually add a bot to blocklist | `!antibot add 2348012345678` |
| `!antibot remove <number>` | Admin | Remove a number from blocklist | `!antibot remove 2348012345678` |
| `!antibot list` | Admin | List all blocked bot numbers | `!antibot list` |
| `!antibot stats` | Admin | View stats & recent blocked events | `!antibot stats` |
| `!blockbot <number>` | Admin | Alias — block a bot number | `!blockbot 2348012345678` |

**Detection Engines:**
- 📍 **Message ID Pattern Matching** — Detects Baileys `BAE5...`, `3EB0...` prefixed IDs
- 📝 **Bot Text Signature Scanning** — Detects bot-like message content patterns
- 📋 **Manual Blocklist** — Numbers explicitly added by admin are always blocked
- 🔒 **Owner Protection** — Owner/admin numbers are never blocked regardless of patterns

---

### 🥷 Stealth Mode / Anti-Detection

Makes WhatsApp unable to identify this as a bot connection by mimicking real human browser behaviour.

| Command | Access | Description | Example |
|---------|--------|-------------|---------|
| `!stealth on` | Admin | Enable full stealth protection | `!stealth on` |
| `!stealth off` | Admin | Disable stealth mode | `!stealth off` |
| `!stealth aggressive` | Admin | Enable maximum stealth (slower responses) | `!stealth aggressive` |
| `!stealth standard` | Admin | Enable balanced stealth (recommended) | `!stealth standard` |
| `!stealth status` | Admin | View current stealth configuration | `!stealth status` |
| `!ghost` | Admin | Alias for `!stealth on` | `!ghost` |
| `!invisible` | Admin | Alias for `!stealth on` | `!invisible` |

**What Stealth Mode Does:**

| Protection | Description |
|---|---|
| 🔄 **Fingerprint Rotation** | Rotates WhatsApp Web browser fingerprint every 24 hours |
| ⌨️ **Human Typing Delays** | Simulates 50–120 WPM human typing speed before replies |
| 📖 **Read Receipt Delay** | Delays replies to mimic human reading speed |
| 👻 **Presence Spoofing** | Randomizes `available / composing / paused / offline` status cycle |
| 🆔 **Message ID Spoofing** | Uses human-looking message IDs (avoids bot ID prefix patterns) |
| 🌐 **Browser Masking** | Appears as `WhatsApp Web / Chrome / Safari / Firefox / Edge` |

---

### 🎛️ Feature & Command Control

Enable or disable any feature or bot command live — no restart required.

| Command | Access | Description | Example |
|---------|--------|-------------|---------|
| `!disable <name>` | Admin | Disable a command or feature | `!disable music` |
| `!enable <name>` | Admin | Re-enable a disabled command | `!enable music` |
| `!disabled` | Admin | List all currently disabled commands | `!disabled` |
| `!togglefeature <name>` | Admin | Toggle a feature on/off | `!togglefeature ai` |
| `!access add <number>` | Admin | Grant a user access to restricted commands | `!access add 2348012345678` |
| `!access remove <number>` | Admin | Revoke a user's access | `!access remove 2348012345678` |
| `!access list` | Admin | List all users with extended access | `!access list` |
| `!access allow <number> <feature>` | Admin | Grant access to specific feature | `!access allow 2348012345678 ai` |

---

### 🔍 Search & Information

| Command | Access | Description | Example |
|---------|--------|-------------|---------|
| `!search <query>` | Public | Web search (Brave AI or DuckDuckGo) | `!search best phones 2025` |
| `!movie search <title>` | Public | Search movie database | `!movie search Oppenheimer` |
| `!movie info <title>` | Public | Detailed movie info (ratings, plot, cast) | `!movie info The Dark Knight` |
| `!movie trending` | Public | Currently trending movies | `!movie trending` |
| `!music search <query>` | Public | Search for songs by title/artist | `!music search Afrobeats mix 2025` |
| `!music lyrics <query>` | Public | Get full song lyrics | `!music lyrics Tems Free Mind` |

---

### ⏰ Scheduling & Broadcast

| Command | Access | Description | Example |
|---------|--------|-------------|---------|
| `!schedule <time> <msg>` | Admin | Schedule a one-time message | `!schedule 18:30 Good evening everyone!` |
| `!schedule list` | Admin | View all pending schedules | `!schedule list` |
| `!schedule cancel <id>` | Admin | Cancel a scheduled message | `!schedule cancel 3` |
| `!broadcast <msg>` | Admin | Broadcast a message to all known chats | `!broadcast Bot maintenance at 2AM` |
| `!broadcast --dm <msg>` | Admin | Broadcast only to DMs | `!broadcast --dm Hello from the bot!` |
| `!broadcast --groups <msg>` | Admin | Broadcast only to groups | `!broadcast --groups Meeting in 10 mins` |

---

### 👤 Profile & Utility Commands

| Command | Access | Description | Example |
|---------|--------|-------------|---------|
| `!getpp` | Admin | Get profile picture of quoted/mentioned user | `!getpp @John` |
| `!getpp <number>` | Admin | Get profile picture by phone number | `!getpp 2348012345678` |
| `!profile` | Public | View your own bot profile & memory | `!profile` |
| `!ping` | Public | Check bot latency | `!ping` |
| `!speed` | Public | Run an internet speed test | `!speed` |
| `!help` | Public | Show the full command list | `!help` |
| `!help <command>` | Public | Get help for a specific command | `!help download` |

---

### 🛠️ System & Admin Commands

| Command | Access | Description | Example |
|---------|--------|-------------|---------|
| `!terminal <cmd>` | Admin | Execute a shell command (⚠️ powerful!) | `!terminal ls -la` |
| `!speed` | Public | Run C++ socket speed benchmark | `!speed` |
| `!status auto` | Admin | Toggle auto-view/like WhatsApp statuses | `!status auto` |
| `!status view` | Admin | Auto-view all current statuses | `!status view` |
| `!antibot on/off` | Admin | Toggle anti-bot protection | `!antibot on` |
| `!stealth on/off` | Admin | Toggle stealth mode | `!stealth on` |
| `!selfadmin` | Admin | Force self-promote to group admin | `!selfadmin` |

---

## ⚙️ Environment Variables (100% Optional)

The bot works perfectly **without any `.env` file**. All variables below are optional overrides:

```env
# ─── Bot Identity ──────────────────────────────────────────
BOT_NAME=Nerd-eth                    # Bot display name
PREFIX=!                             # Command prefix (default: !)

# ─── Admin Numbers ────────────────────────────────────────
# Owner is auto-detected on scan. Add extra co-admins here:
OWNER_NUMBER=2348012345678,2349012345678

# ─── Admin Panel ──────────────────────────────────────────
DASHBOARD_PASSWORD=Omemi             # Web dashboard password

# ─── AI Providers (all optional — free defaults used) ─────
GROQ_API_KEY=gsk-your-groq-key       # Free at console.groq.com
OPENAI_API_KEY=sk-your-openai-key    # platform.openai.com
OPENROUTER_API_KEY=sk-or-v1-...      # openrouter.ai (free tier)

# ─── Search ───────────────────────────────────────────────
BRAVE_SEARCH_API_KEY=BSA-...         # api.search.brave.com (optional)

# ─── Memory & Learning ────────────────────────────────────
MEMORY_ENABLED=true                  # Enable conversation memory
MEMORY_MAX_HISTORY=100               # Max messages to remember per user
MEMORY_AUTO_LEARN=true               # Auto-learn from conversations

# ─── View-Once Vault ──────────────────────────────────────
VIEW_ONCE_ENABLED=true               # Auto-save all view-once media
VIEW_ONCE_NOTIFY_ADMIN=true          # Notify admin when media is saved

# ─── Anti-Ban Protection ──────────────────────────────────
ANTI_BAN_ENABLED=true                # Enable anti-ban protection
ALWAYS_ONLINE=true                   # Keep bot presence as "Online"
MAX_MESSAGES_PER_CHAT=20             # Max messages per chat per minute
HUMAN_TYPING=true                    # Simulate human typing delays
RANDOM_DELAYS=true                   # Add random delays between actions
SAFE_MODE=true                       # Extra-safe message processing

# ─── Storage & Downloads ──────────────────────────────────
DOWNLOAD_PATH=./storage              # Where downloaded files are stored
MAX_FILE_SIZE=100                    # Max download size in MB
```

---

## 🏗️ Project Architecture

```
Nerd_eth-Omemi-WA-Bot/
│
├── index.js                        # 🚀 Main entry — starts server + WhatsApp client
├── server.js                       # 🌐 Express web server + REST API endpoints
├── config.js                       # ⚙️ Central configuration loader
├── SpeedTestEngine.exe             # ⚡ Native C++ socket speed benchmark engine
│
├── public/
│   └── dashboard.html              # 🎨 Glassmorphic admin web control panel
│
├── src/
│   ├── client.js                   # 📱 Baileys WhatsApp WebSocket connection manager
│   │
│   ├── handlers/
│   │   ├── messageHandler.js       # 📨 Incoming message router & anti-bot gate
│   │   ├── commandHandler.js       # ⚡ Command parser, loader & dispatcher
│   │   └── statusHandler.js        # 👁️ WhatsApp status auto-view/like handler
│   │
│   ├── commands/                   # 📦 All command modules (auto-loaded)
│   │   ├── access.js               # 🔑 User access control (grant/revoke features)
│   │   ├── agent.js                # 🤖 Multi-step AI agent tasks
│   │   ├── ai.js                   # 💬 AI chat (Groq / OpenAI / OpenRouter)
│   │   ├── antibot.js              # 🛡️ Anti-bot protection management
│   │   ├── broadcast.js            # 📢 Mass broadcast to all chats
│   │   ├── disable.js              # ❌ Disable commands/features
│   │   ├── disabled.js             # 📋 List disabled commands
│   │   ├── download.js             # 📥 HD video & audio downloader
│   │   ├── enable.js               # ✅ Re-enable commands/features
│   │   ├── generate.js             # 📄 Generate PDF / DOCX documents
│   │   ├── getpp.js                # 🖼️ Profile picture extractor
│   │   ├── group.js                # 👑 Group management (!nuke, !selfadmin, etc.)
│   │   ├── help.js                 # ❓ Help & command listing
│   │   ├── imagine.js              # 🎨 AI image generation
│   │   ├── knowledge.js            # 🧠 User knowledge base management
│   │   ├── media.js                # 🎬 Universal media downloader
│   │   ├── memoryadmin.js          # 💾 Conversation memory administration
│   │   ├── movie.js                # 🎬 Movie finder & downloader
│   │   ├── music.js                # 🎵 Music search, download & lyrics
│   │   ├── persona.js              # 🎭 AI persona switcher
│   │   ├── ping.js                 # 🏓 Bot latency test
│   │   ├── profile.js              # 👤 User profile viewer
│   │   ├── provider.js             # ⚙️ AI provider switcher
│   │   ├── remember.js             # 🧠 Store user memories
│   │   ├── schedule.js             # ⏰ Message scheduler / cron broadcaster
│   │   ├── search.js               # 🔍 Web search (Brave / DuckDuckGo)
│   │   ├── setkey.js               # 🔑 Live API key updater
│   │   ├── speed.js                # ⚡ Internet speed test command
│   │   ├── status.js               # 📊 WhatsApp status manager
│   │   ├── stealth.js              # 🥷 Stealth mode / anti-detection
│   │   ├── terminal.js             # 💻 Remote shell command executor
│   │   ├── togglefeature.js        # 🔄 Feature on/off toggle
│   │   ├── unzip.js                # 📦 ZIP file extractor
│   │   └── viewonce.js             # 📸 View-once media vault manager
│   │
│   ├── services/                   # 🔧 Core service modules
│   │   ├── accessControl.js        # 🔐 Permission & access control engine
│   │   ├── agentService.js         # 🤖 AI agent orchestration service
│   │   ├── aiService.js            # 💡 Multi-provider AI inference engine
│   │   ├── antiBanService.js       # 🛡️ Anti-ban delays, rate limits & detection
│   │   ├── antiBotService.js       # 🚫 Bot request detection & blocking
│   │   ├── downloadService.js      # 📥 Core media download logic
│   │   ├── featureService.js       # 🎛️ Feature flag persistence & checks
│   │   ├── fileGenService.js       # 📄 PDF/DOCX file generation
│   │   ├── mediaService.js         # 🎬 Media processing & conversion
│   │   ├── memoryService.js        # 🧠 User conversation memory & knowledge DB
│   │   ├── onboardingService.js    # 👋 New user onboarding flow
│   │   ├── personaService.js       # 🎭 AI persona configuration
│   │   ├── schedulerService.js     # ⏰ Message scheduling cron engine
│   │   ├── searchService.js        # 🔍 Web search API adapter
│   │   ├── speedTestService.js     # ⚡ C++ speed benchmark engine wrapper
│   │   ├── statusService.js        # 📊 WhatsApp status interaction handler
│   │   ├── stealthService.js       # 🥷 Anti-detection fingerprint engine
│   │   └── viewOnceService.js      # 📸 View-once media detection & vault
│   │
│   └── utils/
│       └── helpers.js              # 🛠️ JID parser, command extractor, JSON helpers
│
└── storage/                        # 💾 Persistent data (auto-created)
    ├── sessions/                   # 🔑 WhatsApp auth session tokens
    ├── viewonce/                   # 📸 Saved view-once media vault
    ├── features.json               # 🎛️ Disabled features/commands state
    ├── antibot.json                # 🛡️ Anti-bot blocklist & event logs
    ├── stealth.json                # 🥷 Stealth mode configuration
    └── memory/                     # 🧠 User conversation history & knowledge
```

### REST API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `GET /dashboard` | GET | Admin web control panel |
| `GET /api/status` | GET | Bot status, uptime, and connection info |
| `GET /api/qrdata` | GET | QR code image (base64 PNG) |
| `POST /api/pair` | POST | Generate WhatsApp pairing code |
| `POST /api/speedtest` | POST | Run C++ speed benchmark |
| `GET /api/features` | GET | Get feature enable/disable states |
| `POST /api/features/toggle` | POST | Toggle a feature on or off |
| `POST /api/keys` | POST | Update API keys at runtime |
| `POST /api/session/reset` | POST | Reset WhatsApp session (fresh QR) |
| `GET /api/logs` | GET | Get recent log events |
| `POST /api/logs` | POST | Append a log event |

---

## 🚀 Deployment Guide

### Local Development

```bash
# Clone and install
git clone https://github.com/Fortunehack45/Nerd_eth-Omemi-WA-Bot.git
cd Nerd_eth-Omemi-WA-Bot
npm install

# Start with auto-restart (recommended for development)
npm run dev

# Or start normally
npm start
```

### Deploy to Render (Free Hosting)

1. Fork this repository on GitHub
2. Sign up at [render.com](https://render.com)
3. Create a new **Web Service** → Connect your GitHub fork
4. Set the following:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** `Node`
5. Add Environment Variables if needed (optional)
6. Deploy! — Access your bot dashboard at `https://your-service-name.onrender.com/dashboard`

> ⚠️ **Render Note:** Free tier services sleep after 15 minutes of inactivity. Use UptimeRobot to keep it awake.

### Deploy to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

### Deploy to Heroku

```bash
# Install Heroku CLI, then:
heroku create your-bot-name
heroku buildpacks:set heroku/nodejs
git push heroku main

# View logs
heroku logs --tail
```

### Deploy with PM2 (VPS / Linux Server)

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start index.js --name nerd-eth-bot

# Auto-start on server reboot
pm2 startup
pm2 save

# View logs
pm2 logs nerd-eth-bot

# Restart
pm2 restart nerd-eth-bot
```

---

## 🔒 Security & Anti-Ban System

Nerd-eth includes a multi-layered protection system to prevent WhatsApp bans:

### Anti-Ban Protections Active by Default

| Protection | How It Works |
|---|---|
| **Rate Limiting** | Max 20 messages/commands per chat per minute |
| **Human Typing Simulation** | Simulates composing indicator before replies |
| **Random Delays** | Adds 200–800ms randomized delays between messages |
| **Duplicate Detection** | Ignores repeated messages with same ID |
| **Safe Mode** | Extra delay between processing incoming messages |
| **Night Throttle** | Slows responses between 12AM–6AM to avoid detection |
| **Cooldown Per User** | 2-second command cooldown per user to prevent spam |

### Stealth Mode (Optional Extra Layer)

Enable via `!stealth on` for:
- Fingerprint rotation (avoids long-term session profiling)
- Human-realistic typing delays (50–120 WPM)
- Read receipt delays before replies
- Presence spoofing (avoids the "always composing" bot pattern)
- Human-like message IDs (avoids `BAE5`/`3EB0` bot ID prefixes)

---

## ❓ FAQ & Troubleshooting

### Q: Bot won't connect — QR code keeps refreshing?
**A:** Run `!reset` or click **Reset Session** on the dashboard. Delete the `sessions/` folder and restart:
```bash
rm -rf sessions/
npm start
```

### Q: "Error: Stream Errored (restart required)"?
**A:** This is a normal WhatsApp WebSocket disconnect. The bot auto-reconnects within 10 seconds.

### Q: Commands not responding?
**A:** Check if the feature is disabled. Use `!disabled` to see all disabled items. Re-enable with `!enable <name>`.

### Q: How do I add myself as an admin?
**A:** You don't need to! The phone number you scan the QR code with is **automatically** the bot owner with full admin access.

### Q: How do I add extra co-admins?
**A:** Set `OWNER_NUMBER=2348012345678,2349012345678` in `.env`, or use the Admin Panel's user access section.

### Q: View-once not being saved?
**A:** Make sure `viewonce` is enabled: `!enable viewonce`. The bot saves on receipt — the sender doesn't need to have the message "opened."

### Q: `!selfadmin` says all methods failed?
**A:** WhatsApp's protocol strictly enforces admin rights. Use Method 3 (Clone Group) — the bot creates a new group where it's automatically the owner. You can migrate your group there.

### Q: Bot got disconnected after deploy to Render?
**A:** Render free tier spins down after 15 min inactivity. Use [UptimeRobot](https://uptimerobot.com) to ping your dashboard URL every 5 minutes.

### Q: `!download` returns "file too large"?
**A:** Increase `MAX_FILE_SIZE` in `.env` (default: 100MB). WhatsApp itself limits files to ~100MB.

---

## 🤝 Contributing & Support

### 💬 Get Help / Report Issues

- **WhatsApp:** [Message the creator directly](https://wa.me/2349167689200?text=Hi%20Nerd-eth%2C%20I%20need%20help%20with%20the%20bot!)
- **Feature Requests:** [Request via WhatsApp](https://wa.me/2349167689200?text=Hi%20Nerd-eth%2C%20I%20want%20to%20request%20a%20new%20feature%3A%20)
- **X (Twitter):** [@OnNerd_eth](https://x.com/OnNerd_eth)
- **GitHub Issues:** [Open an issue](https://github.com/Fortunehack45/Nerd_eth-Omemi-WA-Bot/issues)

### 🛠️ Adding New Commands

1. Create a new file in `src/commands/your-command.js`
2. Export the standard command object:

```javascript
module.exports = {
  name: 'mycommand',          // Command name (without prefix)
  alias: ['mc', 'mycmd'],     // Optional aliases
  description: 'Does X',     // Short description
  usage: '!mycommand <arg>',  // Usage example
  adminOnly: false,           // Set true for admin-only
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;         // Chat JID
    var senderId = ctx.senderId;     // Sender JID
    var isGroup = ctx.isGroup;       // Boolean
    var pushName = ctx.pushName;     // Sender display name

    await sock.sendMessage(sender, { text: 'Hello from my command!' });
  },
};
```

3. The command is **auto-loaded** — no registration needed!

### ⭐ Star the Repository

If this project helped you, please star it on GitHub! It helps others discover it.

---

## 📦 Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@whiskeysockets/baileys` | ^6.7.13 | WhatsApp Multi-Device WebSocket protocol |
| `express` | ^5.2.1 | Web server & REST API |
| `groq-sdk` | ^0.15.0 | Groq AI (Llama 3.1) integration |
| `openai` | ^4.85.0 | OpenAI GPT integration |
| `@distube/ytdl-core` | ^4.16.8 | YouTube video/audio downloader |
| `axios` | ^1.7.9 | HTTP client for API calls |
| `cheerio` | ^1.2.0 | HTML parsing for web scraping |
| `sharp` | ^0.33.5 | Image processing |
| `fluent-ffmpeg` | ^2.1.3 | Audio/video conversion |
| `pdfkit` | ^0.19.1 | PDF document generation |
| `docx` | ^9.7.1 | Word document generation |
| `qrcode` | ^1.5.4 | QR code generation |
| `pino` | ^9.6.0 | High-performance logging |
| `adm-zip` | ^0.5.16 | ZIP file handling |
| `dotenv` | ^16.4.7 | Environment variable loading |
| `google-tts-api` | ^0.0.6 | Text-to-speech conversion |
| `yt-search` | ^2.12.1 | YouTube search API |

---

## 📜 Master Terms of Service, Privacy Policy & Legal Governance

> [!IMPORTANT]
> **Binding Terms of Agreement:** By deploying, installing, hosting, or interacting with **Nerd-eth WhatsApp Bot**, you formally declare that you have read, understood, and accepted all operational terms, privacy frameworks, cautions, and liability disclaimers detailed below.

### 📜 1. Terms & Conditions of Usage
- **1.1 Absolute User Liability:** You retain 100% legal responsibility for all messages, media transfers, API queries, broadcast dispatches, and group actions executed through your bot deployment.
- **1.2 Compliance with WhatsApp Policy:** Software operation must strictly comply with WhatsApp's Terms of Service, Business Policies, and Anti-Spam standards. Unsolicited mass advertising or aggressive spamming is forbidden.
- **1.3 Consensual Environment Usage:** Bot interactions, memory logging, and automated tools must operate strictly within authorized groups or with consensual contacts.
- **1.4 Anti-Bot Protection & Counter-Attacks:** Automated anti-bot detection and the `!banaccount` command are security features designed solely to protect your groups from malicious spam bots. Incoming requests from rival bots are automatically dropped and counter-acted with target blocking and group expulsion.

---

### 🔒 2. Privacy Policy & Local Data Sovereignty
- **2.1 Zero External Telemetry:** All authentication keys, Baileys session data, local database records, and log files remain 100% on your local server environment. No data is harvested, analyzed, or transmitted to centralized author servers.
- **2.2 Encrypted API Integrations:** When AI features (Groq / OpenAI) or media downloaders are invoked, user queries are transmitted via secure HTTPS standard endpoints solely to fulfill requested responses.
- **2.3 Vault Security:** Retrieved View-Once media items are stored locally in your private `storage/vault/` directory and are restricted exclusively to your verified admin WhatsApp JID.

---

### ⚠️ 3. Operational Caution & Liability Disclaimer Notice
- **3.1 Software Provided "AS IS":** **Nerd-eth WA Bot** is an independent open-source utility built for education, administration, and personal productivity. It is provided *"AS IS" and "AS AVAILABLE"* without warranties of any kind.
- **3.2 Complete Liability Waiver:** The lead creator (**Fortune Adebayo / AKA: Nerd_eth**) and repository contributors accept **zero responsibility or liability** for:
  - Account suspensions, temporary cooldowns, or permanent bans enacted by WhatsApp.
  - Group participant removals, automated counter-ban executions, or community management disputes.
  - Local server data loss, network outages, or third-party API rate limits.

---

## 📄 License

Distributed under the **MIT License**. Free for personal and commercial use.

```
MIT License — Copyright (c) 2025 Fortune Adebayo (AKA: Nerd_eth)
```

See [LICENSE](LICENSE) for full text.

---

<div align="center">

**Built by Fortune Adebayo (AKA: Nerd_eth)**

🌐 [Portfolio](https://fortuneadebayo.space/)
&nbsp;|&nbsp;
📲 [WhatsApp Support](https://wa.me/2349167689200)
&nbsp;|&nbsp;
𝕏 Twitter [@OnNerd_eth](https://x.com/OnNerd_eth)
&nbsp;|&nbsp;
⭐ [Star on GitHub](https://github.com/Fortunehack45/Nerd_eth-Omemi-WA-Bot)

</div>
