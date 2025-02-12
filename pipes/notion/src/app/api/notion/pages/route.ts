import { NextResponse } from "next/server";
import { Client } from "@notionhq/client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.toLowerCase().trim();
    const accessToken = searchParams.get("accessToken");

    if (!accessToken) {
      return NextResponse.json(
        { error: "notion not configured" },
        { status: 400 }
      );
    }

    const client = new Client({ auth: accessToken });

    const response = await client.search({
      filter: {
        property: "object",
        value: "page",
      },
      sort: {
        direction: "descending",
        timestamp: "last_edited_time",
      },
      ...(query && { query }),
    });

    const pages = response.results.map((page: any) => ({
      id: page.id,
      title: page.properties?.title?.title?.[0]?.plain_text || "Untitled",
      lastEdited: page.last_edited_time,
      url: page.url,
      icon: page.icon,
      parent: {
        type: page.parent.type,
        id: page.parent.database_id || page.parent.page_id,
      },
    }));

    return NextResponse.json({
      pages,
      next_cursor: response.next_cursor,
      has_more: response.has_more,
    });
  } catch (error) {
    console.error("error fetching pages:", error);
    return NextResponse.json(
      { error: "Failed to fetch pages" },
      { status: 500 }
    );
  }
}
