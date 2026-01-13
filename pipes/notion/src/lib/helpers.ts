import { ContentItem } from "@screenpipe/js";
import { WorkLog, DailyReport } from "./types";
import { embed } from "ai";
import { ollama } from "ollama-ai-provider";
import { z } from "zod";
import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import { settingsStore } from "./store/settings-store";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod.mjs";

export const workLog = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});

export const dailyReportSchema = z.object({
  // 総括
  summary: z.object({
    oneLine: z.string().describe("一言で今日を表すと"),
    achievements: z.array(z.string()).describe("達成できたこと"),
    challenges: z.array(z.string()).describe("課題・困難だったこと"),
  }),
  // 行動分析
  actionAnalysis: z.object({
    patterns: z.array(z.string()).describe("行動パターン（良い/悪い習慣）"),
    focusTime: z.string().describe("集中できた時間帯"),
    distractions: z.array(z.string()).describe("気が散った要因"),
  }),
  // メイン作業
  mainActivities: z.array(z.object({
    title: z.string(),
    description: z.string(),
    outcome: z.string().describe("成果・結果"),
  })),
  // 時間配分
  timeAllocation: z.array(z.object({
    category: z.string(),
    duration: z.string(),
    percentage: z.number(),
  })),
  // 知見・メモ
  insights: z.array(z.object({
    topic: z.string(),
    points: z.array(z.string()),
  })),
  // 注意点・警告
  attentionPoints: z.array(z.object({
    issue: z.string().describe("問題点"),
    risk: z.string().describe("リスク"),
    suggestion: z.string().describe("対処法"),
  })),
  // 改善点・次のアクション
  improvements: z.array(z.object({
    area: z.string().describe("改善領域"),
    current: z.string().describe("現状"),
    action: z.string().describe("具体的なアクション"),
    priority: z.enum(["high", "medium", "low"]),
  })),
  workingFiles: z.array(z.object({
    filename: z.string(),
    description: z.string(),
  })),
  appUsage: z.array(z.object({
    app: z.string(),
    duration: z.string(),
    percentage: z.number(),
    mainUsage: z.string(),
  })),
  tags: z.array(z.string()),
});

async function extractLinkedContent(prompt: string): Promise<string> {
  try {
    // Match @[[file]] or @[[folder/file]] patterns
    const linkRegex = /@\[\[(.*?)\]\]/g;
    const matches = [...prompt.matchAll(linkRegex)];
    const settings = await settingsStore.loadPipeSettings("notion");
    let enrichedPrompt = prompt;

    const notion = new Client({
      auth: settings?.notion?.accessToken,
    });

    const n2m = new NotionToMarkdown({ notionClient: notion });
    for (const match of matches) {
      const pageId = match[1];

      try {
        const mdblocks = await n2m.pageToMarkdown(pageId);
        const mdString = n2m.toMarkdownString(mdblocks);

        enrichedPrompt = enrichedPrompt.replace(
          match[0],
          `\n--- Content of ${pageId} ---\n${mdString.parent}\n---\n`
        );
      } catch (error) {
        console.error(error, `of ${pageId}`);
      }
    }
    return enrichedPrompt;
  } catch (e) {
    console.error("not able to connect to notion", e);
    return prompt;
  }
}

