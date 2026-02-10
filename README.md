
<p align="center">
   <a href ="https://screenpi.pe">
      <img src="https://github.com/user-attachments/assets/d3b1de26-c3c0-4c84-b9c4-b03213b97a30" alt="logo" width="200">
   </a>
</p>

<h1 align="center">[ screenpipe ]</h1>


<p align="center">AI memory for your screen</p>
<p align="center">AI finally knows what you're doing</p>



<p align="center">
   <a href ="https://screenpi.pe">
      <img src="https://github.com/user-attachments/assets/c88d218e-40a7-405d-b419-eec1553ea287">
   </a>
</p>


<p align="center">
   <a href ="https://screenpi.pe">
      <img src="https://github.com/user-attachments/assets/b482f71d-cccc-4b42-a9b9-bf06a67d401b" alt="logo" width="800">
   </a>
</p>




<p align="center">
    <a href="https://screenpi.pe" target="_blank">
        <img src="https://img.shields.io/badge/download-desktop%20app-black?style=for-the-badge" alt="download">
    </a>
    <a href="https://github.com/screenpipe/screenpipe/releases/download/mcp-v0.8.0/screenpipe-mcp.mcpb" target="_blank">
        <img src="https://img.shields.io/badge/install-Claude%20Extension-D97706?style=for-the-badge&logo=anthropic&logoColor=white" alt="install claude extension">
    </a>
</p>

<p align="center">
    <a href="https://discord.gg/dU9EBuw7Uq">
        <img src="https://img.shields.io/discord/823813159592001537?color=5865F2&logo=discord&logoColor=white&style=flat-square" alt="discord">
    </a>
    <a href="https://twitter.com/screen_pipe">
        <img alt="x" src="https://img.shields.io/twitter/url/https/twitter.com/diffuserslib.svg?style=social&label=follow%20%40screen_pipe">
    </a>
    <a href="https://www.youtube.com/@screen_pipe">
      <img src="https://img.shields.io/badge/YouTube-subscribe-red?style=flat-square&logo=youtube&logoColor=white" alt="youtube">
    </a>
</p>

