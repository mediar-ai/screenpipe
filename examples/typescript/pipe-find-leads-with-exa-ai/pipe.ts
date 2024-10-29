import * as fs from "node:fs";
import nodemailer from "npm:nodemailer";
import { ContentItem, pipe } from "https://raw.githubusercontent.com/mediar-ai/screenpipe/main/screenpipe-js/main.ts";
import process from "node:process";
import Exa from "npm:exa-js";
import { generateObject, generateText } from "npm:ai";
import { createOpenAI } from "npm:openai-ai-provider";
import { z } from "npm:zod";
import * as path from "node:path";

const icpSchema = z.object({
  idealCustomerProfile: z.object({
    industry: z.string().optional(),
    companySize: z.string().optional(),
    jobTitles: z.array(z.string()).optional(),
    painPoints: z.array(z.string()).optional(),
    interests: z.array(z.string()).optional(),
    technologies: z.array(z.string()).optional(),
    demographics: z
      .object({
        location: z.string().optional(),
        age: z.string().optional(),
        gender: z.string().optional(),
      })
      .optional(),
  }),
});

async function dailyLeadsPipeline(): Promise<void> {
  console.log("starting daily leads pipeline");

  const config = pipe.loadPipeConfig();
  console.log("loaded config:", JSON.stringify(config, null, 2));

  const interval = config.interval * 1000;
  const emailAddress = config.emailAddress;
  const emailPassword = config.emailPassword;
  const customPrompt = config.customPrompt;
  const gptModel = config.aiModel;
  const gptApiUrl = config.aiApiUrl;
  const openaiApiKey = config.aiApiKey;
  const windowName = config.windowName || "";
  const appName = config.appName || "";
  const pageSize = config.pageSize;
  const exaApiKey = config.exaApiKey;

  const exa = new Exa(exaApiKey);

  const icpFilePath = path.join(process.env.PIPE_DIR!, "icp.json");

  while (true) {
    try {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - interval);

      const screenData = await pipe.queryScreenpipe({
        startTime: oneMinuteAgo.toISOString(),
        endTime: now.toISOString(),
        windowName: windowName,
        appName: appName,
        limit: pageSize,
        contentType: "all",
      });

      if (screenData && screenData.data && screenData.data.length > 0) {
        const currentICP = loadICP(icpFilePath);
        const updatedICP = await updateICP(
          screenData.data,
          currentICP,
          customPrompt,
          gptModel,
          gptApiUrl,
          openaiApiKey
        );
        saveICP(icpFilePath, updatedICP);
        console.log("updated icp:", updatedICP);

        const potentialLeads = await findPotentialLeadsWithExa(
          exa,
          updatedICP,
          gptModel,
          gptApiUrl,
          openaiApiKey
        );
        console.log("potential leads:", potentialLeads);

        if (potentialLeads.length > 0) {
          const emailContent = generateLeadEmailContent(
            potentialLeads,
            updatedICP
          );

          await sendEmail(
            emailAddress,
            emailPassword,
            "potential leads found",
            emailContent
          );
          await pipe.inbox.send({
            title: "potential leads",
            body: emailContent,
          });
          await pipe.sendDesktopNotification({
            title: "potential leads",
            body: "just sent you some potential leads",
          });
        }
      }
    } catch (error) {
      console.warn("error in daily leads pipeline:", error);
    }
    console.log("sleeping for", interval, "ms");
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

function loadICP(
  filePath: string
): z.infer<typeof icpSchema>["idealCustomerProfile"] {
  try {
    if (!fs.existsSync(filePath)) {
      console.log("icp file not found, creating new one");
      const emptyICP = {};
      saveICP(filePath, emptyICP);
      return emptyICP;
    }
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.warn("failed to load icp, returning empty object:", error);
    return {};
  }
}

function saveICP(
  filePath: string,
  icp: z.infer<typeof icpSchema>["idealCustomerProfile"]
): void {
  fs.writeFileSync(filePath, JSON.stringify(icp, null, 2));
}

async function updateICP(
  screenData: ContentItem[],
  currentICP: z.infer<typeof icpSchema>["idealCustomerProfile"],
  customPrompt: string,
  gptModel: string,
  gptApiUrl: string,
  openaiApiKey: string
): Promise<z.infer<typeof icpSchema>["idealCustomerProfile"]> {
  const prompt = `${customPrompt}

  based on the following screen and audio data, analyze the user's activity and update the existing ideal customer profile (icp):

  current icp:
  ${JSON.stringify(currentICP, null, 2)}

  new screen data:
  ${JSON.stringify(screenData)}

  rules:
  - focus on updating the icp based on the user's recent interests, browsing habits, and content they engage with
  - consider new industry trends, technologies used, and pain points discussed
  - maintain consistency with the existing icp, only update or add information when there's strong evidence
  - do not remove existing information unless directly contradicted by new data
  `;

  const provider = createOpenAI({
    apiKey: openaiApiKey,
    baseURL: gptApiUrl,
  });

  const response = await generateObject({
    model: provider(gptModel),
    messages: [{ role: "user", content: prompt }],
    schema: icpSchema,
  });

  console.log("ai response for icp update:", response.object);

  return response.object.idealCustomerProfile;
}

async function findPotentialLeadsWithExa(
  exa: Exa,
  icp: z.infer<typeof icpSchema>["idealCustomerProfile"],
  gptModel: string,
  gptApiUrl: string,
  openaiApiKey: string
): Promise<string[]> {
  const query = `companies in ${icp.industry || "any industry"} 
                 with ${icp.companySize || "any company size"} 
                 using ${icp.technologies?.join(", ") || "any technologies"}
                 ${
                   icp.demographics?.location
                     ? `in ${icp.demographics.location}`
                     : ""
                 }`;

  const results = await exa.searchAndContents(query, {
    type: "neural",
    useAutoprompt: true,
    numResults: 10,
    text: true,
    category: "company",
  });

  const formattedResults = await formatLeadsWithAI(
    results.results,
    icp,
    gptModel,
    gptApiUrl,
    openaiApiKey
  );
  return formattedResults;
}

async function formatLeadsWithAI(
  leads: any[],
  icp: z.infer<typeof icpSchema>["idealCustomerProfile"],
  gptModel: string,
  gptApiUrl: string,
  openaiApiKey: string
): Promise<string[]> {
  const provider = createOpenAI({
    apiKey: openaiApiKey,
    baseURL: gptApiUrl,
  });

  const formattedLeads = [];

  for (const lead of leads) {
    const prompt = `
    Format the following company information in markdown and identify potential pain points based on the given ICP:

    Company: ${lead.title}
    URL: ${lead.url}
    Summary: ${lead.text}

    ICP:
    ${JSON.stringify(icp, null, 2)}

    Rules:
    - Use markdown formatting
    - Highlight the company name as a header
    - Include the URL
    - Provide a brief summary
    - Identify 2-3 potential pain points based on the ICP and company information
    - Keep the total output under 200 words
    `;

    const response = await generateText({
      model: provider(gptModel),
      messages: [{ role: "user", content: prompt }],
    });

    formattedLeads.push(response.text);
  }

  return formattedLeads;
}

function generateLeadEmailContent(
  potentialLeads: string[],
  icp: z.infer<typeof icpSchema>["idealCustomerProfile"]
): string {
  let content = "# ideal customer profile:\n\n";
  content += "```json\n" + JSON.stringify(icp, null, 2) + "\n```\n\n";
  content += "# potential leads found:\n\n";

  for (const lead of potentialLeads) {
    content += lead + "\n\n";
  }

  return content;
}

async function sendEmail(
  to: string,
  password: string,
  subject: string,
  body: string
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: to,
      pass: password,
    },
  });

  const info = await transporter.sendMail({
    from: to,
    to: to,
    subject: subject,
    text: body,
  });

  if (!info) {
    throw new Error("failed to send email");
  }
  console.log(`email sent to ${to} with subject: ${subject}`);
}

dailyLeadsPipeline();

/*
export SCREENPIPE_DIR="$HOME/.screenpipe"
export PIPE_ID="pipe-find-leads-with-exa-ai"
export PIPE_FILE="pipe.ts"
export PIPE_DIR="$SCREENPIPE_DIR/pipes/pipe-find-leads-with-exa-ai"

bun run examples/typescript/pipe-find-leads-with-exa-ai/pipe.ts

*/
