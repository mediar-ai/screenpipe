/* 
curl -X POST "http://localhost:3000/api/press-key-by-index" \
  -H "Content-Type: application/json" \
  -d '{"element_index": 32, "key_combo": "return"}'
*/
import { NextResponse } from "next/server";
import { pipe as browserPipe } from "../../../../../screenpipe-js/browser-sdk/dist";

export async function POST(request: Request) {
  try {
    // parse the JSON body
    const body = await request.json();
    const index = body.element_index;
    const keyCombo = body.key_combo;
    
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
    
    // validate key_combo parameter
    if (!keyCombo) {
      return NextResponse.json(
        { error: "key_combo is required in request body" },
        { status: 400 }
      );
    }
    
    try {
      // call our new pressKeyByIndex method from the SDK
      const result = await browserPipe.operator.pressKeyByIndex(index, keyCombo);
      
      console.log(`pressed key combo "${keyCombo}" on element at index ${index}`);
      
      return NextResponse.json({
        index,
        key_combo: keyCombo,
        success: result,
      });
    } catch (keyPressError) {
      // safely extract error message as string
      const errorMessage = keyPressError instanceof Error 
        ? keyPressError.message 
        : String(keyPressError);
        
      console.error(`press key error: ${errorMessage}`);
      
      // preserve HTTP status if possible
      const statusCode = (keyPressError as any).status || 500;
      
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
