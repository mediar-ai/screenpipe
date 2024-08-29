

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

### pipe-stream-ocr-text

this is an experimental, but official pipe, that will stream OCR text from your screen data every 1 min 

this is how you run it through the app:

add the url of this pipe in the input and click "add" and install

`https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-stream-ocr-text`

wait a few minutes then look at the markdown file

### tech details

we run deno runtime (a JS/TS engine) within the rust code, which host your pipes, its 99.9% similar to normal JS code

### dev mode

if you're in dev mode you can run the cli like this:

```bash
screenpipe --pipe https://github.com/mediar-ai/screenpipe/edit/main/examples/typescript/pipe-stream-ocr-text/main.js
```

or dev your own pipe:

```bash
screenpipe --pipe myPipe.js
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
