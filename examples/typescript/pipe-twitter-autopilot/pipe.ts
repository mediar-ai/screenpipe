import { TwitterApi, type TweetV2 } from "twitter-api-v2";
import { z } from "zod";
import { generateObject } from "ai";
import { createOllama } from "ollama-ai-provider";
import { pipe, ContentItem } from "@screenpipe/js";
import { createOpenAI } from "@ai-sdk/openai";

const twitterSuggestionLog = z.object({
  suggestions: z.array(
    z.object({
      tweetId: z.string(),
      comment: z.string(),
    })
  ),
});

type TwitterSuggestionLog = z.infer<typeof twitterSuggestionLog>;

function createAIProvider(config: any) {
  if (config.aiProvider === "openai") {
    if (!config.openaiApiKey) {
      throw new Error("openai api key required when using openai provider");
    }
    return createOpenAI({
      apiKey: config.openaiApiKey,
    })(config.openaiModel || "gpt-4o");
  } else {
    return createOllama({ baseURL: config.aiApiUrl })(config.aiModel);
  }
}

async function extractKeywords(
  screenData: ContentItem[],
  config: any
): Promise<string[]> {
  if (config.keywords?.trim()) {
    const keywords = config.keywords.split(",").map((k: string) => k.trim());
    console.log("using hardcoded keywords:", keywords);
    return keywords;
  }

  const prompt = `Extract 5 relevant keywords from the following screen data:
    ${JSON.stringify(screenData)}
    Return a JSON object with a single array of strings, here are a few examples:
    - { "keywords": ["screen", "software", "developer", "product", "design"] }
  `;

  const provider = createAIProvider(config);

  const response = await generateObject({
    model: provider,
    messages: [{ role: "user", content: prompt }],
    schema: z.object({ keywords: z.array(z.string()) }),
  });

  console.log("extracted keywords:", response.object);
  return response.object.keywords;
}

async function filterTweetsWithAI(
  tweets: TweetV2[],
  customPrompt: string,
  config: any
): Promise<TweetV2[]> {
  const provider = createAIProvider(config);

  const filterPrompt = `you are a tweet filter. evaluate if these tweets are relevant based on these criteria:
${customPrompt}

additional rules:
- tweets should be engaging and worth responding to
- tweets should be from real users (not bots/spam)
- tweets should be relevant to screen recording, productivity, or software
- tweets should have potential for meaningful interaction

rate each tweet as either KEEP or SKIP. return a JSON array of booleans where true means KEEP.

example format:
{
  "keep": [true, false, true]
}`;

  const response = await generateObject({
    model: provider,
    messages: [
      { role: "system", content: filterPrompt },
      { role: "user", content: JSON.stringify(tweets.map((t) => t.text)) },
    ],
    schema: z.object({ keep: z.array(z.boolean()) }),
  });

  return tweets.filter((_, i) => response.object.keep[i]);
}

async function fetchRelevantTweets(
  keywords: string[],
  twitterClient: TwitterApi,
  customPrompt: string,
  config: any,
  desiredCount: number = 3,
  attempt: number = 1,
  maxAttempts: number = 3
): Promise<TweetV2[]> {
  // Expand search window based on attempt number
  const hoursAgo = attempt * 24; // Increase time window with each attempt
  const startTime = new Date(
    Date.now() - hoursAgo * 60 * 60 * 1000
  ).toISOString();

  // Decrease engagement thresholds with each attempt
  const minLikes = Math.max(1, 4 - attempt);
  const minReplies = Math.max(1, 3 - attempt);
  const minRetweets = Math.max(1, 3 - attempt);

  const relevantKeywords = keywords
    .filter((k) => k.length > 0)
    .map((k) => `"${k}"`)
    .join(" OR ");

  const query = `(${relevantKeywords}) lang:en -is:retweet -is:reply has:mentions`;

  try {
    console.log(
      `attempt ${attempt}: fetching tweets from last ${hoursAgo} hours`
    );

    const tweets = await twitterClient.v2.search(query, {
      max_results: 25 * attempt, // Fetch more tweets with each attempt
      start_time: startTime,
      "tweet.fields": [
        "id",
        "text",
        "author_id",
        "public_metrics",
        "created_at",
      ],
      "user.fields": ["id", "username", "public_metrics"],
      expansions: ["author_id"],
      sort_order: "relevancy",
    });

    // Pre-filter for engagement with reduced thresholds
    const engagementFiltered = tweets.data.data.filter((tweet) => {
      const metrics = tweet.public_metrics;
      return (
        metrics &&
        (metrics.like_count >= minLikes ||
          metrics.reply_count >= minReplies ||
          metrics.retweet_count >= minRetweets)
      );
    });

    // AI filter
    const aiFiltered = await filterTweetsWithAI(
      engagementFiltered,
      customPrompt,
      config
    );

    console.log(
      `attempt ${attempt} results: ${engagementFiltered.length} -> ${aiFiltered.length}`
    );

    // If we don't have enough relevant tweets and haven't hit max attempts, try again
    if (aiFiltered.length < desiredCount && attempt < maxAttempts) {
      console.log(
        `not enough relevant tweets, trying again with expanded criteria`
      );
      const nextAttemptTweets = await fetchRelevantTweets(
        keywords,
        twitterClient,
        customPrompt,
        config,
        desiredCount,
        attempt + 1,
        maxAttempts
      );
      return [...aiFiltered, ...nextAttemptTweets].slice(0, desiredCount);
    }

    return aiFiltered.slice(0, desiredCount);
  } catch (error) {
    console.log(`error in attempt ${attempt}:`, error);
    if (attempt < maxAttempts) {
      console.log("retrying with expanded criteria");
      return fetchRelevantTweets(
        keywords,
        twitterClient,
        customPrompt,
        config,
        desiredCount,
        attempt + 1,
        maxAttempts
      );
    }
    return [];
  }
}

