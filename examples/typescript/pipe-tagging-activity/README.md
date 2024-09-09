
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


### tech details

we run deno runtime (a JS/TS engine) within the rust code, which host your pipes, its 99.9% similar to normal JS code
