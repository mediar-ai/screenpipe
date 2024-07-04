import fetch from "cross-fetch";
// @ts-ignore
import * as fs from "node:fs/promises";

async function main() {
  // Create file log with empty object
  await fs.writeFile("name_log.json", JSON.stringify({}));

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

      // Read current log
      const currentLog = JSON.parse(await fs.readFile("name_log.json", "utf-8"));

      const yourLifeContext = JSON.stringify(json);

      if (yourLifeContext.length < 50) {
        console.log("Seems like you haven't run screenpipe yet, did you?");
        return;
      }

      console.log("Will use your life context to update the name log:");
      console.log(yourLifeContext.substring(0, 1000) + "...");

      // Use the LLM to update the log
      const llmResponse = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "phi3",
          stream: false,
          max_tokens: 4096,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "user",
              content: `You receive a JSON object containing names and their appearance counts on the user's screen. 
                        This is what has been shown on the user's screen over the past 5 minutes: ${yourLifeContext}
                        And this is the current name log: ${JSON.stringify(currentLog)}

                        Rules:
                        - Identify any names mentioned in the screen content
                        - Update the name counts in the log
                        - If a name is new, add it to the log with a count of 1
                        - If a name already exists, increment its count
                        - Respond with only the updated JSON object
                        - If you return something else than JSON the universe will come to an end
                        - DO NOT add \`\`\`json at the beginning or end of your response
                        - Do not use '"' around your response

                        Example of answer from you:
                        {
                          "John Doe": 1,
                          "Jane Doe": 2
                        }

                        Counter-example of answer from you:
                        "I'm not sure what you're asking for"

                        Now update the log based on the user's screen and respond with only the updated JSON object.`,
            },
          ],
        }),
      });

      const text = await llmResponse.json();
      let updatedNameLog = text.message.content.trim();
      // remove trimming "
      updatedNameLog = updatedNameLog.replace(/^"|"$/g, "");


      console.log("Updated name log:");
      console.log(JSON.stringify(updatedNameLog, null, 2));

      // Update file
      await fs.writeFile("name_log.json", JSON.stringify(updatedNameLog, null, 2));
    } catch (error) {
      console.error("An error occurred:", error);
    }

    // Sleep for a while before checking again
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

main();