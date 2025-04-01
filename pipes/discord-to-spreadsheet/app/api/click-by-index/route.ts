/*
curl -X POST "http://localhost:3000/api/click-by-index" \
  -H "Content-Type: application/json" \
  -d '{"element_index": 2}' | jq
*/
import { NextResponse } from "next/server";
import { pipe as browserPipe } from "../../../../../screenpipe-js/browser-sdk/dist";

export async function POST(request: Request) {
  try {
    // Parse the JSON body
    const body = await request.json();
    const index = body.element_index;
    
    if (index === undefined) {
      return NextResponse.json(
        { error: "element_index is required in request body" },
        { status: 400 }
      );
    }
    
    if (typeof index !== 'number') {
      return NextResponse.json(
        { error: "element_index must be a valid number" },
        { status: 400 }
      );
    }
    
    try {
      const result = await browserPipe.operator.clickByIndex(index);
      
      console.log(`clicked element at index ${index}`);
      
      return NextResponse.json({
        index,
        success: result,
      });
    } catch (clickError) {
      // Safely extract error message as string
      const errorMessage = clickError instanceof Error 
        ? clickError.message 
        : String(clickError);
        
      console.error(`Click error: ${errorMessage}`);
      
      // Preserve HTTP status if possible
      const statusCode = (clickError as any).status || 500;
      
      return NextResponse.json(
        { error: errorMessage },
        { status: statusCode }
      );
    }
  } catch (error) {
    // Handle JSON parsing errors or other exceptions
    const errorMessage = error instanceof Error 
      ? error.message 
      : String(error);
      
    console.error(`Route error: ${errorMessage}`);
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
