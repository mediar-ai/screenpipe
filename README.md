
<p align="center">
    <img src="https://github.com/louis030195/screen-pipe/assets/25003283/289bbee7-79bb-4251-9516-878a1c40dcd0" width="200"/>
</p>

<p align="center">
    <a href="https://screenpi.pe" target="_blank">
        <img src="https://img.shields.io/badge/Join%20Waitlist-Desktop%20App-blue?style=for-the-badge" alt="Join Waitlist for Desktop App">
    </a>
</p>

<p align="center">
    <a href="https://www.bensbites.com/">
        <img src="https://img.shields.io/badge/Featured%20on-Ben's%20Bites-blue?style=flat-square" alt="Featured on Ben's Bites">
    </a>
    <a href="https://discord.gg/dU9EBuw7Uq">
        <img src="https://img.shields.io/discord/823813159592001537?color=5865F2&logo=discord&logoColor=white&style=flat-square" alt="Join us on Discord">
    </a>
        <a href="https://twitter.com/screen_pipe"><img alt="X account" src="https://img.shields.io/twitter/url/https/twitter.com/diffuserslib.svg?style=social&label=Follow%20%40screen_pipe"></a>
</p>

> Civilization progresses by the number of operations it can perform without conscious effort.  
> — **Whitehead**

Record your screen & mic 24/7 and connect it to LLMs. Inspired by `adept.ai`, `rewind.ai`, `Apple Shortcut`. Written in Rust. Free. You own your data.

