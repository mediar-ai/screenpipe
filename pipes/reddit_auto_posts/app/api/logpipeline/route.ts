"use server";
import { pipe } from "@screenpipe/js/node";
import fs from "node:fs";
import sendEmail from "@/lib/actions/send-email";
import generateDailyLog from "@/lib/actions/generate-log";
import generateRedditQuestions from "@/lib/actions/generate-reddit-question";
import saveDailyLog from "@/lib/actions/savelog";

export async function GET(): Promise<void> {
  console.log("starting daily log pipeline");


  const settings = await pipe.settings.getNamespaceSettings("reddit_auto_posts");
  console.log("loaded config:", JSON.stringify(settings, null, 2));

  const interval = settings?.interval * 1000 || 60000;
  console.log("INEn", interval)
  const summaryFrequency = settings?.summaryFrequency;
  const emailTime = settings?.emailTime;
  const emailAddress = settings?.emailAddress;
  const emailPassword = settings?.emailPassword;
  const customPrompt = settings?.customPrompt!;
  const dailylogPrompt = settings?.dailylogPrompt!;
  const gptModel = settings?.gptModel;
  const gptApiUrl = settings?.gptApiUrl;
  const openaiApiKey = settings?.openaiApiKey;
  const windowName = settings?.windowName || "";
  const pageSize = settings?.pageSize;
  const contentType = settings?.contentType || "ocr";

  const emailEnabled = !!(emailAddress && emailPassword);
  console.log("email enabled:", emailEnabled);

  console.log("creating logs dir");
  const logsDir = `${process.env.PIPE_DIR}/logs`;
  console.log("logs dir:", logsDir);
  try {
    fs.mkdirSync(logsDir);
  } catch (_error) {
    console.warn("failed to create logs dir, probably already exists");
  }

  let lastEmailSent = new Date(0);

  // Only send welcome email if email is enabled
  if (emailEnabled) {
    const welcomeEmail = `
      Welcome to the daily reddit questions pipeline!

      This pipe will send you a daily list of reddit questions based on your screen data.
      ${
        summaryFrequency === "daily"
          ? `It will run at ${emailTime} every day.`
          : `It will run every ${summaryFrequency} hours.`
      }
    `;
    await sendEmail(
      emailAddress!,
      emailPassword!,
      "daily reddit questions",
      welcomeEmail
    );
  }

  while (true) {
    try {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - interval);

      const screenData = await pipe.queryScreenpipe({
        startTime: oneMinuteAgo.toISOString(),
        endTime: now.toISOString(),
        windowName: windowName,
        limit: pageSize,
        contentType: contentType,
      });

      if (screenData && screenData.data && screenData.data.length > 0) {
        const logEntry = await generateDailyLog(
          screenData.data,
          dailylogPrompt,
          gptModel,
          gptApiUrl,
          openaiApiKey
        );
        console.log("log entry:", logEntry);
        saveDailyLog(logEntry);
      }

      let shouldSendSummary = false;

      if (summaryFrequency === "daily") {
        const [emailHour, emailMinute] = emailTime.split(":").map(Number);
        const emailTimeToday = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          emailHour,
          emailMinute
        );
        shouldSendSummary =
          now >= emailTimeToday &&
          now.getTime() - lastEmailSent.getTime() > 24 * 60 * 60 * 1000;
      } else if (summaryFrequency.startsWith("hourly:")) {
        const hours = parseInt(summaryFrequency.split(":")[1], 10);
        shouldSendSummary =
          now.getTime() - lastEmailSent.getTime() >= hours * 60 * 60 * 1000;
      }

      if (shouldSendSummary) {
        const screenData = await pipe.queryScreenpipe({
          startTime: oneMinuteAgo.toISOString(),
          endTime: now.toISOString(),
          windowName: windowName,
          limit: pageSize,
          contentType: contentType,
        });

        if (screenData && screenData.data && screenData.data.length > 0) {
          const redditQuestions = await generateRedditQuestions(
            screenData.data,
            customPrompt,
            gptModel,
            gptApiUrl,
            openaiApiKey
          );
          console.log("reddit questions:", redditQuestions);

          // Send email only if enabled
          if (emailEnabled) {
            await sendEmail(
              emailAddress!,
              emailPassword!,
              "reddit questions",
              redditQuestions
            );
          }

          // Always send to inbox and desktop notification
          await pipe.inbox.send({
            title: "reddit questions",
            body: redditQuestions,
          });
          await pipe.sendDesktopNotification({
            title: "reddit questions",
            body: "just sent you some reddit questions",
          });
          lastEmailSent = now;
        }
      }
    } catch (error) {
      console.warn("error in daily log pipeline:", error);
    }
    console.log("sleeping for", interval, "ms");
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
