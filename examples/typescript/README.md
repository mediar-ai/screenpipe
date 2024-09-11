# screenpipe examples

screenpipe exposes an API & write mp4 files which allow millions of potential extensions. Keep in mind vision & audition are the most powerful senses of humans and contains all the information necessary for AI use cases.

The API is a high level abstraction you can use to extend & augment screenpipe.

This folder contains various examples demonstrating the usage of screenpipe in different scenarios. The examples are categorized into two types:

1. **Pipes**: These are plugins with native integration with screenpipe. They can run within the CLI/lib/app without the need for manual execution.

2. **Standalone Scripts**: These are independent scripts that need to be run separately and may require additional setup.

Below is a table of the available examples:

| Example | Description | Type | Link |
|---------|-------------|------|------|
| TypeScript Pipe Tagging Activity | Automatically tag activities using AI | Pipe v1 | [Pipe Tagging Activity](./pipe-tagging-activity) |
| TypeScript Pipe Stream OCR Text | Stream OCR text from screen data | Pipe v2 | [Pipe Stream OCR Text](./pipe-stream-ocr-text) |
| TypeScript Pipe Activity Topic Tracker | Track and summarize activities | Pipe v1 | [Pipe Activity Topic Tracker](./pipe-activity-topic-tracker) |
| TypeScript Daily Log | A daily activity logger using screenpipe | Standalone Script | [Daily Log](./daily-log) |
| TypeScript Daily Tracker | An AI-powered daily activity tracker | Standalone Script | [Daily Tracker](./daily-tracker) |
| TypeScript RAG Over Your Life in Obsidian | Retrieval-Augmented Generation for personal knowledge management | Standalone Script | [RAG in Obsidian](./rag-over-your-life-in-obsidian) |
| TypeScript Meeting Summaries in Obsidian | Automated meeting summary generation for Obsidian | Standalone Script | [Meeting Summaries](./meeting-summaries-in-obsidian) |
| TypeScript Apple Shortcut | Integration with Apple Shortcuts | Standalone Script | [Apple Shortcut](./apple-shortcut) |
| TypeScript Agent Multi-Turn RAG | Multi-turn Retrieval-Augmented Generation agent | Standalone Script | [Agent Multi-Turn RAG](./agent-multi-turn-rag) |
| TypeScript Vercel AI Chatbot | AI-powered chatbot using Vercel AI SDK | Standalone Script | [Vercel AI Chatbot](./vercel-ai-chatbot) |
| TypeScript Perplexity-alike Asking Confirmation RAG Agent | A Perplexity-inspired RAG agent with user confirmation | Standalone Script | [Perplexity RAG Agent](./perplexity-alike-asking-confirmation-rag-agent) |

Each example folder contains its own README with specific instructions on how to set up and run the example.

## Getting Started

To run any of these examples:

1. For Pipes:
   - Install the pipe through the screenpipe app or CLI
   - Follow the specific instructions in the pipe's README

2. For Standalone Scripts:
   - Navigate to the specific example folder
   - Install dependencies (usually with `pnpm install` or `npm install`)
   - Set up any required environment variables (check the example's README)
   - Run the example using the provided commands in the example's README

## Contributing

If you have an idea for a new example or want to improve an existing one, feel free to open an issue or submit a pull request!

We're also eager to include your pipes in the store that you can monetize or offer for free!

