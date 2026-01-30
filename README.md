<img referrerpolicy="no-referrer-when-downgrade" src="https://static.scarf.sh/a.png?x-pxid=c3628864-a0cb-47a1-a822-2f936cff50b2" />

<p align="center">
   <a href ="https://screenpi.pe">
      <img src="https://github.com/user-attachments/assets/d3b1de26-c3c0-4c84-b9c4-b03213b97a30" alt="logo" width="200">
   </a>
</p>

<h1 align="center">[ screenpipe ]</h1>


<p align="center">24/7 memory for your desktop</p>
<p align="center">rewind but open source. 100% local. you own your data.</p>



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
    <a href="https://github.com/mediar-ai/screenpipe/raw/main/screenpipe-integrations/screenpipe-mcp/screenpipe-mcp.mcpb" target="_blank">
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
</p>

![image](https://github.com/user-attachments/assets/dec2e07c-b3d5-46dd-9f36-c0c26a82c9fb)


---

## what is this?

screenpipe records your screen and audio 24/7, stores everything locally, and lets you connect digital history to ai.

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

macos, linux:

```bash
curl -fsSL get.screenpi.pe/cli | sh
screenpipe
```

windows:

```bash
iwr get.screenpi.pe/cli.ps1 | iex
screenpipe
```

or [download the desktop app](https://screenpi.pe)

## specs

- 10% cpu usage
- 4gb ram
- ~15gb storage/month
- works offline

## use with claude code

give claude code access to your screen history:

```bash
npx @screenpipe/claude-code
```

that's it. now ask claude:
- "what was i working on yesterday?"
- "find when i saw that error message"
- "search my screen for mentions of API"

### what it does

1. checks screenpipe is running
2. adds screenpipe-mcp to claude code config
3. done - claude can now search your screen history

### requirements

- [screenpipe](https://screenpi.pe) running
- [claude code cli](https://docs.anthropic.com/en/docs/claude-code) installed

---

<p align="center">
    <a href="https://docs.screenpi.pe">docs</a> ·
    <a href="https://discord.gg/dU9EBuw7Uq">discord</a> ·
    <a href="https://twitter.com/screen_pipe">x</a>
</p>
