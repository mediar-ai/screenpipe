import { useState, useCallback } from "react";

interface SearchResult {
	rank: number;
	app_name: string;
	window_name: string;
}

export function useAppNameSuggestion() {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const search = useCallback(async (searchText: string) => {
		try {
			setIsLoading(true);
			setError(null);
			const searchResults = await getAppandWindowByRank(searchText);
			return searchResults;
		} catch (err) {
			setError(
				err instanceof Error
					? err
					: new Error("An error occurred during search"),
			);
			return [];
		} finally {
			setIsLoading(false);
		}
	}, []);

	return {
		isLoading,
		error,
		search,
	};
}

export async function getAppandWindowByRank(
	searchText: string,
	abortContorller?: AbortController,
): Promise<SearchResult[]> {
	// Input validation
	if (!searchText || typeof searchText !== "string") {
		throw new Error("Search text must be a non-empty string");
	}

	// Sanitize input: Remove any SQL special characters that could be used for injection
	const sanitizedText = searchText
		.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, "")
		.replace(/\-\-/g, ""); // Remove SQL comment markers

	const query = `
    WITH RankedResults AS (
      SELECT
          rank,
          app_name,
          window_name,
          ROW_NUMBER() OVER (PARTITION BY window_name ORDER BY rank) as rn
      FROM ocr_text_fts
      WHERE text MATCH '${sanitizedText}'
    )
    SELECT
      rank,
      app_name,
      window_name
    FROM RankedResults
    WHERE rn = 1
    ORDER BY rank
    LIMIT 10
  `;

	try {
		const response = await fetch("http://localhost:3030/raw_sql", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query }),
			signal: abortContorller?.signal,
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json();
		return data;
	} catch (error) {
		console.error("Error searching OCR text:", error);
		throw error;
	}
}
