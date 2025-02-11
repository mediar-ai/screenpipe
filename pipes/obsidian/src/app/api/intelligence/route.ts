import { NextResponse } from "next/server";
import { z } from "zod";
import { generateObject } from "ai";
import { ollama } from "ollama-ai-provider";
import { pipe } from "@screenpipe/js";
import * as fs from "fs/promises";
import * as path from "path";

// rich schema for relationship intelligence
const contactSchema = z.object({
  name: z.string(),
  company: z.string().optional(),
  lastInteraction: z.string(),
  sentiment: z.number(), // -1 to 1
  topics: z.array(z.string()),
  nextSteps: z.array(z.string()),
});

const relationshipIntelligence = z.object({
  contacts: z.array(contactSchema),
  insights: z.object({
    followUps: z.array(z.string()),
    opportunities: z.array(z.string()),
  }),
});

async function analyzeRelationships(
  recentLogs: string,
  model: string
): Promise<z.infer<typeof relationshipIntelligence>> {
  const prompt = `analyze these work logs and create a comprehensive relationship intelligence report.
    focus on:
    - identifying key people and their roles
    - tracking interaction patterns and sentiment
    - spotting business opportunities
    - suggesting follow-ups and introductions
    - finding patterns in topics discussed
    
    recent logs: ${recentLogs}

    todays date: ${new Date().toISOString().split("T")[0]}
    local time: ${new Date().toLocaleTimeString()}
    timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
    
    return a detailed json object following this structure for relationship intelligence.
    
    example response from you:
    
    {
      "contacts": [
        {
          "name": "John Doe",
          "company": "Acme Inc.",
          "lastInteraction": "2024-01-01",
          "sentiment": 0.8,
          "topics": ["sales", "marketing"],
          "nextSteps": ["schedule a call", "send a follow-up email"]
        }
      ],
      "insights": {
        "followUps": ["schedule a call", "send a follow-up email"],
        "opportunities": ["schedule a call", "send a follow-up email"]
      }
    }

    of course adapt the example response to the actual data you have, do not use John Doe in your example response, use the names and companies of the people you see in the logs.
    `;

  const provider = ollama(model);
  console.log("prompt", prompt);
  const response = await generateObject({
    model: provider,
    messages: [{ role: "user", content: prompt }],
    schema: relationshipIntelligence,
    maxRetries: 5,
  });

  console.log(response.object);
  return response.object;
}

async function saveToGraph(
  intelligence: z.infer<typeof relationshipIntelligence>,
  obsidianPath: string
): Promise<string> {
  // normalize path for cross-platform compatibility
  const normalizedPath = path.normalize(obsidianPath);
  const graphPath = path.join(normalizedPath, "relationship-graph");
  await fs.mkdir(graphPath, { recursive: true });

  // create markdown file with mermaid graph
  let mermaidGraph = "```mermaid\ngraph TD\n";

  // add nodes for each contact
  intelligence.contacts.forEach((contact) => {
    mermaidGraph += `    ${contact.name.replace(/\s+/g, "_")}["${
      contact.name
    }\n${contact.company || ""}"]\n`;
  });

  // add basic relationships between contacts that share topics
  const contactsByTopic = new Map<string, string[]>();
  intelligence.contacts.forEach((contact) => {
    contact.topics.forEach((topic) => {
      if (!contactsByTopic.has(topic)) {
        contactsByTopic.set(topic, []);
      }
      contactsByTopic.get(topic)?.push(contact.name);
    });
  });

  // create edges for contacts sharing topics
  contactsByTopic.forEach((contacts) => {
    for (let i = 0; i < contacts.length; i++) {
      for (let j = i + 1; j < contacts.length; j++) {
        mermaidGraph += `    ${contacts[i].replace(/\s+/g, "_")} --- ${contacts[
          j
        ].replace(/\s+/g, "_")}\n`;
      }
    }
  });

  mermaidGraph += "```\n";

  // save as markdown with frontmatter
  const content = `---
created: ${new Date().toISOString()}
tags: [relationship-intelligence, crm, network]
---

# relationship intelligence report

## network graph
${mermaidGraph}

## key contacts
${intelligence.contacts
  .map(
    (c) => `
### ${c.name}
- company: ${c.company || "n/a"}
- last interaction: ${c.lastInteraction}
- sentiment: ${c.sentiment}
- topics: ${c.topics.join(", ")}
- next steps: ${c.nextSteps.join(", ")}
`
  )
  .join("\n")}

## insights
### follow-ups needed
${intelligence.insights.followUps.map((f) => `- ${f}`).join("\n")}

### opportunities
${intelligence.insights.opportunities.map((o) => `- ${o}`).join("\n")}
`;

  const filename = `${new Date().toISOString().split("T")[0]}-intelligence.md`;
  await fs.writeFile(path.join(graphPath, filename), content, "utf8");

  // get vault name safely for windows paths
  const relativePath = obsidianPath
    .replace(normalizedPath, "")
    .replace(/^\//, "");
  // Return the deep link
  return `obsidian://search?vault=${encodeURIComponent(
    relativePath
  )}&query=relationship-intelligence`;
}

async function readRecentLogs(
  obsidianPath: string,
  since: Date
): Promise<string> {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = since.toISOString().split("T")[0];

  try {
    // just read today and yesterday's logs as raw text
    const todayContent = await fs
      .readFile(path.join(obsidianPath, `${today}.md`), "utf8")
      .catch(() => "");
    const yesterdayContent = await fs
      .readFile(path.join(obsidianPath, `${yesterday}.md`), "utf8")
      .catch(() => "");

    return `${yesterdayContent}\n${todayContent}`;
  } catch (error) {
    console.error("failed to read logs:", error);
    return "";
  }
}

export async function GET() {
  try {
    const settings = await pipe.settings.getNamespaceSettings("obsidian");
    const obsidianPath = settings?.vaultPath;
    const model = settings?.aiModel;

    if (!obsidianPath) {
      return NextResponse.json(
        { error: "obsidian path not configured" },
        { status: 400 }
      );
    }

    // get last 24 hours of logs
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    const recentLogs = await readRecentLogs(obsidianPath, yesterday);

    if (recentLogs.length === 0) {
      return NextResponse.json({ message: "no logs found for analysis" });
    }

    const intelligence = await analyzeRelationships(recentLogs, model);
    const deepLink = await saveToGraph(intelligence, obsidianPath);

    return NextResponse.json({
      message: "relationship intelligence updated",
      intelligence,
      deepLink,
      summary: {
        contacts: intelligence.contacts.length,
        opportunities: intelligence.insights.opportunities.length,
        needsFollowUp: intelligence.insights.followUps.length,
        logsAnalyzed: recentLogs.length,
      },
    });
  } catch (error) {
    console.error("error in intelligence api:", error);
    return NextResponse.json(
      { error: `failed to process intelligence: ${error}` },
      { status: 500 }
    );
  }
}
