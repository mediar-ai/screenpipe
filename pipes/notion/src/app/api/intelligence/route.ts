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

	const prompt = `あなたはプロフェッショナルな人脈インテリジェンスアナリストです。作業ログを分析し、人脈に関する包括的なレポートを生成してください。

    【重要な制約】
    - 出力は全て日本語で行うこと
    - 抽出するのは「実際の人物」のみ。プロジェクト名、ツール名、会社名を人物として抽出しないこと
    - 例: "Screenpipe", "Notion", "ClaudeCode" などはツール/プロジェクト名なので抽出しない
    - 例: "Jon Wilcox", "田中太郎" などの実際の人名のみを抽出する

    【分析の目的】
    1. ログに登場する実際の人物の氏名と所属組織を抽出
    2. 各やり取りの性質と質を判定（ポジティブ、ニュートラル、ネガティブ）
    3. やり取りの文脈に基づいてセンチメントスコア（-1〜1）を算出
    4. 繰り返し議論されているトピックとその重要性を特定
    5. ビジネスチャンスやコラボレーションの可能性を認識
    6. 各連絡先に対する具体的でアクション可能なフォローアップを提案

    【コンテキスト】
    本日の日付: ${new Date().toISOString().split("T")[0]}
    現在時刻: ${new Date().toLocaleTimeString()}
    タイムゾーン: ${Intl.DateTimeFormat().resolvedOptions().timeZone}

    【分析対象の作業ログ】
    ${recentLogs}

    【レスポンス形式】
    以下の構造のJSONオブジェクトを返してください:
    {
      "contacts": [
        {
          "name": "氏名（実際の人物名のみ）",
          "company": "所属組織名",
          "lastInteraction": "YYYY-MM-DD",
          "sentiment": 0.X, // -1.0（ネガティブ）〜 1.0（ポジティブ）
          "topics": ["トピック1", "トピック2", "トピック3"],
          "nextSteps": ["具体的なアクション1", "具体的なアクション2"]
        }
      ],
      "insights": {
        "followUps": ["優先フォローアップ1", "優先フォローアップ2"],
        "opportunities": ["ビジネスチャンス1", "ビジネスチャンス2"]
      }
    }

    【重要事項】
    - 実際の人物名のみを抽出すること（ツール名・プロジェクト名・会社名は除外）
    - ログに人物が見つからない場合は、contactsを空配列にすること
    - センチメントスコアはやり取りの質を正確に反映すること
    - 各連絡先に対して具体的でアクション可能な次のステップを提案すること
    - 緊急度と潜在的価値に基づいてフォローアップの優先順位をつけること
    - 明確な潜在的メリットを持つ具体的なビジネスチャンスを特定すること
    `;

	const openai = new OpenAI({
		apiKey: aiPreset.apiKey,
		baseURL: aiPreset.url,
	});

	// Debug logging disabled for production - contains user data
	// console.log("prompt", prompt);


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
			{ error: "failed to process intelligence" },
			{ status: 500 },
		);
	}
}
