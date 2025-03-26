/*
curl "http://localhost:3000/api/get_text?app=Messages" | jq
*/
import { NextResponse } from "next/server";
import { pipe as browserPipe } from "../../../../../screenpipe-js/browser-sdk/dist";

export async function GET(request: Request) {
  try {
    // Get query parameters
    const url = new URL(request.url);
    const app = url.searchParams.get("app");
    
    // Input validation
    if (!app) {
      console.error("missing required parameter: app");
      return NextResponse.json(
        { error: "app parameter is required" },
        { status: 400 }
      );
    }
    
    console.log(`getting text for app: ${app}`);
    
    // Use the Operator SDK to get text
    try {
      const result = await browserPipe.operator.get_text({
        app: app,
      });

      console.log(`got text response, success: ${result.success}, length: ${result.text.length} chars`);
      
      return NextResponse.json({
        app,
        success: result.success,
        text: result.text,
        metadata: result.metadata,
      });
    } catch (textError) {
      // Safely extract error message as string
      const errorMessage = textError instanceof Error 
        ? textError.message 
        : String(textError);
        
      console.error(`get_text error: ${errorMessage}`);
      
      // Preserve HTTP status if possible
      const statusCode = (textError as any).status || 500;
      
      return NextResponse.json(
        { error: errorMessage },
        { status: statusCode }
      );
    }
  } catch (error) {
    // Handle other exceptions
    const errorMessage = error instanceof Error 
      ? error.message 
      : String(error);
      
    console.error(`route error: ${errorMessage}`);
    
    return NextResponse.json(
      { error: `failed to process request: ${errorMessage}` },
      { status: 500 }
    );
  }
}