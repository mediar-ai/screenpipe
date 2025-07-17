import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Placeholder for future AI analysis logic
  console.log("analyze-workflow endpoint called");

  // For now, return a success message
  return NextResponse.json({ success: true, message: "analysis started" });
} 