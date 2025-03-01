"use server";

import { isAfter } from "date-fns";

export async function getStartDate() {
	try {
		const videoChunkQuery = `
         SELECT
            f.timestamp,
            f.offset_index,
            ot.text,
            ot.app_name,
            ot.window_name,
            vc.device_name as screen_device,
            vc.file_path as video_path
         FROM frames f
         JOIN video_chunks vc ON f.video_chunk_id = vc.id
         LEFT JOIN ocr_text ot ON f.id = ot.frame_id
         ORDER BY f.timestamp ASC, f.offset_index ASC
         LIMIT 1

`;

		const audioChunkQuery = `
         SELECT
                at.timestamp,
                at.transcription,
                at.device as audio_device,
                at.is_input_device,
                ac.file_path as audio_path
         FROM audio_transcriptions at
         JOIN audio_chunks ac ON at.audio_chunk_id = ac.id
         ORDER BY at.timestamp ASC
         LIMIT 1
`;

		const videoFetch = fetch("http://localhost:3030/raw_sql", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query: videoChunkQuery }),
		});

		const audioFetch = fetch("http://localhost:3030/raw_sql", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query: audioChunkQuery }),
		});

		const [videoData, audioData] = await Promise.all([videoFetch, audioFetch]);

		if (!videoData.ok || !audioData.ok) {
			return {
				error: "error occured while getting data",
				video: await videoData.json(),
				audio: await audioData.json(),
				query: {
					videoChunkQuery,
					audioChunkQuery,
				},
			};
		}

		const video = (await videoData.json())[0];
		const audio = (await audioData.json())[0];

		const videoStart = new Date(video.timestamp);
		const audioStart = new Date(audio.timestamp);

		const videoGreater = isAfter(videoStart, audioStart);

		return !videoGreater ? videoStart : audioStart;
	} catch (e) {
		return {
			error: "errro occured",
		};
	}
}
