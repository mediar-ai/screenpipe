import { pipe, Settings } from "@screenpipe/js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
	try {
		const { frameIds } = await request.json();
		const settings = (await pipe.settings.getAll()) as Settings & {
			fps: number;
		};

		console.log(settings.fps);

		if (!frameIds || !Array.isArray(frameIds)) {
			return NextResponse.json({ error: "Invalid frame IDs" }, { status: 400 });
		}

		const response = await fetch("http://localhost:3030/frames/export", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ frame_ids: frameIds, fps: settings.fps ?? 0.5 }),
		});

		if (!response.ok) {
			throw new Error("Failed to export video");
		}

		const data = await response.json();
		return NextResponse.json(data);
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to export video" },
			{ status: 500 },
		);
	}
}
