import { pipe, ContentItem } from "@screenpipe/js";
import Anthropic from "@anthropic-ai/sdk";

let anthropic: Anthropic;
let meetingNotes = "";
let actionItems: string[] = [];

// VERY EXPERIMENTAL

// this pipe assist my meetings by taking notes and suggesting things i could do or say
// during the meeting by writing in my note taking software opened in split screen

async function meetingAssistant() {
  console.log("starting meeting assistant");

  const config = pipe.loadPipeConfig();
  const interval = config.interval * 1000 || 30000; // Default to 30 seconds if not specified

  // Initialize Anthropic client with API key from config
  anthropic = new Anthropic({
    apiKey: config.anthropicApiKey,
  });

  pipe.scheduler
    .task("processMeetingData")
    .every(interval)
    .do(async () => {
      try {
        const screenData = await captureScreen();
        const audioData = await captureAudio();

        if (screenData && audioData) {
          await processData(screenData, audioData);
          await generateSuggestions();
        }
      } catch (error) {
        console.error("error in meeting assistant:", error);
      }
    });

  await pipe.scheduler.start();
}

async function captureScreen() {
  const now = new Date();
  const intervalAgo = new Date(now.getTime() - 30000); // Last 30 seconds

  return await pipe.queryScreenpipe({
    startTime: intervalAgo.toISOString(),
    endTime: now.toISOString(),
    limit: 1,
    contentType: "ocr",
    includeFrames: true,
  });
}

async function captureAudio() {
  const now = new Date();
  const intervalAgo = new Date(now.getTime() - 30000); // Last 30 seconds

  return await pipe.queryScreenpipe({
    startTime: intervalAgo.toISOString(),
    endTime: now.toISOString(),
    limit: 1,
    contentType: "audio",
  });
}

async function processData(
  screenData: ContentItem[],
  audioData: ContentItem[]
) {
  if (screenData.length === 0 || audioData.length === 0) {
    console.log("No new data to process");
    return;
  }

  const screenContent =
    screenData[0].type === "OCR" ? screenData[0].content.text : "";
  const audioContent =
    audioData[0].type === "STT" ? audioData[0].content.text : "";

  const tools = [
    {
      type: "computer_20241022",
      name: "computer",
      display_width_px: 1920,
      display_height_px: 1080,
    },
  ];

  let response = await anthropic.beta.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    tools: tools,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyze this meeting data and update the meeting notes. Extract any action items.

Screen content: ${screenContent}
Audio content: ${audioContent}

Current meeting notes:
${meetingNotes}

Use the computer tools to save the updated notes and action items.`,
          },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data:
                screenData[0].type === "OCR" ? screenData[0].content.frame : "",
            },
          },
        ],
      },
    ],
    betas: ["computer-use-2024-10-22"],
  });

  // Implement agent loop to handle tool use requests
  while (response.stop_reason === "tool_use") {
    const toolUse = response.tool_calls[0];
    const toolResult = await executeToolUse(toolUse);

    // Continue the conversation with the tool result
    response = await anthropic.beta.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      tools: tools,
      messages: [
        ...response.messages,
        {
          role: "user",
          content: [
            { type: "tool_result", id: toolUse.id, output: toolResult },
          ],
        },
      ],
      betas: ["computer-use-2024-10-22"],
    });
  }

  // Process the final response
  const result = JSON.parse(response.content[0].text);
  meetingNotes = result.updatedNotes;
  actionItems = [...actionItems, ...result.newActionItems];

  console.log("Meeting notes updated");
  console.log("New action items:", result.newActionItems);
}

async function executeToolUse(toolUse: any) {
  const { name, arguments: args } = toolUse;

  if (name === "computer") {
    const parsedArgs = JSON.parse(args);
    if (parsedArgs.action === "type") {
      return await pipe.input.type(parsedArgs.text);
    }
    // Add other computer actions as needed
  }

  // Return appropriate result based on the tool used
  return "Tool execution completed";
}

async function generateSuggestions() {
  const response = await anthropic.messages.create({
    model: "claude-3-opus-20240229",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Based on the current meeting notes and action items, suggest 3 different paths the conversation could take next. Each suggestion should be concise and actionable.

Meeting notes:
${meetingNotes}

Action items:
${actionItems.join("\n")}

Return a JSON object with a 'suggestions' field containing an array of 3 suggestion strings.`,
      },
    ],
  });

  const result = JSON.parse(response.content[0].text);
  console.log("Suggestions for next steps:");
  result.suggestions.forEach((suggestion: string, index: number) => {
    console.log(`${index + 1}. ${suggestion}`);
  });

  await pipe.sendDesktopNotification({
    title: "Meeting Assistant Suggestions",
    body: result.suggestions.join("\n"),
  });
}

meetingAssistant();


/**

# these are mandatory env variables
export SCREENPIPE_DIR="$HOME/.screenpipe"
export PIPE_ID="pipe-anthropic-computer-use-meeting-assistant"
export PIPE_FILE="pipe.ts"
export PIPE_DIR="$SCREENPIPE_DIR/pipes/pipe-anthropic-computer-use-meeting-assistant"

bun run examples/typescript/pipe-anthropic-computer-use-meeting-assistant/pipe.ts
 */


