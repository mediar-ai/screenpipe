"use server";

export async function hasFramesForDate(date: Date) {
	try {
		// Set up start and end of the day
		const startOfDay = new Date(date);
		startOfDay.setHours(0, 0, 0, 0);

		const endOfDay = new Date(date);
		endOfDay.setHours(23, 59, 59, 999);

		const query = `
            SELECT COUNT(*) as frame_count
            FROM frames f
            WHERE f.timestamp >= '${startOfDay.toISOString()}'
            AND f.timestamp <= '${endOfDay.toISOString()}'
            LIMIT 1
        `;

		const response = await fetch("http://localhost:3030/raw_sql", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query }),
		});

		if (!response.ok) {
			return {
				error: "Error occurred while checking frames",
				details: await response.json(),
			};
		}

		const result = await response.json();
		return result[0]?.frame_count > 0;
	} catch (e) {
		return {
			error: "Error occurred while checking frames",
			details: e,
		};
	}
}
