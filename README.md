# 🤖 Nerd-eth Multi-Purpose WhatsApp AI Bot & Dashboard

![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)
![License](https://img.shields.io/badge/License-MIT-blue.svg)
![WhatsApp](https://img.shields.io/badge/WhatsApp-Multi--Device-25D366.svg)
![AI](https://img.shields.io/badge/AI-Groq%20%7C%20OpenAI%20%7C%20OpenRouter-indigo.svg)
![Creator](https://img.shields.io/badge/Created%20By-%40OnNerd__eth-black.svg)

An enterprise-grade, zero-configuration WhatsApp Automation Bot and Web Control Center built with [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys). Features high-speed AI Chat, HD Media Downloads (YouTube, TikTok, Instagram, Spotify), Movie Finder, Real C++ Network Speed Calculator, View-Once Media Vault, Group Administration Tools (`!nuke`, `!adminme`), and a Mobile-First Glassmorphic Admin Control Panel.

---

## 🌟 Key Highlights & Advantages

- ⚡ **Zero-Configuration Out-of-the-Box**: No complex environment setup or mandatory `.env` variables required.
- 📱 **Automatic Owner Detection**: **No phone number configuration needed!** The bot automatically detects and grants full admin privileges to the linked WhatsApp account upon QR/Pairing scan.
- 🔑 **Built-in Public AI API**: Pre-configured with free Groq & public AI endpoints — works out of the box without requiring API keys.
- 🚀 **Real C++ Speed Calculator**: Embedded high-precision native socket network benchmark engine for download, upload, and latency testing.
- 📲 **Mobile App Control Panel**: Glassmorphic Web Admin Panel with pairing code generator, live terminal streams, and one-click feature switches.
- 👑 **Group Governance**: Execute mass group kick (`!nuke`), instant self-promotion (`!adminme`), and feature toggling (`!disable`, `!enable`).

---

## ⚡ Quick Start (Zero Config Needed)

### 1. Clone & Install
```bash
git clone https://github.com/Fortunehack45/Nerd_eth-Omemi-WA-Bot.git
cd Nerd_eth-Omemi-WA-Bot
npm install
```

### 2. Start the Bot
```bash
npm start
```

### 3. Connect to WhatsApp
* **QR Code Method**: Scan the QR code rendered in the terminal or on the web dashboard (`http://localhost:3000/dashboard`).
* **Pairing Code Method**: Open `http://localhost:3000/dashboard` → Go to **QR & Link Phone** → Enter phone number → Input 8-character pairing code into WhatsApp.

> 💡 **No `.env` file or phone number entry required!** The connected phone automatically becomes the bot owner & admin.

---

## ⚙️ Environment Variables (100% Optional)

Creating a `.env` file is **completely optional**. If omitted, the bot defaults to optimal zero-config settings:

```env
# All settings below are OPTIONAL:

# Bot Persona
BOT_NAME=Nerd-eth
PREFIX=!

# Additional Co-Admins (Optional — Owner is auto-detected on scan)
OWNER_NUMBER=234XXXXXXXXXX,234YYYYYYYYY

# AI Providers (Optional — Default uses free Public AI engine)
GROQ_API_KEY=gsk-your-groq-key
OPENAI_API_KEY=sk-your-openai-key
OPENROUTER_API_KEY=sk-or-v1-your-key

# Internet Search (Optional — Default uses DuckDuckGo)
BRAVE_SEARCH_API_KEY=BSA-your-brave-key

# Security & Admin Panel Access
ADMIN_PASSWORD=Omemi
```

---

## 🎛️ Admin Web Dashboard Features

Access the web dashboard at `http://localhost:3000/dashboard` or your deployed server URL (e.g. Render / Heroku):

* 🔑 **6-Digit Dynamic Access Passcode**: Follow [@OnNerd_eth on X (Twitter)](https://x.com/OnNerd_eth) to automatically generate your 6-digit access key, or use master password `Omemi`.
* ⚡ **Feature Switcher**: Enable or disable any feature (`autoreply`, `schedule`, `ai`, `status`, `viewonce`) or specific command with 1 click.
* 🚀 **Real C++ Internet Speed Calculator**: Execute live socket download, upload, and ping benchmarks directly from the web panel.
* 📲 **WhatsApp Pairing Code Generator**: Link devices remotely without camera QR scanning.
* 📋 **Real-Time Terminal Log Stream**: Live log viewer with 1-click clipboard copy.

---

## 📋 Command Reference

### 🤖 AI & Vision
| Command | Description | Example |
|---------|-------------|---------|
| `!ai <query>` | Chat with AI | `!ai Explain general relativity` |
| `!ask <query>` | Alias for AI chat | `!ask How do I optimize Node.js performance?` |
| `!imagine <prompt>` | Generate AI images | `!imagine A futuristic cyberpunk city at night` |
| `!persona` | Switch persona (Nerd-eth / Omemi) | `!persona female` |

### 📥 HD Media Downloader
| Command | Description | Example |
|---------|-------------|---------|
| `!download <url>` | Download HD video / audio | `!download https://youtu.be/...` |
| `!download <url> --audio` | Download MP3 audio only | `!download https://youtu.be/... --audio` |
| `!dl <url>` | Fast download shortcut | `!dl https://vm.tiktok.com/...` |

* **Supported Platforms**: YouTube (1080p/720p HD), TikTok (No Watermark), Instagram (Reels & Posts), Spotify (MP3 Audio).

### 🎬 Movies & Cinema
| Command | Description | Example |
|---------|-------------|---------|
| `!movie search <title>` | Search movie database | `!movie search Interstellar` |
| `!movie info <title>` | Detailed ratings & plot | `!movie info Inception` |
| `!movie download <title>` | **Direct HD Torrent/Stream Links** | `!movie download Avatar` |
| `!movie trending` | View trending cinema releases | `!movie trending` |

### 📷 Profile & Contact Utilities
| Command | Description | Example |
|---------|-------------|---------|
| `!getpp` | Get high-res profile picture of contact | `!getpp` |
| `!getpp @user` | Get profile picture of tagged group user | `!getpp @John` |
| `!pfp <phone>` | Get profile picture by phone number | `!pfp 2348012345678` |

### 👑 Group Admin & Governance
| Command | Description | Example |
|---------|-------------|---------|
| `!adminme` | Promote yourself to group admin | `!adminme` |
| `!nuke` | **Mass Kick**: Remove all non-admin members | `!nuke` |
| `!disable <cmd/feat>` | Disable command or feature | `!disable music` |
| `!enable <cmd/feat>` | Re-enable command or feature | `!enable music` |
| `!disabled` | List all disabled items | `!disabled` |
| `!tagall` | Mention all group members | `!tagall Meeting starting now!` |

---

## 🛠️ Project Architecture

```
whatsapp-bot/
├── index.js                 # Primary entry point & initialization
├── server.js                # Express dashboard & REST API server
├── SpeedTestEngine.exe      # Compiled C++ / C# native speed engine
├── public/
│   └── dashboard.html       # Glassmorphic web control panel UI
├── src/
│   ├── client.js            # Baileys WhatsApp WebSocket handler
│   ├── commands/            # Extensible command modules
│   │   ├── ai.js            # AI reasoning
│   │   ├── disable.js       # Command disable switcher
│   │   ├── enable.js        # Command enable switcher
│   │   ├── getpp.js         # Profile picture extractor
│   │   ├── group.js         # Group management (!nuke, !adminme)
│   │   └── ...
│   ├── handlers/            # Message & status event routers
│   └── services/            # AI, Media Download, Speed Test services
└── storage/                 # Persistent databases & session tokens
```

---

## 🤝 Community & Support

* **Creator**: [@OnNerd_eth on X (Twitter)](https://x.com/OnNerd_eth)
* **GitHub Repository**: [Fortunehack45/Nerd_eth-Omemi-WA-Bot](https://github.com/Fortunehack45/Nerd_eth-Omemi-WA-Bot)

---

## 📜 License

Distributed under the MIT License. Open-source, free for personal and commercial deployment.
