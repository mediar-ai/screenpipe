const LINEAR_API_URL = "https://api.linear.app/graphql";

interface LinearComment {
  taskId: string;
  body: string;
}

async function generateLinearSearchQuery(
  screenData: ContentItem[],
  ollamaApiUrl: string,
  ollamaModel: string
): Promise<string> {
  const prompt = `based on the following screen data, generate a search query for linear tasks:

    ${JSON.stringify(screenData)}

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

  const response = await fetch(ollamaApiUrl, {
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    body: JSON.stringify({
      model: ollamaModel,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      response_format: { type: "json_object" },
    }),
  });

  console.log("response", response);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `http error! status: ${response.status}, body: ${errorBody}`
    );
  }

  const result = await response.json();

  console.log("ai answer:", result);

  return JSON.parse(result.message.content.trim());
}

async function generateLinearComment(
  screenData: ContentItem[],
  relevantTasks: any[],
  ollamaApiUrl: string,
  ollamaModel: string,
  customCommentPrompt: string
): Promise<LinearComment> {
  console.log("generating linear comment for tasks:", relevantTasks);
  const basePrompt = `based on the following screen data and relevant linear tasks, generate a concise, informative comment for the most relevant task:

    screen data: ${JSON.stringify(screenData)}
    relevant tasks: ${JSON.stringify(relevantTasks)}

    return a json object with the following structure:
    {
        "taskId": "linear task id of the most relevant task",
        "body": "informative comment about work done, progress made, or insights gained"
    }
        
    here are some examples:
    {
        "taskId": "ISS-42",
        "body": "implemented pagination for user list. load times improved by 60%. next: add infinite scroll"
    }
    {
        "taskId": "BUG-17",
        "body": "debugged async data fetching. root cause: race condition. proposed fix: implement mutex. need review"
    }
    {
        "taskId": "FEAT-23",
        "body": "drafted new onboarding flow. key changes: simplified sign-up form, added progress indicator. ready for design review"
    }
    {
        "taskId": "PERF-08",
        "body": "optimized db queries. avg response time: 500ms -> 150ms. identified potential for further improvement in caching layer"
    }
    {
        "taskId": "DOC-12",
        "body": "updated api docs with new endpoints. added example requests and responses. todo: update postman collection"
    }

    rules:
    - format JSON correctly
    - comment should directly relate to the task and recent work/activity
    - include specific details, metrics, or insights from the screen data
    - mention progress made, challenges encountered, or next steps if applicable
    - keep it concise but informative (aim for 2-3 sentences)
    - use technical language appropriate for the task context
    - do not add backticks to the json
    - return only the json object, no additional text`;

  const prompt = customCommentPrompt
    ? `${basePrompt}\n\nadditional instructions: ${customCommentPrompt}`
    : basePrompt;

  const response = await fetch(ollamaApiUrl, {
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    body: JSON.stringify({
      model: ollamaModel,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `http error! status: ${response.status}, body: ${errorBody}`
    );
  }

  const result = await response.json();

  return JSON.parse(result.message.content.trim());
}

async function getCurrentUser(
  apiKey: string
): Promise<{ id: string; name: string }> {
  const query = `
    {
      viewer {
        id
        name
      }
    }
  `;

  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `http error! status: ${response.status}, body: ${errorBody}`
    );
  }

  const result = await response.json();
  return result.data.viewer;
}

async function addCommentToLinear(
  comment: LinearComment,
  apiKey: string
): Promise<void> {
  const user = await getCurrentUser(apiKey);
  const commentWithMention = `<@${user.id}>: ${comment.body}`;

  const mutation = `
    mutation CreateComment($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
      }
    }
  `;

  const variables = {
    input: {
      issueId: comment.taskId,
      body: commentWithMention,
    },
  };

  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      Authorization: apiKey, // Remove the "Bearer" prefix
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: mutation, variables }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `http error! status: ${response.status}, body: ${errorBody}`
    );
  }

  const result = await response.json();
  console.log("result", result);

  console.log("comment added to linear successfully");
}

async function searchLinearTasks(
  queryText: string,
  apiKey: string
): Promise<any[]> {
  const query = `
    {
      issues(filter: { title: { contains: "${queryText}" } }) {
        nodes {
          id
          title
        }
      }
    }
  `;

  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      Authorization: apiKey, // Remove the "Bearer" prefix
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `http error! status: ${response.status}, body: ${errorBody}`
    );
  }

  const result = await response.json();
  return result.data.issues.nodes;
}

async function streamCommentsToLinear(): Promise<void> {
  console.log("starting comments stream to linear");

  const config = await pipe.loadConfig();
  console.log("loaded config:", JSON.stringify(config, null, 2));

  const interval = config.interval * 1000;
  const apiKey = config.linearApiKey;
  const ollamaApiUrl = config.ollamaApiUrl;
  const ollamaModel = config.ollamaModel;
  const customCommentPrompt = config.customCommentPrompt;

  while (true) {
    try {
      const now = new Date();
      const intervalAgo = new Date(now.getTime() - interval);

      const screenData = await pipe.queryScreenpipe({
        start_time: intervalAgo.toISOString(),
        end_time: now.toISOString(),
        limit: config.pageSize,
        content_type: "all",
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

        // step 4: add the comment to the linear task
        await addCommentToLinear(comment, apiKey);

        // randomly send a notification
        await pipe.sendNotification({
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
