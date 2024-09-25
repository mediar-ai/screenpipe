### phi3.5 engineering team logs

![Rocks screenshot (56)](https://github.com/user-attachments/assets/9838f8ac-696d-43fc-b269-d3f40f16a76f)


automates logging of engineering work to notion using screenpipe and phi3.5 ai.

#### quick setup

1. run ollama:
   ```
   ollama run phi3.5:3.8b-mini-instruct-q4_K_M
   ```

2. set up notion:
   - create integration: https://www.notion.so/my-integrations (copy api key)
   - make database with: Title, Description (rich text), Tags (multi-select), Date
   - share database with your integration (click three dots, connections, your integration), open database in full screen mode, copy the database id e.g. https://www.notion.so/some-database-id?v=some-database-version-id

3. configure pipe in the app ui, save, enable, restart screenpipe recording

<img width="1312" alt="Screenshot 2024-09-25 at 10 28 38" src="https://github.com/user-attachments/assets/08c79b70-dc85-45e8-bc59-eec6c7d58422">

boom! it'll log your work to notion every minute.

wanna tweak it? check `pipe.ts` to change frequency or adjust the ai prompt.

(can be used through CLI also)
