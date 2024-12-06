import ngrok from "@ngrok/ngrok";
// import { pipe } from "@screenpipe/js";
import { pipe } from "/Users/louisbeaumont/Documents/screen-pipe/screenpipe-js/main.ts";
import { z } from "zod";
import { generateObject } from "ai";
import { createOllama } from "ollama-ai-provider";
import { createOpenAI } from "@ai-sdk/openai";
import express from "express";




async function startServer(config: any): Promise<express.Express> {
  const app = express();
  app.use(express.json());

  app.post("/api/query", async (req, res) => {
    const { query } = req.body;

    try {
      console.log("query:", query);

      const q = {
        contentType: "audio",
        limit: 1000045,
        offset: 0,
        minLength: 1,
        maxLength: 10000,
        startTime: "2024-10-24T23:23:08.504Z",
        endTime: "2024-11-23T23:23:08.504Z",
      };
      console.log(
        "querying screenpipe with params:",
        JSON.stringify(q, null, 2)
      );
      // Query screenpipe with AI-generated parameters
      // @ts-ignore
      const results = await pipe.queryScreenpipe(q);

      // Ask for permission to share these specific results
      // const allowed = true; // temporarily allow all requests
      const allowed = await new Promise((resolve) => {
        pipe.inbox.send({
          title: "incoming api request",
          body: `allow sharing results for query: "${query}"?

search parameters:
${JSON.stringify(q, null, 2)}


          `,
          actions: [
            { label: "allow", callback: async () => resolve(true) },
            { label: "deny", callback: async () => resolve(false) },
          ],
        });
      });

      // raw results:
// \`\`\`json
// ${JSON.stringify(results, null, 2)}
// \`\`\`
      if (!allowed) {
        return res.status(403).json({ error: "access denied by user" });
      }

      // Return raw results if allowed
      res.json(results);
    } catch (error) {
      console.error("api error:", error);
      res.status(500).json({ error: "internal server error" });
    }
  });

  return app;
}

async function startNgrokTunnel(): Promise<void> {
  try {
    const config = pipe.loadPipeConfig();

    const app = await startServer(config);

    // Start express on a random port
    const port = await new Promise<number>((resolve) => {
      const server = app.listen(0, () => {
        const addr = server.address();
        resolve(typeof addr === "object" ? addr!.port : 0);
      });
    });

    console.log("starting ngrok tunnel to api server");

    const listener = await ngrok.connect({
      addr: port,
      authtoken: config.authtoken,
      domain: config.domain || undefined,
    });

    const tunnelUrl = listener.url();
    console.log(`tunnel established: ${tunnelUrl}`);

    await pipe.inbox.send({
      title: "ngrok tunnel started",
      body: `api is now accessible at: ${tunnelUrl}/api/query`,
    });

    process.on("SIGINT", async () => {
      console.log("shutting down ngrok tunnel");
      await listener.close();
      process.exit(0);
    });
  } catch (error) {
    console.error("error starting ngrok tunnel:", error);
  }
}

startNgrokTunnel();

/*

Instructions to run this pipe:

1. install screenpipe and git clone this repo
    ```
    git clone https://github.com/mediar-ai/screenpipe.git
    cd screenpipe
    ```

2. set up ngrok:
   - create an account at https://ngrok.com
   - get your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken
   - set environment variables:
     ```
     export NGROK_AUTHTOKEN=your_authtoken
     # optional: set a custom domain if you have one
     export NGROK_DOMAIN=your-custom-domain
     ```

3. run the pipe:
   ```
   screenpipe pipe download ./pipes/pipe-ngrok
   screenpipe pipe enable pipe-ngrok
   screenpipe
   ```

For development, you can run:
```
# these are mandatory env variables
export SCREENPIPE_DIR="$HOME/.screenpipe"
export PIPE_ID="pipe-digital-clone"
export PIPE_FILE="pipe.ts"
export PIPE_DIR="$SCREENPIPE_DIR/pipes/pipe-digital-clone"

bun run pipes/pipe-digital-clone/pipe.ts
```

# Using curl
curl -X POST \
  https://select-merely-gelding.ngrok-free.app/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "find my recent chrome windows about AI"}'

*/
