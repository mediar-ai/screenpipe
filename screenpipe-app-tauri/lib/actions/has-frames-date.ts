import { isSameDay } from "date-fns";

export async function hasFramesForDate(date: Date): Promise<boolean> {
	try {
		// Set up start and end of the day
		const startOfDay = new Date(date);
		startOfDay.setHours(0, 0, 0, 0);

		let endOfDay = new Date(date);
		if (isSameDay(startOfDay, new Date())) {
			endOfDay.setMinutes(endOfDay.getMinutes() - 5);
		} else {
			endOfDay.setHours(23, 59, 59, 999);
		}

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
			console.error("Error checking frames for date:", await response.text());
			// Return false on error - let navigation proceed to try the date
			return false;
		}

		const result = await response.json();
		console.log("hasFramesForDate result:", date.toISOString(), result);
		return result[0]?.frame_count > 0;
	} catch (e) {
		console.error("Error checking frames for date:", e);
		// Return false on error - let navigation proceed to try the date
		return false;
	}
}
