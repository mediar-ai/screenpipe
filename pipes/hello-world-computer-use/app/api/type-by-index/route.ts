/*
curl -X POST "http://localhost:3000/api/type-by-index" \
-H "Content-Type: application/json" \
-d '{"element_index": 32, "text":"hello world😊"}' | jq
*/

import { NextResponse } from "next/server";
import { pipe as browserPipe } from "../../../../../screenpipe-js/browser-sdk/dist";

export async function POST(request: Request) {
  try {
    // parse the JSON body
    const body = await request.json();
    const index = body.element_index;
    const text = body.text;
    
    // validate index parameter
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
    
    // validate text parameter
    if (!text) {
      return NextResponse.json(
        { error: "text is required in request body" },
        { status: 400 }
      );
    }
    
    try {
      // call our new typeByIndex method from the SDK
      const result = await browserPipe.operator.typeByIndex(index, text);
      
      console.log(`typed text into element at index ${index}: "${text}"`);
      
      return NextResponse.json({
        index,
        text,
        success: result,
      });
    } catch (typeError) {
      // safely extract error message as string
      const errorMessage = typeError instanceof Error 
        ? typeError.message 
        : String(typeError);
        
      console.error(`type error: ${errorMessage}`);
      
      // preserve HTTP status if possible
      const statusCode = (typeError as any).status || 500;
      
      return NextResponse.json(
        { error: errorMessage },
        { status: statusCode }
      );
    }
  } catch (error) {
    // handle JSON parsing errors or other exceptions
    const errorMessage = error instanceof Error 
      ? error.message 
      : String(error);
      
    console.error(`route error: ${errorMessage}`);
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}