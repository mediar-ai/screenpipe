import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSettings } from "@/lib/settings";
import { getOpenAIClient, createEmbedding } from "@/lib/embeddings";
import { loadVectorStore, searchSimilar } from "@/lib/vector-store";

// Simple rate limiting for chat requests
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const MAX_REQUESTS_PER_MINUTE = 20;
const RATE_LIMIT_WINDOW_MS = 60000;

function checkRateLimit(clientId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const clientData = requestCounts.get(clientId);

  if (!clientData || now > clientData.resetTime) {
    requestCounts.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (clientData.count >= MAX_REQUESTS_PER_MINUTE) {
    const retryAfter = Math.ceil((clientData.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }

  clientData.count++;
  return { allowed: true };
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting based on IP or a simple identifier
    const clientId = request.headers.get("x-forwarded-for") || "default-client";
    const rateLimitResult = checkRateLimit(clientId);

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: `Too many requests. Please wait ${rateLimitResult.retryAfter} seconds before sending another message.`,
          retryAfter: rateLimitResult.retryAfter
        },
        { status: 429 }
      );
    }

    const settings = await getSettings();

    if (!settings.openaiApiKey) {
      return NextResponse.json(
        {
          error: "OpenAI API key not configured. Go to Settings and enter your API key to start searching.",
          action: "configure_api_key"
        },
        { status: 400 }
      );
    }

    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Invalid request: messages array is required." },
        { status: 400 }
      );
    }

    const lastMessage = messages[messages.length - 1];
    const query = lastMessage?.content;

    // Input validation: limit query length to prevent timeouts
    const MAX_QUERY_LENGTH = 2000;
    if (typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json(
        { error: "Please enter a search query." },
        { status: 400 }
      );
    }

    if (query.length > MAX_QUERY_LENGTH) {
      return NextResponse.json(
        {
          error: `Query is too long (${query.length} characters). Please shorten it to ${MAX_QUERY_LENGTH} characters or less.`,
          maxLength: MAX_QUERY_LENGTH,
          currentLength: query.length
        },
        { status: 400 }
      );
    }

    const openai = getOpenAIClient(settings.openaiApiKey);
    const store = loadVectorStore();

    // Check if index is empty and provide helpful guidance
    if (store.documents.length === 0) {
      return NextResponse.json(
        {
          error: "No documents indexed yet. Click 'Run Index' to index your screen recordings before searching.",
          action: "run_indexing",
          documentsCount: 0
        },
        { status: 400 }
      );
    }

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
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Provide actionable error messages
    let actionableMessage = errorMessage;
    let action = "unknown_error";

    if (errorMessage.includes("401") || errorMessage.includes("Unauthorized") || errorMessage.includes("invalid_api_key")) {
      actionableMessage = "Invalid OpenAI API key. Please check your API key in Settings.";
      action = "check_api_key";
    } else if (errorMessage.includes("429") || errorMessage.includes("rate limit")) {
      actionableMessage = "OpenAI rate limit exceeded. Please wait a moment and try again.";
      action = "wait_rate_limit";
    } else if (errorMessage.includes("insufficient_quota")) {
      actionableMessage = "OpenAI quota exceeded. Please check your billing at platform.openai.com.";
      action = "check_quota";
    } else if (errorMessage.includes("context_length_exceeded")) {
      actionableMessage = "The search context is too large. Try a more specific query.";
      action = "refine_query";
    }

    return NextResponse.json(
      { error: actionableMessage, action, details: errorMessage },
      { status: 500 }
    );
  }
}
