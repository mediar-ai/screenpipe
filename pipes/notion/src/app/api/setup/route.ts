import { NextResponse } from "next/server";
import { automateNotionSetup } from "@/lib/notion/setup";
import { getScreenpipeAppSettings } from "@/lib/actions/get-screenpipe-app-settings";

export async function GET() {
	try {
		const settings = (await getScreenpipeAppSettings())["customSettings"]![
			"notion"
		];
		const credentials = await automateNotionSetup(settings?.workspace);
		return NextResponse.json(credentials);
	} catch (error) {
		console.log(error);
		return NextResponse.json(
			{ error: "Failed to setup Notion" },
			{ status: 500 },
		);
	}
}
