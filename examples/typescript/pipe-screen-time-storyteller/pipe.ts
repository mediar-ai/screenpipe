const INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

interface AIProvider {
    provider: string;
    model: string;
}

interface Config {
    aiProvider: string;
    models: {
        claude: string;
        openai: string;
        ollama: string;
    };
    apiKeys: {
        claude: string;
        openai: string;
    };
    pageSize: number;
    contentType: ContentType;
    github: {
        personalAccessToken: string;
    };
}

interface NarrativeSummary {
    summary: string;
    mood: string; // This will now be an emoji
    keyInsights: string[]; // Each insight will include an emoji
}

type ContentType = "ocr" | "audio" | "all"; // Add this near the top of your file

interface ContentItem {
    // Define the structure of your content items here
    // For example:
    id: string;
    content: string;
    timestamp: string;
    // Add other relevant fields
}

async function getAIProvider(config: Config): Promise<AIProvider> {
    return { provider: config.aiProvider, model: config.models[config.aiProvider] };
}

async function queryScreenpipe(params: ScreenpipeQueryParams): Promise<ScreenpipeResponse | null> {
    try {
        const queryParams = Object.entries(params)
            .filter(([_, v]) => v != null)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        console.log("Calling screenpipe", JSON.stringify(params));
        const result = await pipe.get(`http://localhost:3030/search?${queryParams}`);
        console.log("Got", result.data.length, "items from screenpipe");
        return result;
    } catch (error) {
        console.error("Error querying screenpipe:", error);
        return null;
    }
}

async function generateNarrativeSummary(screenData: ContentItem[], provider: AIProvider, config: Config): Promise<NarrativeSummary> {
    // Limit the number of items we send to the AI
    const maxItems = 100;
    const truncatedData = screenData.slice(0, maxItems);

    const prompt = `You're an AI companion living inside the user's devices. Based on the following sample of screen data (${truncatedData.length} out of ${screenData.length} total items), write a friendly, slightly sassy diary entry about what you've observed today:

    ${JSON.stringify(truncatedData)}

    Your diary entry should:
    1. Comment on the user's habits
    2. Make playful jokes about their app usage
    3. Offer 3 pieces of advice for tomorrow
    4. Use a mix of tech slang and emojis for a modern feel

    Return the summary as a JSON object with the following structure:
    {
        "summary": "Your sassy AI companion diary entry",
        "mood": "An emoji that represents the overall mood of the day",
        "keyInsights": ["Array of 3 key insights or observations, each with an relevant emoji"]
    }`;

    let response: Response;
    let result: any;

    try {
        if (provider.provider === "claude") {
            response = await fetch("https://api.anthropic.com/v1/messages", {
                method: 'POST',
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": config.apiKeys.claude,
                    "anthropic-version": "2023-06-01"
                },
                body: JSON.stringify({
                    model: provider.model,
                    messages: [{ role: "user", content: prompt }],
                    max_tokens: 1000,
                }),
            });
            result = await response.json();
            console.log("Claude API response:", JSON.stringify(result, null, 2));
            if (result.content && Array.isArray(result.content) && result.content[0] && result.content[0].text) {
                // Extract JSON from the text response
                const jsonMatch = result.content[0].text.match(/```json\n([\s\S]*?)\n```/);
                if (jsonMatch) {
                    const jsonString = jsonMatch[1].replace(/\\n/g, '\n').replace(/\\/g, '');
                    console.log("Extracted JSON string:", jsonString);
                    try {
                        // Use a more lenient JSON parser
                        const parsedJson = JSON.parse(jsonString.replace(/[\u0000-\u001F]+/g, ""));
                        return {
                            summary: parsedJson.summary || "No summary available",
                            mood: parsedJson.mood || "😐",
                            keyInsights: Array.isArray(parsedJson.keyInsights) ? parsedJson.keyInsights : ["No key insights available"]
                        };
                    } catch (parseError) {
                        console.error("Error parsing extracted JSON:", parseError);
                        // Fallback to a default response
                        return {
                            summary: "Failed to parse the AI response. Here's the raw text: " + jsonString,
                            mood: "😕",
                            keyInsights: ["Error parsing AI response"]
                        };
                    }
                } else {
                    throw new Error("Could not find JSON in Claude's response");
                }
            } else {
                throw new Error("Unexpected response structure from Claude API");
            }
        } else if (provider.provider === "openai") {
            response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: 'POST',
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${config.apiKeys.openai}`,
                },
                body: JSON.stringify({
                    model: provider.model,
                    messages: [{ role: "user", content: prompt }],
                    response_format: { type: "json_object" },
                }),
            });
            result = await response.json();
            return JSON.parse(result.choices[0].message.content);
        } else if (provider.provider === "ollama") {
            response = await fetch("http://localhost:11434/api/chat", {
                method: 'POST',
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: provider.model,
                    messages: [{ role: "user", content: prompt }],
                }),
            });
            result = await response.json();
            return JSON.parse(result.message.content);
        } else {
            throw new Error(`Unsupported AI provider: ${provider.provider}`);
        }
    } catch (error) {
        console.error("Error generating narrative summary:", error);
        console.error("API response:", JSON.stringify(result, null, 2));
        if (error instanceof Error) {
            console.error("Error message:", error.message);
            console.error("Error stack:", error.stack);
        }
        // Return a default response in case of any error
        return {
            summary: "An error occurred while generating the narrative summary.",
            mood: "😞",
            keyInsights: ["Error occurred during summary generation"]
        };
    }
}

async function saveNarrativeSummary(summary: NarrativeSummary): Promise<void> {
    try {
        const date = new Date().toISOString().split('T')[0];
        const fileName = `${date}-narrative-summary.json`;
        const pipeDir = `${process.env.SCREENPIPE_DIR}/pipes/${globalThis.metadata.id}`;
        const fullPath = path.join(pipeDir, fileName);
        
        console.log(`Attempting to save narrative summary to: ${fullPath}`);
        
        await fs.writeFile(fullPath, JSON.stringify(summary, null, 2));
        console.log(`Successfully saved narrative summary to ${fullPath}`);
    } catch (error) {
        console.error("Error saving narrative summary:", error);
        throw error;
    }
}

async function createGist(summary: NarrativeSummary, config: Config): Promise<string | null> {
    const date = new Date().toISOString().split('T')[0];
    const fileName = `${date}-screen-time-story.md`;
    const content = `# 🖥️ Screen Time Story - ${date} ${summary.mood}

## 📱 AI Companion's Diary Entry

${summary.summary}

## 🔍 Key Insights

${summary.keyInsights.map(insight => `- ${insight}`).join('\n')}

---
Generated by your friendly neighborhood AI companion 🤖✨
`;
    
    try {
        console.log("Attempting to create gist...");
        const response = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers: {
                'Authorization': `token ${config.github.personalAccessToken}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Screen-Time-Storyteller',
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            },
            body: JSON.stringify({
                description: `Screen Time Story - ${date}`,
                public: false,
                files: {
                    [fileName]: {
                        content: content
                    }
                }
            })
        });

        if (response.ok) {
            const gistData = await response.json();
            console.log("Created gist:", gistData.html_url);
            return gistData.html_url;
        } else {
            const errorText = await response.text();
            console.error(`Failed to create gist. Status: ${response.status}, Response: ${errorText}`);
            return null;
        }
    } catch (error) {
        console.error("Error creating gist:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
            console.error("Error stack:", error.stack);
        }
        return null;
    }
}

