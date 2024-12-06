## pipe-email-exa-search

email exa search analyzes your daily screen activity, extracts your interests, and uses exa.ai to find relevant content. it then emails you a curated list of 25 top results, keeping you informed about topics that matter to you.

easily discover new content related to your daily interests and stay up-to-date with minimal effort.

warning: there is potential for data leak to exa ai

#### quick setup
1. run ollama:
   ```
   ollama run llama3.2:3b-instruct-q4_K_M
   ```
2. [create app specific password](https://support.google.com/accounts/answer/185833?hl=en) in your google account that will be used to send yourself emails
3. [get exa.ai API key](https://exa.ai/)
4. configure pipe in the app ui, save, enable, restart screenpipe recording

#### advanced
tech details? check `pipe.ts`.
can be used through CLI also, you can tweak the `pipe.json` to your needs, mine looks like this:

```json
{
  "fields": [
    {
      "name": "emailTime",
      "type": "time",
      "default": "22:00",
      "description": "Time to send daily summary email"
    },
    {
      "name": "emailAddress",
      "type": "string",
      "default": "",
      "description": "Email address to send the daily summary to",
      "value": "your.email@example.com"
    },
    {
      "name": "emailPassword",
      "type": "string",
      "default": "",
      "description": "App specific password for your gmail account, https://support.google.com/accounts/answer/185833?hl=en",
      "value": "your-app-specific-password"
    },
    {
      "name": "exaApiKey",
      "type": "string",
      "default": "",
      "description": "Exa Api key, you can get one for free at https://exa.ai/",
      "value": "your-exa-api-key"
    },
    {
      "name": "ollamaApiUrl",
      "type": "string",
      "default": "http://localhost:11434/api",
      "description": "AI API URL, can be ollama, openai, any openai compatible API, risky to use cloud providers due to high usage"
    },
    {
      "name": "ollamaModel",
      "type": "string",
      "default": "llama3.2:3b-instruct-q4_K_M",
      "description": "AI Model"
    },
    {
      "name": "pageSize",
      "type": "number",
      "default": 100,
      "description": "Number of records to retrieve from screenpipe per page for structured extraction, keep in mind LLMs have a context window limit. Increase this value if using audio."
    },
    {
      "name": "topicQueryCount",
      "type" : "number",
      "default" : 10,
      "description" : "Number of random pages to pull from screenpipe for sub-summarization. The total records used will be pageSize times topicQueryCount"
    },
    {
      "name": "windowName",
      "type": "window",
      "default": "",
      "description": "Specific window name to filter the screen data, for example 'gmail', 'john', 'slack', 'myCodeFile.tsx', etc. this will filter out audio"
    },
    {
      "name": "contentType",
      "type": "contentType",
      "default": "ocr",
      "description": "Type of content to analyze: 'ocr', 'audio', or 'all'. OCR usually contains more content, so it's recommended to choose either OCR or audio rather than 'all' for better performance."
    }
  ],
  "source": "https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-email-exa-search",
  "enabled": true
}
