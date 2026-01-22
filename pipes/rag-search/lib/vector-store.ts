import * as fs from "fs";
import * as path from "path";

export interface VectorDocument {
  id: string;
  text: string;
  embedding: number[];
  metadata: {
    timestamp: string;
    appName: string;
    windowName: string;
    type: "ocr" | "audio";
  };
}

export interface VectorStore {
  documents: VectorDocument[];
  lastIndexedTime: string | null;
}

const STORE_PATH = path.join(process.cwd(), ".vector-store.json");

// Cache the store in memory to avoid re-reading the large file
let cachedStore: VectorStore | null = null;
let cacheTime: number = 0;
const CACHE_TTL = 300000; // 5 minute cache (loading 278MB file is slow)

export function loadVectorStore(): VectorStore {
  // Return cached version if still valid
  if (cachedStore && Date.now() - cacheTime < CACHE_TTL) {
    return cachedStore;
  }

  try {
    if (fs.existsSync(STORE_PATH)) {
      // Use streaming JSON parser for large files
      const fileSize = fs.statSync(STORE_PATH).size;

      if (fileSize > 100 * 1024 * 1024) {
        // > 100MB: use chunked reading
        console.log(`Loading large vector store (${(fileSize / 1024 / 1024).toFixed(1)} MB)...`);
        const store = loadLargeVectorStore();
        cachedStore = store;
        cacheTime = Date.now();
        return store;
      } else {
        const data = fs.readFileSync(STORE_PATH, "utf-8");
        const store = JSON.parse(data);
        cachedStore = store;
        cacheTime = Date.now();
        return store;
      }
    }
  } catch (error) {
    console.error("Error loading vector store:", error);
  }
  return { documents: [], lastIndexedTime: null };
}

function loadLargeVectorStore(): VectorStore {
  // Read file in chunks and parse incrementally
  const fd = fs.openSync(STORE_PATH, "r");
  const fileSize = fs.statSync(STORE_PATH).size;
  const CHUNK_SIZE = 64 * 1024 * 1024; // 64MB chunks

  let content = "";
  let position = 0;

  while (position < fileSize) {
    const buffer = Buffer.alloc(Math.min(CHUNK_SIZE, fileSize - position));
    fs.readSync(fd, buffer, 0, buffer.length, position);
    content += buffer.toString("utf-8");
    position += buffer.length;
  }

  fs.closeSync(fd);
  return JSON.parse(content);
}

export function invalidateCache(): void {
  cachedStore = null;
  cacheTime = 0;
}

export function saveVectorStore(store: VectorStore): void {
  try {
    // Invalidate cache when saving
    invalidateCache();

    // Write in chunks to avoid "Invalid string length" error for large data
    const fd = fs.openSync(STORE_PATH, "w");
    fs.writeSync(fd, '{"documents":[');

    for (let i = 0; i < store.documents.length; i++) {
      if (i > 0) fs.writeSync(fd, ",");
      // Reduce embedding precision to 6 decimal places to save space
      const doc = {
        ...store.documents[i],
        embedding: store.documents[i].embedding.map((v) => Math.round(v * 1000000) / 1000000),
      };
      fs.writeSync(fd, JSON.stringify(doc));
    }

    fs.writeSync(fd, `],"lastIndexedTime":${JSON.stringify(store.lastIndexedTime)}}`);
    fs.closeSync(fd);
    console.log(`Saved vector store with ${store.documents.length} documents`);
  } catch (error) {
    console.error("Error saving vector store:", error);
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

// Extract frame ID from document ID (e.g., "ocr-20383-1" → "20383")
function getFrameId(docId: string): string | null {
  const parts = docId.split("-");
  if (parts.length >= 2 && parts[0] === "ocr") {
    return parts[1];
  }
  if (parts.length >= 2 && parts[0] === "audio") {
    return parts[1];
  }
  return null;
}

// Normalize text for deduplication (remove whitespace, lowercase, keep only alphanumeric)
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 200);
}

// Check if two texts are near-duplicates (>80% similar in first 200 chars)
function isNearDuplicate(text1: string, text2: string): boolean {
  const norm1 = normalizeText(text1);
  const norm2 = normalizeText(text2);

  if (norm1 === norm2) return true;

  // Simple character overlap check
  const set1 = new Set(norm1.split(''));
  const set2 = new Set(norm2.split(''));
  const intersection = [...set1].filter(c => set2.has(c)).length;
  const union = new Set([...set1, ...set2]).size;
  const similarity = intersection / union;

  return similarity > 0.9;
}