async function generateTwitterSuggestions(
  tweets: TweetV2[],
  customPrompt: string,
  config: any
): Promise<TwitterSuggestionLog["suggestions"]> {
  // Only process the filtered tweets
  const tweetTexts = tweets.map((t) => t.text);

  const hardcodedPrompt = `you are a tweet comment generator. your task is to generate engaging replies to tweets.

rules for comments:
${customPrompt}

format rules:
- you MUST return a valid JSON object containing a "comments" array
- each comment in the array MUST be a string
- generate exactly ${tweetTexts.length} comments, one for each tweet provided
- comments should be in the same order as the tweets provided
- do NOT include any explanation or other text, ONLY the JSON object

here's a valid example:
{
  "comments": [
    "what do you think is the reason why this happen?",
    "been there, totally get it. the struggle is real",
    "hot take but you're absolutely right"
  ]
}

twitter algorithm optimization:
- aim for replies that get 13.5+ engagement score
- aim for profile visits that convert (12.0+ score)
- aim for author engagement on your reply (75.0+ score)
- avoid content that gets reported (-369.0 penalty)
- avoid content that gets muted/blocked (-74.0 penalty)`;

  const provider = createAIProvider(config);

  const response = await generateObject({
    model: provider,
    messages: [
      { role: "system", content: hardcodedPrompt },
      { role: "user", content: `tweets: ${tweetTexts.join("\n")}` },
    ],
    schema: z.object({ comments: z.array(z.string()) }),
  });

  // Map AI comments back to tweets with correct IDs
  return response.object.comments.map((comment, index) => ({
    tweetId: tweets[index].id,
    comment,
  }));
}

function generateTwitterLinks(
  suggestions: TwitterSuggestionLog["suggestions"]
): string {
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
  suggestions: TwitterSuggestionLog["suggestions"]
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
  const twitterBearerToken = config.twitterBearerToken;

  const twitterClient = new TwitterApi(twitterBearerToken);

  await pipe.inbox.send({
    title: "twitter suggestions stream started",
    body: `monitoring tweets every ${config.interval} seconds`,
  });

  pipe.scheduler
    .task("generateTwitterSuggestions")
    .every(`${config.interval} seconds`)
    .do(async () => {
      try {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - interval);

        const screenData = await pipe.queryScreenpipe({
          startTime: oneHourAgo.toISOString(),
          endTime: now.toISOString(),
          limit: 50,
          contentType: "ocr",
          minLength: 50,
        });

        console.log("fetched screen data:", screenData?.pagination.total);

        if (screenData && screenData.data.length > 0) {
          const keywords = await extractKeywords(screenData.data, config);
          console.log("extracted keywords:", keywords);
          const relevantTweets = await fetchRelevantTweets(
            keywords,
            twitterClient,
            config.customPrompt,
            config
          );

          if (relevantTweets.length > 0) {
            const suggestions = await generateTwitterSuggestions(
              relevantTweets,
              config.customPrompt,
              config
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

  pipe.scheduler.start();
}

// streamTwitterSuggestions();

/**

# these are mandatory env variables
export SCREENPIPE_DIR="$HOME/.screenpipe"
export PIPE_ID="pipe-twitter-autopilot"
export PIPE_FILE="pipe.ts"
export PIPE_DIR="$SCREENPIPE_DIR/pipes/pipe-twitter-autopilot"

bun run examples/typescript/pipe-twitter-autopilot/pipe.ts
 */

// ... existing code ...

async function testTwitterSuggestionsOnce(): Promise<void> {
  console.log("testing twitter suggestions with last 60 min data");

  const config = pipe.loadPipeConfig();
  console.log("loaded config:", JSON.stringify(config, null, 2));

  const twitterClient = new TwitterApi(config.twitterBearerToken);

  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const screenData = await pipe.queryScreenpipe({
      startTime: oneHourAgo.toISOString(),
      endTime: now.toISOString(),
      limit: 50,
      contentType: "ocr",
      minLength: 50,
    });

    console.log("fetched screen data:", screenData?.pagination.total);

    if (screenData && screenData.data.length > 0) {
      const keywords = await extractKeywords(screenData.data, config);
      console.log("extracted keywords:", keywords);
      const relevantTweets = await fetchRelevantTweets(
        keywords,
        twitterClient,
        config.customPrompt,
        config
      );

      if (relevantTweets.length > 0) {
        const suggestions = await generateTwitterSuggestions(
          relevantTweets,
          config.customPrompt,
          config
        );
        await syncSuggestionsToInbox(suggestions);
      } else {
        console.log("no relevant tweets found");
      }
    } else {
      console.log("no relevant screen data detected in the last hour");
    }
  } catch (error) {
    console.error("error in twitter suggestions test:", error);
    await pipe.inbox.send({
      title: "twitter suggestions test error",
      body: `error in twitter suggestions test: ${error}`,
    });
  }
}

// Comment out or remove the streamTwitterSuggestions() call
// streamTwitterSuggestions();

// Add this line to run the test function
testTwitterSuggestionsOnce();

// fetchRelevantTweets(
//   ["screen", "recording", "software"],
//   new TwitterApi(pipe.loadPipeConfig().twitterBearerToken)
// ).then(console.log);