async function main() {
    console.log("Starting Screen Time Storyteller");
    let config: Config;
    try {
        const rawConfig = await pipe.loadConfig();
        console.log("Loaded raw config:", JSON.stringify(rawConfig, null, 2));
        
        if (typeof rawConfig !== 'object' || rawConfig === null) {
            throw new Error("Config is not an object or is null");
        }
        
        // Validate and transform the raw config into our Config type
        config = {
            aiProvider: rawConfig.aiProvider,
            models: rawConfig.models,
            apiKeys: rawConfig.apiKeys,
            pageSize: rawConfig.pageSize,
            contentType: rawConfig.contentType as ContentType,
            github: rawConfig.github
        };
        
        // Validate required fields
        if (!config.aiProvider) throw new Error("Missing aiProvider in config");
        if (!config.models) throw new Error("Missing models in config");
        if (!config.apiKeys) throw new Error("Missing apiKeys in config");
        if (!config.pageSize) throw new Error("Missing pageSize in config");
        if (!config.contentType) throw new Error("Missing contentType in config");
        if (!config.github) throw new Error("Missing github config");
        
        console.log("Processed config:", JSON.stringify(config, null, 2));
    } catch (error) {
        console.error("Error loading or processing config:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
            console.error("Error stack:", error.stack);
        }
        return; // Exit the function if we can't load the config
    }

    const provider = await getAIProvider(config);
    console.log("Using AI provider:", provider);

    while (true) {
        try {
            const now = new Date();
            const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

            const screenData = await queryScreenpipe({
                start_time: oneDayAgo.toISOString(),
                end_time: now.toISOString(),
                limit: config.pageSize,
                content_type: config.contentType,
            });

            if (screenData && screenData.data && screenData.data.length > 0) {
                try {
                    const narrativeSummary = await generateNarrativeSummary(screenData.data, provider, config);
                    console.log("Generated narrative summary:", JSON.stringify(narrativeSummary, null, 2));
                    await saveNarrativeSummary(narrativeSummary);
                    
                    const gistUrl = await createGist(narrativeSummary, config);
                    if (gistUrl) {
                        console.log("Created gist for review:", gistUrl);
                    } else {
                        console.log("Failed to create gist");
                        console.error("GitHub personal access token:", config.github.personalAccessToken ? "Present" : "Missing");
                        console.error("Please check your GitHub personal access token and ensure it has the necessary permissions.");
                    }
                } catch (summaryError) {
                    console.error("Error generating or processing narrative summary:", summaryError);
                    if (summaryError instanceof Error) {
                        console.error("Error message:", summaryError.message);
                        console.error("Error stack:", summaryError.stack);
                    } else {
                        console.error("Non-Error object thrown:", summaryError);
                    }
                }
            } else {
                console.log("No screen data available for the past day");
            }
        } catch (error) {
            console.error("Error in Screen Time Storyteller loop:", error);
            if (error instanceof Error) {
                console.error("Error message:", error.message);
                console.error("Error stack:", error.stack);
            } else {
                console.error("Non-Error object thrown:", error);
            }
        }

        console.log(`Sleeping for ${INTERVAL / 1000 / 60} minutes`);
        await new Promise(resolve => setTimeout(resolve, INTERVAL));
    }
}

main().catch(error => {
    console.error("Fatal error in Screen Time Storyteller:", error);
    if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
    }
});