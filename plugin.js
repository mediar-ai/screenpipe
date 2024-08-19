// const INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
// const INTERVAL = 10 * 1000; // 10 seconds in milliseconds

// async function queryScreenpipe(params) {
//   try {
//     console.log("params", params);
//     const queryParams = new URLSearchParams(
//       Object.entries({
//         q: params.q,
//         offset: params.offset ? params.offset.toString() : undefined,
//         limit: params.limit ? params.limit.toString() : undefined,
//         start_time: params.start_time,
//         end_time: params.end_time,
//         content_type: params.content_type,
//         app_name: params.app_name,
//       }).filter(([_, v]) => v != null)
//     );
//     console.log("calling screenpipe", JSON.stringify(params));
//     const response = await fetch(`http://localhost:3030/search?${queryParams}`);
//     if (!response.ok) {
//       const text = await response.text();
//       console.log("error", text);
//       throw new Error(`HTTP error! status: ${response.status} ${text}`);
//     }
//     const result = await response.json();
//     console.log("result", result.data.length);
//     console.log("result", {
//       ...result,
//       data: undefined,
//     });
//     return result;
//   } catch (error) {
//     console.error("Error querying screenpipe:", error);
//     return null;
//   }
// }

// async function getAIProvider() {
//   // Default to OpenAI if no provider is specified
//   const provider = "ollama";
//   const model = "mistral-nemo:12b-instruct-2407-q2_K";

//   return { provider, model };
// }

// async function generateActivityData(provider) {
//   const now = new Date();
//   const fiveMinutesAgo = new Date(now.getTime() - INTERVAL);

//   const screenData = await queryScreenpipe({
//     start_time: fiveMinutesAgo.toISOString(),
//     end_time: now.toISOString(),
//     limit: 50,
//     content_type: "all",
//   });

//   const prompt = `Based on the following screen and audio data, generate an activity summary for the last 5 minutes:
    
//     ${JSON.stringify(screenData)}

//     You should return a JSON object with the following fields:
//     - topics: an array of topics
//     - tags: an array of tags
//     - summary: a concise summary of the activity
//     - timestamp: the timestamp of the activity

//     Examples:
//     - { "topics": ["meeting", "project", "discussion"], "tags": ["work", "team", "important"], "summary": "Discussed project requirements and assigned tasks.", "timestamp": "2024-08-18T12:54:12Z" }
//     - { "topics": ["game", "strategy", "multiplayer"], "tags": ["gaming", "online", "competitive"], "summary": "Played a multiplayer strategy game with friends.", "timestamp": "2024-08-18T06:13:55Z" }
//     - { "topics": ["sales", "meeting", "presentation"], "tags": ["work", "team", "important"], "summary": "Presented the new product to the sales team.", "timestamp": "2024-08-18T12:54:12Z" }
//     - { "topics": ["programming", "code", "debugging"], "tags": ["work", "team", "important"], "summary": "Debugged a bug in the codebase.", "timestamp": "2024-08-18T12:54:12Z" }
//     - { "topics": ["writing", "blog", "content"], "tags": ["work", "team", "important"], "summary": "Wrote a blog post about the new product.", "timestamp": "2024-08-18T12:54:12Z" }
//     - { "topics": ["content creation", "social media", "marketing"], "tags": ["work", "team", "important"], "summary": "Created a social media post about the new product.", "timestamp": "2024-08-18T12:54:12Z" }

//     Provide a concise summary, relevant topics, and tags.`;

//   const response = await fetch(
//     provider.provider === "openai"
//       ? "https://api.openai.com/v1/chat/completions"
//       : "http://localhost:11434/api/chat",
//     {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify({
//         model: provider.model,
//         messages: [{ role: "user", content: prompt }],
//         ...(provider.provider === "openai" && {
//           response_format: { type: "json_object" },
//         }),
//         stream: false,
//       }),
//     }
//   );

//   const result = await response.json();
//   const content =
//     provider.provider === "openai"
//       ? result.choices[0].message.content
//       : result.message.content;
//   return JSON.parse(content);
// }

// // Global variable to store our activities in memory
// let activityLog = [];

// async function mergeAndSaveActivity(activity) {
//   // Add the new activity to our in-memory log
//   activityLog.push(activity);

//   // Optionally, we can limit the size of our log to prevent memory issues
//   const MAX_LOG_SIZE = 1000; // Adjust as needed
//   if (activityLog.length > MAX_LOG_SIZE) {
//     activityLog = activityLog.slice(-MAX_LOG_SIZE);
//   }

//   // Log the current state of our activity log
//   console.log("Updated activity log:", JSON.stringify(activityLog, null, 2));
// }

// async function runActivityTracker() {
//   const provider = await getAIProvider();

//   console.log("Starting Activity Topic Tracker");

//   while (true) {
//     try {
//       const activity = await generateActivityData(provider);
//       await mergeAndSaveActivity(activity);
//       console.log("Activity logged:", activity);
//     } catch (error) {
//       console.error("Error logging activity:", error);
//     }
//     await new Promise((resolve) => setTimeout(resolve, INTERVAL));
//   }
// }

// Self-invoking async function to run the activity tracker
// (async () => {
//   try {
//     Deno[Deno.internal].core.ops.op_hello("World");
//     Deno[Deno.internal].core.ops.op_hello("World");
//     Deno[Deno.internal].core.ops.op_hello("World");
//     Deno[Deno.internal].core.ops.op_hello("World");
//     // await runActivityTracker();
//     return "hi";
//   } catch (error) {
//     console.error("Fatal error in Activity Topic Tracker:");
//     if (error instanceof Error) {
//       console.error("Error name:", error.name);
//       console.error("Error message:", error.message);
//       console.error("Error stack:", error.stack);
//     } else {
//       console.error("Unexpected error:", error);
//     }
//   }
// })();

Deno[Deno.internal].core.ops.op_hello("World");
