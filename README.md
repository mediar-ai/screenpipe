 
<p align="center">
    <img src="https://github.com/louis030195/screen-pipe/assets/25003283/289bbee7-79bb-4251-9516-878a1c40dcd0" width="200"/>
</p>

<p align="center">
    <a href="https://screenpi.pe" target="_blank">
        <img src="https://img.shields.io/badge/Download%20The-Desktop%20App-blue?style=for-the-badge" alt="Download the Desktop App">
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

<p align="center">
  <a href ="https://cal.com/louis030195/screenpipe">
    <img alt="Let's chat" src="https://cal.com/book-with-cal-dark.svg" />
  </a>
    
</p>

![Demo](./content/demo.gif)

---

*Latest News* 🔥
- [2024/07] **The Windows desktop app is here! [Get it now!](https://screenpi.pe)** Due to high demand, we will increase price by 080224.
- [2024/07] 🎁 Screenpipe won Friends (the AI necklace) hackathon at AGI House (integrations soon)
- [2024/07] **We just launched the desktop app! [Download now!](https://screenpi.pe)**

[![Screenshot 2024-07-30 at 12 13 15](https://github.com/user-attachments/assets/792c7f2b-e6a3-47da-8fd2-8276308f28b8)](https://screenpi.pe)


---

# 24/7 Screen & Audio Capture

Library to build personalized AI powered by what you've seen, said, or heard. Works with Ollama. Alternative to Rewind.ai. Open. Secure. You own your data. Rust.  
We are shipping daily, make suggestions, post bugs, [give feedback](mailto:louis@screenpi.pe?subject=Screenpipe%20Feedback&body=I'd%20like%20to%20use%20Screenpipe%20for%20...%0D%0A%0D%0AI%20cannot%20because%20of%20...%0D%0A%0D%0AWe%20can%20also%20have%20a%20call,%20book%20at%20https://cal.com/louis030195/screenpipe).

![diagram](./content/diagram2.png)

# Why?

Building a reliable stream of audio and screenshot data, where a user simply clicks a button and the script runs in the background 24/7, collecting and extracting data from screen and audio input/output, can be frustrating. 

There are numerous use cases that can be built on top of this layer. To simplify life for other developers, we decided to solve this non-trivial problem. It's still in its early stages, but it works end-to-end. We're working on this full-time and would love to hear your feedback and suggestions.

## Get started

There are multiple ways to install screenpipe:
- as a CLI (continue reading), for rather technical users
- as a [paid desktop app](https://screenpi.pe) with updates, priority support, and features
- as a free desktop app (but you need to build it yourself). We're 100% OSS.
- as a Rust or WASM library (documentation WIP)

This is the instructions to install the command line interface.

Struggle to get it running? [I'll install it with you in a 15 min call.](https://cal.com/louis030195/screenpipe)

<details>
  <summary>CLI installation</summary>


<details>
  <summary>MacOS</summary>

<details>
  <summary>Option I: brew</summary>

1. Install CLI
```bash
brew tap louis030195/screen-pipe https://github.com/louis030195/screen-pipe.git
brew install screenpipe
```
2. Run it:
```bash
screenpipe 
```
or if you don't want audio to be recorded
```bash
screenpipe --disable-audio
```
if you want to save OCR data to text file in text_json folder in the root of your project (good for testing):
```bash
screenpipe --save-text-files
```
if you want to run screenpipe in debug mode to show more logs in terminal:
```bash
screenpipe --debug
```
by default screenpipe is using deepgram nova-t text-to-audio model via cloud api. To use whisper-tiny that runs locally you should add this flag:
```bash
screenpipe --cloud-audio-off
```

you can combine multiple flags if needed

[Didn't work?](https://github.com/louis030195/screen-pipe/issues/new?assignees=&labels=dislike&template=dislike.yml&title=brew+install+screenpipe+didnt+work)

</details>

<details>
  <summary>Option II: Install from the source</summary>

1. Install dependencies:
```bash
brew install pkg-config ffmpeg jq tesseract
```

Install [Rust](https://www.rust-lang.org/tools/install).

2. Clone the repo:

```bash
git clone https://github.com/louis030195/screen-pipe
```

This runs a local SQLite DB + an API + screenshot, ocr, mic, stt, mp4 encoding
```bash
cd screen-pipe # enter cloned repo
```

Build the project, takes 5-10 minutes depending on your hardware
```bash
cargo build --release --features metal
```

Then run it
```bash
./target/release/screenpipe # add "--disable-audio" if you don't want audio to be recorded
# "--save-text-files" if you want to save OCR data to text file in text_json folder in the root of your project (good for testing)
# "--debug" if you want to run screenpipe in debug mode to show more logs in terminal
```

[Didn't work?](https://github.com/louis030195/screen-pipe/issues/new?assignees=&labels=dislike&template=dislike.yml&title=cloning+screenpipe+didnt+work)
</details>

<br><br>
</details>

<details>
  <summary>Windows</summary>

  NOT RECOMMENDED. Get the [desktop app](https://screenpi.pe/) instead.
  
  1. Install dependencies:

```bash
# Install first Chocolatey from https://chocolatey.org/install
choco install ffmpeg pkgconfiglite rust git
```

  2. Clone the repo:

```bash
git clone https://github.com/louis030195/screen-pipe
cd screen-pipe
```

  3. Run the API:

```bash
# This runs a local SQLite DB + an API + screenshot, ocr, mic, stt, mp4 encoding
cargo build --release --features cuda # remove "--features cuda" if you do not have a NVIDIA GPU

# then run it
./target/release/screenpipe
```
</details>

<details>
  <summary>Linux</summary>

  1. Install dependencies:

```bash
sudo apt-get update
sudo apt-get install -y libavformat-dev libavfilter-dev libavdevice-dev ffmpeg libasound2-dev tesseract-ocr libtesseract-dev

# Install Rust programming language
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

  2. Clone the repo:

```bash
git clone https://github.com/louis030195/screen-pipe
cd screen-pipe
```

  3. Run the API:

```bash
cargo build --release --features cuda # remove "--features cuda" if you do not have a NVIDIA GPU

# then run it
./target/release/screenpipe
```

</details>
<br><br>
</details>

By default the data is stored in `$HOME/.screenpipe` (`C:\AppData\Users\<user>\.screenpipe` on Windows) you can change using `--data-dir <mydir>`

<details>
  <summary>run example vercel/ai chatbot web interface</summary>

  This example uses OpenAI. If you're looking for ollama example check the [examples folder](https://github.com/louis030195/screen-pipe/tree/main/examples/typescript)

The [desktop app](https://screenpi.pe/) fully support OpenAI & Ollama by default.

To run Vercel chatbot, try this:

```bash
git clone https://github.com/louis030195/screen-pipe
```

Navigate to app directory
```bash
cd screen-pipe/examples/typescript/vercel-ai-chatbot 
```
Set up you OPENAI API KEY in .env
```bash
echo "OPENAI_API_KEY=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" > .env
```
[Didn't work?](https://github.com/louis030195/screen-pipe/issues/new?assignees=&labels=dislike&template=dislike.yml&title=vercel+app+didnt+work)

Install dependencies and run local web server
```bash
npm install 
```
```bash
npm run dev
```
![Vercel App](./content/Vercel_app.png)
<br><br>

![Claude_prompt](./content/Claude_prompt.png)
<br><br>
</details>


## Usage

You can use terminal commands to query and view your data as shown below. Also, we recommend Tableplus.com to view the database, it has a free tier.

Here's a pseudo code to illustrate how to use screenpipe, after a meeting for example (automatically with our webhooks):
```js

// 1h ago
const startDate = "<some time 1h ago..>"
// 10m ago
const endDate = "<some time 10m ago..>"

// get all the screen & mic data from roughly last hour 
const results = fetchScreenpipe(startDate, endDate)

// send it to an LLM and ask for a summary
const summary = fetchOllama("{results} create a summary from these transcriptions")
// or const summary = fetchOpenai(results)

// add the meeting summary to your notes
addToNotion(summary)
// or your favourite note taking app

```

Or thousands of other usages of all your screen & mic data!


<details>
<summary>
Check which tables you have in the local database</summary>

```bash
sqlite3 ~/.screenpipe/db.sqlite ".tables" 
```
</details>
<details>
<summary>
Print a sample audio_transcriptions from the database</summary>

```bash
sqlite3 ~/.screenpipe/db.sqlite ".mode json" ".once /dev/stdout" "SELECT * FROM audio_transcriptions ORDER BY id DESC LIMIT 1;" | jq .
```
![audio_transcriptions](./content/audio_transcriptions.png)
</details>
<details>
<summary>
Print a sample frame_OCR_text from the database</summary>

```bash
sqlite3 ~/.screenpipe/db.sqlite ".mode json" ".once /dev/stdout" "SELECT * FROM ocr_text ORDER BY frame_id DESC LIMIT 1;" | jq -r '.[0].text'
```
![frame_text](./content/frame_text.png)
</details>
<details>
<summary>
Play a sample frame_recording from the database</summary>

```bash
ffplay "data/2024-07-12_01-14-14.mp4"
```
</details>
<details>
<summary>
Play a sample audio_recording from the database</summary>

```bash
ffplay "data/Display 1 (output)_2024-07-12_01-14-11.mp4"
```
</details>

<details>
  <summary>Example to query the API</summary>
  
1. Basic search query
```bash
curl "http://localhost:3030/search?q=Neuralink&limit=5&offset=0&content_type=ocr" | jq
```
"Elon Musk" prompt
![Elon_Musk_prompt](./content/Elon_Musk_prompt.png)
</details>
<details>
  <summary>Other Example to query the API</summary>

  ```bash
# 2. Search with content type filter (OCR)
curl "http://localhost:3030/search?q=QUERY_HERE&limit=5&offset=0&content_type=ocr"

# 3. Search with content type filter (Audio)
curl "http://localhost:3030/search?q=QUERY_HERE&limit=5&offset=0&content_type=audio"

# 4. Search with pagination
curl "http://localhost:3030/search?q=QUERY_HERE&limit=10&offset=20"

# 6. Search with no query (should return all results)
curl "http://localhost:3030/search?limit=5&offset=0"
  ```
</details>
<br><br>
Keep in mind that it's still experimental.
<br><br>

https://github.com/user-attachments/assets/edb503d4-6531-4527-9b05-0397fd8b5976

## Use cases:

- Search
  - Semantic and keyword search. Find information you've forgotten or misplaced
  - Playback history of your desktop when searching for a specific info
- Automation: 
  - Automatically generate documentation
  - Populate CRM systems with relevant data
  - Synchronize company knowledge across platforms
  - Automate repetitive tasks based on screen content
- Analytics:
  - Track personal productivity metrics
  - Organize and analyze educational materials
  - Gain insights into areas for personal improvement
  - Analyze work patterns and optimize workflows
- Personal assistant:
  - Summarize lengthy documents or videos
  - Provide context-aware reminders and suggestions
  - Assist with research by aggregating relevant information
  - Live captions, translation support
- Collaboration:
  - Share and annotate screen captures with team members
  - Create searchable archives of meetings and presentations
- Compliance and security:
  - Track what your employees are really up to
  - Monitor and log system activities for audit purposes
  - Detect potential security threats based on screen content

## Example vercel/ai-chatbot that query screenpipe autonomously

Check this example of screenpipe which is a chatbot that make requests to your data to answer your questions

https://github.com/louis030195/screen-pipe/assets/25003283/6a0d16f6-15fa-4b02-b3fe-f34479fdc45e

## Status 

Alpha: runs on my computer (`Macbook pro m3 32 GB ram`) 24/7.

- [ ] Integrations
    - [x] ollama
    - [x] openai
    - [x] Friend wearable 
    - [x] [Fileorganizer2000](https://github.com/different-ai/file-organizer-2000)
    - [x] mem0
    - [ ] supermemory
    - [x] Obsidian
    - [x] Apple shortcut
    - [ ] multion
    - [x] iPhone
    - [ ] Android
    - [ ] Camera
    - [ ] Keyboard
    - [ ] Browser
    - [ ] Pipe Store (a list of "pipes" you can build, share & easily install to get more value out of your screen & mic data without effort)
- [x] screenshots + OCR
- [x] audio + STT (works with multi input & output devices, like your iPhone + mac mic)
- [x] [remote capture](https://github.com/louis030195/screen-pipe/discussions/68) (run screenpipe on your cloud and it capture your local machine, only tested on Linux) for example when you have low compute laptop
- [x] optimised screen & audio recording (mp4 encoding, estimating 30 gb/m with default settings)
- [x] sqlite local db
- [x] local api
- [x] Cross platform CLI, [desktop app](https://screenpi.pe/) (MacOS, Windows, Linux)
- [x] Metal, CUDA
- [ ] TS SDK
- [ ] multimodal embeddings
- [ ] cloud storage options (s3, pgsql, etc.)
- [ ] cloud computing options
- [ ] bug-free & stable
- [x] custom storage settings: customizable capture settings (fps, resolution)
- [ ] data encryption options & higher security
- [ ] fast, optimised, energy-efficient modes
- [ ] webhooks/events (for automations)

## Why open source?

Recent breakthroughs in AI have shown that context is the final frontier. AI will soon be able to incorporate the context of an entire human life into its 'prompt', and the technologies that enable this kind of personalisation should be available to all developers to accelerate access to the next stage of our evolution.  

## Contributing

Contributions are welcome! If you'd like to contribute, please read [CONTRIBUTING.md](CONTRIBUTING.md).

## FAQ

<details>
  <summary>What's the difference with adept.ai and rewind.ai?</summary>

  - adept.ai is a closed product, focused on automation while we are open and focused on enabling tooling & infra for a wide range of applications like adept 
  - rewind.ai is a closed product, focused on a single use case (they only focus on meetings now), not customisable, your data is owned by them, and not extendable by developers 

</details>

<details>
  <summary>Where is the data stored?</summary>
  
  - 100% of the data stay local in a SQLite database and mp4/mp3 files. You own your data
</details>

<details>
  <summary>Do you encrypt the data?</summary>
  
  - Not yet but we're working on it. We want to provide you the highest level of security.
</details>

<details>
  <summary>How can I customize capture settings to reduce storage and energy usage?</summary>
  
  - You can adjust frame rates and resolution in the configuration. Lower values will reduce storage and energy consumption. We're working on making this more user-friendly in future updates.
</details>

<details>
  <summary>What are some practical use cases for screenpipe?</summary>
  
    - RAG & question answering
    - Automation (write code somewhere else while watching you coding, write docs, fill your CRM, sync company's knowledge, etc.)
    - Analytics (track human performance, education, become aware of how you can improve, etc.)
    - etc.
    - We're constantly exploring new use cases and welcome community input!
</details>
