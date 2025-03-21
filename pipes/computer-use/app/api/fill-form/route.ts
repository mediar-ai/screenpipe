import { NextResponse } from "next/server";
import { pipe as browserPipe } from "../../../../../screenpipe-js/browser-sdk/dist";

export async function GET(request: Request) {
  try {
    // Get query parameters
    const url = new URL(request.url);
    const app = url.searchParams.get("app") || "Chrome";
    
    
    // Use the Operator SDK to locate UI elements
    const text = "STOP";

    const elements = await browserPipe.operator.fill({
      app,
      text,
      value: text
    });
    
    
    console.log(`found ${elements} elements`);
    
    return NextResponse.json({
      app,
      elements,
    });
  } catch (error) {
    console.error("error accessing ui elements:", error);
    return NextResponse.json(
      { error: `failed to access ui elements: ${error}` },
      { status: 500 }
    );
  }
}