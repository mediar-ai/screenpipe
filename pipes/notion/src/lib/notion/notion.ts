"use server";

import { Client } from "@notionhq/client";
import { WorkLog, Intelligence, NotionCredentials, DailyReport } from "@/lib/types";
import { BlockObjectRequest, DatabaseObjectResponse } from "@notionhq/client/build/src/api-endpoints";

// Retry helper for rate limiting
async function withRetry<T>(
	fn: () => Promise<T>,
	maxRetries: number = 3,
	baseDelay: number = 1000
): Promise<T> {
	for (let i = 0; i < maxRetries; i++) {
		try {
			return await fn();
		} catch (error: unknown) {
			const isRateLimit = error instanceof Error && error.message.includes("429");
			if (isRateLimit && i < maxRetries - 1) {
				const delay = baseDelay * Math.pow(2, i);
				console.log(`rate limited, retrying in ${delay}ms...`);
				await new Promise(resolve => setTimeout(resolve, delay));
			} else {
				throw error;
			}
		}
	}
	throw new Error("max retries exceeded");
}

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

export async function syncDailyReport(
	credentials: NotionCredentials,
	report: DailyReport,
): Promise<string> {
	const client = new Client({ auth: credentials.accessToken });

	// Check for existing report for today (exclude archived pages)
	const existingReports = await withRetry(() => client.databases.query({
		database_id: credentials.databaseId,
		filter: {
			and: [
				{
					property: "Date",
					date: {
						equals: report.date,
					},
				},
			],
		},
	}));

	// Filter out archived pages
	const activeReports = existingReports.results.filter(
		(page) => "archived" in page && !page.archived
	);

	// Generate description from summary
	const descriptionText = report.summary?.oneLine || report.mainActivities
		.map((a, i) => `${i + 1}. ${a.title}`)
		.join("\n");

	const properties = {
		Name: {
			title: [{ text: { content: `作業日報 ${report.date}` } }],
		},
		Description: {
			rich_text: [
				{
					text: {
						content: descriptionText.substring(0, 2000), // Notion limit
					},
				},
			],
		},
		Date: { date: { start: report.date } },
		Tags: { multi_select: report.tags.map((tag) => ({ name: tag })) },
		Summary: {
			rich_text: [
				{
					text: {
						content: `${report.summary?.oneLine || ""} | 記録: ${report.recordingPeriod}`,
					},
				},
			],
		},
	};

	// Build content blocks
	const children: BlockObjectRequest[] = [
		// Header info
		{
			type: "callout",
			callout: {
				rich_text: [
					{
						type: "text",
						text: {
							content: `記録期間: ${report.recordingPeriod}  キャプチャ数: ${report.captureCount}回`,
						},
					},
				],
				icon: { emoji: "📊" },
			},
		},
	];

	// ==================== 総括セクション ====================
	if (report.summary) {
		children.push(
			{
				type: "heading_1",
				heading_1: {
					rich_text: [{ type: "text", text: { content: "📝 総括" } }],
				},
			},
			{
				type: "quote",
				quote: {
					rich_text: [{ type: "text", text: { content: report.summary.oneLine || "（総括なし）" } }],
				},
			}
		);

		if (report.summary.achievements?.length > 0) {
			children.push({
				type: "heading_3",
				heading_3: {
					rich_text: [{ type: "text", text: { content: "✅ 達成できたこと" } }],
				},
			});
			report.summary.achievements.forEach((achievement) => {
				children.push({
					type: "bulleted_list_item",
					bulleted_list_item: {
						rich_text: [{ type: "text", text: { content: achievement } }],
					},
				});
			});
		}

		if (report.summary.challenges?.length > 0) {
			children.push({
				type: "heading_3",
				heading_3: {
					rich_text: [{ type: "text", text: { content: "⚠️ 課題・困難だったこと" } }],
				},
			});
			report.summary.challenges.forEach((challenge) => {
				children.push({
					type: "bulleted_list_item",
					bulleted_list_item: {
						rich_text: [{ type: "text", text: { content: challenge } }],
					},
				});
			});
		}

		children.push({ type: "divider", divider: {} });
	}

	// ==================== 行動分析セクション ====================
	if (report.actionAnalysis) {
		children.push({
			type: "heading_1",
			heading_1: {
				rich_text: [{ type: "text", text: { content: "🔍 行動分析" } }],
			},
		});

		if (report.actionAnalysis.focusTime) {
			children.push({
				type: "callout",
				callout: {
					rich_text: [{ type: "text", text: { content: `集中できた時間帯: ${report.actionAnalysis.focusTime}` } }],
					icon: { emoji: "🎯" },
				},
			});
		}

		if (report.actionAnalysis.patterns?.length > 0) {
			children.push({
				type: "heading_3",
				heading_3: {
					rich_text: [{ type: "text", text: { content: "行動パターン" } }],
				},
			});
			report.actionAnalysis.patterns.forEach((pattern) => {
				children.push({
					type: "bulleted_list_item",
					bulleted_list_item: {
						rich_text: [{ type: "text", text: { content: pattern } }],
					},
				});
			});
		}

		if (report.actionAnalysis.distractions?.length > 0) {
			children.push({
				type: "heading_3",
				heading_3: {
					rich_text: [{ type: "text", text: { content: "⚡ 気が散った要因" } }],
				},
			});
			report.actionAnalysis.distractions.forEach((distraction) => {
				children.push({
					type: "bulleted_list_item",
					bulleted_list_item: {
						rich_text: [{ type: "text", text: { content: distraction } }],
					},
				});
			});
		}

		children.push({ type: "divider", divider: {} });
	}

	// ==================== メイン作業セクション ====================
	children.push({
		type: "heading_2",
		heading_2: {
			rich_text: [{ type: "text", text: { content: "📍 本日のメイン作業" } }],
		},
	});

	// Add main activities with outcome
	report.mainActivities.forEach((activity, index) => {
		children.push(
			{
				type: "heading_3",
				heading_3: {
					rich_text: [
						{ type: "text", text: { content: `${index + 1}. ${activity.title}` } },
					],
				},
			},
			{
				type: "paragraph",
				paragraph: {
					rich_text: [{ type: "text", text: { content: activity.description } }],
				},
			}
		);
		// Add outcome if available
		if (activity.outcome) {
			children.push({
				type: "callout",
				callout: {
					rich_text: [{ type: "text", text: { content: `成果: ${activity.outcome}` } }],
					icon: { emoji: "🎯" },
				},
			});
		}
	});

	// Time Allocation Section
	children.push(
		{
			type: "heading_2",
			heading_2: {
				rich_text: [{ type: "text", text: { content: "⏱️ 時間配分" } }],
			},
		},
		{
			type: "table",
			table: {
				table_width: 3,
				has_column_header: true,
				has_row_header: false,
				children: [
					{
						type: "table_row",
						table_row: {
							cells: [
								[{ type: "text", text: { content: "カテゴリ" } }],
								[{ type: "text", text: { content: "時間" } }],
								[{ type: "text", text: { content: "割合" } }],
							],
						},
					},
					...report.timeAllocation.map((item) => ({
						type: "table_row" as const,
						table_row: {
							cells: [
								[{ type: "text" as const, text: { content: item.category } }],
								[{ type: "text" as const, text: { content: item.duration } }],
								[{ type: "text" as const, text: { content: `${item.percentage}%` } }],
							],
						},
					})),
				],
			},
		}
	);

	// Insights Section
	if (report.insights.length > 0) {
		children.push({
			type: "heading_2",
			heading_2: {
				rich_text: [{ type: "text", text: { content: "💡 得られた知見・メモ" } }],
			},
		});

		report.insights.forEach((insight) => {
			children.push({
				type: "heading_3",
				heading_3: {
					rich_text: [{ type: "text", text: { content: insight.topic } }],
				},
			});
			insight.points.forEach((point) => {
				children.push({
					type: "bulleted_list_item",
					bulleted_list_item: {
						rich_text: [{ type: "text", text: { content: point } }],
					},
				});
			});
		});
	}

	// ==================== 注意点・警告セクション ====================
	if (report.attentionPoints && report.attentionPoints.length > 0) {
		children.push(
			{ type: "divider", divider: {} },
			{
				type: "heading_1",
				heading_1: {
					rich_text: [{ type: "text", text: { content: "🚨 注意点・警告" } }],
				},
			}
		);

		report.attentionPoints.forEach((point) => {
			children.push(
				{
					type: "callout",
					callout: {
						rich_text: [
							{ type: "text", text: { content: `問題: ${point.issue}\n` }, annotations: { bold: true } },
							{ type: "text", text: { content: `リスク: ${point.risk}\n` } },
							{ type: "text", text: { content: `対処法: ${point.suggestion}` } },
						],
						icon: { emoji: "⚠️" },
					},
				}
			);
		});
	}

	// ==================== 改善点・次のアクションセクション ====================
	if (report.improvements && report.improvements.length > 0) {
		children.push(
			{ type: "divider", divider: {} },
			{
				type: "heading_1",
				heading_1: {
					rich_text: [{ type: "text", text: { content: "🚀 改善点・次のアクション" } }],
				},
			}
		);

		// Priority order
		const priorityOrder = { high: 0, medium: 1, low: 2 };
		const sortedImprovements = [...report.improvements].sort(
			(a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
		);

		sortedImprovements.forEach((improvement) => {
			const priorityEmoji = improvement.priority === "high" ? "🔴" : improvement.priority === "medium" ? "🟡" : "🟢";
			children.push(
				{
					type: "heading_3",
					heading_3: {
						rich_text: [{ type: "text", text: { content: `${priorityEmoji} ${improvement.area}` } }],
					},
				},
				{
					type: "bulleted_list_item",
					bulleted_list_item: {
						rich_text: [
							{ type: "text", text: { content: "現状: " }, annotations: { bold: true } },
							{ type: "text", text: { content: improvement.current } },
						],
					},
				},
				{
					type: "bulleted_list_item",
					bulleted_list_item: {
						rich_text: [
							{ type: "text", text: { content: "アクション: " }, annotations: { bold: true } },
							{ type: "text", text: { content: improvement.action } },
						],
					},
				}
			);
		});
	}

	// Working Files Section
	if (report.workingFiles.length > 0) {
		children.push({
			type: "heading_2",
			heading_2: {
				rich_text: [{ type: "text", text: { content: "📁 作業中だったファイル" } }],
			},
		});

		report.workingFiles.forEach((file) => {
			children.push({
				type: "bulleted_list_item",
				bulleted_list_item: {
					rich_text: [
						{ type: "text", text: { content: file.filename }, annotations: { code: true } },
						{ type: "text", text: { content: ` - ${file.description}` } },
					],
				},
			});
		});
	}

	// App Usage Section
	if (report.appUsage.length > 0) {
		children.push(
			{
				type: "heading_2",
				heading_2: {
					rich_text: [{ type: "text", text: { content: "💻 アプリ使用状況" } }],
				},
			},
			{
				type: "table",
				table: {
					table_width: 4,
					has_column_header: true,
					has_row_header: false,
					children: [
						{
							type: "table_row",
							table_row: {
								cells: [
									[{ type: "text", text: { content: "アプリ" } }],
									[{ type: "text", text: { content: "使用時間" } }],
									[{ type: "text", text: { content: "割合" } }],
									[{ type: "text", text: { content: "主な用途" } }],
								],
							},
						},
						...report.appUsage.map((app) => ({
							type: "table_row" as const,
							table_row: {
								cells: [
									[{ type: "text" as const, text: { content: app.app } }],
									[{ type: "text" as const, text: { content: app.duration } }],
									[{ type: "text" as const, text: { content: `${app.percentage}%` } }],
									[{ type: "text" as const, text: { content: app.mainUsage } }],
								],
							},
						})),
					],
				},
			}
		);
	}

	let pageId: string;

	console.log(`daily report: ${children.length} blocks to add`);

	if (activeReports.length > 0) {
		// Update existing report
		pageId = activeReports[0].id;
		console.log(`updating existing report: ${pageId}`);

		await withRetry(() => client.pages.update({
			page_id: pageId,
			properties,
		}));

		// Delete existing blocks
		const existingBlocks = await withRetry(() => client.blocks.children.list({
			block_id: pageId,
		}));

		console.log(`deleting ${existingBlocks.results.length} existing blocks`);
		for (const block of existingBlocks.results) {
			try {
				await withRetry(() => client.blocks.delete({
					block_id: block.id,
				}));
				// Small delay between deletes to avoid rate limiting
				await new Promise(resolve => setTimeout(resolve, 100));
			} catch (e) {
				console.warn(`failed to delete block ${block.id}:`, e);
			}
		}

		// Add new blocks in batches (Notion limit: 100 blocks per request)
		const batchSize = 100;
		for (let i = 0; i < children.length; i += batchSize) {
			const batch = children.slice(i, i + batchSize);
			console.log(`adding blocks batch ${i / batchSize + 1}: ${batch.length} blocks`);
			try {
				await withRetry(() => client.blocks.children.append({
					block_id: pageId,
					children: batch,
				}));
			} catch (e) {
				console.error(`failed to append blocks batch:`, e);
				throw e;
			}
		}
	} else {
		// Create new report
		console.log(`creating new report`);
		const newPage = await withRetry(() => client.pages.create({
			parent: { database_id: credentials.databaseId },
			properties,
			children,
		}));
		pageId = newPage.id;
	}

	return `https://notion.so/${pageId.replace(/-/g, "")}`;
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
			title: database.title[0]?.plain_text || "Untitled",
		}));
}
