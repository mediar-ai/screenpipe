import { NextResponse } from "next/server";
import { pipe as browserPipe } from "../../../../../screenpipe-js/browser-sdk/dist";

export async function GET(request: Request) {
  try {
    // Get query parameters
    const url = new URL(request.url);
    const app = url.searchParams.get("app") || "Chrome";
        
    // Use the Operator SDK to get text
    const elements = await browserPipe.operator
      .get_text({
        app: app,
      });

    console.log(`found ${elements} elements`);
    
    return NextResponse.json({
      app,
      elementsFound: elements,
      elements,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: `failed: \n ${error}` },
      { status: 500 }
    );
  }
}