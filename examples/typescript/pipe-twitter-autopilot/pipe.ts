import { ContentItem } from "screenpipe";
import { TwitterApi, type TweetV2 } from "twitter-api-v2";
import { z } from "zod";
import { generateObject } from "ai";
import { createOllama } from "ollama-ai-provider";
import { pipe } from "screenpipe";

const twitterSuggestionLog = z.object({
  tweetId: z.string(),
  comment: z.string(),
});

type TwitterSuggestionLog = z.infer<typeof twitterSuggestionLog>;

async function extractKeywords(
  screenData: ContentItem[],
  ollamaModel: string,
  ollamaApiUrl: string
): Promise<string[]> {
  const prompt = `Extract 5 relevant keywords from the following screen data:

    ${JSON.stringify(screenData)}

    Return a JSON object with a single array of strings, here are a few examples:
    - { keywords: ["screen", "software", "developer", "product", "design"] }

  `;

  const provider = createOllama({ baseURL: ollamaApiUrl });

  const response = await generateObject({
    model: provider(ollamaModel),
    messages: [{ role: "user", content: prompt }],
    schema: z.object({ keywords: z.array(z.string()) }),
  });

  console.log("extracted keywords:", response.object);
  return response.object.keywords;
}

async function fetchRelevantTweets(
  keywords: string[],
  twitterClient: TwitterApi
): Promise<TweetV2[]> {
  const query = `(${keywords.join(" OR ")}) (lang:en OR from:louis030195 OR to:louis030195)`;
  const tweets = await twitterClient.v2.search(query, {
    max_results: 10,
    "tweet.fields": ["id", "text", "author_id"],
    "user.fields": ["id", "username", "location"],
    expansions: ["author_id"],
  });
  
  // Filter tweets based on US location or related to your account
  const filteredTweets = tweets.data.data.filter(tweet => {
    const author = tweets.includes?.users?.find(user => user.id === tweet.author_id);
    return (
      author?.location?.toLowerCase().includes("united states") ||
      author?.location?.toLowerCase().includes("usa") ||
      author?.username === "louis030195" ||
      tweet.text.toLowerCase().includes("@louis030195")
    );
  });

  return filteredTweets;
}

async function generateTwitterSuggestions(
  tweets: TweetV2[],
  customPrompt: string,
  ollamaModel: string,
  ollamaApiUrl: string
): Promise<TwitterSuggestionLog[]> {
  const hardcodedPrompt = `you generate 3 tweet comments to these tweets: ${tweets
    .map((tweet) => tweet.text)
    .join(", ")}

    respect these rules: ${customPrompt}

    your goal is to help the user grow their twitter account by generating comments that are engaging and help the user get more likes, replies and followers.

    TLDR of twitter algorithm:

    optimize for these engagement metrics (higher is better):
    - probability the user replies to the tweet: 13.5
    - probability the user opens the tweet author profile and likes or replies to a tweet: 12.0
    - probability the user replies to the tweet and this reply is engaged by the tweet author: 75.0
    - probability the user will click into the conversation of this tweet and reply or like a tweet: 11.0
    - probability the user will click into the conversation and stay there for at least 2 minutes: 10.0

    avoid these negative outcomes:
    - probability the user will react negatively (requesting "show less often" on the tweet or author, block or mute the tweet author): -74.0
    - probability the user will click report tweet: -369.0

    for each tweet, return a json object:
    {
        "tweetId": "the id of the tweet",
        "comment": "the tweet comment"
    }`;

  const provider = createOllama({ baseURL: ollamaApiUrl });

  const response = await generateObject({
    model: provider(ollamaModel),
    messages: [{ role: "user", content: hardcodedPrompt }],
    schema: z.array(twitterSuggestionLog),
  });

  console.log("ai suggestions:", response.object);
  return response.object;
}

function generateTwitterLinks(suggestions: TwitterSuggestionLog[]): string {
  return suggestions
    .map((suggestion, index) => {
      const encodedComment = encodeURIComponent(suggestion.comment);

      const twitterLink = `https://twitter.com/intent/tweet?in_reply_to=${suggestion.tweetId}&text=${encodedComment}`;

      return `
### ${index + 1}. Tweet: ${suggestion.tweetId}

Comment: ${suggestion.comment}

[Comment on Twitter](${twitterLink})
    `.trim();
    })
    .join("\n\n");
}

async function syncSuggestionsToInbox(
  suggestions: TwitterSuggestionLog[]
): Promise<void> {
  try {
    console.log("syncSuggestionsToInbox", suggestions);

    const markdownContent = generateTwitterLinks(suggestions);

    await pipe.inbox.send({
      title: "twitter suggestions",
      body: `new twitter suggestions:\n\n${markdownContent}`,
    });
  } catch (error) {
    console.error("error syncing twitter suggestions to inbox:", error);
    await pipe.inbox.send({
      title: "twitter suggestions error",
      body: `error syncing twitter suggestions to inbox: ${error}`,
    });
  }
}

async function streamTwitterSuggestions(): Promise<void> {
  console.log("starting twitter suggestions stream");

  const config = pipe.loadPipeConfig();
  console.log("loaded config:", JSON.stringify(config, null, 2));

  const interval = config.interval * 1000;
  const ollamaApiUrl = config.aiApiUrl;
  const ollamaModel = config.aiModel;
  const twitterBearerToken = config.twitterBearerToken;

  const twitterClient = new TwitterApi(twitterBearerToken);

  await pipe.inbox.send({
    title: "twitter suggestions stream started",
    body: `monitoring tweets every ${config.interval} seconds`,
  });

  pipe.scheduler
    .task("generateTwitterSuggestions")
    // .every(interval)

    .every("1 minutes")
    .do(async () => {
      try {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - interval);

        const screenData = await pipe.queryScreenpipe({
          startTime: oneHourAgo.toISOString(),
          endTime: now.toISOString(),
          limit: 50,
          contentType: "ocr",
        });

        if (screenData && screenData.data.length > 0) {
          const keywords = await extractKeywords(
            screenData.data,
            ollamaModel,
            ollamaApiUrl
          );
          const relevantTweets = await fetchRelevantTweets(
            keywords,
            twitterClient
          );

          if (relevantTweets.length > 0) {
            const suggestions = await generateTwitterSuggestions(
              relevantTweets,
              config.customPrompt,
              ollamaModel,
              ollamaApiUrl
            );
            await syncSuggestionsToInbox(suggestions);
          } else {
            console.log("no relevant tweets found");
          }
        } else {
          console.log("no relevant screen data detected in the last hour");
        }
      } catch (error) {
        console.error("error in twitter suggestions pipeline:", error);
        await pipe.inbox.send({
          title: "twitter suggestions error",
          body: `error in twitter suggestions pipeline: ${error}`,
        });
      }
    });

  await pipe.scheduler.start();
}

streamTwitterSuggestions();

/**

# these are mandatory env variables
export SCREENPIPE_DIR="$HOME/.screenpipe"
export PIPE_ID="pipe-twitter-autopilot"
export PIPE_FILE="pipe.ts"
export PIPE_DIR="$SCREENPIPE_DIR/pipes/pipe-twitter-autopilot"

deno run --allow-read --allow-write --allow-env --allow-net --allow-run --allow-sys examples/typescript/pipe-twitter-autopilot/pipe.ts
 */
