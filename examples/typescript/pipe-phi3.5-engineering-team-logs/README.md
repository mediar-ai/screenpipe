### phi3.5 engineering team logs

this pipe automates logging of engineering work to notion using screenpipe and phi3.5 ai.

#### setup

1. install screenpipe and git clone this repo
    ```
    git clone https://github.com/mediar-ai/screenpipe.git
    cd screenpipe
    ```

2. install and run ollama:
   - follow instructions at https://github.com/jmorganca/ollama
   - run `ollama run phi3.5`

3. set up notion:
   - create a notion integration: https://www.notion.so/my-integrations
   - create a database with properties: Title, Description (rich text), Tags (multi-select), Date
   - share database with your integration

4. set environment variables:
   ```
   export SCREENPIPE_NOTION_API_KEY=your_notion_api_key
   export SCREENPIPE_NOTION_DATABASE_ID=your_notion_database_id
   ```

5. run the pipe:
   ```
   screenpipe pipe download ./examples/typescript/pipe-phi3.5-engineering-team-logs
   screenpipe pipe enable phi3.5-engineering-team-logs
   screenpipe 
   ```

the pipe will run continuously, logging engineering work to your notion database every hour.

#### customization

- adjust `INTERVAL` in pipe.ts to change logging frequency
- modify the prompt to refine ai output
