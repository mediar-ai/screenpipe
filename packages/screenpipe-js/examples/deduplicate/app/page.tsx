"use client";

import { pipe, ScreenpipeQueryParams } from "@screenpipe/browser";
import { useState } from "react";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [dedupResults, setDedupResults] = useState<{
    groups: { text: string; similar: string[] }[];
  }>({ groups: [] });

  const handleSearch = async () => {
    setLoading(true);
    try {
      // query last 24h of data
      const params: ScreenpipeQueryParams = {
        q: "",
        contentType: "ocr",
        limit: 10,
        startTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await pipe.queryScreenpipe(params);
      console.log(response);
      if (response) {
        setResults(response.data);

        // extract all text content for deduplication
        const texts = response.data.map((r) => {
          if ("content" in r && "text" in r.content) return r.content.text;
          return "";
        }) as string[];
        console.log(texts);
        const deduped = await pipe.deduplicateText(texts);
        setDedupResults(deduped);
      }
    } catch (error) {
      console.error("search failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50 font-mono">
      <div className="max-w-6xl mx-auto">
        {/* header */}
        <h3 className="text-2xl mb-8 font-bold text-gray-800">
          screenpipe deduplication demo
        </h3>

        {/* search input */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? "searching..." : "search"}
          </button>
        </div>

        <div className="my-12 p-4 bg-gray-800 text-gray-300 rounded-lg">
          <div className="text-sm font-bold mb-2">sdk usage:</div>
          <pre className="text-xs overflow-x-auto">
            {`// query screenpipe
const results = await pipe.queryScreenpipe({
  query: "",
  contentType: "ocr",
  limit: 100,
  startTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
});

// deduplicate results
const texts = results.data.map(r => JSON.stringify(r.content));
const deduped = await pipe.deduplicateText(texts);

// deduped.groups contains:
{
  text: string;      // original text
  similar: string[]; // similar variations
}`}
          </pre>
        </div>

        {/* results grid */}
        <div className="grid grid-cols-2 gap-8">
          {/* raw results */}
          <div>
            <h4 className="text-sm font-bold mb-4 text-gray-600">
              raw results ({results.length})
            </h4>
            <div className="space-y-2">
              {results.map((result, i) => (
                <div
                  key={i}
                  className="p-3 bg-white rounded-lg border border-gray-200"
                >
                  <div
                    className="text-sm group relative cursor-help"
                    title={
                      typeof result === "string"
                        ? result
                        : typeof result.text === "string"
                        ? result.text
                        : typeof result.content === "string"
                        ? result.content
                        : JSON.stringify(result, null, 2)
                    }
                  >
                    <span className="truncate block">
                      {typeof result === "string"
                        ? result
                        : typeof result.text === "string"
                        ? result.text
                        : typeof result.content === "string"
                        ? result.content
                        : JSON.stringify(result, null, 2)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    timestamp:{" "}
                    {new Date(result.content.timestamp).toLocaleString()}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    app: {result.content.appName}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    window: {result.content.windowName}
                  </div>
                  {result.content.browserUrl && (
                    <div className="mt-1 text-xs text-gray-500">
                      url:{" "}
                      <a
                        href={result.content.browserUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {result.content.browserUrl}
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* deduplicated results */}
          <div>
            <h4 className="text-sm font-bold mb-4 text-gray-600">
              deduplicated groups ({dedupResults.groups.length})
            </h4>
            <div className="space-y-4">
              {dedupResults.groups.map((group, i) => (
                <div
                  key={i}
                  className="p-4 bg-white rounded-lg border border-gray-200"
                >
                  <div
                    className="font-bold text-sm truncate cursor-help"
                    title={group.text}
                  >
                    {group.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* dev hints */}
      </div>
    </div>
  );
}
