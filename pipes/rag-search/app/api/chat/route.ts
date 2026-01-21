import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSettings } from "@/lib/settings";
import { getOpenAIClient, createEmbedding } from "@/lib/embeddings";
import { loadVectorStore, searchSimilar } from "@/lib/vector-store";

export async function POST(request: NextRequest) {
  try {
    const settings = await getSettings();

    if (!settings.openaiApiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured. Please go to Settings." },
        { status: 400 }
      );
    }

    const { messages } = await request.json();
    const lastMessage = messages[messages.length - 1];
    const query = lastMessage.content;

    const openai = getOpenAIClient(settings.openaiApiKey);
    const store = loadVectorStore();

    // Create embedding for the query
    const queryEmbedding = await createEmbedding(openai, query);

    // Search for similar documents
    const results = searchSimilar(store, queryEmbedding, settings.maxResults);

    // Build context from search results
    const context = results
      .map((doc) => {
        const date = new Date(doc.metadata.timestamp).toLocaleString();
        return `[${date}] [${doc.metadata.appName}] [${doc.metadata.windowName}]\n${doc.text}`;
      })
      .join("\n\n---\n\n");

    // Debug: log first 2000 chars of context
    console.log(`\n=== CONTEXT SENT TO LLM (first 2000 chars) ===`);
    console.log(context.slice(0, 2000));
    console.log(`=== END CONTEXT PREVIEW (total ${context.length} chars) ===\n`);

    const systemPrompt = `You are a helpful assistant that answers questions based on the user's screen history and audio transcriptions.

You have access to the following context from the user's screen recordings and audio transcriptions. Use this information to answer their questions accurately. If the information isn't available in the context, say so clearly.

When referencing information, mention the app name and approximate time when relevant.

Context from screen history:
${context || "No relevant context found. The index may be empty - try asking the user to run indexing first."}`;

    // Stream the response
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      stream: true,
    });

    // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of response) {
          const text = chunk.choices[0]?.delta?.content || "";
          if (text) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat request failed" },
      { status: 500 }
    );
  }
}
