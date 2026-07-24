# 🤖 Nerd-eth (Omemi) WhatsApp Bot — Technical Manual & Developer Guide

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org)
[![Baileys Framework](https://img.shields.io/badge/Baileys-v6.6%2B-purple.svg)](https://github.com/WhiskeySockets/Baileys)
[![Status: Production Ready](https://img.shields.io/badge/Status-Production%20Ready-success.svg)](#)

Welcome to the official developer manual and architectural documentation for **Nerd-eth (Omemi) WhatsApp Bot**. Built on Node.js and `@whiskeysockets/baileys`, Nerd-eth is an enterprise-grade autonomous assistant, media downloader, AI agent router, status ad blocker, anti-delete recovery system, and group management bot.

---

## 📋 Table of Contents
1. [Core Features & Architecture](#-core-features--architecture)
2. [Project Directory Layout](#-project-directory-layout)
3. [Command Catalog (All 41 Commands)](#-command-catalog-all-41-commands)
4. [Developer Guide: How to Add New Custom Commands](#-developer-guide-how-to-add-new-custom-commands)
5. [Core Engines Deep Dive](#-core-engines-deep-dive)
   - [Anti-Delete & View-Once Media Engine](#1-anti-delete--view-once-media-engine)
   - [WhatsApp Status Ad Blocker Engine](#2-whatsapp-status-ad-blocker-engine)
   - [Auto-View & Auto-Like Status Engine](#3-auto-view--auto-like-status-engine)
   - [Multi-Engine Media Downloader (yt-dlp)](#4-multi-engine-media-downloader-yt-dlp)
   - [Scheduler & Target Verification Engine](#5-scheduler--target-verification-engine)
   - [Stealth & Anti-Ban Security Engine](#6-stealth--anti-ban-security-engine)
6. [Installation & Setup](#-installation--setup)
7. [Configuration Reference (.env)](#-configuration-reference-env)
8. [Pairing Code & QR Authentication](#-pairing-code--qr-authentication)
9. [Web Management Dashboard](#-web-management-dashboard)
10. [Terms and Conditions of Service](#-terms-and-conditions-of-service)
11. [Privacy Policy & Data Protection](#-privacy-policy--data-protection)
12. [Legal Disclaimer & Liability Waiver](#-legal-disclaimer--liability-waiver)

---

## 🚀 Core Features & Architecture

```
                                  ┌───────────────────────────┐
                                  │   WhatsApp Network (WS)   │
                                  └─────────────┬─────────────┘
                                                │ Baileys Socket
                                                ▼
                                  ┌───────────────────────────┐
                                  │      Client Manager       │
                                  │     (src/client.js)       │
                                  └─────────────┬─────────────┘
                                                │
         ┌──────────────────────────────────────┼──────────────────────────────────────┐
         ▼                                      ▼                                      ▼
┌─────────────────┐                    ┌─────────────────┐                    ┌─────────────────┐
│ Message Handler │                    │ Status Handler  │                    │ Anti-Delete     │
│ (Commands/AI)   │                    │ (View/Like/Ads) │                    │ (Revoke Engine) │
└────────┬────────┘                    └────────┬────────┘                    └────────┬────────┘
         │                                      │                                      │
         ▼                                      ▼                                      ▼
┌─────────────────┐                    ┌─────────────────┐                    ┌─────────────────┐
│ AI & Downloader │                    │ Status Ad       │                    │ Pre-Buffered    │
│ (yt-dlp/Groq)   │                    │ Blocker Engine  │                    │ Media Cache     │
└─────────────────┘                    └─────────────────┘                    └─────────────────┘
```

- **Prefix & Prefix-Less Emoji Dispatcher**: All commands can be triggered with standard prefix (`!music`), short forms (`!m`), or directly via emojis (`🎵`, `!🎵`).
- **Pre-Buffered Anti-Delete Engine**: Intercepts `messages.upsert` and pre-downloads photos, videos, voice notes, stickers, documents, and View-Once media into memory prior to deletion.
- **WhatsApp Status Ad Blocker**: Filters out WhatsApp sponsored ads, Meta promotional stories, and channel ads, preventing auto-viewing or auto-liking of commercial clutter.
- **Auto-View & Auto-Like Status**: Automatically sends read-receipts (`sock.readMessages`) and green heart reactions (`💚`) to status updates from real contacts.
- **High-Performance Downloader**: Native `yt-dlp` integration for HD Instagram Reels/Posts, Twitter/X videos, TikTok, YouTube audio, and Spotify tracks.
- **Media Information Cards**: Embeds album covers, movie banners, and app icons into WhatsApp cards.
- **AI Agent Router & Swarm**: Supports OpenAI (`gpt-4o-mini`), Groq (`llama-3.1-8b-instant`), and autonomous multi-agent tool execution.

---

## 📁 Project Directory Layout

```
whatsappbot/
├── config.js                       # Master environment & bot settings
├── index.js                        # System entry point
├── package.json                    # Node.js dependencies & scripts
├── LICENSE                         # MIT License
├── README.md                       # Developer encyclopedia & manual
├── src/
│   ├── client.js                   # Baileys WebSocket lifecycle & connection manager
│   ├── commands/                   # Command modules (41 files)
│   │   ├── access.js               # Access control command
│   │   ├── agent.js                # Autonomous subagent runner
│   │   ├── ai.js                   # AI chat command
│   │   ├── antibot.js              # Anti-bot counter-attack manager
│   │   ├── antidelete.js           # Anti-delete recovery manager
│   │   ├── apk.js                  # APK downloader command
│   │   ├── blockads.js             # Status Ad Blocker command
│   │   ├── download.js             # Universal downloader command
│   │   ├── help.js                 # Command help menu
│   │   ├── movie.js                # Movie search command
│   │   ├── music.js                # Music search & download command
│   │   ├── pair.js                 # 8-digit pairing code generator
│   │   ├── schedule.js             # Task schedule manager
│   │   └── ... (30+ additional command files)
│   ├── handlers/                   # Message & status event routers
│   │   ├── commandHandler.js       # Dynamic command loader & runner
│   │   ├── messageHandler.js       # Message parser & emoji dispatcher
│   │   └── statusHandler.js        # Status event filter & ad blocker
│   ├── services/                   # Core business logic & services
│   │   ├── accessControl.js        # Permission & role manager
│   │   ├── aiService.js            # OpenAI & Groq AI provider engine
│   │   ├── antiBotService.js       # Rival bot counter-attack engine
│   │   ├── antiDeleteService.js    # Pre-buffered anti-delete engine
│   │   ├── downloadService.js      # yt-dlp & multi-engine scraper
│   │   ├── schedulerService.js     # Schedule timer & onWhatsApp check
│   │   ├── statusAdBlockerService.js # Status Ad Blocker engine
│   │   ├── statusService.js        # Auto-View, Auto-Like & Status saver
│   │   ├── stealthService.js       # Anti-Ban stealth fingerprinting
│   │   └── viewOnceService.js      # View-Once message reveal engine
│   └── utils/                      # Helper functions & data storage
│       └── helpers.js              # Formatting & JSON persistence
├── storage/                        # Local data storage (downloads, logs, memory)
└── web/                            # Web management dashboard interface
```

---

## 📜 Command Catalog (All 41 Commands)

Below is the complete reference of all 41 commands supported by Nerd-eth, including primary names, short forms, emoji shortcuts, permission levels, and usage examples:

### 1. Media & Downloaders

| Command | Short Alias | Emoji Shortcut | Level | Description | Example |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `!download` | `!dl`, `!get` | 📥, ⬇️, 📹 | Public | Universal downloader for IG, Twitter/X, TikTok, YouTube | `!download https://instagram.com/reel/C7rX_1-S_Xw/` |
| `!music` | `!m`, `!play`, `!song` | 🎵, 🎶, 🎧 | Public | Search & download high-res MP3 audio with album cover | `!music Burna Boy Last Last` |
| `!movie` | `!film`, `!cinema` | 🎬, 🍿, 🎥 | Public | Search movie metadata, poster banner, cast & streaming | `!movie Inception` |
| `!apk` | `!app`, `!mod` | 📲, 📱 | Public | Search & download Android APK binaries with app icon | `!apk WhatsApp Messenger` |
| `!media` | `!st`, `!sticker` | 🖼️, 📷, 🎨 | Public | Convert image/video into WhatsApp sticker or extract media | `!media (reply to image/video)` |
| `!savestatus` | `!sw`, `!save` | 💾, 📱 | Public/Admin | Save contact WhatsApp status image/video to self-chat | `!savestatus (reply to status update)` |
| `!viewonce` | `!vv`, `!rvo` | 👁️, 📸, 🙈 | Public/Admin | Extract and reveal View-Once one-time photos/videos | `!viewonce (reply to View-Once message)` |
| `!unzip` | `!zip`, `!extract` | 📦, 📂 | Public | Unpack ZIP/RAR/TAR archives and inspect file contents | `!unzip (reply to document attachment)` |
| `!getpp` | `!pp`, `!avatar` | 🖼️, 👤 | Public | Fetch high-definition profile picture of user or group | `!getpp` or `!getpp @user` |

### 2. AI & Knowledge Assistant

| Command | Short Alias | Emoji Shortcut | Level | Description | Example |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `!ai` | `!gpt`, `!ask` | 🤖, 🧠, 💡 | Public | Query multi-model AI assistant (OpenAI / Groq) | `!ai Explain quantum computing in 3 sentences` |
| `!imagine` | `!img`, `!draw` | 🎨, 🖌️ | Public | Generate high-quality AI artwork and illustrations | `!imagine A futuristic cybernetic tiger in neon Tokyo` |
| `!generate` | `!gen`, `!write` | 📝, 📄 | Public | Draft essays, code snippets, emails, and articles | `!generate Write a Python script for web scraping` |
| `!agent` | `!ag`, `!task` | 🤖, 💼 | Public | Execute autonomous subagent multi-step research task | `!agent Research best practices for Node.js security` |
| `!persona` | `!botstyle` | 🎭 | Admin | Customise AI bot persona, tone, and response style | `!persona Set tone to formal software engineer` |
| `!knowledge` | `!kb`, `!wiki` | 📚, 🗂️ | Public | Query curated local developer knowledge base items | `!knowledge search deployment` |
| `!remember` | `!memo` | 📌 | Public | Store custom key-value memories for AI recall | `!remember server_ip 192.168.1.1` |
| `!search` | `!find`, `!google` | 🔍, 🔎, 🌐 | Public | Perform web search queries and retrieve summarized web info | `!search Latest tech news 2026` |

### 3. System, Administration & Security

| Command | Short Alias | Emoji Shortcut | Level | Description | Example |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `!antidelete` | `!antidel`, `!ad` | 🗑️ | Admin | Manage anti-delete message & media pre-buffer recovery | `!antidelete status` or `!antidelete on` |
| `!blockads` | `!adblock`, `!noads` | 🛑 | Admin | Manage WhatsApp Status Ad Blocker engine & view log | `!blockads status` or `!blockads on` |
| `!schedule` | `!sched`, `!cron` | ⏰, 📅, ⏱️ | Admin | Schedule recurring or one-off tasks with onWhatsApp check | `!schedule create GoodMorning --type daily --time 08:00` |
| `!pair` | `!code`, `!link` | 🔢 | Public/Admin | Request 8-digit WhatsApp pairing code for linking | `!pair 2348012345678` |
| `!react` | `!r`, `!roleplay` | 🤗, 💋, 👊 | Public | Send emoji reactions or roleplay actions (hug, kiss, slap) | `!react hug @user` or `!hug @user` |
| `!group` | `!g`, `!gc` | 👥, 📢 | Admin | Manage group settings (announce, lock, promote, kick) | `!group announce` or `!group kick @user` |
| `!broadcast` | `!bc`, `!announce` | 📣, 📻 | Admin | Broadcast message to all active chats and groups | `!broadcast Important system update tonight!` |
| `!antibot` | `!nobot` | ⚔️, 🛑 | Admin | Toggle anti-bot protection and view rival bot counter-bans | `!antibot status` |
| `!stealth` | `!ghost` | 🥷, 👻 | Admin | Manage stealth fingerprinting and human typing simulation | `!stealth status` |
| `!access` | `!acl`, `!perm` | 🔑, 🔐, 🛡️ | Admin | Grant or revoke user permission access levels | `!access grant 2348012345678 music` |
| `!banaccount` | `!ban` | 🔨, 🚫 | Admin | Ban user account from invoking bot commands | `!banaccount 2348012345678` |
| `!disable` | `!off` | ❌ | Admin | Disable specific bot commands globally | `!disable music` |
| `!enable` | `!on` | ✅ | Admin | Enable previously disabled bot commands | `!enable music` |
| `!disabled` | `!dislist` | 📋 | Admin | List all currently disabled commands | `!disabled` |
| `!togglefeature` | `!tf` | 🎚️, 🔀 | Admin | Enable or disable core system feature flags | `!togglefeature status` |
| `!provider` | `!model` | ⚙️ | Admin | Switch primary AI provider (OpenAI vs Groq) | `!provider groq` |
| `!setkey` | `!key` | 🔑 | Admin | Update API keys dynamically at runtime | `!setkey openai sk-xxxx...` |
| `!memoryadmin` | `!memadm` | 💾, 💿 | Admin | Inspect and wipe conversation memory databases | `!memoryadmin stats` |
| `!ping` | `!p` | 🏓 | Public | Test bot responsiveness and WebSocket connection latency | `!ping` |
| `!speed` | `!test` | ⚡, 🚀 | Public | Run diagnostic benchmark tests for CPU, RAM & disk | `!speed` |
| `!status` | `!info`, `!sys` | 📊, 📈 | Public | Display system memory, CPU usage, uptime & engine stats | `!status` |
| `!profile` | `!me`, `!user` | 👑, 👤 | Public | View caller permissions, message count, and usage stats | `!profile` |
| `!terminal` | `!cmd`, `!exec` | 💻, ⌨️, 🖥️ | Owner Only | Execute shell commands directly on host system (Restricted) | `!terminal dir` |
| `!help` | `!h`, `!menu` | ❓, 📜, 📖 | Public | Display menu of all commands, aliases, and examples | `!help` or `!help music` |

---

## 🛠️ Developer Guide: How to Add New Custom Commands

Adding a new command to Nerd-eth is **100% modular and automatic**! You do not need to register the command manually—simply create a new JavaScript file in `src/commands/`.

### Step-by-Step Tutorial

1. **Create File**: Create a new file in `src/commands/` (e.g. `src/commands/mycommand.js`).
2. **Export Command Module**: Export an object containing:
   - `name`: String (primary command name, lowercase).
   - `alias`: Array of Strings (short forms and emoji shortcuts).
   - `description`: String (brief explanation).
   - `usage`: String (syntax format).
   - `adminOnly`: Boolean (`true` if restricted to admins/owner).
   - `execute`: Async function `(sock, msg, args, ctx) => { ... }`.
3. **Test**: The command loader in `src/handlers/commandHandler.js` will automatically discover and register your new command upon startup!

### Command Template (`src/commands/mycommand.js`)

```javascript
module.exports = {
  name: 'mycommand',
  alias: ['mycmd', 'mc', '🎉'], // Short forms and emoji shortcuts
  description: 'A custom command that demonstrates bot functionality',
  usage: '!mycommand [text]',
  adminOnly: false, // Set to true if restricted to admins
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;
    var textInput = (args || '').trim();

    if (!textInput) {
      return sock.sendMessage(sender, {
        text: '❌ *Usage Error:* Please provide text argument.\nSyntax: `!mycommand Hello World`'
      });
    }

    var replyText = '🎉 *My Custom Command Executed!*\n\n' +
      '▸ *Input:* ' + textInput + '\n' +
      '▸ *Caller:* ' + (ctx.pushName || 'User') + '\n' +
      '▸ *Time:* ' + new Date().toLocaleTimeString();

    await sock.sendMessage(sender, { text: replyText });
  },
};
```

---

## 🛠️ Core Engines Deep Dive

### 1. Anti-Delete & View-Once Media Engine
- **Pre-Buffering Mechanism**: When an incoming message containing an image, video, audio clip, document, or sticker is received via Baileys `messages.upsert`, `antiDeleteService.js` downloads the raw stream into memory immediately (`savedBuffer`).
- **Protocol Interception**: When WhatsApp emits a `messages.update` or `messages.upsert` with protocol `REVOKE` (type `0`), `handleRevokeMessage` resolves the cached buffer and forwards the recovered payload to your owner self-chat.
- **View-Once Support**: Automatically unwraps `viewOnceMessage`, `viewOnceMessageV2`, and `viewOnceMessageV2Extension` structures.

### 2. WhatsApp Status Ad Blocker Engine
- **Protocol & Context Metadata Scanning**: Inspects incoming `status@broadcast` updates for `sponsoredMessage`, `adContext`, `externalAdReply`, `isAd`, and `sourceApp` (`facebook`, `instagram`, `ads`).
- **Sender & Keyword Verification**: Filters out business bot IDs (`0@s.whatsapp.net`), channel broadcasts (`@newsletter`), and commercial call-to-action phrases (`#ad`, `#sponsored`, `shop now`, `install app`, discount codes).
- **Execution Drop**: When an ad is detected, `statusHandler.js` drops execution immediately—preventing auto-viewing or auto-liking of ads.

### 3. Auto-View & Auto-Like Status Engine
- **Auto-View**: Automatically sends read-receipts (`sock.readMessages([key])`) for contact status updates when `AUTO_VIEW_STATUS` is enabled.
- **Auto-Like**: Automatically sends green heart status reactions (`💚`) to contact status updates when `AUTO_LIKE_STATUS` is enabled.
- **Ad Filtering**: Automatically bypassed for status ads detected by the Status Ad Blocker engine.

### 4. Multi-Engine Media Downloader (yt-dlp)
- **Primary Engine**: Integrates local `yt-dlp` executable for high-resolution video streams from Instagram Reels/Posts, Twitter/X, TikTok, and YouTube.
- **Fallback Chain**: `yt-dlp` ➔ `btch-downloader` ➔ `Cobalt API` ➔ HTML Scrapers (`indown.io`, `twitsave.com`, `snapsave.app`).
- **Attached Media Posters**: Automatically attaches album art covers to music downloads (`!music`), movie posters to film info cards (`!movie`), and application icons to APK cards (`!apk`).

### 5. Scheduler & Target Verification Engine
- **onWhatsApp Verification**: When creating a scheduled task (`!schedule create`), `sock.onWhatsApp(targetNumber)` verifies whether the phone number is active on WhatsApp before accepting the schedule.
- **24-Hour Clock Accuracy**: `parseHoursMinutes` cleanly handles midnight times (e.g., `00:56`) without falsy coercion errors.
- **High-Precision Loop**: Runs background checks every 10 seconds for precise execution.

### 6. Stealth & Anti-Ban Security Engine
- **Organic Fingerprinting**: Simulates authentic WhatsApp Web clients with randomised browser strings, User-Agents, and WebSocket heartbeat presences.
- **Human Typing Delay**: Applies human-like typing indicators (`composing`, `recording`) with random delays before responding.
- **Rival Anti-Bot Counter-Attack**: Detects automated spam bots and automatically counter-bans/kicks them from group chats.

---

## 📥 Installation & Setup

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **FFmpeg**: Installed and available in PATH (for media conversions)
- **yt-dlp**: Native executable installed and accessible via command line (`yt-dlp --version`)

### 1. Clone Repository
```bash
git clone https://github.com/Fortunehack45/Nerd_eth-Omemi-WA-Bot.git
cd whatsappbot
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

### 4. Start the Application
```bash
npm start
```

---

## ⚙️ Configuration Reference (.env)

```ini
# Bot Configuration
BOT_NAME=Nerd-eth
OWNER_NUMBER=2348012345678
PREFIX=!
DASHBOARD_PASSWORD=Omemi

# AI Providers
OPENAI_API_KEY=sk-proj-xxxx...
GROQ_API_KEY=gsk_xxxx...
AI_MODEL=gpt-4o-mini
GROQ_MODEL=llama-3.1-8b-instant

# Feature Flags & Automation
AUTO_VIEW_STATUS=true
AUTO_LIKE_STATUS=true
STATUS_AD_BLOCKER_ENABLED=true
ANTI_BAN_ENABLED=true
ALWAYS_ONLINE=true
SAFE_MODE=true
HUMAN_TYPING=true
```

---

## 📱 Pairing Code & QR Authentication

Nerd-eth supports two authentication methods for linking your WhatsApp account:

1. **8-Digit Pairing Code (Recommended)**:
   - Run `npm start` and execute `!pair <your_phone_number>` (e.g., `!pair 2348012345678`).
   - Open WhatsApp on your phone ➔ **Linked Devices** ➔ **Link with phone number instead** ➔ Enter the 8-digit code shown in terminal or chat.

2. **Standard QR Code Scanning**:
   - If no pairing code is requested, a QR code will render directly in the terminal window for scanning.

---

## 🌐 Web Management Dashboard

Nerd-eth features a lightweight web control dashboard accessible locally:

- **URL**: `http://localhost:3000`
- **Default Password**: Defined in `DASHBOARD_PASSWORD` (`.env`)
- **Capabilities**:
  - Live system memory, CPU usage, and latency monitoring.
  - Active session inspect & pairing status.
  - Real-time message logs & Anti-Delete event logs.
  - Status Ad Blocker stats & blocked ads history.

---

## ⚖️ Terms and Conditions of Service

### 1. Acceptance of Terms
By installing, hosting, or invoking **Nerd-eth (Omemi) WhatsApp Bot**, you agree to be bound by these Terms of Service. If you do not agree with any portion of these terms, you must immediately terminate execution and delete all copies of the codebase.

### 2. Authorized & Compliant Usage
- Users are solely responsible for ensuring their usage complies with all applicable local, national, and international laws, including data privacy legislation (GDPR, CCPA) and platform policies.
- Spamming, bulk unsolicited messaging, harassment, or unauthorized automated activity is strictly prohibited.

### 3. Account Safety & Anti-Ban Disclaimer
- While Nerd-eth includes sophisticated anti-ban security features (stealth fingerprinting, typing delays, rate limiting), automated interaction with WhatsApp carries inherent risks of account suspension by WhatsApp LLC / Meta Platforms Inc.
- Software maintainers and contributors accept **no liability** for any account bans, suspensions, or restrictions imposed on linked WhatsApp numbers.

### 4. Intellectual Property & License
- Nerd-eth is licensed under the open-source **MIT License**. You are permitted to modify, distribute, and host the software provided the original copyright notice and permission notice are included in all copies.

---

## 🔒 Privacy Policy & Data Protection

### 1. Local Data Processing & Storage
- **Zero Cloud Uploads**: All message caches, Anti-Delete buffers, status indexes, and user conversation histories are stored **strictly on your local machine / server** inside the `storage/` directory.
- No analytics, telemetric user tracking, or conversation logs are transmitted to external servers maintained by the developers.

### 2. End-to-End Encryption Integrity
- Nerd-eth operates through official `@whiskeysockets/baileys` WebSocket connections. All communication between the bot and WhatsApp servers remains end-to-end encrypted under WhatsApp's standard Signal protocol.

### 3. Data Retention & Erasure
- **Temporary Cache**: Message caches created for Anti-Delete expire automatically after reaching the maximum queue size (3,000 messages).
- **Data Erasure**: System administrators may wipe stored memory databases at any time using the `!memoryadmin reset` command or by deleting the `storage/` directory.

---

## ⚠️ Legal Disclaimer & Liability Waiver

```
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY 
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES 
OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT 
SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, 
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT 
OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) 
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, 
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS 
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

- **Third-Party Trademarks**: WhatsApp, Instagram, Facebook, Meta, Twitter, X, TikTok, Spotify, and YouTube are registered trademarks of their respective corporate owners. Nerd-eth is an independent open-source project and is not affiliated with, endorsed by, or sponsored by Meta Platforms Inc. or any of its subsidiaries.
- **Copyrighted Content**: Users downloading media via `!download`, `!music`, `!movie`, or `!apk` are strictly responsible for respecting copyright laws and intellectual property rights in their jurisdiction.

---

*Engineered with precision by the Nerd-eth Open Source Team.*
