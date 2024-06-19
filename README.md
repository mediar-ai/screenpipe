# screen-pipe

## Overview
**ScreenPipe** is a versatile library designed to facilitate the piping of screen data—including frames, video, OCR text, and metadata—from multiple screens to a defined storage solution. Written in Rust and compiled to WebAssembly (WASM), it ensures high performance and cross-platform compatibility, making it suitable for use on macOS, Linux, Windows, and other platforms.

## Features
- **Multi-Screen Support**: Capture and aggregate data from multiple screens simultaneously.
- **Video Recording**: Record continuous or event-triggered screen activities.
- **OCR Capabilities**: Extract text from captured frames or videos for further analysis.
- **Metadata Extraction**: Collect and store metadata related to screen activities for enhanced insights.
- **Flexible Storage Options**: Configure storage on local drives, cloud storage, or custom solutions tailored to enterprise needs.
- **Cross-Platform**: Runs smoothly on various operating systems thanks to its Rust base and WASM compilation.

## Installation

To install ScreenPipe, run the following command in your terminal:

```bash
brew install screenpipe
# or
apt install screenpipe
```

## Usage

### On Computers
To start capturing screen data and send it to a specific storage location such as Amazon S3, use the following command line interface (CLI) command:

```bash
screenpipe --storage s3://yourbucket/path --screen 1
```

### On Server
Here's an example of server-side code written in TypeScript that takes the streamed data from ScreenPipe and uses a Large Language Model like OpenAI's to process text and images for analyzing sales conversations:

```typescript
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { OpenAI } from "openai";

const s3 = new S3Client({ region: "your-region" });
const openai = new OpenAI();

export async function onTick(bucket: string, key: string) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const data = await s3.send(command);

  const response = await openai.chat({
    model: "gpt4-o",
    prompt: "Fill salesforce CRM based on Bob's sales activity: " + data,
  });

  // Add to Salesforce API ...
}
```

## Documentation

For more detailed information about the API and advanced configurations, please refer to the [ScreenPipe Documentation](https://github.com/yourusername/screenpipe/docs).

## Contributing

Contributions are welcome! If you'd like to contribute, please fork the repository and use a feature branch. Pull requests are warmly welcome.

## Licensing

The code in this project is licensed under MIT license. See the [LICENSE](LICENSE.md) file for more information.


