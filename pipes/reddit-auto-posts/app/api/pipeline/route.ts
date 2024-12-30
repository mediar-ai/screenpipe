"use server";
import fs from "node:fs";
import { NextResponse } from "next/server";
import { pipe } from "@screenpipe/js/node";
import sendEmail from "@/lib/actions/send-email";
import generateDailyLog from "@/lib/actions/generate-log";
import generateRedditQuestions from "@/lib/actions/generate-reddit-question";
import saveDailyLog from "@/lib/actions/savelog";

export async function GET() {
  try {
    console.log("starting daily log pipeline");
    const settings = await pipe.settings.getNamespaceSettings("reddit-auto-posts");
    const interval = settings?.interval * 1000 || 60000;
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
    const logsDir = `${process.env.PIPE_DIR}/logs` || `${process.cwd()}/logs`;
    const emailEnabled = !!(emailAddress && emailPassword);

    try {
      fs.mkdirSync(logsDir);
    } catch (_error) {
      console.warn("failed to create logs dir, probably already exists");
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
      const logEntry = await generateDailyLog(
        screenData.data,
        dailylogPrompt,
        gptModel,
        gptApiUrl,
        openaiApiKey
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
        const redditQuestions = await generateRedditQuestions(
          screenData.data,
          customPrompt,
          gptModel,
          gptApiUrl,
          openaiApiKey
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
              { error: `error in sending mail` },
              { status: 500 }
            );
          }
        }

        await pipe.inbox.send({
          title: "reddit questions",
          body: redditQuestions,
        });
        await pipe.sendDesktopNotification({
          title: "reddit questions",
          body: "just sent you some reddit questions",
        });
        lastEmailSent = now;
      } else if(screenData && screenData.data && screenData.data.length === 0) {
        return NextResponse.json(
          { message: "no screenpipe data is found, is screenpipe running?" },
          { status: 200 }
        );
      }
    }
  } catch (error) {
    return NextResponse.json(
      { error: `please check your configuration ${error}` },
      { status: 400 }
    );
  }
} 
