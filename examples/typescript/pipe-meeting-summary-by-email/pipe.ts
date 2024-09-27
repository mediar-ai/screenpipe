async function summarizeAudio(
  audioData: ContentItem[],
  aiApiUrl: string,
  aiModel: string
): Promise<string> {
  const prompt = `summarize the following meeting transcript:

    ${JSON.stringify(audioData)}

    provide a concise summary of the key points discussed in the meeting.`;

  const response = await fetch(`${aiApiUrl}/chat`, {
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
  const from = to;
  const result = await pipe.sendEmail({
    to,
    from,
    password,
    subject,
    body,
  });
  if (!result) {
    throw new Error("failed to send email");
  }
  console.log(`email sent to ${to} with subject: ${subject}`);
}

async function meetingSummaryPipeline(): Promise<void> {
  console.log("starting meeting summary pipeline");

  const config = await pipe.loadConfig();
  console.log("loaded config:", JSON.stringify(config, null, 2));

  const { pollingInterval, emailAddress, emailPassword, aiApiUrl, aiModel } =
    config;

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

      const audioData = await pipe.queryScreenpipe({
        start_time: oneHourAgo.toISOString(),
        end_time: now.toISOString(),
        content_type: "audio",
        limit: 10_000,
      });

      console.log("audioData:", audioData);

      if (audioData && audioData.data && audioData.data.length > 0) {
        console.log("audioData.data:", audioData.data);
        const summary = await summarizeAudio(audioData.data, aiApiUrl, aiModel);
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
