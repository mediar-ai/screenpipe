const INTERVAL = 30 * 1000; // 30 seconds in milliseconds
const NOTION_API_URL = 'https://api.notion.com/v1/pages';
const NOTION_DATABASE_ID = process.env.SCREENPIPE_NOTION_DATABASE_ID;
const NOTION_API_KEY = process.env.SCREENPIPE_NOTION_API_KEY;



async function queryScreenpipe(startTime, endTime) {
    try {
        const queryParams = `start_time=${startTime}&end_time=${endTime}&limit=50&content_type=audio`;
        const response = await fetch(`http://localhost:3030/search?${queryParams}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Error querying screenpipe:", error.toString());
        return [];
    }
}

async function syncAudioToNotion(audioData) {
    try {
        const title = `Audio - ${audioData.content.timestamp}`;
        const date = audioData.content.timestamp;
        const transcription = audioData.content.transcription;

        // Split transcription into chunks of 2000 characters
        const chunks = splitTranscription(transcription);

        for (let i = 0; i < chunks.length; i++) {
            const response = await fetch(NOTION_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${NOTION_API_KEY}`,
                    'Notion-Version': '2022-06-28',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    parent: { database_id: NOTION_DATABASE_ID },
                    properties: {
                        Title: { title: [{ text: { content: `${title} (Part ${i + 1}/${chunks.length})` } }] },
                        Date: { date: { start: date } },
                        Transcription: { rich_text: [{ text: { content: chunks[i] } }] },
                    },
                }),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
            }
        }

        console.log("Audio synced to Notion successfully");
    } catch (error) {
        console.error("Error syncing audio to Notion:", error);
    }
}

function splitTranscription(transcription, chunkSize = 2000) {
    const chunks = [];
    for (let i = 0; i < transcription.length; i += chunkSize) {
        chunks.push(transcription.slice(i, i + chunkSize));
    }
    return chunks;
}

async function streamAudioToNotion() {
    console.log("Starting Audio Stream to Notion");

    while (true) {
        try {
            const now = new Date();
            const thirtySecondsAgo = new Date(now.getTime() - INTERVAL);

            const audioData = await queryScreenpipe(thirtySecondsAgo.toISOString(), now.toISOString());

            console.log("Audio data:", audioData);
            for (const audio of audioData.data) {
                await syncAudioToNotion(audio);
            }
        } catch (error) {
            console.error("Error syncing audio to Notion:", {
                message: error.message,
                stack: error.stack,
                audioData: JSON.stringify(audioData)
            });
        }
        await new Promise((resolve) => setTimeout(resolve, INTERVAL));
    }
}

streamAudioToNotion();