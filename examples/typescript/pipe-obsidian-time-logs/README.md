### obsidian time log

![image](https://github.com/user-attachments/assets/8bf4e730-ec5e-4e6b-9660-09c982db574a)

automates logging of work to obsidian using screenpipe and openai/ollama

#### quick setup

1. install screenpipe and git clone this repo
    ```
    git clone https://github.com/mediar-ai/screenpipe.git
    cd screenpipe
    ```

2. set up AI provider:
   Option 1 - OpenAI:
   - Set gptModel (e.g. "gpt-4o") and openaiApiKey in pipe.json
   
   Option 2 - Ollama (default):
   - Install Ollama: follow instructions at https://github.com/jmorganca/ollama
   - Run `ollama run llama3.2:3b-instruct-q4_K_M`
   - Optionally customize ollamaApiUrl and ollamaModel in pipe.json

3. set up obsidian:
   - create a folder in your obsidian vault for time entries
   - set obsidianPath in pipe.json to your obsidian vault time entries folder path

4. optionally customize other settings in pipe.json:
   - interval: how often to check for new entries
   - customPrompt: customize the AI prompt
   - pageSize: number of screen records to process

5. run the pipe:
   ```
   screenpipe pipe download ./examples/typescript/pipe-obsidian-time-logs
   screenpipe pipe enable pipe-obsidian-time-logs
   screenpipe
   ```

The pipe will:
- Monitor your screen activity at the configured interval
- Generate engineering log entries using OpenAI or Ollama
- Save entries to daily markdown files in your obsidian vault
- Each day's entries will be saved in YYYY-MM-DD.md format
- Entries are formatted as markdown tables with Title, Description, Tags, and Time Spent
- New entries are appended to existing daily files
