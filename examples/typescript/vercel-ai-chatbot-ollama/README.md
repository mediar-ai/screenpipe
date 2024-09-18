
# Chat with Your Screen Time History, Locally!

![Demo](./public/demo.gif)

## Getting Started

Follow these steps to set up your local environment for chatting with an AI that retrieves your screen data.

### 1. Install Ollama

First, install [Ollama](https://www.ollama.com/).

### 2. Choose a Tool-Supported Model

To run Screenpipe and chat with the AI, you need a model that supports tools. This example has been successfully tested using the model [mannix/llama3.1-8b-lexi:tools-q8_0](https://ollama.com/mannix/llama3.1-8b-lexi). 

You can find a list of models that support tools here: [Ollama Models with Tool Support](https://ollama.com/search?c=tools). 

For more information, read [What Are Tools?](https://ollama.com/blog/tool-support).

### 3. Run Screenpipe

Once you have Screenpipe and a tool-supported model (e.g., `mannix/llama3.1-8b-lexi:tools-q8_0`), run Screenpipe with the following command:

```bash
ollama serve &
```

### 4. Set Up the Development Server

Next, set up the development server by running: 

```bash
npm install
```
Then, start the server:
```bash
npm run dev
```

### 5.Access the Application

Open your browser and navigate to [http://localhost:3000](http://localhost:3000) to see the application in action.

### 6.Customize Your Application

You can start editing the logic and adding tools by modifying the lib/chat/actions.tsx file, which is used to call the Screenpipe API.


This example is based on the project found at [vercel/ai-chatbot](https://github.com/vercel/ai-chatbot).
