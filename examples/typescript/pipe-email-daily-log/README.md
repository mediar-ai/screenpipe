### pipe-email-daily-log

<img width="988" alt="Screenshot 2024-09-25 at 17 56 00" src="https://github.com/user-attachments/assets/f9d604af-b098-4f93-b923-b2fc455a6172">



https://github.com/user-attachments/assets/a81963c9-54ee-4587-aac1-2eba0df4a5fc



llama3.2 looks at your screen 24/7 and send you emails summarizing your activity or action items (e.g. follow up on this lead, or anything, you can customise the prompt and windows/tabs/apps being used as prompt)

#### quick setup

1. run ollama:
   ```
   ollama run phi3.5:3.8b-mini-instruct-q4_K_M
   ```

2. [create app specific password](https://support.google.com/accounts/answer/185833?hl=en) in your google account that will be used to send yourself emails

3. configure pipe in the app ui, save, enable, restart screenpipe recording (you can config to either receive a mail a day or several every x hours)

<img width="1312" alt="Screenshot 2024-09-25 at 18 16 54" src="https://github.com/user-attachments/assets/9669b2f1-c67d-4055-9e03-067c67fb51f8">

boom!

wanna tweak it? check `pipe.ts`.

can be used through CLI also, you can tweak the `pipe.json` to your needs, mine looks like this:

```json
{
  "fields": [
    {
      "name": "interval",
      "type": "number",
      "default": 60,
      "description": "Interval in seconds to read your screen data"
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
      "default": "<fill your email address here>",
      "description": "Email Address",
      "value": "louis@screenpi.pe"
    },
    {
      "name": "emailPassword",
      "type": "string",
      "default": "<fill your email password here>",
      "description": "Email Password https://support.google.com/accounts/answer/185833?hl=en",
      "value": "mypassword"
    },
    {
      "name": "ollamaApiUrl",
      "type": "string",
      "default": "http://localhost:11434/api",
      "description": "Ollama API URL"
    },
    {
      "name": "ollamaModel",
      "type": "string",
      "default": "llama3.2:3b-instruct-q4_K_M",
      "description": "Ollama Model"
    },
    {
      "name": "pageSize",
      "type": "number",
      "default": 100,
      "description": "Number of records to retrieve from screenpipe per page, keep in mind LLMs have a context window limit"
    },
    {
      "name": "customPrompt",
      "type": "string",
      "default": "You are an AI assistant tasked with extracting structured information from screen data (OCR). Analyze the following screen data and extract relevant information about my daily activity.",
      "description": "Custom prompt for the AI assistant"
    },
    {
      "name": "summaryPrompt",
      "type": "string",
      "default": "You are an AI assistant tasked with summarizing information that has previously been extracted from screen data (OCR) by another AI assistant. Analyze the following structured data extracted from my screen data and summarize my daily activity, this will be send as a mail to my email address.",
      "description": "Summary prompt for the AI assistant"
    },
    {
      "name": "windowName",
      "type": "window",
      "default": "",
      "description": "Specific window name to filter the screen data, for example 'gmail', 'john', 'slack', 'myCodeFile.tsx', etc.",
      "value": "matt"
    }
  ],
  "source": "https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-email-daily-log",
  "enabled": true
}
```
