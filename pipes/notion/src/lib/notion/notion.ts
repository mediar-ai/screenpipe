"use server";

import { Client } from "@notionhq/client";
import { WorkLog, Intelligence, NotionCredentials } from "@/lib/types";
import { BlockObjectRequest, DatabaseObjectResponse } from "@notionhq/client/build/src/api-endpoints";

export async function validateCredentials(
	credentials: NotionCredentials,
): Promise<boolean> {
	try {
		const client = new Client({ auth: credentials.accessToken });
		await client.databases.retrieve({
			database_id: credentials.databaseId,
		});

		await client.databases.retrieve({
			database_id: credentials.intelligenceDbId,
		});

		// Reset logs database properties
		await client.databases.update({
			database_id: credentials.databaseId,
			title: [{ text: { content: "Activity Logs" } }],
			properties: {
				Description: { rich_text: {} },
				Tags: { multi_select: {} },
				Date: { date: {} },
				StartTime: { date: {} },
				EndTime: { date: {} },
				Summary: { rich_text: {} },
			},
		});

		await client.databases.update({
			database_id: credentials.intelligenceDbId,
			title: [{ text: { content: "Relationship Intelligence" } }],
			properties: {
				Date: { date: {} },
				Summary: { rich_text: {} },
			},
		});

		return true;
	} catch (error) {
		console.error("Failed to validate/update database:", error);
		return false;
	}
}

export async function syncWorkLog(
	credentials: NotionCredentials,
	logEntry: WorkLog,
): Promise<string> {
	const client = new Client({ auth: credentials.accessToken });
	const today = new Date();

	await client.pages.create({
		parent: { database_id: credentials.databaseId },
		properties: {
			Name: { title: [{ text: { content: logEntry.title } }] },
			Description: { rich_text: [{ text: { content: logEntry.description } }] },
			Tags: { multi_select: logEntry.tags.map((tag) => ({ name: tag })) },
			Date: { date: { start: today.toISOString().split("T")[0] } },
			StartTime: {
				date: { start: new Date(logEntry.startTime).toISOString() },
			},
			EndTime: { date: { start: new Date(logEntry.endTime).toISOString() } },
			Summary: {
				rich_text: [
					{
						text: {
							content: `Activity logged at ${new Date().toLocaleTimeString()}`,
						},
					},
				],
			},
		},
	});

	return `https://notion.so/${credentials.databaseId}`;
}
export async function syncIntelligence(
	credentials: NotionCredentials,
	intelligence: Intelligence,
): Promise<string> {
	const client = new Client({ auth: credentials.accessToken });
	const today = new Date().toISOString().split("T")[0];

	// Check for existing intelligence report for today
	const existingReports = await client.databases.query({
		database_id: credentials.intelligenceDbId,
		filter: {
			property: "Date",
			date: {
				equals: today,
			},
		},
	});

	const properties = {
		Name: {
			title: [{ text: { content: `Intelligence Report for ${today}` } }],
		},
		Date: { date: { start: today } },
		Summary: {
			rich_text: [
				{
					text: {
						content: `Generated: ${new Date().toLocaleString()}\nContacts: ${intelligence.contacts.length}\nOpportunities: ${intelligence.insights.opportunities.length}\nFollow-ups: ${intelligence.insights.followUps.length}`,
					},
				},
			],
		},
	};

	const children: BlockObjectRequest[] = [
		{
			type: "code",
			code: {
				rich_text: [
					{
						text: {
							content: generateMermaidGraph(intelligence.contacts),
						},
					},
				],
				language: "mermaid",
			},
		},
		...generateContactsSection(intelligence.contacts),
		...generateInsightsSection(intelligence.insights),
	];

	let pageId: string;

	if (existingReports.results.length > 0) {
		// Update existing report
		pageId = existingReports.results[0].id;
		await client.pages.update({
			page_id: pageId,
			properties,
		});

		// Delete existing blocks
		const existingBlocks = await client.blocks.children.list({
			block_id: pageId,
		});

		for (const block of existingBlocks.results) {
			await client.blocks.delete({
				block_id: block.id,
			});
		}

		// Add new blocks
		await client.blocks.children.append({
			block_id: pageId,
			children,
		});
	} else {
		// Create new report
		const newPage = await client.pages.create({
			parent: { database_id: credentials.intelligenceDbId },
			properties,
			children,
		});
		pageId = newPage.id;
	}

	return `https://notion.so/${credentials.intelligenceDbId}`;
}

