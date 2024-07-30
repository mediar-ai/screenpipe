


this is quite experimental but a good start if you want to build a daily log of your day

the output could be like this:

```md
### 073024 - 9.05 AM - 9.10 AM - Inbox 0 (emails)
- 2 min: Answer to John
- 3 min: Checked & scrolled spam folder
```

feel free to prompt engineer, works with ollama, openai.

openai works better obviously

make sure to keep the prompt not too big for the LLM (time interval 1-5 min)

### usage

```
pnpm i # or npm i
export OPENAI_API_KEY="<your key>"
# or modify the code to use llama3.1 through ollama (just two lines to uncomment & comment)
npx tsx main.ts
```

