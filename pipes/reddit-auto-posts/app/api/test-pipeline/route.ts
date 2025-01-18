"use server";
// this route is only for getting reddit post reccomendation, explicitly by clickin the 
// `generate button` it won't send any mails
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { pipe } from "@screenpipe/js";
import sendEmail from "@/lib/actions/send-email";
import generateRedditQuestions from "@/lib/actions/generate-reddit-question";

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
    const emailAddress = redditSettings?.emailAddress;
    const emailPassword = redditSettings?.emailPassword;
    const customPrompt = redditSettings?.customPrompt!;
    const windowName = redditSettings?.windowName || "";
    const pageSize = redditSettings?.pageSize;
    const contentType = redditSettings?.contentType || "ocr";
    const emailEnabled = !!(emailAddress && emailPassword);
    const screenpipeDir = process.env.SCREENPIPE_DIR || process.cwd();
    const logsDir = path.join(screenpipeDir, "pipes", "reddit-auto-posts", "logs");

    try {
      fs.mkdirSync(logsDir);
    } catch (_error) {
      console.warn("creating logs directory, probably already exists:", logsDir);
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
      return NextResponse.json(
        { message: "pipe executed successfully", suggestedQuestions: redditQuestions },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        { message: "query is empty please wait & and try again!" },
        { status: 200 }
          );
      };
  } catch (error) {
    console.error("error in GET handler:", error);
    return NextResponse.json(
      { error: `${error}` },
      { status: 400 }
    );
  }
}
