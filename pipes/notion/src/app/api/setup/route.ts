import { NextResponse } from "next/server";
import { automateNotionSetup } from "@/lib/notion/setup";
import { pipe } from "@screenpipe/js";

export async function GET() {
  try {
    const settings = await pipe.settings.getNamespaceSettings("notion");
    const credentials = await automateNotionSetup(settings?.workspace);
    return NextResponse.json(credentials);
  } catch (error) {
    console.log(error);
    return NextResponse.json(
      { error: "Failed to setup Notion" },
      { status: 500 }
    );
  }
}
