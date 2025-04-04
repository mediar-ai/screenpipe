import { NextResponse } from "next/server";
import { z } from "zod";
import { generateObject } from "ai";
import { ollama } from "ollama-ai-provider";
import { Client } from "@notionhq/client";
import { NotionClient } from "@/lib/notion/client";
import { settingsStore } from "@/lib/store/settings-store";
import { OpenAI } from "openai";
import { zodResponseFormat } from "openai/helpers/zod";

// rich schema for relationship intelligence
const contactSchema = z.object({
	name: z.string(),
	company: z.string().optional(),
	lastInteraction: z.string(),
	sentiment: z.number(), // -1 to 1
	topics: z.array(z.string()),
	nextSteps: z.array(z.string()),
});

const relationshipIntelligence = z.object({
	contacts: z.array(contactSchema),
	insights: z.object({
		followUps: z.array(z.string()),
		opportunities: z.array(z.string()),
	}),
});

async function analyzeRelationships(
	recentLogs: string,
	aiPreset: ReturnType<typeof settingsStore.getPreset>,
): Promise<z.infer<typeof relationshipIntelligence>> {

	if (!aiPreset) {
		throw new Error("ai preset not found");
	}

	const prompt = `You are a professional relationship intelligence analyst. Your task is to analyze work logs and generate a comprehensive relationship intelligence report.

    ANALYSIS OBJECTIVES:
    1. Extract all individuals mentioned, including their full names and organizations
    2. Determine the nature and quality of each interaction (positive, neutral, negative)
    3. Calculate sentiment scores (-1 to 1) based on interaction context
    4. Identify recurring discussion topics and their importance
    5. Recognize potential business opportunities and collaboration possibilities
    6. Suggest specific, actionable follow-ups for each contact

    CONTEXT:
    Today's date: ${new Date().toISOString().split("T")[0]}
    Current time: ${new Date().toLocaleTimeString()}
    Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}

    WORK LOGS TO ANALYZE:
    ${recentLogs}

    RESPONSE FORMAT:
    Return a JSON object with the following structure:
    {
      "contacts": [
        {
          "name": "Full Name",
          "company": "Organization Name",
          "lastInteraction": "YYYY-MM-DD",
          "sentiment": 0.X, // Range from -1.0 (negative) to 1.0 (positive)
          "topics": ["topic1", "topic2", "topic3"],
          "nextSteps": ["specific action 1", "specific action 2"]
        },
        // Additional contacts...
      ],
      "insights": {
        "followUps": ["priority follow-up 1", "priority follow-up 2"],
        "opportunities": ["business opportunity 1", "business opportunity 2"]
      }
    }

    IMPORTANT:
    - Use only real names and companies found in the logs
    - Ensure sentiment scores accurately reflect interaction quality
    - Provide specific, actionable next steps tailored to each contact
    - Prioritize follow-ups based on urgency and potential value
    - Identify concrete business opportunities with clear potential benefits
    `;

	const openai = new OpenAI({
		apiKey: aiPreset.apiKey,
		baseURL: aiPreset.url,
		dangerouslyAllowBrowser: true,
	});

	console.log("prompt", prompt);


	const response = await openai.chat.completions.create({
		model: aiPreset.model,
		messages: [{ role: "user", content: prompt }],
		// response_format: { type: "json_object" },
		response_format: zodResponseFormat(relationshipIntelligence, "relationshipIntelligence"),
	});

	console.log("relationship intelligence response", response.choices[0].message.content);
	return JSON.parse(response.choices[0].message.content || "{}");
}

async function readRecentLogs(
	client: Client,
	databaseId: string,
	since: Date,
): Promise<string> {
	try {
		const response = await client.databases.query({
			database_id: databaseId,
			filter: {
				and: [
					{
						property: "Date",
						date: {
							on_or_after: since.toISOString().split("T")[0],
						},
					},
				],
			},
			sorts: [
				{
					property: "Date",
					direction: "ascending",
				},
			],
		});

		return response.results
			.map((page: any) => {
				const title = page.properties.Title?.title[0]?.text?.content || "";
				const description =
					page.properties.Description?.rich_text[0]?.text?.content || "";
				return `${title}\n${description}`;
			})
			.join("\n\n");
	} catch (error) {
		console.error("Failed to read logs:", error);
		return "";
	}
}

export async function GET() {
	try {
		const settings = await settingsStore.loadPipeSettings("notion");

		console.log("settings", settings);

		const aiPreset = settingsStore.getPreset("notion", "aiLogPresetId");

		if (
			!settings?.notion?.accessToken ||
			!settings?.notion?.databaseId ||
			!settings?.notion?.intelligenceDbId
		) {
			return NextResponse.json(
				{ error: "notion not configured" },
				{ status: 400 },
			);
		}

		const client = new Client({ auth: settings.notion.accessToken });

		// Get last 24 hours of logs
		const today = new Date();
		const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

		const recentLogs = await readRecentLogs(
			client,
			settings.notion.databaseId,
			yesterday,
		);

		if (!recentLogs) {
			return NextResponse.json(
				{ message: "no logs found for analysis" },
				{ status: 404 },
			);
		}

		const intelligence = await analyzeRelationships(
			recentLogs,
			aiPreset
		);

		const notion = new NotionClient(settings.notion);

		const deepLink = await notion.createIntelligence(intelligence);

		return NextResponse.json({
			message: "relationship intelligence updated",
			intelligence,
			deepLink,
			summary: {
				contacts: intelligence.contacts.length,
				opportunities: intelligence.insights.opportunities.length,
				needsFollowUp: intelligence.insights.followUps.length,
				logsAnalyzed: recentLogs.length,
			},
		});
	} catch (error) {
		console.error("error in intelligence api:", error);
		return NextResponse.json(
			{ error: `failed to process intelligence: ${error}` },
			{ status: 500 },
		);
	}
}
