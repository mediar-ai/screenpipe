
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

Alpha: runs on my computer (`Macbook pro m3 32 GB ram`). Capture things and do things.

## Usage

Keep in mind that it's still experimental but got a working prototype, see the [Related projects](#related-projects) section.

To try the current version, which capture your screen, extract the text, and do some LLM magic, run:

```bash
git clone https://github.com/louis030195/screen-pipe
cd screen-pipe
```

Then, in one terminal run the OCR API [(just a temporary hack until something cleaner)](https://github.com/louis030195/screen-pipe/issues/7):

```bash
virtualenv env
source env/bin/activate
pip install fastapi uvicorn pytesseract pillow
uvicorn main:app --reload
```

In another terminal run [ollama](https://github.com/ollama/ollama):

```bash
ollama run llama3
```

And (you need Rust + Cargo installed) the Rust CLI:

```bash
cargo install --path screenpipe
screenpipe
```

Check the `target/screenshots` directory now :)

<details>
  <summary>Sample file</summary>

  Basically ends up with bunch of image + JSON pairs with the OCR:
  
  ```json
{"text":"{\"text\":\"e P& screen-pipe Ow 33\\nOo Pe Av @ Cargo.toml M ® main.rs MX {} ® main.py 1, U cay\\n\\\\Y OPEN EDITORS screenpipe > src > ® main.rs > @ process_image\\n© Cargo.tom! screenpipe M async fn call_ocr_api(image_path: &str) — Result<String, reqwest::Error> {\\nX ® main.rs screenpipe/src M let text = response.text().await?;\\n{} Ok( text)\\n@ main.py 1,U }\\n\\\\ SCREEN-PIPE\\n> __pycache_ async fn process_image(filename: String) {\\n> .github // Example async post-processing function\\n> cy // Perform tasks like extracting text or making API calls here\\nMrecicervine println!(\\\"Processing image asynchronously: {}\\\", filename);\\nv ste // Simulate async work Lr\\n. j // tokio:: time :: sleep(Duration:: from_secs(1)).await;\\n® main.rs M y , . .\\n. y let text = call_ocr_api( &filename).await.unwrap();\\ny println!(\\\"OCR result: {}\\\", text);\\n80,\\n Cargo.toml M y // Create a JSON object\\n¥ y let json = serde_json::json!({ \\\"text\\\": text });\\n> y let new_filename = filename.replace( \\\"\\\\png\\\", \\\",json\\\");\\n> y let mut file = File::create( new_filename).unwrap();\\n> y file.write_all( json.to_string().as_bytes()).unwrap();\\n>  ¥\\n>\\n> fn screenpipe(path: &Sstr, interval: f32, running: Arc<AtomicBool>) {\\n{} // delete and recreate the directory\\nPROBLEMS 9 OUTPUT DEBUGCONSOLE TERMINAL PORTS tu we A xX\\n® .gitignore Found 1 monitors | (9 screenpipe A\\nScreenshots will be saved to target/screenshots =\\nInterval: @ seconds (g bash A\\n Cargo.toml Press Ctrl+C to stop I @ Python A\\n® Cross.toml\\n$ install.sh TN TN TN TN JN /_/\\\\ TIN TN TW\\nf{ LICENSE.md J f:/_ / /:/ VEEN J f:/_ J f:/_ \\\\OA\\\\:\\\\ J /::\\\\ 1 IN I PS I Pl.\\nnr . ar wn ee a eee ee ee ee VAN J L:1\\\\:\\\\1 131 J 1:1\\\\:\\\\7_ 1:7 /N\\n> CET PS? 11U 1 i ee ee ee ee ee A 9 hod? ee ee 9 ey ee 2 —--\\\\--\\\\:\\\\ J f:/~1:1__12\\\\ ee shed et ee\\n@ README.md 7 Aa AY ee ee A 9 a ® ®  ® a  ® \\\\ JA 1 121N\\\\_NIN?\\\\_S S31 121131 1:1 /N\\nNONE /e7N ONIN ZN NM ttt NEE NO NAA IN \\\\i\\\\ee\\\\e\\\\/ \\\\A\\\\HW:/ NONE AINA 27\\nNONE 722 NNN LSD NX Nit/eere NONE DD NONE Lt NONI ee \\\\ \\\\is/ \\\\Ne/\\\\ N\\\\esZ NO NitZ /:/\\nVW Jf NNN NNN VON: NONE NNN \\\\O\\\\N\\\\ J_S:/ \\\\ \\\\:\\\\ XN NINA:/\\n/_/:/ \\\\ \\\\is/ VAN \\\\ \\\\is/ \\\\ \\\\sa/ \\\\O\\\\N\\\\ \\\\O\\\\N\\\\ \\\\_V \\\\ Vt \\\\ \\\\s2/\\n\\\\__V \\\\__V \\\\__V \\\\__V \\\\__V \\\\__V \\\\__V \\\\__V \\\\__V\\n* Update Cursor? I\\n> BRILLIANT Ai. .--.-. --- eee eee\\n\\n& mains 2 @©®1A1@7_ rust-analyzer Ln80,Col1 Rust Copilot++ &\\n\"}"}
  ```

And the idea is to feed this to an LLM that do rest of the work
</details>



https://github.com/louis030195/screen-pipe/assets/25003283/bdce0793-3db4-4233-a276-65c3e4f8a333


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
