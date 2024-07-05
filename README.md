
<p align="center">
    <br>
       <img src="https://github.com/louis030195/screen-pipe/assets/25003283/289bbee7-79bb-4251-9516-878a1c40dcd0" width="200"/>
    <br>
<p>
<p align="center">
    <a href="https://discord.gg/dU9EBuw7Uq"><img alt="Join us on Discord" src="https://img.shields.io/discord/823813159592001537?color=5865F2&logo=discord&logoColor=white"></a>
    <a href="https://twitter.com/screen_pipe"><img alt="X account" src="https://img.shields.io/twitter/url/https/twitter.com/diffuserslib.svg?style=social&label=Follow%20%40screen_pipe"></a>
</p>

> Civilization progresses by the number of operations it can perform without conscious effort.  
> — **Whitehead**

Record your screen & mic 24/7 and connect it to LLMs. Inspired by `adept.ai`, `rewind.ai`, `Apple Shortcut`. Written in Rust. Free. You own your data.

screenpipe is a library that allows you to gather all your life context and connect it to LLMs easily for:
- search (e.g. go beyond your limited human memory)
- automation (such as making actions on the web while you work, syncing company's knowledge, etc.)
- etc.

<!--

## Screen to action using LLMs
Here's an example of server-side code written in TypeScript that takes the streamed data from ScreenPipe and uses a Large Language Model like OpenAI's to process text and images for analyzing sales conversations:

```typescript
import { ScreenPipe } from "screenpipe";
import { generateObject } from 'ai';
import { z } from 'zod';

const screenPipe = new ScreenPipe();

export async function onTick() {
  const data = await screenPipe.tick([1], {frames: 60}); // or screen [1, 2, 3, ...]
  // [{frame: [...], text: [...], metadata: [...]}, ...]

  const { object } = await generateObject({
    model: openai("gpt4-o"),
    schema: z.object({
      leads: z.array(z.object({
        name: z.string(),
        company: z.string(),
        role: z.string(),
        status: z.string(),
        messages: z.array(z.string()),
      }),
    })),
    prompt: "Fill salesforce CRM based on Bob's sales activity (this is what appeared on his screen): " +
     data.map((frame) => frame.text).join("\n"),
  });

  // Add to Salesforce API ...
}
```

-->

## Example vercel/ai-chatbot that query screenpipe autonomously

Check this example of screenpipe which is a chatbot that make requests to your data to answer your questions

https://github.com/louis030195/screen-pipe/assets/25003283/6a0d16f6-15fa-4b02-b3fe-f34479fdc45e

## Status 

Alpha: runs on my computer (`Macbook pro m3 32 GB ram`). Uses 2x less energy than `Rewind.ai`

- [x] screenshots
- [x] mp4 encoding to disk (30 GB / month)
- [x] sqlite local db
- [x] OCR
- [x] audio + stt
- [x] api
- [ ] TS SDK
- [ ] cloud storage options (s3, pqsql, etc.)
- [ ] cloud computing options
- [ ] fast, optimised
- [ ] bug-free 

## Usage

Keep in mind that it's still experimental.

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
# if you are on mac, use "cargo build --release --features metal" to leverage M series acceleration
cargo build --release
./target/release/pipe


# or only stream audio + speech to text to stdout
./target/release/pipe-audio

# or only stream screenshots + ocr to stdout
./target/release/pipe-vision

# or only record mp4 videos + json containing ocr
./target/release/pipe-video
```

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

# 5. Get recent results without date range
curl "http://localhost:3030/recent?limit=5&offset=0"

# 6. Get recent results with date range
curl "http://localhost:3030/recent?limit=5&offset=0&start_date=2024-07-02T14:00:00&end_date=2024-07-02T23:59:59"

# 5 s ago
start_date=$(date -u -v-5S +'%Y-%m-%dT%H:%M:%S')
end_date=$(date -u +'%Y-%m-%dT%H:%M:%S')
curl "http://localhost:3030/recent?limit=5&offset=0&start_date=$start_date&end_date=$end_date"

# 6. Search with no query (should return all results)
curl "http://localhost:3030/search?limit=5&offset=0"

# 7. Get recent results with pagination
curl "http://localhost:3030/recent?limit=20&offset=40"
  ```
</details>

Now pipe this into a LLM to build:
- memory extension apps
- automatic summaries
- automatic action triggers (say every time you see a dog, send a tweet)
- automatic CRM (fill salesforce while you spam ppl on linkedin)

Struggle to get it running? [I'll install it with you in a 15 min call.](https://cal.com/louis030195/screenpipe)

We are working toward [making it easier to try](https://github.com/louis030195/screen-pipe/issues/6), feel free to help!

[Check example with vercel/ai-chatbot project (nextjs)](https://github.com/louis030195/screen-pipe/tree/main/examples/ts/vercel-ai-chatbot)


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

Where is the data stored?

- 100% of the data stay local in a SQLite database and mp4 files
- if you use an LLM like OpenAI, part of your data will be sent to Microsoft servers, you can use a local LLM like [Chrome AI](https://sdk.vercel.ai/providers/community-providers/chrome-ai)

