import { NextResponse } from "next/server";
import { pipe as browserPipe } from "../../../../../screenpipe-js/browser-sdk/dist";

export async function GET(request: Request) {
  try {
    // Get query parameters
    const url = new URL(request.url);
    const app = url.searchParams.get("app") || "Chrome";
    const maxResults = parseInt(url.searchParams.get("maxResults") || "10");
    const maxDepth = parseInt(url.searchParams.get("maxDepth") || "1");
    
    
    // Use the Operator SDK to locate UI elements
    const elements = await browserPipe.operator
      .get_interactable_elements({
        app: app,
      })
    
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