function generateMermaidGraph(contacts: Intelligence["contacts"]): string {
	let mermaidGraph = "graph TD\n";
	contacts.forEach((contact) => {
		mermaidGraph += `    ${contact.name.replace(/\s+/g, "_")}["${contact.name}\n${contact.company || ""}"]\n`;
	});

	return mermaidGraph;
	//return `\`\`\`mermaid\n${mermaidGraph}\`\`\``;
}

function generateContactsSection(
	contacts: Intelligence["contacts"],
): BlockObjectRequest[] {
	const blocks: BlockObjectRequest[] = [
		{
			type: "heading_2",
			heading_2: {
				rich_text: [{ type: "text", text: { content: "Key Contacts" } }],
			},
		},
	];

	contacts.forEach((contact) => {
		blocks.push(
			{
				type: "heading_3",
				heading_3: {
					rich_text: [{ type: "text", text: { content: contact.name } }],
				},
			},
			{
				type: "bulleted_list_item",
				bulleted_list_item: {
					rich_text: [
						{ text: { content: `Company: ${contact.company || "N/A"}` } },
					],
				},
			},
			{
				type: "bulleted_list_item",
				bulleted_list_item: {
					rich_text: [
						{
							text: { content: `Last Interaction: ${contact.lastInteraction}` },
						},
					],
				},
			},
			{
				type: "bulleted_list_item",
				bulleted_list_item: {
					rich_text: [{ text: { content: `Sentiment: ${contact.sentiment}` } }],
				},
			},
			{
				type: "bulleted_list_item",
				bulleted_list_item: {
					rich_text: [
						{ text: { content: `Topics: ${contact.topics.join(", ")}` } },
					],
				},
			},
			{
				type: "bulleted_list_item",
				bulleted_list_item: {
					rich_text: [
						{
							text: { content: `Next Steps: ${contact.nextSteps.join(", ")}` },
						},
					],
				},
			},
		);
	});

	return blocks;
}

function generateInsightsSection(
	insights: Intelligence["insights"],
): BlockObjectRequest[] {
	const blocks: BlockObjectRequest[] = [
		{
			type: "heading_2",
			heading_2: {
				rich_text: [{ type: "text", text: { content: "Insights" } }],
			},
		},
		{
			type: "heading_3",
			heading_3: {
				rich_text: [{ type: "text", text: { content: "Follow-ups Needed" } }],
			},
		},
	];

	insights.followUps.forEach((followUp) => {
		blocks.push({
			type: "bulleted_list_item",
			bulleted_list_item: {
				rich_text: [{ text: { content: followUp } }],
			},
		});
	});

	blocks.push({
		type: "heading_3",
		heading_3: {
			rich_text: [{ type: "text", text: { content: "Opportunities" } }],
		},
	});

	insights.opportunities.forEach((opportunity) => {
		blocks.push({
			type: "bulleted_list_item",
			bulleted_list_item: {
				rich_text: [{ text: { content: opportunity } }],
			},
		});
	});

	return blocks;
}

export async function getAvailableDatabases(accessToken: string) {
	const client = new Client({ auth: accessToken });
	const databases = await client.search({
		query: "",
		filter: {
			property: "object",
			value: "database",
		},
	});
	return databases.results
		.filter((database): database is DatabaseObjectResponse => 
			database.object === "database" && "title" in database)
		.map((database) => ({
			id: database.id,
			title: database.title[0].plain_text,
		}));
}
