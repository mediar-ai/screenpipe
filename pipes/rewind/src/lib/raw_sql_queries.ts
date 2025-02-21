export async function fetchAppAndWindowNames(
	keywords: string[],
	signal?: AbortSignal,
) {
	const conditions = keywords
		.map((k) => {
			const pattern = `%${k}%`;
			return `(
      o.text LIKE '${pattern}' AND
      (o.window_name LIKE '${pattern}' OR o.app_name LIKE '${pattern}')
    )`;
		})
		.join(" OR ");

	const sql = `
    SELECT DISTINCT
      o.app_name,
      o.window_name
    FROM frames f
    JOIN ocr_text o ON f.id = o.frame_id
    WHERE ${conditions}
    ORDER BY f.timestamp DESC
    LIMIT 100
  `;

	const response = await fetch("http://localhost:3030/raw_sql", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ query: sql }),
		signal,
	});

	if (!response.ok) {
		throw new Error("Failed to execute raw SQL query");
	}

	const res = await response.json();
	console.log(res);
	return res;
}
