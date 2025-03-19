import { NextRequest, NextResponse } from "next/server";

/**
 * API route to fetch content from external URLs
 * Used by the playground to fetch documentation and other external resources
 */
export async function GET(request: NextRequest) {
  try {
    // Get the URL from the query parameters
    const url = request.nextUrl.searchParams.get("url");
    console.log("fetch-external: received request for url:", url);

    // Validate URL parameter
    if (!url) {
      console.error("fetch-external: missing url parameter");
      return NextResponse.json(
        { error: "missing url parameter" },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (err) {
      console.error("fetch-external: invalid url format:", url);
      return NextResponse.json(
        { error: "invalid url format" },
        { status: 400 }
      );
    }

    // Fetch the content
    console.log("fetch-external: fetching content from:", url);
    const startTime = performance.now();
    const response = await fetch(url, {
      headers: {
        "User-Agent": "ScreenPipe-Example-Pipe/1.0"
      }
    });
    const endTime = performance.now();
    
    if (!response.ok) {
      console.error(`fetch-external: external request failed with status ${response.status}`);
      return NextResponse.json(
        { error: `external request failed with status ${response.status}` },
        { status: 502 }
      );
    }

    // Get the content
    const content = await response.text();
    console.log(
      "fetch-external: successfully fetched content",
      "length:", content.length,
      "time:", (endTime - startTime).toFixed(2), "ms"
    );

    // Return the content with appropriate content type
    return new NextResponse(content, {
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "text/plain",
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch (error) {
    console.error("fetch-external: unexpected error:", error);
    return NextResponse.json(
      { error: "failed to fetch external content" },
      { status: 500 }
    );
  }
}
