"use server";
import fs from "node:fs";
import path from "node:path";
import { DailyLog } from "@/lib/types";
import { NextResponse } from "next/server";
import { pipe } from "@screenpipe/js/node";
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
  const filename = `${timestamp}-${logEntry.category.replace(/[\/\\?%*:|"<>']/g, "-")}.json`;
  console.log("filename:", filename)
  const logFile = path.join(logsDir, filename)
  try {
    fs.writeFileSync(logFile, JSON.stringify(logEntry, null, 2));
  } catch (error) {
    console.log(`Failed to write log file: ${error}`)
    throw new Error(`failed to write log file: ${error}`)
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

    try {
      fs.mkdirSync(logsDir);
    } catch (_error) {
      console.warn("failed to create logs directory, probably already exists:", logsDir);
    }

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

      try {
        await sendEmail(
          emailAddress!,
          emailPassword!,
          "daily reddit questions",
          welcomeEmail
        );
      } catch (error) {
        return NextResponse.json(
          { error: `Error in sending welcome email: ${error}` },
          { status: 500 }
        );
      }
    }

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
      if (aiProvider === "screenpipe-cloud" && !userToken) {
        return NextResponse.json(
          { error: `seems like you don't have screenpipe-cloud access :(` },
          { status: 500 }
        );
      }
      const logEntry = await generateDailyLog(
        screenData.data,
        dailylogPrompt,
        aiProvider,
        aiModel,
        aiUrl,
        openaiApiKey,
        userToken,
      );
      saveDailyLog(logEntry);
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
      const screenData = await pipe.queryScreenpipe({
        startTime: oneMinuteAgo.toISOString(),
        endTime: now.toISOString(),
        windowName: windowName,
        limit: pageSize,
        contentType: contentType,
      });

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
          userToken,
        );
        console.log("reddit questions:", redditQuestions);

        if (emailEnabled) {
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
        }

        try {
          await pipe.inbox.send({
            title: "reddit questions",
            body: redditQuestions,
          });
          await pipe.sendDesktopNotification({
            title: "reddit questions",
            body: "just sent you some reddit questions",
          });
        } catch(error) {
          return NextResponse.json(
            { error: `error in sending mail ${error}` },
            { status: 500 }
          );
        }
        lastEmailSent = now;
      } else if(screenData && screenData.data && screenData.data.length === 0) {
        return NextResponse.json(
          { message: "no screenpipe data is found, is screenpipe running?" },
          { status: 200 }
        );
      }
    }
  } catch (error) {
    console.error("error in GET handler:", error);
    return NextResponse.json(
      { error: `please check your configuration ${error}` },
      { status: 400 }
    );
  }
}
