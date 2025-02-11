"use strict";
"use server";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCredentials = validateCredentials;
exports.syncWorkLog = syncWorkLog;
exports.syncIntelligence = syncIntelligence;
const client_1 = require("@notionhq/client");
function validateCredentials(credentials) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const client = new client_1.Client({ auth: credentials.accessToken });
            yield client.databases.retrieve({
                database_id: credentials.databaseId,
            });
            yield client.databases.retrieve({
                database_id: credentials.intelligenceDbId,
            });
            // Reset logs database properties
            yield client.databases.update({
                database_id: credentials.databaseId,
                title: [{ text: { content: "Activity Logs" } }],
                properties: {
                    Description: { rich_text: {} },
                    Tags: { multi_select: {} },
                    Date: { date: {} },
                    StartTime: { date: {} },
                    EndTime: { date: {} },
                    Summary: { rich_text: {} },
                },
            });
            yield client.databases.update({
                database_id: credentials.intelligenceDbId,
                title: [{ text: { content: "Relationship Intelligence" } }],
                properties: {
                    Date: { date: {} },
                    Summary: { rich_text: {} },
                },
            });
            return true;
        }
        catch (error) {
            console.error("Failed to validate/update database:", error);
            return false;
        }
    });
}
function syncWorkLog(credentials, logEntry) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = new client_1.Client({ auth: credentials.accessToken });
        const today = new Date();
        yield client.pages.create({
            parent: { database_id: credentials.databaseId },
            properties: {
                Name: { title: [{ text: { content: logEntry.title } }] },
                Description: { rich_text: [{ text: { content: logEntry.description } }] },
                Tags: { multi_select: logEntry.tags.map((tag) => ({ name: tag })) },
                Date: { date: { start: today.toISOString().split("T")[0] } },
                StartTime: {
                    date: { start: new Date(logEntry.startTime).toISOString() },
                },
                EndTime: { date: { start: new Date(logEntry.endTime).toISOString() } },
                Summary: {
                    rich_text: [
                        {
                            text: {
                                content: `Activity logged at ${new Date().toLocaleTimeString()}`,
                            },
                        },
                    ],
                },
            },
        });
        return `https://notion.so/${credentials.databaseId}`;
    });
}
function syncIntelligence(credentials, intelligence) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = new client_1.Client({ auth: credentials.accessToken });
        const today = new Date().toISOString().split("T")[0];
        // Check for existing intelligence report for today
        const existingReports = yield client.databases.query({
            database_id: credentials.intelligenceDbId,
            filter: {
                property: "Date",
                date: {
                    equals: today,
                },
            },
        });
        const properties = {
            Name: {
                title: [{ text: { content: `Intelligence Report for ${today}` } }],
            },
            Date: { date: { start: today } },
            Summary: {
                rich_text: [
                    {
                        text: {
                            content: `Generated: ${new Date().toLocaleString()}\nContacts: ${intelligence.contacts.length}\nOpportunities: ${intelligence.insights.opportunities.length}\nFollow-ups: ${intelligence.insights.followUps.length}`,
                        },
                    },
                ],
            },
        };
        const children = [
            {
                type: "code",
                code: {
                    rich_text: [
                        {
                            text: {
                                content: generateMermaidGraph(intelligence.contacts),
                            },
                        },
                    ],
                    language: "mermaid",
                },
            },
            ...generateContactsSection(intelligence.contacts),
            ...generateInsightsSection(intelligence.insights),
        ];
        let pageId;
        if (existingReports.results.length > 0) {
            // Update existing report
            pageId = existingReports.results[0].id;
            yield client.pages.update({
                page_id: pageId,
                properties,
            });
            // Delete existing blocks
            const existingBlocks = yield client.blocks.children.list({
                block_id: pageId,
            });
            for (const block of existingBlocks.results) {
                yield client.blocks.delete({
                    block_id: block.id,
                });
            }
            // Add new blocks
            yield client.blocks.children.append({
                block_id: pageId,
                children,
            });
        }
        else {
            // Create new report
            const newPage = yield client.pages.create({
                parent: { database_id: credentials.intelligenceDbId },
                properties,
                children,
            });
            pageId = newPage.id;
        }
        return `https://notion.so/${credentials.intelligenceDbId}`;
    });
}
function generateMermaidGraph(contacts) {
    let mermaidGraph = "graph TD\n";
    contacts.forEach((contact) => {
        mermaidGraph += `    ${contact.name.replace(/\s+/g, "_")}["${contact.name}\n${contact.company || ""}"]\n`;
    });
    return mermaidGraph;
    //return `\`\`\`mermaid\n${mermaidGraph}\`\`\``;
}
function generateContactsSection(contacts) {
    const blocks = [
        {
            type: "heading_2",
            heading_2: {
                rich_text: [{ type: "text", text: { content: "Key Contacts" } }],
            },
        },
    ];
    contacts.forEach((contact) => {
        blocks.push({
            type: "heading_3",
            heading_3: {
                rich_text: [{ type: "text", text: { content: contact.name } }],
            },
        }, {
            type: "bulleted_list_item",
            bulleted_list_item: {
                rich_text: [
                    { text: { content: `Company: ${contact.company || "N/A"}` } },
                ],
            },
        }, {
            type: "bulleted_list_item",
            bulleted_list_item: {
                rich_text: [
                    {
                        text: { content: `Last Interaction: ${contact.lastInteraction}` },
                    },
                ],
            },
        }, {
            type: "bulleted_list_item",
            bulleted_list_item: {
                rich_text: [{ text: { content: `Sentiment: ${contact.sentiment}` } }],
            },
        }, {
            type: "bulleted_list_item",
            bulleted_list_item: {
                rich_text: [
                    { text: { content: `Topics: ${contact.topics.join(", ")}` } },
                ],
            },
        }, {
            type: "bulleted_list_item",
            bulleted_list_item: {
                rich_text: [
                    {
                        text: { content: `Next Steps: ${contact.nextSteps.join(", ")}` },
                    },
                ],
            },
        });
    });
    return blocks;
}
function generateInsightsSection(insights) {
    const blocks = [
        {
            type: "heading_2",
            heading_2: {
                rich_text: [{ type: "text", text: { content: "Insights" } }],
            },
        },
        {
            type: "heading_3",
            heading_3: {
                rich_text: [{ type: "text", text: { content: "Follow-ups Needed" } }],
            },
        },
    ];
    insights.followUps.forEach((followUp) => {
        blocks.push({
            type: "bulleted_list_item",
            bulleted_list_item: {
                rich_text: [{ text: { content: followUp } }],
            },
        });
    });
    blocks.push({
        type: "heading_3",
        heading_3: {
            rich_text: [{ type: "text", text: { content: "Opportunities" } }],
        },
    });
    insights.opportunities.forEach((opportunity) => {
        blocks.push({
            type: "bulleted_list_item",
            bulleted_list_item: {
                rich_text: [{ text: { content: opportunity } }],
            },
        });
    });
    return blocks;
}
