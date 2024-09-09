const INTERVAL = 1 * 60 * 1000; // 1 minute in milliseconds

async function queryScreenpipe(params) {
  try {
    const queryParams = Object.entries(params)
      .filter(([_, v]) => v != null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    console.log("Calling Screenpipe:", JSON.stringify(params));
    const result = await pipe.get(
      `http://localhost:3030/search?${queryParams}`
    );
    // console.log("Retrieved", result.data.length, "items from Screenpipe");
    return result;
  } catch (error) {
    console.error("Error querying Screenpipe:", error);
    return null;
  }
}

async function getAIProvider() {
  const provider = "ollama";
  const model = "Hermes-llama-3.1:latest";
  return { provider, model };
}

async function checkSecurity(provider, screenData) {
  const prompt = `Act like a cybersecurity expert with 10 years of experience detecting suspicious activity. Analyze the following screen data and determine if a security issue is present.

Instructions:
    Analyze the screen data for suspicious activity.
    Output a JSON object:

        {
        "securityIssueFound": true,  // or false
        "reason": "Specify the reason for the issue"
        "summary": "One-sentence summary of the security threat"
        }
    Input:
        ${JSON.stringify(screenData)}
    Output only the JSON object.`;

  try {
    const result = await pipe.post(
      "http://localhost:10001/api/chat",
      JSON.stringify({
        model: provider.model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        stream: false,
      })
    );
    console.log("AI answer:", result);
    const content = result.message.content;
    console.log("AI answer content:", content);
    return JSON.parse(content);
  } catch (error) {
    console.error("Error in AI Response:", error);
  }
}

async function checkRecentActivities(provider) {
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - INTERVAL);

  const screenData = await queryScreenpipe({
    start_time: oneMinuteAgo.toISOString(),
    end_time: now.toISOString(),
    limit: 5,
    content_type: "ocr",
  });

//   console.log("Screenpipe data:", screenData);

  if (!screenData || !screenData.data || screenData.data.length === 0) {
    console.log("No data retrieved from Screenpipe");
    return;
  }

  const response  = await checkSecurity(provider, screenData);
  console.log("Security check for recent activities response: ", response);
  if (response.securityIssueFound) {
    console.error("Security issue detected", response.reason);
    // pipe.sendNotification("Security issue detected", response.reason);
  } else {
    console.log("No security issue detected");
  }
}

async function runSecurityChecker() {
  const provider = await getAIProvider();
  console.log("Starting Security Checker with provider:", provider);

  while (true) {
    try {
      await checkRecentActivities(provider);
    } catch (error) {
        // pipe.sendNotification({title: "Error in security check", body: error.message})
      console.error("Error in security check of activity:", error);
    }
    await new Promise(resolve => setTimeout(resolve, INTERVAL));
  }
}

// Self-invoking async function to run the activity tagger
(async () => {
  try {
    await runSecurityChecker();
  } catch (error) {
    console.error("Fatal error in Activity Tagger:");
    if (error instanceof Error) {
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    } else {
      console.error("Unexpected error:", error);
    }
  }
})();