screenpipe is a library that allows you to gather all your life context and connect it to LLMs easily for:
- search (e.g. go beyond your limited human memory)
- automation (such as making actions on the web while you work, syncing company's knowledge, etc.)
- etc.


## Example vercel/ai-chatbot that query screenpipe autonomously

Check this example of screenpipe which is a chatbot that make requests to your data to answer your questions

https://github.com/louis030195/screen-pipe/assets/25003283/6a0d16f6-15fa-4b02-b3fe-f34479fdc45e

## Status 

Alpha: runs on my computer (`Macbook pro m3 32 GB ram`) 24/7.

- [x] screenshots
- [x] mp4 encoding to disk (30 GB / month)
- [x] sqlite local db
- [x] OCR
- [x] audio + stt
  - [x] multi audio input (e.g. laptop microphone + iphone microphone + whatever)
  - [ ] multi audio output
  - [ ] multi audio input + multi audio output
- [x] local api
- [ ] TS SDK
- [ ] cloud storage options (s3, pgsql, etc.)
- [ ] cloud computing options
- [ ] bug-free & stable
- [ ] storage efficient modes: customizable capture settings (fps, resolution)
- [ ] data encryption options & higher security
- [ ] fast, optimised, energy-efficient modes

## Usage

Keep in mind that it's still experimental.

```bash
screenpipe --list-audio-devices
# then pick one or multiple audio input
screenpipe --audio-device "Device Name (input)" [--audio-device "Another Device (input)"]
```

Audio output not supported yet, see #24.

<details>
  <summary>Examples to query the API</summary>
  
  ```bash
# 1. Basic search query
curl "http://localhost:3030/search?q=test&limit=5&offset=0"

# 2. Search with content type filter (OCR)
curl "http://localhost:3030/search?q=test&limit=5&offset=0&content_type=ocr"

# 3. Search with content type filter (Audio)
curl "http://localhost:3030/search?q=test&limit=5&offset=0&content_type=audio"

# 4. Search with pagination
curl "http://localhost:3030/search?q=test&limit=10&offset=20"

# 6. Search with no query (should return all results)
curl "http://localhost:3030/search?limit=5&offset=0"
  ```
</details>

Now pipe this into a LLM to build:
- memory extension apps
- automatic summaries
- automatic action triggers (say every time you see a dog, send a tweet)
- automatic CRM (fill salesforce while you do sales on linkedin)
- sync your local pkm with company's pkm (obsidian to notion for example)
- maintain cheatsheets of your customers relationships formatted as markdown table in notion
- dating app that make AI agents talk with millions of other potential mates acting like you and scheduling you weekly dates


[Check example with vercel/ai-chatbot project (nextjs)](https://github.com/louis030195/screen-pipe/tree/main/examples/ts/vercel-ai-chatbot)

## Installation

### Windows

TBD. Own a Windows computer? [Please help us test it!](https://github.com/louis030195/screen-pipe/issues/6).

### Linux

```bash
curl -sSL https://raw.githubusercontent.com/louis030195/screen-pipe/main/install.sh | sh
```

Now you should be able to `screenpipe`. (You may need to restart your terminal, or find the CLI in `$HOME/.local/bin`)

### MacOS

On Mac you need to build the CLI yourself.

1. Install dependencies:
```bash
# On Mac
brew install ffmpeg
```

Install [Rust](https://www.rust-lang.org/tools/install).

2. Clone the repo:

```bash
git clone https://github.com/louis030195/screen-pipe
cd screen-pipe
```

3. Run the API:

```bash
# This runs a local SQLite DB + an API + screenshot, ocr, mic, stt, mp4 encoding
cargo build --release --features metal # remove "--features metal" if you do not have M series processor

# sign the executable to avoid mac killing the process when it's running for too long
codesign --sign - --force --preserve-metadata=entitlements,requirements,flags,runtime ./target/release/screenpipe

# then run it
./target/release/screenpipe
```

Struggle to get it running? [I'll install it with you in a 15 min call.](https://cal.com/louis030195/screenpipe)

We are working toward [making it easier to try](https://github.com/louis030195/screen-pipe/issues/6), feel free to help!

## Why open source?

Recent breakthroughs in AI have shown that context is the final frontier. AI will soon be able to incorporate the context of an entire human life into its 'prompt', and the technologies that enable this kind of personalisation should be available to all developers to accelerate access to the next stage of our evolution.  

## Principles 

This is a library intended to stick to simple use case:
- record the screen & associated metadata (generated locally or in the cloud) and pipe it somewhere (local, cloud)

Think of this as an API that let's you do this:

```bash
screenpipe | ocr | llm "turn what i see into my CRM" | api "send data to salesforce api"
```

Any interfaces are out of scope and should be built outside this repo, for example:
- UI to search on these files (like rewind)
- UI to spy on your employees
- etc.

## Contributing

Contributions are welcome! If you'd like to contribute, please fork the repository and use a feature branch. Pull requests are warmly welcome.

Say 👋 in our [public Discord channel](https://discord.gg/dU9EBuw7Uq) . We discuss how to bring this lib to production, help each other with contributions, personal projects or just hang out ☕.

Bit more details on the architecture [here](https://link.excalidraw.com/l/5MKXLddifTr/8subenQGvcd).

## Licensing

The code in this project is licensed under MIT license. See the [LICENSE](LICENSE.md) file for more information.

## Related projects

This is a very quick & dirty example of the end goal that works in a few lines of python:
https://github.com/louis030195/screen-to-crm

Very thankful for https://github.com/jasonjmcghee/xrem which was helpful. Although screenpipe is going in a different direction.

## FAQ

<details>
  <summary>What's the difference with adept.ai and rewind.ai?</summary>

  - adept.ai is closed product, focused on automation while we are open and focused on enabling tooling & infra for a wide range of applications like adept 
  - rewind.ai is closed product, focused on a single use case (they only focus on meetings now), not customisable, your data is owned by them, and not extendable by developers 

</details>

<details>
  <summary>Where is the data stored?</summary>
  
  - 100% of the data stay local in a SQLite database and mp4 files
  - If you use an LLM like OpenAI, part of your data will be sent to Microsoft servers, you can use a local LLM like [Chrome AI](https://sdk.vercel.ai/providers/community-providers/chrome-ai)
</details>

<details>
  <summary>How can I customize capture settings to reduce storage and energy usage?</summary>
  
  - You can adjust frame rates and resolution in the configuration. Lower values will reduce storage and energy consumption. We're working on making this more user-friendly in future updates.
</details>

<details>
  <summary>Is my data secure?</summary>
  
  - Your data is stored locally by default. We're actively working on implementing encryption options for enhanced security.
</details>

<details>
  <summary>What are some practical use cases for screenpipe?</summary>
  
  - Personal knowledge management
  - Automated task logging and time tracking
  - Context-aware AI assistants for improved productivity
  - Seamless data entry into CRM systems
  - We're constantly exploring new use cases and welcome community input!
</details>
