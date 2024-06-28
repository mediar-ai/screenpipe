
<p align="center">
    <br>
       <img src="https://github.com/louis030195/screen-pipe/assets/25003283/289bbee7-79bb-4251-9516-878a1c40dcd0" width="200"/>
    <br>
<p>
<p align="center">
    <a href="https://github.com/louis030195/screen-pipe/blob/main/LICENSE"><img alt="GitHub" src="https://img.shields.io/github/license/huggingface/datasets.svg?color=blue"></a>
    <a href="https://discord.gg/dU9EBuw7Uq"><img alt="Join us on Discord" src="https://img.shields.io/discord/823813159592001537?color=5865F2&logo=discord&logoColor=white"></a>
    <a href="https://twitter.com/screen_pipe"><img alt="X account" src="https://img.shields.io/twitter/url/https/twitter.com/diffuserslib.svg?style=social&label=Follow%20%40screen_pipe"></a>
</p>

Turn your screen into actions (using LLMs). Inspired by `adept.ai`, `rewind.ai`, `Apple Shortcut`. Rust + WASM.

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

## Status 

Alpha: runs on my computer (`Macbook pro m3 32 GB ram`). Record your screen 24/7 into mp4 and extract the text from every frame.

## Usage

Keep in mind that it's still experimental.

To try the current version, which capture your screen and extract the text, do:

1. Install [ffmpeg](https://www.ffmpeg.org/download.html).
2. Clone the repo:

```bash
git clone https://github.com/louis030195/screen-pipe
cd screen-pipe/screenpipe
```

3. Run the API (make sure to install [Rust](https://www.rust-lang.org/tools/install)):

```bash
cargo run
```

Get today's context (all the text you've seen):

```bash
curl "http://localhost:3030/texts?date=$(date +%Y-%m-%d%%20%H:%M:%S)"
```

Or search for a specific text:

```bash
curl "http://localhost:3030/frames?limit=10&offset=0&search='louis'"
```

Now pipe this into a LLM to build:
- memory extension apps
- automatic summaries
- automatic action triggers (say every time you see a dog, send a tweet)
- automatic CRM (fill salesforce while you spam ppl on linkedin)

We are working toward [making it easier to try](https://github.com/louis030195/screen-pipe/issues/6), feel free to help!


https://github.com/louis030195/screen-pipe/assets/25003283/9a26469f-5bd0-4905-ad6a-c52ef912c235


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

## Licensing

The code in this project is licensed under MIT license. See the [LICENSE](LICENSE.md) file for more information.

## Related projects

This is a very quick & dirty example of the end goal that works in a few lines of python:
https://github.com/louis030195/screen-to-crm

Very thankful for https://github.com/jasonjmcghee/xrem which was helpful. Although screenpipe is going in a different direction.
