const INTERVAL = 1 * 60 * 1000; // 1 minute in milliseconds

async function queryScreenpipe(params) {
    try {
        const queryParams = Object.entries(params)
            .filter(([_, v]) => v != null)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        console.log("Calling Screenpipe:", JSON.stringify(params));
        const result = await pipe.get(`http://localhost:3030/search?${queryParams}`);
        console.log("Retrieved", result.data.length, "items from Screenpipe");
        return result;
    } catch (error) {
        console.error("Error querying Screenpipe:", error);
        return null;
    }
}

async function getAIProvider() {
    const provider = "ollama";
    const model = "phi3.5";
    return { provider, model };
}

async function generateTags(provider, screenData) {
    const prompt = `Based on the following screen data, generate relevant tags for the user's activity:

    ${JSON.stringify(screenData)}

    Return a JSON object with the following structure:
    {
        "tags": ["tag1", "tag2", "tag3"]
    }
    Do not say anything else but JSON.
    Provide 3-5 relevant tags that describe the user's activity.`;

    const result = await pipe.post(
        "http://localhost:11434/api/chat",
        JSON.stringify({
            model: provider.model,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            stream: false,
        }),
    );

    console.log("AI answer:", result);

    const content = result.message.content;
    return JSON.parse(content);
}

async function addTags(contentType, id, tags) {
    try {
        console.log(`Adding tags to ${contentType} item ${id}:`, tags);
        const result = await pipe.post(
            `http://localhost:3030/tags/${contentType}/${id}`,
            JSON.stringify({ tags })
        );
        console.log("Tags added successfully:", result);
        return result;
    } catch (error) {
        console.error(`Error adding tags to ${contentType} item ${id}:`, error);
        return null;
    }
}

async function tagRecentActivities(provider) {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - INTERVAL);

    const screenData = await queryScreenpipe({
        start_time: oneMinuteAgo.toISOString(),
        end_time: now.toISOString(),
        limit: 50,
        content_type: "ocr",
    });

    if (!screenData || !screenData.data || screenData.data.length === 0) {
        console.log("No data retrieved from Screenpipe");
        return;
    }

    const { tags } = await generateTags(provider, screenData);

    for (const item of screenData.data) {
        const contentType = "vision";
        const id = item.content.frame_id;
        await addTags(contentType, id, tags);
    }

    console.log("Tags added to recent activities:", tags);
}

async function runActivityTagger() {
    const provider = await getAIProvider();
    console.log("Starting Activity Tagger with provider:", provider);

    while (true) {
        try {
            await tagRecentActivities(provider);
        } catch (error) {
            console.error("Error in activity tagging:", error);
        }
        await new Promise(resolve => setTimeout(resolve, INTERVAL));
    }
}

// Self-invoking async function to run the activity tagger
(async () => {
    try {
        await runActivityTagger();
    } catch (error) {
        console.error("Fatal error in Activity Tagger:");
        if (error instanceof Error) {
            console.error("Error name:", error.name);
            console.error("Error message:", error.message);
            console.error("Error stack:", error.stack);
        } else {
            console.error("Unexpected error:", error);
        }
    }
})();