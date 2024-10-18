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

  const queryScreenpipe = async (params: ScreenpipeQueryParams) => {
    const url = new URL("http://localhost:3030/search");
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, value.toString());
      }
    });

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`http error! status: ${response.status}`);
    }
    return response.json();
  };

  useEffect(() => {
    const fetchKeywords = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const response = await queryScreenpipe({
          content_type: "all",
          start_time: yesterday.toISOString(),
          end_time: now.toISOString(),
          limit: 1_000_000,
        });

        if (response && response.data) {
          processContentStreaming(response.data);
        } else {
          setError("no data returned from screenpipe");
        }
      } catch (err) {
        setError("error fetching keywords");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchKeywords();
  }, []);

  const processContentStreaming = (data: ContentItem[]) => {
    const batchSize = 100;
    const wordCounts: Record<string, number> = {};

    const processBatch = (startIndex: number) => {
      const endIndex = Math.min(startIndex + batchSize, data.length);
      
      for (let i = startIndex; i < endIndex; i++) {
        const item = data[i];
        const text = item.type === "OCR" ? item.content.text : item.content.transcription;
        if (text) {
          const words = text.toLowerCase().split(/\s+/);
          words.forEach((word) => {
            if (word.length > 3) {
              wordCounts[word] = (wordCounts[word] || 0) + 1;
            }
          });
        }
      }

      const sortedKeywords = sortKeywords(wordCounts).slice(0, 20);
      setKeywords(sortedKeywords);

      if (endIndex < data.length) {
        setTimeout(() => processBatch(endIndex), 0);
      }
    };

    processBatch(0);
  };

  const sortKeywords = (wordCounts: Record<string, number>): KeywordCount[] => {
    return Object.entries(wordCounts)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count);
  };

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
