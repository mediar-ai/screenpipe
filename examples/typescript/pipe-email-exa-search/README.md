## pipe-email-exa-search

### Overview
1. Pulls random sections of screenpipe text results from the previous day
2. Tries to pull user interests from each section
3. Combines user interests across the sections to create an exa search query
4. Uses Exa.ai to search for relevant content to the user's screen
5. Emails the top 25 results to the user at the predetermined time each day

Warning: There is potential for data leak to Exa AI

#### quick setup

1. run ollama:
   ```
   ollama run llama3.2:3b-instruct-q4_K_M
   ```
2. [create app specific password](https://support.google.com/accounts/answer/185833?hl=en) in your google account that will be used to send yourself emails
3. [Get Exa.ai API key](https://exa.ai/)
4. configure pipe in the app ui, save, enable, restart screenpipe recording


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
      "description": "Email address to send the daily summary to"
    },
    {
      "name": "emailPassword",
      "type": "string",
      "default": "",
      "description": "App specific password for your gmail account, https://support.google.com/accounts/answer/185833?hl=en"
    },
    {
      "name": "exaApiKey",
      "type": "string",
      "default": "",
      "description": "Exa Api key, you can get one for free at https://exa.ai/"
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
  ]
}
```
