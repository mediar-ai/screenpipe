import { NextResponse } from "next/server";
import { z } from "zod";
import { generateObject } from "ai";
import { ollama } from "ollama-ai-provider";
import { Client } from "@notionhq/client";
import { NotionClient } from "@/lib/notion/client";
import { getScreenpipeAppSettings } from "@/lib/actions/get-screenpipe-app-settings";

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
	model: string,
): Promise<z.infer<typeof relationshipIntelligence>> {
	const prompt = `analyze these work logs and create a comprehensive relationship intelligence report.
    focus on:
    - identifying key people and their roles
    - tracking interaction patterns and sentiment
    - spotting business opportunities
    - suggesting follow-ups and introductions
    - finding patterns in topics discussed

    recent logs: ${recentLogs}

    todays date: ${new Date().toISOString().split("T")[0]}
    local time: ${new Date().toLocaleTimeString()}
    timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}

    return a detailed json object following this structure for relationship intelligence.

    example response from you:

    {
      "contacts": [
        {
          "name": "John Doe",
          "company": "Acme Inc.",
          "lastInteraction": "2024-01-01",
          "sentiment": 0.8,
          "topics": ["sales", "marketing"],
          "nextSteps": ["schedule a call", "send a follow-up email"]
        }
      ],
      "insights": {
        "followUps": ["schedule a call", "send a follow-up email"],
        "opportunities": ["schedule a call", "send a follow-up email"]
      }
    }

    of course adapt the example response to the actual data you have, do not use John Doe in your example response, use the names and companies of the people you see in the logs.
    `;

	const provider = ollama(model);
	console.log("prompt", prompt);
	const response = await generateObject({
		model: provider,
		messages: [{ role: "user", content: prompt }],
		schema: relationshipIntelligence,
		maxRetries: 5,
	});

	console.log(response.object);
	return response.object;
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
		const settings = (await getScreenpipeAppSettings())["customSettings"]![
			"notion"
		];

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
			settings.aiModel || "mistral",
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
