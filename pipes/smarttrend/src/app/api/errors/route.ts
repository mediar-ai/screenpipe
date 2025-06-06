import { NextRequest } from "next/server";
import { eventEmitter } from "@/lib/events";

export interface Error {
  title: string;
  description: string;
}

export async function GET(req: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      const sendData = (data: Error) => {
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
      };

      eventEmitter.on("catchError", sendData);

      const keepAliveInterval = setInterval(() => {
        controller.enqueue(new TextEncoder().encode(": keep-alive\n\n"));
      }, 30_000);

      req.signal.addEventListener("abort", () => {
        console.log("/api/errors: Connection Closed");
        eventEmitter.off("catchError", sendData);
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
