import { NextRequest } from "next/server";
import { eventEmitter } from "@/lib/events";
import type { Suggestion } from "@/lib/actions/run-bot";

export async function GET(req: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      const sendData = (data: Suggestion) => {
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
      };

      eventEmitter.on("addSuggestion", sendData);

      const keepAliveInterval = setInterval(() => {
        controller.enqueue(new TextEncoder().encode(": keep-alive\n\n"));
      }, 30_000);

      req.signal.addEventListener("abort", () => {
        console.log("/api/suggestions: Connection Closed");
        eventEmitter.off("addSuggestion", sendData);
        clearInterval(keepAliveInterval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
