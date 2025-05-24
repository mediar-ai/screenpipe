import { invoke } from '@tauri-apps/api/core';

export async function getMediaFile(
	filePath: string,
): Promise<{ data: string; mimeType: string }> {
	try {
		const result = await invoke<{ data: string; mimeType: string }>('get_media_file', {
			filePath: filePath,
		});

		return result;
	} catch (error) {
		console.error("failed to read media file:", error);
		throw new Error(
			`failed to read media file: ${error instanceof Error ? error.message : "unknown error"}`,
		);
	}
}

