import fetch from "cross-fetch";
// @ts-ignore
import * as fs from "node:fs/promises";

async function main() {
  // Create file log with empty lines
  await fs.writeFile("log.md", "");

  while (true) {
    try {
      // Use the API to get recent OCR text

      const response = await fetch(
        `http://localhost:3030/recent?limit=5&offset=0`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API error: ${errorData.error || response.statusText}`);
      }

      const json = await response.json();
      const texts = json.data
        .filter((item) => item.text)
        .map((item) => item.text);
      const concatenatedTexts = texts.join(" ");

      // Read current log
      const currentLog = await fs.readFile("log.md", "utf-8");

      console.log(concatenatedTexts);

      // Use the LLM to update the log
      const llmResponse = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "phi3",
          stream: false,
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: `you receive a markdown log of what the user has been doing today, 
                                that you maintain based on the text extracted from the user's screen. 
                                You can add new categories or update the existing ones. You can also add a new entry to the log. 
                                This is what has been shown on the user's screen over the past 5 minutes: ${concatenatedTexts}
                                And this is the current log: ${currentLog}

                                Rules:
                                - Keep the log small and concise, formatted as a bullet list
                                - Your responses are NOT in a code block e.g. no \`\`\`plaintext \`\`\`markdown etc.!
                                - DO WRITE A LOG OF THE USER'S DAY. NOTHING ELSE

                                Now update the log based on the user's screen and respond with only the updated log. 
                                LOG OF THE USER'S DAY:`,
            },
          ],
        }),
      });

      const text = await llmResponse.json();
      let llmResponseText = text.message.content.trim().replace(/^"|"$/g, "");

      console.log(llmResponseText);

      // Replace all \n with \n\n
      llmResponseText = llmResponseText.replace(/\\n/g, "\n\n");

      // Update file
      await fs.writeFile("log.md", llmResponseText);
    } catch (error) {
      console.error("An error occurred:", error);
    }

    // Sleep for a while before checking again
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

main();
