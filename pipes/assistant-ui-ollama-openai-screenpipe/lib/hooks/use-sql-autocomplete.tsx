import { useState, useEffect, useCallback } from "react";

interface AutocompleteItem {
  name: string;
  count: number;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const cache: Record<string, { data: AutocompleteItem[]; timestamp: number }> =
  {};

export function useSqlAutocomplete(type: "app" | "window") {
  const [items, setItems] = useState<AutocompleteItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const cachedData = cache[type];
      if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
        setItems(cachedData.data);
      } else {
        const query = `
          SELECT ${
            type === "app" ? "ocr.app_name" : "ocr.window_name"
          } as name, COUNT(*) as count
          FROM ocr_text ocr
          JOIN frames f ON ocr.frame_id = f.id
          WHERE f.timestamp > datetime('now', '-7 days')
          GROUP BY ${type === "app" ? "ocr.app_name" : "ocr.window_name"}
          ORDER BY count DESC
          LIMIT 100
        `;
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
