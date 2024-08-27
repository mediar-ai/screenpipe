
in screenpipe we have a plugin system called "pipe store" or "pipes"

think of it like this:

📺🎙️ | AI tag | notion update

or 

📺🎙️ | AI tag | slack send report

or 

📺🎙️ | fill salesforce

or 

📺🎙️ | logs daily

basically it would read, process, annotate, analyse, summarize, send, your data customisable to your desire, effortlessly

### pipe-tagging-activity

this is an experimental, but official pipe, that will use ollama + phi3.5 to annotate your screen data (only OCR) every 1 min 

soon we'll make is easier to search through these annotations / tags but in the meantime you can you use to enrich your data

and AI will be able to provide you more relevant answers

this is how you run it through the app:

```bash
ollama run phi3.5
```

click "install"

wait a few minutes then ask AI "read my data from last 5 minutes and list tags you see"


### dev mode

if you're in dev mode you can run the cli like this:

```bash
screenpipe --pipe https://github.com/mediar-ai/screenpipe/edit/main/examples/typescript/pipe-tagging-activity/main.js
```

or dev your own pipe:

```bash
screenpipe --pipe myPipe.js
```

please look the code, it's 99% normal JS but there are limitations currently:
- you cannot use dependencies (yet)
- untested with typescript (but will make pipes TS first soon)

i recommend you copy paste the current main.js file into AI and ask some changes for whatever you want to do, make sure to run an infinite loop also

### what's next for pipes

- use dependencies (like vercel/ai so cool)
- TS
- acess to screenpipe desktop api (e.g. trigger notifications, customise what cursor-like @ are in the chat, etc.)
- easier to publish your pipes (like obsidian store)
- everything frictionless, effortless, and maximize the value you get out of screenpipe













