import { ContentItem, pipe } from "@screenpipe/js";

import { z } from "zod";
import { generateObject } from "ai";
import { createOllama } from "ollama-ai-provider";
import { LinearClient } from "@linear/sdk";

const linearSearchQuery = z.object({
  query: z.string(),
});

const linearComment = z.object({
  taskId: z.string(),
  body: z.string(),
  nothingToDo: z.boolean().optional(),
});

async function generateLinearSearchQuery(
  screenData: ContentItem[],
  ollamaApiUrl: string,
  ollamaModel: string
): Promise<string> {
  const prompt = `based on the following screen data, generate a search query for linear tasks:

    ${JSON.stringify(screenData)}

    the query should be relevant to the screen/audio data and will be used to search for relevant linear tasks in the product management tool of the user to comment on it

    return a json object with a single 'query' field containing only the text to search for in the task title. here are some examples:
    - { "query": "audio" }
    - { "query": "macos" }
    - { "query": "windows" }
    - { "query": "docs" }
    - { "query": "ocr" }
    - { "query": "vad" }
    - { "query": "debian" }
        
    rules:
    - format JSON correctly
    - query should be relevant to the screen/audio data
    - return only a short phrase or few keywords, not a full sentence
    - do not add backticks to the json
    - return only the json object, no additional text
    `;

  const provider = createOllama({
    baseURL: ollamaApiUrl,
  });

  const response = await generateObject({
    model: provider(ollamaModel),
    messages: [{ role: "user", content: prompt }],
    schema: linearSearchQuery,
  });

  console.log("ai response", response);

  return response.object.query;
}

async function generateLinearComment(
  screenData: ContentItem[],
  relevantTasks: any[],
  ollamaApiUrl: string,
  ollamaModel: string,
  customCommentPrompt: string
): Promise<z.infer<typeof linearComment>> {
  console.log("generating linear comment for tasks:", relevantTasks);
  const basePrompt = `based on the following screen data and relevant linear tasks, generate a concise, informative comment for the most relevant task:

    screen data: ${JSON.stringify(screenData)}
    relevant tasks: ${JSON.stringify(relevantTasks)}

    return a json object with the following structure:
    {
        "taskId": "linear task id of the most relevant task (must be one of the provided task ids)",
        "body": "informative comment about work done, progress made, or insights gained related to the chosen task"
        "nothingToDo": "no task to comment on based on the screen data"
    }
        
    rules:
    - format JSON correctly
    - taskId MUST be one of the provided task ids, do not invent new ones
    - comment should directly relate to the chosen task and recent work/activity
    - include specific details, metrics, or insights from the screen data if applicable
    - mention progress made, challenges encountered, or next steps if applicable
    - keep it concise but informative (aim for 2-3 sentences)
    - use technical language appropriate for the task context
    - do not add backticks to the json
    - return only the json object, no additional text`;

  const prompt = customCommentPrompt
    ? `${basePrompt}\n\nadditional instructions: ${customCommentPrompt}`
    : basePrompt;

  const provider = createOllama({
    baseURL: ollamaApiUrl,
  });

  const response = await generateObject({
    model: provider(ollamaModel),
    messages: [{ role: "user", content: prompt }],
    schema: linearComment,
  });

  console.log("ai response", response);

  return response.object;
}

async function getCurrentUser(
  apiKey: string
): Promise<{ id: string; name: string }> {
  const client = new LinearClient({ apiKey });
  const viewer = await client.viewer;
  return { id: viewer.id, name: viewer.name };
}

async function addCommentToLinear(
  comment: z.infer<typeof linearComment>,
  apiKey: string
): Promise<void> {
  const client = new LinearClient({ apiKey });
  const user = await getCurrentUser(apiKey);
  const commentWithMention = `<@${user.id}>: ${comment.body}`;

  try {
    await client.createComment({
      issueId: comment.taskId as string,
      body: commentWithMention,
    });
    console.log("comment added to linear successfully");

    // Send inbox message
    const issue = await client.issue(comment.taskId as string);
    const inboxMessage = {
      title: `Comment added to: ${issue.title}`,
      body: `
### New comment on Linear issue

${comment.body}

[View issue in Linear](${issue.url})
      `,
    };
    await pipe.inbox.send(inboxMessage);
  } catch (error) {
    console.error("linear api error:", error);
    throw new Error("failed to add comment to linear");
  }
}

async function searchLinearTasks(
  queryText: string,
  apiKey: string
): Promise<any[]> {
  const client = new LinearClient({ apiKey });
  const issues = await client.issues({
    filter: {
      title: { contains: queryText },
    },
  });

  return issues.nodes.map((issue) => ({
    id: issue.id,
    title: issue.title,
  }));
}

async function streamCommentsToLinear(): Promise<void> {
  console.log("starting comments stream to linear");

  const config = await pipe.loadPipeConfig();
  console.log("loaded config:", JSON.stringify(config, null, 2));

  const interval = config.interval * 1000;
  const apiKey = config.linearApiKey;
  const ollamaApiUrl = config.ollamaApiUrl;
  const ollamaModel = config.ollamaModel;
  const customCommentPrompt = config.customCommentPrompt;
  const windowName = config.windowName;
  const contentType = config.contentType;

  // announce pipe in the inbox
  await pipe.inbox.send({
    title: "linear comment pipeline started",
    body: `commenting on linear tasks every ${interval / 1000} seconds`,
  });

  while (true) {
    await new Promise((resolve) => setTimeout(resolve, interval));

    try {
      const now = new Date();
      const intervalAgo = new Date(now.getTime() - interval);

      const screenData = await pipe.queryScreenpipe({
        startTime: intervalAgo.toISOString(),
        endTime: now.toISOString(),
        limit: config.pageSize,
        contentType: contentType,
        windowName: windowName,
      });

      if (screenData && screenData.data.length > 0) {
        // step 1: ask llm to generate a function call to search linear tasks
        const searchQuery = await generateLinearSearchQuery(
          screenData.data,
          ollamaApiUrl,
          ollamaModel
        );

        // step 2: execute the search on linear
        const relevantTasks = await searchLinearTasks(searchQuery, apiKey);

        if (relevantTasks.length === 0) {
          console.log("no relevant tasks found");
          continue;
        }

        // step 3: ask llm to generate a comment for the most relevant task
        const comment = await generateLinearComment(
          screenData.data,
          relevantTasks,
          ollamaApiUrl,
          ollamaModel,
          customCommentPrompt
        );

        if (comment.nothingToDo) {
          console.log("no comment to add to linear");
          continue;
        }

        // step 4: add the comment to the linear task
        await addCommentToLinear(comment, apiKey);

        // randomly send a notification
        await pipe.sendDesktopNotification({
          title: "linear comment pipeline update",
          body: `comment added to task ${comment.taskId}`,
        });
      } else {
        console.log("no relevant work detected in the last interval");
      }
    } catch (error: any) {}
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

streamCommentsToLinear();
