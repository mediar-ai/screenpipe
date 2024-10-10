
import { z } from "zod";
import { streamText } from "ai";
import { ollama } from "ollama-ai-provider";
import * as fs from "node:fs/promises";

const screenpipeQuery = z.object({
  q: z.string().optional(),
  content_type: z.enum(["ocr", "audio", "all"]).default("all"),
  limit: z.number().default(20),
  start_time: z.string().default(new Date(Date.now() - 3600000).toISOString()),
  end_time: z.string().default(new Date().toISOString()),
});

async function queryScreenpipe(params: z.infer<typeof screenpipeQuery>) {
  try {
    const queryParams = new URLSearchParams(
      Object.entries(params).filter(([_, v]) => v != null) as [string, string][]
    );
    console.log("calling screenpipe", JSON.stringify(params));
    const response = await fetch(`http://localhost:3030/search?${queryParams}`);
    if (!response.ok) {
      throw new Error(`http error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("error querying screenpipe:", error);
    return null;
  }
}

const simpleOllamaChat = async () => {
  console.log(
    "starting simple ollama chat. make sure to run `ollama run nemotron-mini:4b-instruct-q4_k_m` before running this script."
  );
  const provider = ollama("nemotron-mini:4b-instruct-q4_k_m");

  while (true) {
    try {
      // query last 1 min of screenpipe
      const screenpipe = await queryScreenpipe({
        content_type: "all",
        limit: 10,
        start_time: new Date(Date.now() - 60000).toISOString(),
        end_time: new Date().toISOString(),
      });
      console.log(
        "got some screenpipe data of length:",
        screenpipe.data.length
      );

      const conversation: { role: string; content: string }[] = [
        {
          role: "user",
          content:
            "what did i do in the last minute? here is the screenpipe data: " +
            JSON.stringify(screenpipe),
        },
      ];

      const { textStream } = await streamText({
        model: provider,
        messages: conversation,
        maxToolRoundtrips: 3,
      });

      process.stdout.write("ai: ");
      for await (const chunk of textStream) {
        process.stdout.write(chunk);
      }
      console.log(); // new line after the complete response

      // log conversation to file
      await fs.appendFile(
        "conversation_log.txt",
        JSON.stringify(conversation) + "\n"
      );
    } catch (error) {
      console.error("error in ollama chat:", error);
    }
  }
};

const main = async () => {
  await simpleOllamaChat();
};

main();
