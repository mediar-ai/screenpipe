"use client";

import React, { useEffect, useState } from "react";

interface KeywordCount {
  word: string;
  count: number;
}

interface ScreenpipeQueryParams {
  content_type?: string;
  start_time?: string;
  end_time?: string;
  limit?: number;
}

interface ContentItem {
  type: "OCR" | "Audio";
  content: {
    text?: string;
    transcription?: string;
  };
}

export const KeywordCloud: React.FC = () => {
  const [keywords, setKeywords] = useState<KeywordCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const processContentStreaming = async () => {
    console.log("fetching keyword stats...");
    const url = new URL("http://localhost:3030/raw_sql");
    
    const query = `
      WITH RECURSIVE
      split(word, str) AS (
        SELECT '', content || ' '
        FROM (
          -- Get OCR text and audio from last 12h
          SELECT text as content
          FROM ocr_text ot
          JOIN frames f ON ot.frame_id = f.id
          WHERE datetime(timestamp) >= datetime('now', '-12 hours')
          UNION ALL
          SELECT transcription as content
          FROM audio_transcriptions
          WHERE datetime(timestamp) >= datetime('now', '-12 hours')
        )
        UNION ALL
        SELECT
          LOWER(SUBSTR(str, 0, INSTR(str, ' '))),
          SUBSTR(str, INSTR(str, ' ')+1)
        FROM split WHERE str!=''
      )
      SELECT 
        word,
        COUNT(*) as count
      FROM split
      WHERE length(word) > 3
        AND word NOT IN ('this', 'that', 'with', 'from', 'have', 'what', 'your', 'which', 'their', 'about')
      GROUP BY word
      HAVING count > 5
      ORDER BY count DESC
      LIMIT 50;
    `;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error(`http error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log("received keyword stats:", result);

      setKeywords(result.map((row: any) => ({
        word: row.word,
        count: row.count
      })));

    } catch (err) {
      console.error("failed to fetch keyword stats:", err);
      setError("error fetching keyword stats");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    processContentStreaming();
  }, []);

  if (isLoading) return <div>loading...</div>;
  if (error) return <div>error: {error}</div>;

  return (
    <div className="p-4 bg-gray-100 rounded-lg">
      <h2 className="text-xl font-bold mb-4">top keywords (last 24h)</h2>
      <div className="flex flex-wrap gap-2">
        {keywords.map((keyword) => (
          <span
            key={keyword.word}
            className="px-2 py-1 bg-white rounded-full text-sm flex items-center"
            style={{
              fontSize: `${Math.max(0.8, Math.min(2, keyword.count / 10))}rem`,
            }}
          >
            {keyword.word}
            <span className="ml-1 text-xs text-gray-500">({keyword.count})</span>
          </span>
        ))}
      </div>
    </div>
  );
};
