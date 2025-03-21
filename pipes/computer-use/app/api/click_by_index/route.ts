import { NextResponse } from "next/server";
import { pipe as browserPipe } from "../../../../../screenpipe-js/browser-sdk/dist";

export async function GET(request: Request) {
  try {
    // Get query parameters
    const url = new URL(request.url);
    const app = url.searchParams.get("app") || "Chrome";
    const indexStr = url.searchParams.get("index");
    
    if (!indexStr) {
      return NextResponse.json(
        { error: "index parameter is required" },
        { status: 400 }
      );
    }
    
    const index = parseInt(indexStr, 10);
    
    if (isNaN(index)) {
      return NextResponse.json(
        { error: "index must be a valid number" },
        { status: 400 }
      );
    }
    
    // We need to implement clickByIndex method in Operator class
    // For now, assuming it exists
    const result = await browserPipe.operator.clickByIndex(index);
    
    console.log(`clicked element at index ${index} in ${app}`);
    
    return NextResponse.json({
      app,
      index,
      success: result,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: `failed: \n ${error}` },
      { status: 500 }
    );
  }
}
