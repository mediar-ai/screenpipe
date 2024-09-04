
https://github.com/user-attachments/assets/795dfd91-393a-4eef-a20b-5b2c35d594f9

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

### pipe-sync-meetings-to-notion

this is an experimental, but official pipe, that will sync your meetings to notion

this is how you run it through the app:


## Setup

1. create a notion integration:
   - go to https://www.notion.so/my-integrations
   - click "new integration"
   - give it a name (e.g., "screenpipe meeting sync")
   - select the workspace where you want to sync your meetings
   - click "submit" to create the integration

2. get your notion api key:
   - in the integration page, find the "internal integration token"
   - copy this token, you'll need it later

3. create a database in notion:
   - create a new page in notion
   - add a database to this page
   - add columns: title, date, transcription + optionally notion ai columns if you want
   - share this page with your integration (click three dots, connections, your integration)

4. get your notion database id:
   - open your database in notion
   - look at the url, it should look like: https://www.notion.so/yourworkspace/83c75a51b3bd4a)
   - the part after the last slash and before the ? is your database id

now, your meeting transcriptions will automatically sync to your notion database!


if you're in dev mode you can run the cli like this:

```bash
export SCREENPIPE_NOTION_API_KEY=secret_abcd
export SCREENPIPE_NOTION_DATABASE_ID=1234567890
screenpipe --pipe ./examples/typescript/pipe-sync-meetings-to-notion/main.js
```

please look at the code, it's 99% normal JS but there are limitations currently:
- you cannot use dependencies (yet)
- untested with typescript (but will make pipes TS first soon)

i recommend you copy paste the current main.js file into AI and ask some changes for whatever you want to do, make sure to run an infinite loop also

get featured in the pipe store:

<img width="1312" alt="Screenshot 2024-08-27 at 17 06 45" src="https://github.com/user-attachments/assets/b6856bf4-2cfd-4888-be11-ee7baae6b84b">

just ask @louis030195

### what's next for pipes

- use dependencies (like vercel/ai so cool)
- TS
- access to screenpipe desktop api (e.g. trigger notifications, customise what cursor-like @ are in the chat, etc.)
- easier to publish your pipes (like obsidian store)
- everything frictionless, effortless, and maximize the value you get out of screenpipe
