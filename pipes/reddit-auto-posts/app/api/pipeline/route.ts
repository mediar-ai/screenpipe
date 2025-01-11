"use server";
import fs from "node:fs";
import path from "node:path";
import { DailyLog } from "@/lib/types";
import { NextResponse } from "next/server";
import { pipe } from "@screenpipe/js";
import sendEmail from "@/lib/actions/send-email";
import generateDailyLog from "@/lib/actions/generate-log";
import generateRedditQuestions from "@/lib/actions/generate-reddit-question";

async function saveDailyLog(logEntry: DailyLog) {
  if (!logEntry){
    throw new Error("no log entry to save")
  }
  console.log("saving log entry:", logEntry);

  const screenpipeDir = process.env.SCREENPIPE_DIR || process.cwd();
  const logsDir = path.join(screenpipeDir, "pipes", "reddit-auto-posts", "logs");
  const timestamp = new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\..+/, "");
  const filename = `${timestamp}-${logEntry.category?.replace(/[\/\\?%*:|"<>']/g, "-")}.json`;
  const logFile = path.join(logsDir, filename)
  try {
    fs.writeFileSync(logFile, JSON.stringify(logEntry, null, 2));
  } catch (error) {
    console.log(`Failed to write log file: ${error}`)
    throw new Error(`failed to write log file: ${error}`)
  }
}

