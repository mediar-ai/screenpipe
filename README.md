
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

## On your computer
To start capturing screen data and send it to a specific storage location such as Amazon S3, use the following command line interface (CLI) command:

```bash
screenpipe --path ./second-memory
```


https://github.com/louis030195/screen-pipe/assets/25003283/08a8c9d6-0be6-44c2-b37f-62d0721fe8c3



## Status 

Alpha: runs on my computer. Capture things and do things.

## Installation

To install ScreenPipe, run the following command in your terminal:

```bash
git clone https://github.com/louis030195/screen-pipe
cargo install --path screenpipe
# test
screenpipe --path ./second-memory
```

## Why open source?

Recent breakthroughs in AI have shown that context is the final frontier. AI will soon be able to incorporate the context of an entire human life into its 'prompt', and the technologies that enable this kind of personalisation should be available to all developers to accelerate access to the next stage of our evolution.  

## Contributing

Contributions are welcome! If you'd like to contribute, please fork the repository and use a feature branch. Pull requests are warmly welcome.

Say 👋 in our [public Discord channel](https://discord.gg/dU9EBuw7Uq) . We discuss how to bring this lib to production, help each other with contributions, personal projects or just hang out ☕.

## Licensing

The code in this project is licensed under MIT license. See the [LICENSE](LICENSE.md) file for more information.

## Related projects

https://github.com/louis030195/screen-to-crm
