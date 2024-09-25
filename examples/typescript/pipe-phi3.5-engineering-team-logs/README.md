### phi3.5 engineering team logs

automates logging of engineering work to notion using screenpipe and phi3.5 ai.

#### quick setup

1. install stuff:
   ```
   npm install -g screenpipe
   git clone https://github.com/jmorganca/ollama
   cd ollama && ./scripts/install.sh
   ```

2. run ollama:
   ```
   ollama run phi3.5:3.8b-mini-instruct-q4_K_M
   ```

3. set up notion:
   - create integration: https://www.notion.so/my-integrations (copy api key)
   - make database with: Title, Description (rich text), Tags (multi-select), Date
   - share database with your integration (click three dots, connections, your integration), open database in full screen mode, copy the database id e.g. https://www.notion.so/some-database-id?v=some-database-version-id

4. put the fields in the app ui, save, enable, restart screenpipe recording

boom! it'll log your work to notion every minute.

wanna tweak it? check `pipe.ts` to change frequency or adjust the ai prompt.


