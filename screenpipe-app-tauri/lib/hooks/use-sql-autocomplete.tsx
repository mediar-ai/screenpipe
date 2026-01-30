import { useState, useEffect, useCallback } from "react";

interface AutocompleteItem {
  name: string;
  count: number;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const cache: Record<string, { data: AutocompleteItem[]; timestamp: number }> =
  {};

export function useSqlAutocomplete(type: "app" | "window" | "url") {
  const [items, setItems] = useState<AutocompleteItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const cachedData = cache[type];
      if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
        setItems(cachedData.data);
      } else {
        let query: string;
        if (type === "url") {
          // Query unique domains from browser_url
          query = `
            SELECT
              CASE
                WHEN browser_url LIKE 'https://%' THEN SUBSTR(browser_url, 9, INSTR(SUBSTR(browser_url, 9), '/') - 1)
                WHEN browser_url LIKE 'http://%' THEN SUBSTR(browser_url, 8, INSTR(SUBSTR(browser_url, 8), '/') - 1)
                ELSE browser_url
              END as name,
              COUNT(*) as count
            FROM frames
            WHERE browser_url IS NOT NULL
            AND browser_url != ''
            AND timestamp > datetime('now', '-7 days')
            GROUP BY name
            HAVING name != ''
            ORDER BY count DESC
            LIMIT 100
          `;
        } else {
          query = `
            SELECT ${
              type === "app" ? "f.app_name" : "f.window_name"
            } as name, COUNT(*) as count
            FROM ocr_text ocr
            JOIN frames f ON ocr.frame_id = f.id
            WHERE f.timestamp > datetime('now', '-7 days')
            AND ${type === "app" ? "f.app_name" : "f.window_name"} IS NOT NULL
            AND ${type === "app" ? "f.app_name" : "f.window_name"} != ''
            GROUP BY ${type === "app" ? "f.app_name" : "f.window_name"}
            ORDER BY count DESC
            LIMIT 100
          `;
        }
        const response = await fetch("http://localhost:3030/raw_sql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query }),
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        setItems(result);
        cache[type] = { data: result, timestamp: Date.now() };
      }
    } catch (error) {
      console.error("failed to fetch items:", error);
    } finally {
      setIsLoading(false);
    }
  }, [type]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return { items, isLoading };
}