export function searchSimilar(
  store: VectorStore,
  queryEmbedding: number[],
  topK: number = 10
): Array<VectorDocument & { score: number }> {
  // Step 1: Calculate similarity scores for all documents
  const scoredDocs = store.documents.map((doc) => ({
    ...doc,
    score: cosineSimilarity(queryEmbedding, doc.embedding),
  }));

  // Step 2: Sort by score
  scoredDocs.sort((a, b) => b.score - a.score);

  // Step 3: Deduplicate only top candidates (optimization: O(n²) on small subset instead of all docs)
  const CANDIDATE_POOL = 500; // Only deduplicate top 500 candidates
  const candidates = scoredDocs.slice(0, CANDIDATE_POOL);

  // Use hash-based exact dedup first (O(n))
  const seenNormalized = new Set<string>();
  const deduplicatedDocs: Array<VectorDocument & { score: number }> = [];

  for (const doc of candidates) {
    const normalized = normalizeText(doc.text);
    if (!seenNormalized.has(normalized)) {
      seenNormalized.add(normalized);
      deduplicatedDocs.push(doc);
    }
  }

  console.log(`Deduplication: ${candidates.length} candidates → ${deduplicatedDocs.length} unique docs`);

  // Step 4: Get top K from deduplicated results
  const topMatches = deduplicatedDocs.slice(0, topK);

  // Step 5: Collect all unique frame IDs from top matches
  const matchedFrameIds = new Set<string>();
  for (const doc of topMatches) {
    const frameId = getFrameId(doc.id);
    if (frameId) {
      matchedFrameIds.add(frameId);
    }
  }

  // Step 6: Get ALL chunks from matched frames (siblings)
  const frameChunks = new Map<string, Array<VectorDocument & { score: number }>>();

  for (const doc of scoredDocs) {
    const frameId = getFrameId(doc.id);
    if (frameId && matchedFrameIds.has(frameId)) {
      if (!frameChunks.has(frameId)) {
        frameChunks.set(frameId, []);
      }
      frameChunks.get(frameId)!.push(doc);
    }
  }

  // Step 7: Sort chunks within each frame by chunk index, then combine
  const results: Array<VectorDocument & { score: number }> = [];

  // Sort frames by their best matching score
  const sortedFrameIds = [...matchedFrameIds].sort((a, b) => {
    const aMax = Math.max(...(frameChunks.get(a)?.map(d => d.score) || [0]));
    const bMax = Math.max(...(frameChunks.get(b)?.map(d => d.score) || [0]));
    return bMax - aMax;
  });

  for (const frameId of sortedFrameIds) {
    const chunks = frameChunks.get(frameId) || [];
    // Sort by chunk index (last part of ID: "ocr-20383-1" → 1)
    chunks.sort((a, b) => {
      const aIdx = parseInt(a.id.split("-").pop() || "0");
      const bIdx = parseInt(b.id.split("-").pop() || "0");
      return aIdx - bIdx;
    });
    results.push(...chunks);
  }

  // Debug: log matched frame IDs
  console.log(`Search: ${topK} top matches → ${matchedFrameIds.size} frames → ${results.length} total chunks`);
  console.log(`Matched frame IDs: ${[...matchedFrameIds].slice(0, 10).join(', ')}`);

  // Debug: log top 5 matches with scores
  console.log(`Top 5 matches:`);
  for (let i = 0; i < Math.min(5, topMatches.length); i++) {
    const m = topMatches[i];
    console.log(`  #${i+1} [${m.score.toFixed(4)}] ${m.id}: ${m.text.slice(0, 60)}...`);
  }

  return results;
}

export function addDocuments(
  store: VectorStore,
  documents: VectorDocument[]
): VectorStore {
  const existingIds = new Set(store.documents.map((d) => d.id));
  const newDocs = documents.filter((d) => !existingIds.has(d.id));

  return {
    ...store,
    documents: [...store.documents, ...newDocs],
  };
}

export function pruneOldDocuments(
  store: VectorStore,
  maxAge: number = 7 * 24 * 60 * 60 * 1000 // 7 days
): VectorStore {
  const cutoff = new Date(Date.now() - maxAge).toISOString();

  return {
    ...store,
    documents: store.documents.filter(
      (d) => d.metadata.timestamp > cutoff
    ),
  };
}
