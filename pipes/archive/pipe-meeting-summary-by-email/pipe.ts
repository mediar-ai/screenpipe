import {
  queryScreenpipe,
  loadPipeConfig,
  ContentItem,
  extractJsonFromLlmResponse,
} from "@screenpipe/js";
import nodemailer from "nodemailer";

async function summarizeAudio(
  audioData: ContentItem[],
  aiApiUrl: string,
  aiModel: string,
  customSummaryPrompt: string
): Promise<string> {
  const prompt = `Very important instructions to follow: "${customSummaryPrompt}"

    summarize the following meeting transcript:

    ${JSON.stringify(audioData)}

    provide a concise summary of the key points discussed in the meeting.`;

  const response = await fetch(aiApiUrl, {
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    body: JSON.stringify({
      model: aiModel,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`http error! status: ${response.status}`);
  }

  const result = await response.json();
  return result.message.content;
}

async function sendEmail(
  to: string,
  password: string,
  subject: string,
  body: string
): Promise<void> {
  // Create a transporter using SMTP
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", // Replace with your SMTP server
    port: 587,
    secure: false, // Use TLS
    auth: {
      user: to, // assuming the sender is the same as the recipient
      pass: password,
    },
  });

  // Send mail with defined transport object
  const info = await transporter.sendMail({
    from: to, // sender address
    to: to, // list of receivers
    subject: subject, // Subject line
    text: body, // plain text body
  });

  if (!info) {
    throw new Error("failed to send email");
  }
  console.log(`email sent to ${to} with subject: ${subject}`);
}

interface TimeAdjustment {
  shouldAdjust: boolean;
  shouldPollDataBeforeOrAfter: boolean;
}

async function checkTimeAdjustment(
  audioData: ContentItem[],
  aiApiUrl: string,
  aiModel: string
): Promise<TimeAdjustment> {
  const prompt = `Analyze the following meeting transcript:

    ${JSON.stringify(audioData)}

    Determine if this appears to be a complete meeting or if it might be truncated.
    Return a JSON object with the following structure:
    {
      "shouldAdjust": boolean,
      "shouldPollDataBeforeOrAfter": boolean,
    }

    Rules:
    - Set shouldAdjust to true if the meeting seems incomplete
    - set shouldPollDataBeforeOrAfter to true if we need to get data before or after the meeting timestamp to make it complete
    - If the meeting seems complete, set all values to 0
    - Do not add backticks to the JSON
    - Return only the JSON object, no additional text, if you return anything but JSON, the whole code will crash and the user will be very sad
    `;

  const response = await fetch(aiApiUrl, {
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    body: JSON.stringify({
      model: aiModel,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    console.log("ollama response:", await response.text());
    throw new Error(`http error! status: ${response.status}`);
  }

  const result = await response.json();

  console.log("ai answer:", result);

  let content;
  try {
    content = extractJsonFromLlmResponse(result.message.content);
  } catch (error) {
    console.warn("failed to parse ai response:", error, result);
    throw new Error("invalid ai response format");
  }

  return content;
}

async function meetingSummaryPipeline(): Promise<void> {
  console.log("starting meeting summary pipeline");

  const config = await loadPipeConfig();
  console.log("loaded config:", JSON.stringify(config, null, 2));

  const {
    pollingInterval,
    emailAddress,
    emailPassword,
    aiApiUrl,
    aiModel,
    customSummaryPrompt,
  } = config;

  console.log("pollingInterval:", pollingInterval);
  console.log("emailAddress:", emailAddress);
  console.log("emailPassword:", emailPassword);
  console.log("aiApiUrl:", aiApiUrl);
  console.log("aiModel:", aiModel);

  while (true) {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      console.log("oneHourAgo:", oneHourAgo);
      console.log("now:", now);

      const audioData = await queryScreenpipe({
        startTime: oneHourAgo.toISOString(),
        endTime: now.toISOString(),
        contentType: "audio",
        limit: 10_000,
      });

      console.log("audioData:", audioData);

      if (audioData && audioData.data && audioData.data.length > 0) {
        console.log("audioData.data:", audioData.data);

        // Check if we need to adjust the time range
        const timeAdjustment = await checkTimeAdjustment(
          audioData.data,
          aiApiUrl,
          aiModel
        );

        if (timeAdjustment.shouldAdjust) {
          // if we need to adjust the time range, we need to query the data before or after the meeting timestamp to make it complete
          // if it's before, we need to remove 30 minutes from the start
          // if it's after, we need to add 30 minutes to the end

          const adjustedStart = timeAdjustment.shouldPollDataBeforeOrAfter
            ? new Date(oneHourAgo.getTime() - 30 * 60 * 1000)
            : oneHourAgo;
          const adjustedEnd = timeAdjustment.shouldPollDataBeforeOrAfter
            ? new Date(now.getTime() + 30 * 60 * 1000)
            : now;

          console.log("Adjusting time range:");
          console.log("New start:", adjustedStart);
          console.log("New end:", adjustedEnd);

          // Query additional data
          const additionalData = await queryScreenpipe({
            startTime: adjustedStart.toISOString(),
            endTime: adjustedEnd.toISOString(),
            contentType: "audio",
            limit: 10_000,
          });

          // Merge the additional data with the original data
          if (additionalData && additionalData.data) {
            audioData.data = [...audioData.data, ...additionalData.data];
          }
        }

        console.log("now summarizing");

        const summary = await summarizeAudio(
          audioData.data,
          aiApiUrl,
          aiModel,
          customSummaryPrompt
        );
        console.log("summary:", summary);

        await sendEmail(
          emailAddress,
          emailPassword,
          "meeting summary",
          summary
        );
      }
    } catch (error) {
      console.warn("error in meeting summary pipeline:", error);
    }
    console.log("sleeping for", pollingInterval, "ms");
    await new Promise((resolve) => setTimeout(resolve, pollingInterval));
  }
}

meetingSummaryPipeline();
