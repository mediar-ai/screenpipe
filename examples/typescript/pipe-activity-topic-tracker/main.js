const INTERVAL = 1 * 60 * 1000; // 1 minutes in milliseconds

async function queryScreenpipe(params) {
    try {
        console.log("params", params);
        const queryParams = Object.entries({
            q: params.q,
            offset: params.offset,
            limit: params.limit,
            start_time: params.start_time,
            end_time: params.end_time,
            content_type: params.content_type,
            app_name: params.app_name,
        })
            .filter(([_, v]) => v != null)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        console.log("calling screenpipe", JSON.stringify(params));
        const result = await pipe.get(`http://localhost:3030/search?${queryParams}`);
        console.log("got", result.data.length, "items from screenpipe");

        return result;
    } catch (error) {
        console.error("Error querying screenpipe:", error);
        return null;
    }
}

async function getAIProvider() {
    // Default to OpenAI if no provider is specified
    const provider = "ollama";
    const model = "phi3.5";

    return { provider, model };
}

async function generateActivityData(provider) {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - INTERVAL);

    const screenData = await queryScreenpipe({
        start_time: fiveMinutesAgo.toISOString(),
        end_time: now.toISOString(),
        limit: 50,
        content_type: "ocr",
    });

    const prompt = `Based on the following screen and audio data, generate an activity summary for the last minutes:

    ${JSON.stringify(screenData)}

    You should return a JSON object with the following fields:
    - topics: an array of topics
    - tags: an array of tags
    - summary: a concise summary of the activity
    - timestamp: the timestamp of the activity
    - sources: an array of absolute file paths to mp4 videos in the user's screenpipe data directory

    Examples:
    - { "topics": ["meeting", "project", "discussion"], "tags": ["work", "team", "important"], "summary": "Discussed project requirements and assigned tasks.", "timestamp": "2024-08-18T12:54:12Z", "sources": ["/Users/louisbeaumont/.screenpipe/data/2024-08-18_12-50-00.mp4", "/Users/louisbeaumont/.screenpipe/data/2024-08-18_12-55-00.mp4"] }
    - { "topics": ["game", "strategy", "multiplayer"], "tags": ["gaming", "online", "competitive"], "summary": "Played a multiplayer strategy game with friends.", "timestamp": "2024-08-18T06:13:55Z", "sources": ["/Users/louisbeaumont/.screenpipe/data/2024-08-18_06-10-00.mp4"] }
    - { "topics": ["sales", "meeting", "presentation"], "tags": ["work", "team", "important"], "summary": "Presented the new product to the sales team.", "timestamp": "2024-08-18T12:54:12Z", "sources": ["/Users/louisbeaumont/.screenpipe/data/2024-08-18_12-45-00.mp4"] }
    - { "topics": ["programming", "code", "debugging"], "tags": ["work", "team", "important"], "summary": "Debugged a bug in the codebase.", "timestamp": "2024-08-18T12:54:12Z", "sources": ["/Users/louisbeaumont/.screenpipe/data/2024-08-18_12-30-00.mp4", "/Users/louisbeaumont/.screenpipe/data/2024-08-18_12-40-00.mp4", "/Users/louisbeaumont/.screenpipe/data/2024-08-18_12-50-00.mp4"] }
    - { "topics": ["writing", "blog", "content"], "tags": ["work", "team", "important"], "summary": "Wrote a blog post about the new product.", "timestamp": "2024-08-18T12:54:12Z", "sources": ["/Users/louisbeaumont/.screenpipe/data/2024-08-18_12-30-00.mp4"] }
    - { "topics": ["content creation", "social media", "marketing"], "tags": ["work", "team", "important"], "summary": "Created a social media post about the new product.", "timestamp": "2024-08-18T12:54:12Z", "sources": ["/Users/louisbeaumont/.screenpipe/data/2024-08-18_12-40-00.mp4", "/Users/louisbeaumont/.screenpipe/data/2024-08-18_12-50-00.mp4"] }

    Provide a concise summary, relevant topics, tags, and sources (absolute file paths to mp4 videos in /Users/louisbeaumont/.screenpipe/data/). The sources array may contain one or more file paths.`;

    const result = await pipe.post(
        provider.provider === "openai"
            ? "https://api.openai.com/v1/chat/completions"
            : "http://localhost:11434/api/chat",
        JSON.stringify({
            model: provider.model,
            messages: [{ role: "user", content: prompt }],
            ...(provider.provider === "openai" && {
                response_format: { type: "json_object" },
            }),
            stream: false,
        }),
    );

    console.log("AI answer:", result);

    const content =
        provider.provider === "openai"
            ? result.choices[0].message.content
            : result.message.content;
    return JSON.parse(content);
}

// Global variable to store our activities in memory
let activityLog = [];

async function mergeAndSaveActivity(fileName, activity) {
    let existingLog = [];
    try {
        const fileContent = await pipe.readFile(fileName);
        existingLog = JSON.parse(fileContent);
    } catch (error) {
        console.error("Error reading existing log, starting fresh:", error);
    }

    // Add the new activity to the existing log
    existingLog.push(activity);

    console.log("will write", JSON.stringify(existingLog, null, 2));

    // Write the updated log back to the file
    await pipe.writeFile(fileName, JSON.stringify(existingLog, null, 2));

    // Update the in-memory activityLog
    activityLog = existingLog;

    // Log the current state of our activity log
    console.log("Updated activity log:", JSON.stringify(activityLog, null, 2));
}

async function runActivityTracker() {
    const provider = await getAIProvider();

    console.log("Starting Activity Topic Tracker with provider:", provider);

    const fileName = `activity-log-${new Date().toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" }).replace(/[/:]/g, "-")}.json`;
    while (true) {
        try {
            const activity = await generateActivityData(provider);
            await mergeAndSaveActivity(fileName, activity);
            console.log("Activity logged:", activity);
        } catch (error) {
            console.error("Error logging activity:", error);
        }
        await new Promise((resolve) => setTimeout(resolve, INTERVAL));
    }
}

// Self-invoking async function to run the activity tracker
(async () => {
    try {
        await runActivityTracker();
    } catch (error) {
        console.error("Fatal error in Activity Topic Tracker:");
        if (error instanceof Error) {
            console.error("Error name:", error.name);
            console.error("Error message:", error.message);
            console.error("Error stack:", error.stack);
        } else {
            console.error("Unexpected error:", error);
        }
    }
})();