export async function generateWorkLog(
  screenData: ContentItem[],
  aiPreset: ReturnType<typeof settingsStore.getPreset>,
  startTime: Date,
  endTime: Date,
  customPrompt?: string
): Promise<WorkLog> {

  if (!aiPreset) {
    throw new Error("ai preset not found");
  }

  let enrichedPrompt = customPrompt || aiPreset.prompt || "";

  if (customPrompt) {
    enrichedPrompt = await extractLinkedContent(customPrompt);
  }

  const defaultPrompt = `あなたはスクリーンデータを分析し、正確な作業ログを生成するアシスタントです。

## 分析指示
- スクリーンデータを詳細に分析し、実行されたメイン作業を特定してください
- 使用したアプリケーション名、閲覧したウェブサイト、作業したドキュメントを具体的に抽出してください
- 完了した作業について、正確かつ事実に基づいた説明を作成してください
- 実際のコンテンツに基づいて関連タグを特定してください（プロジェクト名、ツール名、トピックなど）
- 以下のコンテキストを参考に、ユーザーの目標と優先事項を理解してください：

${enrichedPrompt}

## 分析対象データ
${JSON.stringify(screenData)}

## 出力形式
以下の構造でJSONを返してください：
{
    "title": "メイン作業を反映した具体的で正確なタイトル",
    "description": "達成した内容の詳細かつ簡潔な説明（具体的なツール名やコンテンツを含める）",
    "tags": ["#関連タグ1", "#関連タグ2", "#関連タグ3"]
}

※ JSONは正しくフォーマットされ、指定されたフィールドのみを含めてください。
※ すべての出力は日本語で記述してください。`;

  console.log("enrichedPrompt prompt:", enrichedPrompt);

  const openai = new OpenAI({
    apiKey: aiPreset.apiKey,
    baseURL: aiPreset.url,
    dangerouslyAllowBrowser: true,
  });

  const response = await openai.chat.completions.create({
    model: aiPreset.model,
    messages: [{ role: "user", content: defaultPrompt }],
    response_format: zodResponseFormat(workLog, "workLog"),
  });

  const formatDate = (date: Date) => {
    return date.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  return {
    ...JSON.parse(response.choices[0].message.content || "{}"),
    startTime: formatDate(startTime),
    endTime: formatDate(endTime),
  };
}

export async function generateDailyReport(
  screenData: ContentItem[],
  aiPreset: ReturnType<typeof settingsStore.getPreset>,
  startTime: Date,
  endTime: Date,
  customPrompt?: string
): Promise<DailyReport> {
  if (!aiPreset) {
    throw new Error("ai preset not found");
  }

  let enrichedPrompt = customPrompt || "";

  if (customPrompt) {
    enrichedPrompt = await extractLinkedContent(customPrompt);
  }

  const formatTime = (date: Date) => {
    return date.toLocaleString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).replace(/\//g, "-");
  };

  const durationMs = endTime.getTime() - startTime.getTime();
  const durationMinutes = Math.round(durationMs / 60000);
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  const durationStr = hours > 0 ? `約${hours}時間${minutes}分` : `約${minutes}分`;

  const systemPrompt = `あなたは日本語で**深い洞察のある作業日報**を作成する専門アシスタントです。

## プライバシー・モラルガイドライン（最重要・厳守）

以下の内容は**絶対に記載しない**でください。違反は重大なプライバシー侵害です。

### 完全除外（一切言及禁止）

#### 金融・決済
- 銀行サイト（みずほ、三菱UFJ、三井住友、楽天銀行、PayPay銀行など）
- クレジットカード情報、口座番号、残高、振込履歴
- 決済画面（Amazon、楽天市場などの支払い画面）
- 仮想通貨、投資、証券取引

#### 認証・セキュリティ
- パスワード入力、PIN、セキュリティコード
- 1Password、Bitwarden、LastPassなどのパスワードマネージャー
- 二要素認証、SMS認証コード
- ログイン画面の詳細

#### アダルト・エンターテイメント
- 成人向けサイト、動画、画像（FANZA、Pornhub、XVideosなど）
- 出会い系、マッチングアプリ（Tinder、Pairsなど）
- ギャンブル（オンラインカジノ、競馬、パチンコなど）
- 違法コンテンツ

#### 医療・健康
- 病名、症状、診断結果
- 薬の名前、処方箋
- 病院、クリニック名
- 健康診断結果

#### 個人情報
- 住所、電話番号、メールアドレス
- マイナンバー、免許証番号、パスポート番号
- 家族、友人の名前や個人情報
- プライベートな写真

#### プライベートコミュニケーション
- LINE、WhatsApp、Messengerの個人チャット内容
- 個人的なメールの内容
- SNSのDM内容

### 記載する場合の抽象化ルール
- 銀行サイトを見た → 記載しない（完全除外）
- パスワード変更 → 記載しない
- 友人とLINE → 「プライベートコミュニケーション」とだけ記載（詳細は絶対に書かない）
- 医療関連のサイト → 記載しない
- 買い物の決済 → 記載しない

### 業務関連のみ記載
- 仕事に直接関係する活動のみを分析対象とする
- 休憩中の個人的な活動は完全に除外
- 判断に迷ったら除外する（安全側に倒す）

---

## あなたの役割
単なる「何をしたか」の記録ではなく、以下を分析・提供してください：
- **なぜ**その行動をしたのか（動機・目的）
- **何を達成したのか**（成果・結果）
- **何がうまくいかなかったか**（課題・問題点）
- **明日から何を改善すべきか**（具体的なアクション）
- **注意すべきリスク**は何か

## 重要なルール
- **すべての出力は必ず日本語で記述してください**
- 英語のテキストが入力に含まれていても、出力は日本語に翻訳してください
- 技術用語やアプリ名は原語のまま使用可（例: Visual Studio Code, Slack）
- **表面的な記録ではなく、実用的な洞察を提供する**
- スクリーンデータから行動パターンを読み取り、良い習慣・悪い習慣を特定する
- 曖昧な表現を避け、具体的かつ実行可能な提案をする`;

  const dailyReportPrompt = `## 分析するデータ
記録期間: ${formatTime(startTime)} 〜 ${formatTime(endTime)}（${durationStr}）
キャプチャ数: ${screenData.length}回

スクリーンデータ:
${JSON.stringify(screenData, null, 2)}

${enrichedPrompt ? `## ユーザーコンテキスト\n${enrichedPrompt}\n` : ""}

## 出力要件（すべて日本語で、深い分析を含めて）

### 1. summary（総括）- 最重要
- **oneLine**: 一言で今日を表すと（例：「Notion連携の実装に集中したが、API制限で苦戦した日」）
- **achievements**: 今日達成できたこと（具体的に2-4項目）
- **challenges**: 課題・困難だったこと（正直に1-3項目）

### 2. actionAnalysis（行動分析）
- **patterns**: 観察された行動パターン
  - 良い習慣（例：「午前中にコーディングに集中」）
  - 悪い習慣（例：「SNSをチェックする頻度が高い」）
- **focusTime**: 最も集中できていた時間帯
- **distractions**: 気が散った要因（アプリ名、サイト名を具体的に）

### 3. mainActivities（メイン作業）3-5項目
- title: 作業タイトル
- description: 何をしたか（2-3文）
- **outcome**: 成果・結果は何だったか（これが重要！）

### 4. timeAllocation（時間配分）
- カテゴリ、duration（"2時間30分"形式）、percentage（合計100%）

### 5. insights（知見・メモ）
- topic と points でグループ化

### 6. attentionPoints（注意点・警告）- 重要
今後気をつけるべきこと：
- **issue**: 何が問題か
- **risk**: 放置するとどうなるか
- **suggestion**: どう対処すべきか

### 7. improvements（改善点・次のアクション）- 最重要
明日から実行すべきこと：
- **area**: 改善したい領域
- **current**: 今の状況
- **action**: 具体的に何をするか（実行可能な形で）
- **priority**: "high" / "medium" / "low"

### 8. workingFiles, appUsage, tags
- ファイル名、アプリ使用状況、関連タグ（#付き）`;


  console.log("generating daily report...");

  const openai = new OpenAI({
    apiKey: aiPreset.apiKey,
    baseURL: aiPreset.url,
    dangerouslyAllowBrowser: true,
  });

  const response = await openai.chat.completions.create({
    model: aiPreset.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: dailyReportPrompt }
    ],
    response_format: zodResponseFormat(dailyReportSchema, "dailyReport"),
  });

  const reportData = JSON.parse(response.choices[0].message.content || "{}");

  return {
    date: formatDate(endTime),
    recordingPeriod: `${formatTime(startTime)} 〜 ${formatTime(endTime)}（${durationStr}）`,
    captureCount: screenData.length,
    ...reportData,
  };
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (normA * normB);
}

