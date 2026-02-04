"use client";

import { ScreenpipeClient, type SearchParams } from "@screenpipe/browser";
import { useState } from "react";

const client = new ScreenpipeClient();

function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (normA * normB);
}

async function deduplicateTexts(texts: string[]) {
  if (texts.length === 0) return { groups: [] };

  const result = await client.createEmbeddings(texts);
  const embeddings = result.data.map((d, i) => ({
    text: texts[i],
    embedding: d.embedding,
  }));

  const threshold = 0.9;
  const groups: { text: string; similar: string[] }[] = [];
  const used = new Set<number>();

  for (let i = 0; i < embeddings.length; i++) {
    if (used.has(i)) continue;
    const group = { text: embeddings[i].text, similar: [] as string[] };
    used.add(i);
    for (let j = i + 1; j < embeddings.length; j++) {
      if (used.has(j)) continue;
      if (cosineSimilarity(embeddings[i].embedding, embeddings[j].embedding) > threshold) {
        group.similar.push(embeddings[j].text);
        used.add(j);
      }
    }
    if (group.similar.length > 0) groups.push(group);
  }

  return { groups };
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [dedupResults, setDedupResults] = useState<{
    groups: { text: string; similar: string[] }[];
  }>({ groups: [] });

  const handleSearch = async () => {
    setLoading(true);
    try {
      const params: SearchParams = {
        q: "",
        contentType: "vision",
        limit: 10,
        startTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await client.search(params);
      if (response) {
        setResults(response.data);

        const texts = response.data.map((r) => {
          if ("content" in r && "text" in r.content) return r.content.text;
          return "";
        });

        const deduped = await deduplicateTexts(texts);
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
        <h3 className="text-2xl mb-8 font-bold text-gray-800">
          screenpipe deduplication demo
        </h3>

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
            {`import { ScreenpipeClient } from "@screenpipe/browser";
const client = new ScreenpipeClient();

// search vision content
const results = await client.search({
  contentType: "vision",
  limit: 100,
  startTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
});

// create embeddings for deduplication
const texts = results.data.map(r => r.content.text);
const embeddings = await client.createEmbeddings(texts);`}
          </pre>
        </div>

        <div className="grid grid-cols-2 gap-8">
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
                  <div className="text-sm truncate" title={JSON.stringify(result.content)}>
                    {result.content?.text || result.content?.transcription || JSON.stringify(result.content)}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    timestamp: {new Date(result.content.timestamp).toLocaleString()}
                  </div>
                  {result.content.appName && (
                    <div className="mt-1 text-xs text-gray-500">
                      app: {result.content.appName}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

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
                  <div className="font-bold text-sm truncate" title={group.text}>
                    {group.text}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {group.similar.length} similar item(s)
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