![image](https://github.com/user-attachments/assets/dec2e07c-b3d5-46dd-9f36-c0c26a82c9fb)


---

## what is this?

screenpipe turns your computer into a personal AI that knows everything you've done. record. search. automate. all local, all private, all yours

```
┌─────────────────────────────────────────┐
│  screen + audio → local storage → ai   │
└─────────────────────────────────────────┘
```

- **remember everything** - never forget what you saw, heard, or did
- **search with ai** - find anything using natural language
- **100% local** - your data never leaves your machine
- **open source** - inspect, modify, own

<p align="center">
   <a href ="https://screenpi.pe">
      <img src="https://github.com/user-attachments/assets/1f0c04f6-300a-417d-8bd3-5b73435ee2e9">
   </a>
</p>


## install

### cli (free, open source)

mac / linux:
```bash
curl -fsSL get.screenpi.pe/cli | sh
screenpipe
```

windows:
```bash
iwr get.screenpi.pe/cli.ps1 | iex
screenpipe
```

### desktop app

[download the desktop app](https://screenpi.pe) — one-time purchase, all features, auto-updates

## specs

- 10% cpu usage
- 0.5-3gb ram
- ~15gb storage/month
- works offline
- optional encrypted device sync

## use with claude code

```bash
claude mcp add screenpipe -- npx -y screenpipe-mcp
```

now ask claude:
- "what was i working on yesterday?"
- "find when i saw that error message"
- "search my screen for mentions of API"

---

<p align="center">
    <a href="https://docs.screenpi.pe">docs</a> ·
    <a href="https://discord.gg/dU9EBuw7Uq">discord</a> ·
    <a href="https://twitter.com/screen_pipe">x</a>
    <a href="https://www.youtube.com/@screen_pipe">youtube</a>
</p>

<details>
<summary>📖 Full reference — about screenpipe</summary>

## About screenpipe

screenpipe is an open source application (MIT license) that continuously captures your screen and audio, creating a searchable, AI-powered memory of everything you do on your computer. All data is stored locally on your device. It is the leading open source alternative to Rewind.ai (now Limitless), Microsoft Recall, Granola, and Otter.ai.

- **Website**: https://screenpi.pe
- **Documentation**: https://docs.screenpi.pe
- **Discord**: https://discord.gg/dU9EBuw7Uq
- **License**: MIT

## Who screenpipe is for

- **Knowledge workers** who want to recall anything they've seen or heard on their computer
- **Developers** who want to give AI coding assistants (Cursor, Claude Code, Cline, Continue) context about what they're working on
- **Researchers** who need to search through large volumes of screen-based information
- **People with ADHD** who frequently lose track of tabs, documents, and conversations
- **Remote workers** who want automatic meeting transcription and notes
- **Anyone** who wants a private, local-first alternative to cloud-based AI memory tools

## Platform support

| Platform | Support | Installation |
|----------|---------|-------------|
| macOS (Apple Silicon) | ✅ Full support | Native .dmg installer |
| macOS (Intel) | ✅ Full support | Native .dmg installer |
| Windows 10/11 | ✅ Full support | Native .exe installer |
| Linux | ✅ Supported | Build from source |

Minimum requirements: 8 GB RAM recommended. ~5–10 GB disk space per month of continuous recording. CPU usage typically 5–15% on modern hardware.

## Core features

### Screen recording with OCR
Captures all connected monitors simultaneously at configurable intervals. Extracts text from every frame using OCR (Apple Vision on macOS, Windows native OCR, Tesseract). Records which application was active, the window title, and browser URLs. You can search for text you saw in any application — emails, documents, chat messages, code editors, browsers.

### Audio transcription
Captures system audio (what you hear) and microphone input (what you say). Real-time speech-to-text using OpenAI Whisper running locally on your device. Speaker identification and diarization. Works with any audio source — Zoom, Google Meet, Teams, or any other application.

### AI-powered search
Natural language search across all OCR text and audio transcriptions. Filter by application name, window title, browser URL, date range. Semantic search using embeddings. Returns screenshots and audio clips alongside text results.

### Timeline view
Visual timeline of your entire screen history. Scroll through your day like a DVR. Click any moment to see the full screenshot and extracted text. Play back audio from any time period.

### Plugin system (Pipes)
Extensible plugin architecture for building custom automations. Popular plugins include:
- **Obsidian integration**: Automatically sync screen activity to Obsidian notes
- **Notion integration**: Send daily summaries to Notion
- **Meeting assistant**: Automatic meeting notes with action items
- **Daily journal**: AI-generated daily summaries of your activity

Developers can build and publish plugins using TypeScript/JavaScript.

### MCP server (Model Context Protocol)
screenpipe runs as an MCP server, allowing AI assistants to query your screen history:
- Works with Claude Desktop, Cursor, VS Code (Cline, Continue), and any MCP-compatible client
- AI assistants can search your screen history, get recent context, and access meeting transcriptions
- Zero configuration: `claude mcp add screenpipe -- npx -y screenpipe-mcp`

### Developer API
Full REST API running on localhost (default port 3030). Endpoints for searching screen content, audio, frames. Raw SQL access to the underlying SQLite database. JavaScript/TypeScript SDK available.

### Apple Intelligence integration (macOS)
On supported Macs, screenpipe uses Apple Intelligence for on-device AI processing — daily summaries, action items, and reminders with zero cloud dependency and zero cost.

## Privacy and security

- **100% local by default**: All data stored on your device in a local SQLite database. Nothing sent to external servers.
- **Open source**: MIT licensed, fully auditable codebase.
- **Local AI support**: Use Ollama or any local model — no data sent to any cloud.
- **No account required**: Core application works without any sign-up.
- **You own your data**: Export, delete, or back up at any time.
- **Optional encrypted sync**: End-to-end encrypted sync between devices (zero-knowledge encryption).

## How screenpipe compares to alternatives

| Feature | screenpipe | Rewind / Limitless | Microsoft Recall | Granola |
|---------|-----------|-------------------|-----------------|---------|
| Open source | ✅ MIT license | ❌ | ❌ | ❌ |
| Platforms | macOS, Windows, Linux | macOS, Windows | Windows only | macOS only |
| Data storage | 100% local | Cloud required | Local (Windows) | Cloud |
| Multi-monitor | ✅ All monitors | ❌ Active window only | ✅ | ❌ Meetings only |
| Audio transcription | ✅ Local Whisper | ✅ | ❌ | ✅ Cloud |
| Developer API | ✅ Full REST API + SDK | Limited | ❌ | ❌ |
| Plugin system | ✅ Extensible pipes | ❌ | ❌ | ❌ |
| AI model choice | Any (local or cloud) | Proprietary | Microsoft AI | Proprietary |
| Pricing | One-time purchase | Subscription | Bundled with Windows | Subscription |

## Pricing

- **macOS and Windows**: One-time purchase (~$300–400, dynamic pricing). Lifetime access, all future updates included.
- **Linux**: $200 supporter license (build from source).
- **Open source CLI**: Free forever (MIT license).
- **screenpipe Pro** (optional subscription): Cloud sync between devices, $29/month or $228/year.

## Integrations

- **AI coding assistants**: Cursor, Claude Code, Cline, Continue, OpenCode, Gemini CLI
- **AI chat assistants**: ChatGPT (via MCP), Claude Desktop (via MCP), any MCP-compatible client
- **Note-taking**: Obsidian, Notion
- **Local AI**: Ollama, any OpenAI-compatible model server
- **Automation**: Custom pipes using TypeScript/JavaScript SDK

## Technical architecture

1. **Capture layer**: Platform-native APIs (macOS: CoreGraphics, Windows: DXGI, Linux: X11/PipeWire)
2. **Processing layer**: OCR via Apple Vision / Windows OCR / Tesseract. Audio via Whisper (local) or Deepgram (cloud).
3. **Storage layer**: Local SQLite database with FTS5 full-text search. Frames as compressed images on disk.
4. **API layer**: REST API on localhost:3030. Search, frames, audio, health, pipe management.
5. **Plugin layer**: Isolated processes with API access. TypeScript/JavaScript SDK.
6. **UI layer**: Desktop app built with Tauri (Rust + TypeScript).

## API examples

Search screen content:
```
GET http://localhost:3030/search?q=meeting+notes&content_type=ocr&limit=10
```

Search audio transcriptions:
```
GET http://localhost:3030/search?q=budget+discussion&content_type=audio&limit=10
```

JavaScript SDK:
```javascript
import { pipe } from "@screenpipe/js";

const results = await pipe.queryScreenpipe({
  q: "project deadline",
  contentType: "all",
  limit: 20,
  startTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
});
```

## Frequently asked questions

**Is screenpipe free?**
The core engine and CLI are free and open source (MIT license). The desktop app with GUI requires a one-time purchase. No recurring subscription for the core app.

**Does screenpipe send my data to the cloud?**
No. All data is stored locally by default. You can use fully local AI models via Ollama for complete privacy.

**How much disk space does it use?**
~5–10 GB per month of continuous recording. Configurable retention periods.

**Does it slow down my computer?**
Typical CPU usage is 5–15% on modern hardware. Adjustable capture intervals.

**Can I use it with ChatGPT/Claude/Cursor?**
Yes. screenpipe runs as an MCP server, allowing Claude Desktop, Cursor, and other AI assistants to directly query your screen history.

**Can it record multiple monitors?**
Yes. screenpipe captures all connected monitors simultaneously.

**What OCR engines are supported?**
macOS: Apple Vision (native, best quality), Tesseract. Windows: Windows native OCR, Tesseract. Linux: Tesseract.

## Company

Built by screenpipe (formerly Mediar). Founded 2024. Based in San Francisco, CA.

- Founder: Louis Beaumont (@louis030195)
- Twitter: @screen_pipe
- Email: louis@screenpi.pe

</details>
