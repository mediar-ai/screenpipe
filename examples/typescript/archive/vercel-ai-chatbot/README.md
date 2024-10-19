# Chat with your screen time history

![Demo](./public/demo.gif)


## Getting Started

First, add your OpenAI API key to `.env` file:

```
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Then, run the development server:

```bash
npm install
```


```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the logic by modifying `lib/chat/actions.tsx`- a tool to call screenpipe api


this example is based on https://github.com/vercel/ai-chatbot 