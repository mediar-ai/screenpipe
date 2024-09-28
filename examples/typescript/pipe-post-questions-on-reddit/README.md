### pipe-post-questions-on-reddit
GPT-4o (or local model) looks at your screen 24/7 and sends you emails with questions to post on Reddit based on your activity.



https://github.com/user-attachments/assets/289d1809-6855-4336-807f-dd9ee7181324



#### quick setup
1. [Get an OpenAI API key](https://platform.openai.com/account/api-keys)
2. [Create an app-specific password](https://support.google.com/accounts/answer/185833?hl=en) in your Google account that will be used to send yourself emails
3. Configure pipe in the app UI, save, enable, and restart screenpipe recording (you can configure to either receive an email daily or several every x hours)


#### Advanced
tech details? check `pipe.ts`.
can be used through CLI also, you can tweak the `pipe.json` to your needs, mine looks like this:

```json
{
  "fields": [
    {
      "name": "interval",
      "type": "number",
      "default": 60,
      "description": "Interval in seconds to read your screen data and extract structured logs (will be used to summarize and send an email). Increase this value if using audio."
    },
    {
      "name": "summaryFrequency",
      "type": "string",
      "default": "daily",
      "description": "Frequency of summary emails: 'daily' for once a day at emailTime, or 'hourly:X' for every X hours (e.g., 'hourly:4' for every 4 hours)",
      "value": "hourly:1"
    },
    {
      "name": "emailTime",
      "type": "time",
      "default": "11:00",
      "description": "Time to send daily summary email (used only if summaryFrequency is 'daily')"
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
      "name": "gptApiUrl",
      "type": "string",
      "default": "https://api.openai.com/v1/chat/completions",
      "description": "GPT API URL"
    },
    {
      "name": "gptModel",
      "type": "string",
      "default": "gpt-4",
      "description": "GPT Model"
    },
    {
      "name": "openai_api_key",
      "type": "string",
      "default": "",
      "description": "Your OpenAI API key",
      "value": "your-openai-api-key"
    },
    {
      "name": "pageSize",
      "type": "number",
      "default": 100,
      "description": "Number of records to retrieve from screenpipe per page for structured extraction, keep in mind LLMs have a context window limit. Increase this value if using audio."
    },
    {
      "name": "customPrompt",
      "type": "string",
      "default": "You are an AI assistant tasked with extracting structured information from screen data (OCR). Analyze the following screen data and extract relevant information about my daily activity.",
      "description": "Custom prompt for the AI assistant that will be used to extract information from the screen data every few minutes"
    },
    {
      "name": "summaryPrompt",
      "type": "string",
      "default": "You are an AI assistant tasked with summarizing information that has previously been extracted from screen data (OCR) by another AI assistant. Analyze the following structured data extracted from my screen data and summarize my daily activity, this will be send as a mail to my email address.",
      "description": "Summary prompt for the AI assistant that will be used to summarize the logs previously extracted and send a mail"
    },
    {
      "name": "windowName",
      "type": "window",
      "default": "",
      "description": "Specific window name to filter the screen data, for example 'gmail', 'john', 'slack', 'myCodeFile.tsx', etc. this will filter out audio",
      "value": "reddit"
    },
    {
      "name": "contentType",
      "type": "contentType",
      "default": "ocr",
      "description": "Type of content to analyze: 'ocr', 'audio', or 'all'. OCR usually contains more content, so it's recommended to choose either OCR or audio rather than 'all' for better performance."
    }
  ],
  "source": "https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-post-questions-on-reddit",
  "enabled": true
}
```