export async function deduplicateScreenData(
  screenData: ContentItem[],
): Promise<ContentItem[]> {
  if (!screenData.length) return screenData;

  try {
    const provider = ollama.embedding("nomic-embed-text");
    const embeddings: number[][] = [];
    const uniqueData: ContentItem[] = [];
    let duplicatesRemoved = 0;

    for (const item of screenData) {
      const textToEmbed =
        "content" in item
          ? typeof item.content === "string"
            ? item.content
            : "text" in item.content
              ? item.content.text
              : JSON.stringify(item.content)
          : "";

      if (!textToEmbed.trim()) {
        uniqueData.push(item);
        continue;
      }

      try {
        const { embedding } = await embed({
          model: provider,
          value: textToEmbed,
        });

        let isDuplicate = false;
        for (let i = 0; i < embeddings.length; i++) {
          const similarity = cosineSimilarity(embedding, embeddings[i]);
          if (similarity > 0.95) {
            isDuplicate = true;
            duplicatesRemoved++;
            break;
          }
        }

        if (!isDuplicate) {
          embeddings.push(embedding);
          uniqueData.push(item);
        }
      } catch (error) {
        console.warn("embedding failed for item, keeping it:", error);
        uniqueData.push(item);
      }
    }

    console.log(
      `deduplication: removed ${duplicatesRemoved} duplicates from ${screenData.length} items`,
    );
    return uniqueData;
  } catch (error) {
    console.warn("deduplication failed, using original data:", error);
    return screenData;
  }
}
