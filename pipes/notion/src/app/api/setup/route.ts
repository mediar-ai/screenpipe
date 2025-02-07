import { NextResponse } from "next/server";
import { automateNotionSetup } from "@/lib/notion/setup";
import { Settings } from "@/lib/types";
import { getNotionSettings } from "@/lib/actions/namespace-settings";

export async function GET() {
	try {
		const settings = (await getNotionSettings()) as Settings;
		const credentials = await automateNotionSetup(settings.workspace);
		return NextResponse.json(credentials);
	} catch (error) {
		console.log(error);
		return NextResponse.json(
			{ error: "Failed to setup Notion" },
			{ status: 500 },
		);
	}
}
