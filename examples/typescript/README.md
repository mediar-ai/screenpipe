# screenpipe examples

screenpipe exposes an API & write mp4 files which allow millions of potential extensions. Keep in mind vision & audition are the most powerful senses of humans and contains all the information necessary for AI use cases.

The API is a high level abstraction you can use to extend & augment screenpipe.

This folder contains various examples demonstrating the usage of screenpipe in different scenarios. The examples are categorized into two types:

1. **Pipes**: These are plugins with native integration with screenpipe. They can run within the CLI/lib/app without the need for manual execution.

2. **Standalone Scripts**: These are independent scripts that need to be run separately and may require additional setup.

Below is a table of the available examples:

| **example**                          | **description**                                  | **link**                          |
| ------------------------------------ | ------------------------------------------------ | --------------------------------- |
| **pipe email daily log**             | send daily activity logs via email               | [link](https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-email-daily-log)                         |
| **pipe screen to crm**               | integrate screen data with crm systems           | [link](https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-screen-to-crm)                         |
| **pipe phi3.5 engineering team logs**| generate engineering team work logs              | [link](https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-phi3.5-engineering-team-logs)                         |
| **pipe stream ocr text**             | stream ocr text from screen data                 | [link](https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-stream-ocr-text)                         |
| **pipe activity topic tracker**      | track and summarize activities                   | [link](https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-activity-topic-tracker)                         |
| **pipe focus notification buddy**    | help you stay focused                            | [link](https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-focus-notification-buddy)                         |
| **pipe security check**              | notify user if detected any suspicious activity  | [link](https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-security-check)                         |
| **pipe sync meetings to notion**     | sync meeting transcriptions & summaries to notion| [link](https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-sync-meetings-to-notion)                        |
| **pipe tagging activity**            | automatically tag activities using ai            | [link](https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-tagging-activity)                         |

Each example folder contains its own README with specific instructions on how to set up and run the example.

We recommend you to use pipes instead of standalone scripts as they are easier to develop and maintain and more aligned with the screenpipe infrastructure.

## Getting Started

To run any of these examples:

1. For Pipes:
   - Install the pipe through the screenpipe app or CLI
   - Follow the specific instructions in the pipe's README

For example:

```bash
screenpipe pipe download https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-stream-ocr-text
screenpipe pipe enable pipe-stream-ocr-text
screenpipe
```

2. For Standalone Scripts:
   - Navigate to the specific example folder
   - Install dependencies (usually with `pnpm install` or `npm install`)
   - Set up any required environment variables (check the example's README)
   - Run the example using the provided commands in the example's README

## Contributing

If you have an idea for a new example or want to improve an existing one, feel free to open an issue or submit a pull request!

We're also eager to include your pipes in the store that you can monetize or offer for free!

