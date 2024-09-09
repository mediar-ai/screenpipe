![Screenpipe Pipe Store json](https://github.com/user-attachments/assets/6c074beb-5b0f-4829-8a07-52805a78e80c)

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

### pipe-activity-topic-tracker

this is an experimental, but official pipe, that will use ollama + phi3.5 to track your activities and generate summaries every 1 min 

soon we'll make it easier to search through these summaries but in the meantime you can use it to enrich your data

and AI will be able to provide you more relevant answers about your activities

this is how you run it through the app:

```bash
ollama run phi3.5
```

add the url of this pipe in the input and click "add" and install

`https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-activity-topic-tracker`

wait a few minutes then look at the json file
