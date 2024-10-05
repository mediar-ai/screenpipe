const INTERVAL = 1 * 6 * 1000; // 1 minute in milliseconds

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

async function detectWorkStatus(provider, screenData) {
    const prompt = `Based on the following screen data, determine if the user is working or not:

    ${JSON.stringify(screenData)}

    We will show a desktop notification if the user is not working.
    Not working:
    - Social media
    - Chatting
    - Youtube
    - Netflix
    - Games
    - Porn
    - Other distracting websites

    Be funny, sarcastic, like say "stop watching porn bro", use techbro language. Keep body short as it's a notification.

    Return a JSON object with the following structure:
    {
        "work": boolean,
        "title": "A brief title with advice or support",
        "body": "A brief message with advice or support"
    }
    Do not say anything else but JSON.`;

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

async function main() {
    const provider = await getAIProvider();

    while (true) {
        try {
            const screenData = await queryScreenpipe({
                limit: 10,
                offset: 0,
                start_time: new Date(Date.now() - INTERVAL).toISOString(),
                end_time: new Date().toISOString(),
                content_type: "ocr",
            });

            if (screenData && screenData.data) {
                const workStatus = await detectWorkStatus(provider, screenData.data);

                if (!workStatus.work) {
                    pipe.sendNotification({
                        title: workStatus.title,
                        body: workStatus.body,
                    });
                }
            }
        } catch (error) {
            console.error("Error in main loop:", error);
        }

        await new Promise(resolve => setTimeout(resolve, INTERVAL));
    }
}

main();