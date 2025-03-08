import { NextResponse } from "next/server";
import * as fs from "fs/promises";

export async function POST(req: Request) {
  try {
    const { path } = await req.json();

    try {
      await fs.access(path);
      return NextResponse.json({ exists: true });
    } catch {
      return NextResponse.json({ exists: false });
    }
  } catch (error) {
    console.error("error checking folder:", error);
    return NextResponse.json({ exists: false });
  }
}