async function retry(fn: any, retries = 3, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await fn();
      if (result){
        return result;
      }
    } catch (error) {
      console.log(`Screenpipe query failed, retry, attempt: ${i + 1}`)
      if (i === retries - 1) throw error;
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

export async function GET() {
  try {
    console.log("starting daily log pipeline");
    const settingsManager = pipe.settings;
    const redditSettings = await pipe.settings.getNamespaceSettings("reddit-auto-posts");

    if (!settingsManager) {
      return NextResponse.json(
        { error: `no setting manager found` },
        { status: 500 }
      );
    }

    const rawSettings = await settingsManager.getAll();
    const aiModel = rawSettings?.aiModel;
    const aiUrl = rawSettings?.aiUrl;
    const openaiApiKey = rawSettings?.openaiApiKey;
    const aiProvider = rawSettings?.aiProviderType;
    const userToken = rawSettings?.user?.token;

    const interval = redditSettings?.interval * 1000 || 60000;
    const summaryFrequency = redditSettings?.summaryFrequency;
    const emailTime = redditSettings?.emailTime;
    const emailAddress = redditSettings?.emailAddress;
    const emailPassword = redditSettings?.emailPassword;
    const customPrompt = redditSettings?.customPrompt!;
    const dailylogPrompt = redditSettings?.dailylogPrompt!;
    const windowName = redditSettings?.windowName || "";
    const pageSize = redditSettings?.pageSize;
    const contentType = redditSettings?.contentType || "ocr";
    const emailEnabled = !!(emailAddress && emailPassword);
    const screenpipeDir = process.env.SCREENPIPE_DIR || process.cwd();
    const logsDir = path.join(screenpipeDir, "pipes", "reddit-auto-posts", "logs");
    const pipeConfigPath = path.join(screenpipeDir, "pipes", "reddit-auto-posts", "pipe.json");

    try {
      fs.mkdirSync(logsDir);
    } catch (_error) {
      console.warn("failed to create logs directory, probably already exists:", logsDir);
    }

    const fileContent = fs.readFileSync(pipeConfigPath, 'utf-8');
    const configData = JSON.parse(fileContent);
    if (emailEnabled && !configData?.welcomeEmailSent) {
      const welcomeEmail = `
        Welcome to the daily reddit questions pipeline!

        This pipe will send you a daily list of reddit questions based on your screen data.
        ${
          summaryFrequency === "daily"
            ? `It will run at ${emailTime} every day.`
            : `It will run every ${summaryFrequency} hours.`
        }
      `;

      try {
        await sendEmail(
          emailAddress!,
          emailPassword!,
          "daily reddit questions",
          welcomeEmail
        );
          configData.welcomeEmailSent = true;
          fs.writeFileSync(pipeConfigPath, JSON.stringify(configData, null, 2));
      } catch (error) {
          configData.welcomeEmailSent = false;
          fs.writeFileSync(pipeConfigPath, JSON.stringify(configData, null, 2));
        return NextResponse.json(
          { error: `Error in sending welcome email: ${error}` },
          { status: 500 }
        );
      }
    }

    const now = new Date();
    const startTime = new Date(now.getTime() - interval);

    const screenData = await retry(() => pipe.queryScreenpipe({
      startTime: startTime.toISOString(),
      endTime: now.toISOString(),
      windowName: windowName,
      limit: pageSize,
      contentType: contentType,
    }));

    let logEntry: DailyLog | undefined;
    if (screenData && screenData.data && screenData.data.length > 0) {
      if (aiProvider === "screenpipe-cloud" && !userToken) {
        return NextResponse.json(
          { error: `seems like you don't have screenpipe-cloud access :(` },
          { status: 500 }
        );
      }
      logEntry = await generateDailyLog(
        screenData.data,
        dailylogPrompt,
        aiProvider,
        aiModel,
        aiUrl,
        openaiApiKey,
        userToken as string,
      );
      await saveDailyLog(logEntry);
    } else {
      return NextResponse.json(
        { message: "no screenpipe data is found, is screenpipe running?" },
        { status: 200 }
      );
    }

    let lastEmailSent = new Date(0);
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
      const screenData = await retry(() => pipe.queryScreenpipe({
        startTime: startTime.toISOString(),
        endTime: now.toISOString(),
        windowName: windowName,
        limit: pageSize,
        contentType: contentType,
      }));

      if (screenData && screenData.data && screenData.data.length > 0) {
        if (aiProvider === "screenpipe-cloud" && !userToken) {
          return NextResponse.json(
            { error: `seems like you don't have screenpipe-cloud access :(` },
            { status: 500 }
          );
        }
        const redditQuestions = await generateRedditQuestions(
          screenData.data,
          customPrompt,
          aiProvider,
          aiModel,
          aiUrl,
          openaiApiKey,
          userToken as string,
        );
        console.log("reddit questions:", redditQuestions);

        if (emailEnabled && redditQuestions) {
          try {
            await sendEmail(
              emailAddress!,
              emailPassword!,
              "reddit questions",
              redditQuestions
            );
          } catch(error) {
            return NextResponse.json(
              { error: `error in sending mail ${error}` },
              { status: 500 }
            );
          }
        } else {
          console.log("Failed to get reddit questions!!")
        }
        
        if (redditQuestions) {
          try {
            console.log("Sending screenpipe inbox notification");
            await pipe.inbox.send({
              title: "reddit questions",
              body: redditQuestions,
            });
          } catch(error) {
            return NextResponse.json(
              { error: `error in sending inbox notification ${error}` },
              { status: 500 }
            );
          }
        } else {
          console.log("Failed to get reddit questions!!")
        }

        try {
          console.log("Sending desktop notification");
          await pipe.sendDesktopNotification({
            badge: "reddit questions",
            body: "just sent you some reddit questions",
          });
        } catch (error) {
          return NextResponse.json(
            { error: `error in sending desktop notification ${error}` },
            { status: 500 }
          );
        }
        lastEmailSent = now;
        return NextResponse.json(
          { message: "pipe executed successfully", suggestedQuestions: redditQuestions },
          { status: 200 }
        );
      } else {
        return NextResponse.json(
          { message: "no screenpipe data is found, is screenpipe running?" },
          { status: 200 }
        );
      }
    } else {
      return NextResponse.json(
        { message: "pipe executed successfully, but its not that time to send questions!" },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error("error in GET handler:", error);
    return NextResponse.json(
      { error: `${error}` },
      { status: 400 }
    );
  }
}
