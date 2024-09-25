

![Rocks screenshot (1)](https://github.com/user-attachments/assets/be5f8df5-ebc8-422f-a059-e5055c7c601b)



https://github.com/user-attachments/assets/ee2ea7fa-d723-4f8e-9ed0-78241851b066



in screenpipe we have a plugin system called "pipe store" or "pipes"

think of it like this:

screenpipe data -> your pipe like "AI annotate" or "send to salesforce"

a more dev-friendly explanation:

screenpipe | AI tag | notion update

or 

screenpipe | AI tag | slack send report

or 

screenpipe | fill salesforce

or 

screenpipe | logs daily

basically it would read, process, annotate, analyse, summarize, send, your data customisable to your desire, effortlessly

### pipe-screen-to-crm

this is an experimental, that will fill with notion table CRM while you work 

instructions to run this pipe:

1. install screenpipe and git clone this repo
    ```
    git clone https://github.com/mediar-ai/screenpipe.git
    cd screenpipe
    ```

2. install and run ollama:
   - follow instructions at https://github.com/jmorganca/ollama
   - run `ollama run phi3.5:3.8b-mini-instruct-q4_K_M`

3. set up notion:
   - create a notion integration: https://www.notion.so/my-integrations - copy the API key
   - create a database with properties: Name (text), Company (text), Position (text), LinkedIn URL (url), Last Interaction (text), Potential Opportunity (text), Date (date)
   - share database with your integration - copy the database ID eg https://www.notion.so/<THIS>?<NOTTHIS>

4. set environment variables:
   ```
   export SCREENPIPE_NOTION_API_KEY=your_notion_api_key
   export SCREENPIPE_NOTION_DATABASE_ID=your_notion_database_id
   ```

5. run the pipe:
   ```
   screenpipe pipe download ./examples/typescript/pipe-screen-to-crm
   screenpipe pipe enable screen-to-crm
   screenpipe 
   ```

### tech details

we run deno runtime (a JS/TS engine) within the rust code, which host your pipes, its 99.9% similar to normal JS code

### dev mode

if you're in dev mode you can run the cli like this:

```bash
screenpipe pipe download https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-stream-ocr-text
screenpipe pipe enable pipe-stream-ocr-text
```

this would download the pipe in your local files and enable it

then you need to restart screenpipe backend

### get featured in the pipe store

<img width="1312" alt="Screenshot 2024-08-27 at 17 06 45" src="https://github.com/user-attachments/assets/b6856bf4-2cfd-4888-be11-ee7baae6b84b">

just ask @louis030195

### what's next for pipes

- use dependencies (like vercel/ai so cool)
- access to screenpipe desktop api (control your computer, embedded LLM, better UI feedback API, etc.)
- easier to publish your pipes (like obsidian store)
- everything frictionless, effortless, and maximize the value you get out of screenpipe
