### pipe-screen-time-storyteller


<img width="1512" alt="Screenshot 2024-10-15 at 15 11 00" src="https://github.com/user-attachments/assets/07851108-1f04-404b-908e-62a360d95852">

screen time storyteller uses AI to generate engaging, personalized narratives based on your daily screen activities. it analyzes your device usage data to create a fun, slightly sassy diary entry, complete with insights and advice for better digital habits.

easily track your screen time habits, gain insights, and improve your digital wellbeing.

#### quick setup
1. [get an API key for your chosen AI provider (Claude or OpenAI)](https://platform.openai.com/account/api-keys)
2. [create a GitHub personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) for creating gists
3. configure pipe in the app UI, save, enable, and restart screenpipe recording (you can configure to generate summaries every hour)

#### advanced
tech details? check `pipe.ts`.
can be used through CLI also, you can tweak the `pipe.json` to your needs, mine looks like this:

```json
{
  "name": "Screen Time Storyteller",
  "version": "0.1.0",
  "description": "Generates a narrative summary of your screen time data",
  "author": "David Anyatonwu",
  "fields": [
    {
      "name": "aiProvider",
      "type": "string",
      "default": "claude",
      "description": "AI provider to use (ollama, openai, or claude)",
      "value": "claude"
    },
    {
      "name": "claudeModel",
      "type": "string",
      "default": "claude-3-sonnet-20240229",
      "description": "Claude AI model to use"
    },
    {
      "name": "openaiModel",
      "type": "string",
      "default": "gpt-4-turbo-preview",
      "description": "OpenAI model to use"
    },
    {
      "name": "ollamaModel",
      "type": "string",
      "default": "llama3.1",
      "description": "Ollama model to use"
    },
    {
      "name": "claudeApiKey",
      "type": "string",
      "default": "",
      "description": "API key for Claude",
      "value": "your-claude-api-key"
    },
    {
      "name": "openaiApiKey",
      "type": "string",
      "default": "",
      "description": "API key for OpenAI"
    },
    {
      "name": "pageSize",
      "type": "number",
      "default": 1000,
      "description": "Number of items to process per page"
    },
    {
      "name": "contentType",
      "type": "string",
      "default": "ocr",
      "description": "Type of content to process (ocr, audio, or all)"
    },
    {
      "name": "githubToken",
      "type": "string",
      "default": "",
      "description": "GitHub personal access token",
      "value": "your-github-personal-access-token"
    }
  ],
  "source": "https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-screen-time-storyteller",
  "enabled": true
}
```

#### usage
the screen time storyteller pipe will run automatically as part of your screenpipe workflow. it generates a narrative summary every hour based on your screen activities from the past 24 hours.

you can find the generated summaries in two places:
1. a JSON file in the `.screenpipe/pipes/screen-time-storyteller/` directory, named with the current date (e.g., `2024-10-06-narrative-summary.json`).
2. a GitHub gist, which you can access through your GitHub account.

#### troubleshooting
if you encounter any issues:
1. check screenpipe's logs for any error messages related to the screen time storyteller pipe.
2. ensure your API keys and GitHub token are correct and have the necessary permissions.
3. verify that the pipe's directory is in the correct location within your screenpipe installation.

#### contributing
contributions are welcome! please feel free to submit a pull request to the screenpipe repository.

#### license
this project is licensed under the same license as screenpipe - see the [LICENSE](LICENSE) file in the screenpipe repository for details.

#### acknowledgments
- thanks to the screenpipe team for providing the underlying screen time tracking functionality.
- powered by AI models from anthropic, openai, and ollama.

