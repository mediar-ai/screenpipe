import { NextResponse } from "next/server";
import { automateNotionSetup } from "@/lib/notion/setup";
import { getScreenpipeAppSettings } from "@/lib/actions/get-screenpipe-app-settings";

export async function GET() {
	try {
		const settings = (await getScreenpipeAppSettings())["customSettings"]![
			"notion"
		];

		if (!settings.workspace) {
			return NextResponse.json(
				{ error: "Please provide workspace name" },
				{ status: 404 },
			);
		}

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
