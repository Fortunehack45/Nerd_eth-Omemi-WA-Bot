<div align="center">

<img src="https://iili.io/Cwvlxwv.png" alt="Nerd-eth Bot Logo" width="180" style="border-radius: 36px; box-shadow: 0 16px 50px rgba(0,0,0,0.5);"/>

# 🤖 Nerd-eth — Master Technical Architecture & Developer Encyclopedia
### Enterprise WhatsApp Multi-Device Automation Engine, AI Chat Platform & Web Control Suite

**Version:** `2.0.0` &nbsp;|&nbsp; **Core Runtime:** `Node.js v18+` &nbsp;|&nbsp; **Protocol:** `@whiskeysockets/baileys` &nbsp;|&nbsp; **License:** `MIT`

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Multi--Device-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://web.whatsapp.com)
[![License](https://img.shields.io/badge/License-MIT-4f46e5?style=for-the-badge)](LICENSE)
[![AI Providers](https://img.shields.io/badge/AI-Groq%20%7C%20OpenAI%20%7C%20OpenRouter-a855f7?style=for-the-badge&logo=openai&logoColor=white)](https://groq.com)
[![Portfolio](https://img.shields.io/badge/Portfolio-Fortune__Adebayo-6366f1?style=for-the-badge&logo=googlechrome&logoColor=white)](https://fortuneadebayo.space/)
[![Creator](https://img.shields.io/badge/Creator-%40OnNerd__eth-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/OnNerd_eth)

---

🌐 **Official Portfolio:** [fortuneadebayo.space](https://fortuneadebayo.space/)
&nbsp;|&nbsp;
📲 **WhatsApp Support:** [+234 916 768 9200](https://wa.me/2349167689200?text=Hi%20Nerd-eth%2C%20I%20need%20help%20with%20the%20bot!)
&nbsp;|&nbsp;
𝕏 **Follow Creator:** [@OnNerd_eth](https://x.com/OnNerd_eth)

</div>

---

## 📚 Master Table of Contents

1. [Executive Summary & Platform Philosophy](#1-executive-summary--platform-philosophy)
2. [Comparative Performance & Feature Matrix](#2-comparative-performance--feature-matrix)
3. [Exhaustive Codebase Directory & File Architecture](#3-exhaustive-codebase-directory--file-architecture)
4. [Baileys Protocol & Event Handling Architecture](#4-baileys-protocol--event-handling-architecture)
   - [4.1 WASocket Connection & Authentication Lifecycle](#41-wasocket-connection--authentication-lifecycle)
   - [4.2 8-Digit Pairing Code Sequence & Protocol Protocol](#42-8-digit-pairing-code-sequence--protocol-protocol)
   - [4.3 Protocol Revoke Interception (Anti-Delete Engine)](#43-protocol-revoke-interception-anti-delete-engine)
   - [4.4 Multi-Engine Scraper Fallback Architecture](#44-multi-engine-scraper-fallback-architecture)
   - [4.5 Stealth Mode & Fingerprint Rotation State Machine](#45-stealth-mode--fingerprint-rotation-state-machine)
   - [4.6 Anti-Bot Defense & Counter-Attack Mechanism](#46-anti-bot-defense--counter-attack-mechanism)
   - [4.7 View-Once Auto-Vault Encryption & Decryption Pipeline](#47-view-once-auto-vault-encryption--decryption-pipeline)
5. [Comprehensive Core Services Technical Specification](#5-comprehensive-core-services-technical-specification)
   - [5.1 `src/services/antiDeleteService.js`](#51-srcservicesantideleteservicejs)
   - [5.2 `src/services/downloadService.js`](#52-srcservicesdownloadservicejs)
   - [5.3 `src/services/stealthService.js`](#53-srcservicesstealthservicejs)
   - [5.4 `src/services/antiBotService.js`](#54-srcservicesantibotservicejs)
   - [5.5 `src/services/viewOnceService.js`](#55-srcservicesviewonceservicejs)
   - [5.6 `src/services/accessControl.js`](#56-srcservicesaccesscontroljs)
   - [5.7 `src/services/featureService.js`](#57-srcservicesfeatureservicejs)
   - [5.8 `src/services/statusService.js`](#58-srcservicesstatusservicejs)
   - [5.9 `src/services/aiService.js`](#59-srcservicesaiservicejs)
   - [5.10 `src/services/fileGenService.js`](#510-srcservicesfilegenservicejs)
   - [5.11 `src/services/memoryService.js`](#511-srcservicesmemoryservicejs)
   - [5.12 `src/services/personaService.js`](#512-srcservicespersonaservicejs)
   - [5.13 `src/services/schedulerService.js`](#513-srcservicesschedulerservicejs)
   - [5.14 `src/services/searchService.js`](#514-srcservicessearchservicejs)
   - [5.15 `src/services/speedTestService.js`](#515-srcservicesspeedtestservicejs)
6. [Exhaustive 40-Command Reference Manual](#6-exhaustive-40-command-reference-manual)
   - [Section 6.1: AI & Intelligence Commands (10 Commands)](#section-61-ai--intelligence-commands)
   - [Section 6.2: Media Downloading & File Utilities (7 Commands)](#section-62-media-downloading--file-utilities)
   - [Section 6.3: Security, Privacy & Anti-Delete Commands (9 Commands)](#section-63-security-privacy--anti-delete-commands)
   - [Section 6.4: Group Management Commands (9 Commands)](#section-64-group-management-commands)
   - [Section 6.5: Utility & Reaction Commands (12 Commands)](#section-65-utility--reaction-commands)
7. [Prefix-Less Emoji Command Specification (60+ Emojis)](#7-prefix-less-emoji-command-specification-60-emojis)
8. [JSON Database Schemas & Persistence Specification](#8-json-database-schemas--persistence-specification)
9. [Web Control Panel REST API Specification & Payload Schemas](#9-web-control-panel-rest-api-specification--payload-schemas)
10. [Developer Guide: Step-by-Step Custom Command Creation](#10-developer-guide-step-by-step-custom-command-creation)
11. [Enterprise Deployment Manual (PM2, Docker, Nginx, Systemd)](#11-enterprise-deployment-manual-pm2-docker-nginx-systemd)
12. [Security Threat Model, Hardening & Anti-Ban Protocols](#12-security-threat-model-hardening--anti-ban-protocols)
13. [Comprehensive Troubleshooting & Diagnostics Directory](#13-comprehensive-troubleshooting--diagnostics-directory)
14. [License & Credits](#14-license--credits)

---

## 1. Executive Summary & Platform Philosophy

**Nerd-eth** is an enterprise-grade WhatsApp Multi-Device automation platform and developer framework built on `@whiskeysockets/baileys`. Engineered for performance, resilience, and extensibility, Nerd-eth implements autonomous zero-configuration bootstrapping alongside a modular service-oriented architecture.

### Key Innovations:
- **Zero-Config Self-Healing Engine**: Automatically creates directories, database files, fallback API scrapers, and Web UI configurations upon initial startup without requiring pre-configured `.env` parameters.
- **Protocol-Level Anti-Delete**: Intercepts WhatsApp `REVOKE` protocol stanzas, capturing deleted text and media buffers (photos, HD videos, voice notes, stickers, documents) and delivering them to an owner self-chat.
- **8-Digit Pairing Code Generator**: Integrates WhatsApp's native `requestPairingCode` API, providing an alternative to QR code scanning.
- **Multi-Engine Redundant Downloader**: Utilizes 5 fallback scrapers for Instagram and 4 for Twitter/X, ensuring high availability during API rate limits.
- **Rich Visual Banners**: Automatically attaches movie posters (`!movie`), music album cover art (`!music`), and app icons (`!apk`) to response cards.
- **Prefix-Less Emoji Dispatcher**: Features a custom parser supporting 60+ standalone emoji triggers operating alongside standard `!` prefix commands.

---

## 2. Comparative Performance & Feature Matrix

| Operational Vector | Nerd-eth Platform | Standard WhatsApp Frameworks |
|---|---|---|
| **Protocol Foundation** | Native `@whiskeysockets/baileys` WS | Web Scraping (Puppeteer / Selenium) |
| **Authentication Flow** | Terminal QR + 8-Digit Pairing Code | QR Code Scan Only |
| **Anti-Delete Recovery** | Protocol REVOKE Interception & Buffer Capture | Not Supported |
| **Scraper Redundancy** | 5 Redundant Fallback Scrapers per Platform | Single API / Scraper |
| **Rich Media Attachments** | Movie Posters, Album Cover Art, App Logos | Plain Text Messages |
| **Emoji Parsing** | 60+ Standalone Prefix-Less Emoji Triggers | Mandatory Prefix Only |
| **AI Intelligence Chain** | Groq (Llama 3.1 70B) ➔ OpenAI ➔ OpenRouter | Single Provider Only |
| **Anti-Bot Defense** | Heuristic Detection + Counter-Ban Engine | Vulnerable to Loop Attacks |
| **Stealth Anti-Detection** | Fingerprint Pools + Presence Spoofing | Fixed Static Identifiers |
| **View-Once Vault** | Automatic Silent Media Buffer Vaulting | Manual Capture Only |
| **Group Mass Purging** | Rate-Limited Batch Kicks (Preserves Admins) | Uncontrolled Batch Kicks |
| **Speed Benchmark** | Native Compiled C++ TCP Socket Engine | HTTP Ping Only |
| **Web Control UI** | Glassmorphic Web Dashboard + REST API | Command Line Interface Only |

---

## 3. Exhaustive Codebase Directory & File Architecture

```
whatsappbot/
├── index.js                          # Application bootstrapper & lifecycle manager
├── server.js                         # Express REST API & Web Dashboard backend
├── config.js                         # Global configuration & environment loader
├── ecosystem.config.js               # PM2 production process configuration
├── package.json                      # Node.js project manifest & dependencies
├── README.md                         # Master technical architecture manual
├── LICENSE                           # MIT open-source license file
├── public/                           # Web Dashboard Frontend Assets
│   ├── dashboard.html                # Glassmorphic admin dashboard interface
│   └── styles.css                    # Custom CSS styling rules
├── storage/                          # JSON Database & Session Directory
│   ├── access.json                   # Access control whitelist database
│   ├── antidelete.json               # Anti-delete recovery logs & configuration
│   ├── stealth.json                  # Stealth mode parameters & fingerprints
│   ├── auth_info_baileys/            # Baileys multi-device session credentials
│   └── status/                       # Auto-saved status media storage
└── src/
    ├── client.js                     # Baileys WASocket connection & pairing module
    ├── handlers/                     # Event Routing & Command Parsing
    │   ├── commandHandler.js         # Command parser & dispatcher
    │   └── messageHandler.js         # Message router & emoji parser
    ├── services/                     # 18 Modular Core Services
    │   ├── accessControl.js          # ACL authorization service
    │   ├── agentService.js           # Multi-step AI subagent runner
    │   ├── aiService.js              # AI multi-provider fallback engine
    │   ├── antiBanService.js         # Rate-limiting & human emulation rules
    │   ├── antiBotService.js         # Anti-bot detection & counterban engine
    │   ├── antiDeleteService.js      # Anti-delete capture & recovery engine
    │   ├── downloadService.js        # Multi-engine media downloader
    │   ├── featureService.js         # Feature toggle & command lock registry
    │   ├── fileGenService.js         # Document generator (PDF, DOCX, ZIP)
    │   ├── mediaService.js           # Storage file manager service
    │   ├── memoryService.js          # Conversation memory database service
    │   ├── onboardingService.js      # User welcome & onboarding service
    │   ├── personaService.js         # AI personality switcher service
    │   ├── schedulerService.js       # Cron task scheduler & timer service
    │   ├── searchService.js          # Web & Wikipedia search service
    │   ├── speedTestService.js       # Native C++ speed test service
    │   ├── statusService.js          # Status saver & publisher service
    │   ├── stealthService.js         # Stealth mode presence service
    │   └── viewOnceService.js        # View-once media auto-vault service
    └── commands/                     # 40 Modular Command Modules
        ├── access.js                 # ACL permission manager
        ├── agent.js                  # Multi-step AI agent launcher
        ├── ai.js                     # AI chat command
        ├── antibot.js                # Anti-bot defense manager
        ├── antidelete.js             # Anti-delete engine manager
        ├── apk.js                    # APK downloader with app logos
        ├── banaccount.js             # Account ban & block manager
        ├── broadcast.js              # Announcement broadcast manager
        ├── disable.js                # Command disabler module
        ├── disabled.js               # Disabled commands list module
        ├── download.js               # Universal HD media downloader
        ├── enable.js                 # Command enabler module
        ├── generate.js               # Document file generator
        ├── getpp.js                  # Profile picture extractor
        ├── group.js                  # Group manager & mass purge
        ├── help.js                   # Interactive command menu
        ├── imagine.js                # AI image generator
        ├── knowledge.js              # User knowledge database
        ├── media.js                  # Storage file manager
        ├── memoryadmin.js            # Memory database manager
        ├── movie.js                  # Movie finder with poster banners
        ├── music.js                  # Music engine with album cover art
        ├── pair.js                   # 8-Digit pairing code generator
        ├── persona.js                # AI personality switcher
        ├── ping.js                   # Latency & health checker
        ├── profile.js                # User profile & facts reader
        ├── provider.js               # AI provider switcher
        ├── react.js                  # Emoji reaction & roleplay manager
        ├── remember.js               # Memory recorder module
        ├── savestatus.js             # Status media downloader
        ├── schedule.js               # Cron scheduler & timer
        ├── search.js                 # Web search engine
        ├── setkey.js                 # Runtime API key manager
        ├── speed.js                  # TCP socket speed benchmark
        ├── status.js                 # WhatsApp status manager
        ├── stealth.js                # Stealth mode manager
        ├── terminal.js               # Web terminal shell executor
        ├── togglefeature.js          # Module toggle manager
        ├── unzip.js                  # Archive file extractor
        └── viewonce.js               # View-once vault manager
```

---

## 4. Baileys Protocol & Event Handling Architecture

### 4.1 WASocket Connection Lifecycle

```
[ Application Start: index.js ]
            │
            ▼
[ Client Initializer: src/client.js ] ──► Load Session Credentials (storage/auth_info_baileys)
            │
            ├──► Has Existing Session? ──► [ Establish WASocket WS ] ──► [ Connection Active ]
            │
            └──► Missing Session? ──► Choice:
                                       ├──► [ Terminal QR Code Display ]
                                       └──► [ Execute requestPairingCode(phone) ] ──► Display 8-Digit Code
```

### 4.2 8-Digit Pairing Code Sequence Protocol Flow

```
Admin / User ──► Triggers `!pair 2348012345678` or Web Form
                      │
                      ▼
              [ src/client.js: requestPairingCode() ]
                      │
                      ▼
              [ Query WhatsApp Protocol Gateway ]
                      │
                      ▼
              [ Server Issues Code: e.g. "ABCD-1234" ]
                      │
                      ▼
User opens WhatsApp ──► Linked Devices ──► Link with Phone Number ──► Enters Code ──► Session Authenticated!
```

---

## 5. Comprehensive Core Services Technical Specification

### 5.1 `src/services/antiDeleteService.js`
- **Purpose**: Intercepts `REVOKE` protocol stanzas and recovers deleted messages and media.
- **Cache Architecture**: Maintains a sliding window memory `Map` holding up to 2000 recent incoming messages.
- **Media Decoding**: Decodes media streams via `downloadContentFromMessage` for image, video, audio, document, and sticker messages.

```javascript
// Caches incoming message payload in memory cache Map
function cacheMessage(msg) {
  if (!msg || !msg.key || !msg.key.id) return;
  messageCache.set(msg.key.id, {
    id: msg.key.id,
    key: msg.key,
    senderJid: msg.key.participant || msg.key.remoteJid,
    chatJid: msg.key.remoteJid,
    pushName: msg.pushName || 'User',
    text: msg.message?.conversation || msg.message?.extendedTextMessage?.text || '',
    content: msg.message,
    timestamp: Date.now()
  });
}
```

### 5.2 `src/services/downloadService.js`
- **Purpose**: Unified multi-engine media scraper.
- **Redundancy Matrix**:
  - Instagram: 5 fallback scrapers (`wf-instagram-url-direct`, `btch-downloader`, `SnapSave`, `Cobalt API`, `yt-dlp`).
  - Twitter/X: 4 fallback scrapers (`btch-downloader`, `Cobalt API`, `twitsave`, `yt-dlp`).

---

## 6. Exhaustive 40-Command Reference Manual

### Section 6.1: AI & Intelligence Commands

#### 1. `!ai <prompt>`
- **Aliases**: `!ask`, `!chat`, `!gpt`, `!gemini`, `🤖`, `🧠`, `💡`
- **Access Level**: Public
- **Description**: Query the multi-provider AI engine. Auto-routes through Groq (Llama 3.1 70B), OpenAI GPT-4o, and OpenRouter.
- **Example**: `!ai Explain quantum computing in simple terms`

#### 2. `!imagine <prompt>`
- **Aliases**: `!draw`, `!generate`, `!img`, `!image`, `!dalle`, `🎨`, `🖌️`
- **Access Level**: Public
- **Description**: Generate photorealistic AI images from text descriptions.
- **Example**: `!imagine A futuristic cyberpunk city at sunset in 8k detail`

#### 3. `!agent <task>`
- **Aliases**: `!agents`, `!multiagent`
- **Access Level**: Admin
- **Description**: Execute autonomous multi-step subagent tasks.
- **Example**: `!agent Research market trends for AI startups in 2026`

#### 4. `!persona [name]`
- **Aliases**: `!mode`, `!gender`, `!identity`, `!botname`, `🎭`
- **Access Level**: Admin
- **Description**: Switch the AI personality profile (Jarvis, Cyberpunk, Assistant).
- **Example**: `!persona jarvis`

#### 5. `!provider [name]`
- **Aliases**: `!model`, `!switch`, `!prov`, `!pv`, `🎛️`
- **Access Level**: Admin
- **Description**: Switch primary AI provider engine (`groq`, `openai`, `openrouter`).
- **Example**: `!provider groq`

#### 6. `!setkey <provider> <key>`
- **Aliases**: `!apikey`, `!changekey`, `!key`, `!setk`, `🔑`
- **Access Level**: Admin
- **Description**: Update API keys dynamically at runtime without restarting.
- **Example**: `!setkey groq gsk_xxxxxxxxx...`

#### 7. `!memoryadmin [subcommand]`
- **Aliases**: `!mem`, `!memory`, `!brains`, `!db`, `💾`, `💿`
- **Access Level**: Admin
- **Description**: View, search, export, or clear stored user conversation memory.
- **Example**: `!mem stats`

#### 8. `!knowledge [user | search]`
- **Aliases**: `!users`, `!contacts`, `!known`, `!kb`, `📚`, `🗂️`
- **Access Level**: Admin
- **Description**: Inspect learned user facts, preferences, and knowledge base entries.
- **Example**: `!knowledge search John`

#### 9. `!remember <fact>`
- **Aliases**: `!note`, `!savenote`, `!memo`, `!rem`, `📌`
- **Access Level**: Public
- **Description**: Store a personal fact or note for the AI to remember about you.
- **Example**: `!remember My preferred programming language is Rust`

#### 10. `!profile`
- **Aliases**: `!user`, `!whoami`, `!pr`, `👤`, `🆔`
- **Access Level**: Public
- **Description**: View your personal memory profile, stored facts, and interaction stats.
- **Example**: `!profile`

---

### Section 6.2: Media Downloading & File Utilities

#### 11. `!download <url>`
- **Aliases**: `!dl`, `!save`, `!get`, `!yt`, `!ig`, `!tt`, `📥`, `⬇️`
- **Access Level**: Public
- **Description**: Download HD video or audio from YouTube, TikTok, Instagram, Twitter/X, Spotify, Facebook.
- **Example**: `!download https://instagram.com/reel/abc123`

#### 12. `!music <play | info | lyrics | trending>`
- **Aliases**: `!song`, `!audio`, `!play`, `!ytmp3`, `🎵`, `🎶`, `🎧`
- **Access Level**: Public
- **Description**: Search tracks, download MP3 audio, view lyrics & trending charts with **attached album cover art**.
- **Example**: `!song Burna Boy Last Last`

#### 13. `!movie <info | search | trending | top>`
- **Aliases**: `!film`, `!movies`, `!mov`, `!mv`, `🎬`, `🍿`, `🎥`
- **Access Level**: Public
- **Description**: Search movies, view plot summaries, cast, ratings, and **attached poster banners**.
- **Example**: `!movie Interstellar --full`

#### 14. `!apk <get | search | info | download>`
- **Aliases**: `!app`, `!apkdl`, `!getapk`, `📲`, `📱`
- **Access Level**: Public
- **Description**: Search and download Android APK packages with **attached app logo icons**.
- **Example**: `!apk download com.whatsapp`

#### 15. `!media <list | send | recent | clear>`
- **Aliases**: `!file`, `!files`, `!view`, `!m`, `📁`, `🗃️`
- **Access Level**: Admin
- **Description**: Browse and send files from the server storage directory.
- **Example**: `!media list storage/downloads`

#### 16. `!unzip <filepath>`
- **Aliases**: `!extract`, `!zip`, `!archive`, `!uz`, `📦`
- **Access Level**: Admin
- **Description**: Decompress archive files (ZIP, RAR, TAR, GZ) stored on the server.
- **Example**: `!unzip storage/downloads/archive.zip`

#### 17. `!generate <type> <content>`
- **Aliases**: `!gen`, `!createfile`, `!make`, `!mk`, `📝`, `📄`
- **Access Level**: Admin
- **Description**: Convert Markdown or text into downloadable files (PDF, DOCX, TXT, ZIP).
- **Example**: `!gen pdf # Title\nSample PDF text content`

---

### Section 6.3: Security, Privacy & Anti-Delete Commands

#### 18. `!antidelete [on | off | status | list]`
- **Aliases**: `!antidel`, `!ad`, `!nodelete`, `!savedeleted`, `🗑️`
- **Access Level**: Admin
- **Description**: Captures and recovers deleted text and media when contacts hit "Delete for Everyone".
- **Example**: `!antidel on`

#### 19. `!stealth [on | off | status]`
- **Aliases**: `!ghost`, `!invisible`, `!stl`, `!sh`, `🥷`, `👻`
- **Access Level**: Admin
- **Description**: Toggle stealth mode (rotating user-agents, presence spoofing, typing delays).
- **Example**: `!stealth on`

#### 20. `!antibot [on | off | status]`
- **Aliases**: `!blockbot`, `!botblock`, `!ab`, `!anti`, `⚔️`, `🛑`
- **Access Level**: Admin
- **Description**: Toggle anti-bot heuristic detection and auto-counterban engine.
- **Example**: `!antibot on`

#### 21. `!banaccount <number>`
- **Aliases**: `!targetban`, `!accountban`, `!botban`, `!ban`, `🔨`, `🚫`
- **Access Level**: Admin
- **Description**: Block target user number and kick them from all mutual groups.
- **Example**: `!ban 2348012345678`

#### 22. `!access <add | remove | list>`
- **Aliases**: `!permission`, `!auth`, `!whitelist`, `!acc`, `🔑`, `🔐`
- **Access Level**: Admin
- **Description**: Manage ACL whitelist permissions for administrative bot control.
- **Example**: `!access add 2348012345678`

#### 23. `!togglefeature <feature>`
- **Aliases**: `!toggle`, `!feature`, `!tog`, `!tf`, `🎚️`, `🔀`
- **Access Level**: Admin
- **Description**: Globally enable or disable specific bot modules.
- **Example**: `!toggle disable music`

#### 24. `!disable <command>`
- **Aliases**: `!dis`, `❌`
- **Access Level**: Admin
- **Description**: Instantly disable a single command module.
- **Example**: `!disable imagine`

#### 25. `!enable <command>`
- **Aliases**: `!ena`, `✅`
- **Access Level**: Admin
- **Description**: Re-enable a previously disabled command module.
- **Example**: `!enable imagine`

#### 26. `!disabled`
- **Aliases**: `!features`, `!disabledlist`, `📋`
- **Access Level**: Admin
- **Description**: List all currently disabled features and commands.
- **Example**: `!disabled`

---

### Section 6.4: Group Management Commands

#### 27. `!group <nuke | promote | demote | tagall | info | link>`
- **Aliases**: `!g`, `!grp`
- **Access Level**: Admin
- **Description**: Unified group management routing command.
- **Example**: `!group info`

#### 28. `!nuke [--confirm]`
- **Aliases**: `!purge`, `!kickall`, `!removeall`, `🧹`, `🚨`, `💣`
- **Access Level**: Admin
- **Description**: Batch kick all regular group members safely (excludes group creator, admins, and bot).
- **Example**: `!nuke --confirm`

#### 29. `!adminme`
- **Aliases**: `!makeadmin`, `👑`
- **Access Level**: Admin
- **Description**: Self-promote caller to Group Admin if bot has admin rights.
- **Example**: `!adminme`

#### 30. `!selfadmin`
- **Aliases**: `!groupown`, `!botadmin`
- **Access Level**: Admin
- **Description**: Trigger self-admin escalation using 3 fallback escalation techniques.
- **Example**: `!selfadmin`

#### 31. `!promote @user`
- **Aliases**: `!admin`
- **Access Level**: Admin
- **Description**: Promote tagged member to Group Admin.
- **Example**: `!promote @John`

#### 32. `!demote @user`
- **Aliases**: `!unadmin`
- **Access Level**: Admin
- **Description**: Demote tagged Group Admin to regular member.
- **Example**: `!demote @John`

#### 33. `!tagall [message]`
- **Aliases**: `!everyone`, `!all`, `📢`
- **Access Level**: Admin
- **Description**: Tag all group participants in a single announcement message.
- **Example**: `!tagall Meeting starting now!`

#### 34. `!groupinfo`
- **Aliases**: `!ginfo`, `👥`, `ℹ️`
- **Access Level**: Admin
- **Description**: View detailed group metadata, creation date, and admin list.
- **Example**: `!groupinfo`

#### 35. `!link`
- **Aliases**: `!invitelink`, `🔗`
- **Access Level**: Admin
- **Description**: Retrieve current group invite link.
- **Example**: `!link`

---

### Section 6.5: Utility & Reaction Commands

#### 36. `!getpp [@user | reply | number | group]`
- **Aliases**: `!pfp`, `!profilepic`, `!avatar`, `!pp`, `!p`, `🖼️`, `📷`
- **Access Level**: Admin
- **Description**: Fetch profile picture of mentioned user, quoted participant, phone number, or group avatar (`!getpp group`).
- **Example**: `!getpp @John`

#### 37. `!pair <phone_number>`
- **Aliases**: `!code`, `!pairing`, `!paircode`, `!connectcode`, `!pcode`, `🔢`
- **Access Level**: Admin
- **Description**: Generate an 8-digit WhatsApp pairing code for QR-optional connection.
- **Example**: `!pair 2348012345678`

#### 38. `!react <emoji>` / `!hug @user` / `!slap @user`
- **Aliases**: `!r`, `!kiss`, `!pat`, `!punch`, `!dance`, `!laugh`, `!wink`, `!wave`, `🤗`, `😘`, `🖐️`, `👊`, `💃`, `😂`, `😉`, `👋`
- **Access Level**: Public
- **Description**: Send emoji reactions or interactive tagged roleplay action cards.
- **Example**: `!hug @John`

#### 39. `!ping`
- **Aliases**: `!p`, `!uptime`, `!alive`, `🏓`
- **Access Level**: Public
- **Description**: Check bot online status, websocket latency, and server uptime.
- **Example**: `!ping`

#### 40. `!speed`
- **Aliases**: `!speedtest`, `!nettest`, `!sp`, `!st`, `⚡`, `🚀`
- **Access Level**: Public
- **Description**: Execute native C++ TCP socket internet speed benchmark.
- **Example**: `!speed`

---

## 7. Prefix-Less Emoji Command Specification (60+ Emojis)

| Standalone Emoji | Command | Usage |
|---|---|---|
| `🖼️` / `📷` | `getpp` | `🖼️ @user` |
| `🧹` / `🚨` / `💣` | `nuke` | `🧹 --confirm` |
| `👑` | `adminme` | `👑` |
| `📢` | `tagall` | `📢 Hello` |
| `🏓` | `ping` | `🏓` |
| `🎵` | `music` | `🎵 Song` |

---

## 8. JSON Database Schemas & Persistence Specification

### `storage/access.json`
```json
{
  "admins": ["2348012345678@s.whatsapp.net"],
  "allowedGroups": [],
  "blockedUsers": []
}
```

---

## 9. Web Control Panel REST API Specification & Payload Schemas

- `GET /api/status`: Health check.
- `POST /api/pair`: Body `{ "phone": "234..." }`.

---

## 10. Developer Guide: Step-by-Step Custom Command Creation

```javascript
module.exports = {
  name: 'mycommand',
  alias: ['myc'],
  description: 'Custom command example',
  adminOnly: false,
  execute: async (sock, msg, args, ctx) => {
    await sock.sendMessage(ctx.sender, { text: 'Hello from custom command!' });
  }
};
```

---

## 11. Enterprise Deployment Manual (PM2, Docker, Nginx, Systemd)

```javascript
module.exports = {
  apps: [{
    name: 'nerd-eth-bot',
    script: 'index.js',
    instances: 1,
    autorestart: true,
    max_memory_restart: '1G'
  }]
};
```

---

## 12. Security Threat Model, Hardening & Anti-Ban Protocols

1. **Random Delays**: Implements human typing delays.
2. **Rate Limiting**: Throttles message execution to prevent spam flags.

---

## 13. Comprehensive Troubleshooting & Diagnostics Directory

- **Session Errors**: Clear `storage/auth_info_baileys` and re-pair.
- **Scraper Errors**: Run `pip install -U yt-dlp` to update native fallback scrapers.

---

## 14. License & Credits

Distributed under the **MIT License**. See [LICENSE](LICENSE) for details.

Created with ❤️ by **Fortune Adebayo ([@OnNerd_eth](https://x.com/OnNerd_eth))**.
