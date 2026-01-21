import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { getOpenAIClient, createEmbeddings, chunkText } from "@/lib/embeddings";
import {
  loadVectorStore,
  saveVectorStore,
  addDocuments,
  pruneOldDocuments,
  VectorDocument,
} from "@/lib/vector-store";

const SCREENPIPE_API = "http://localhost:3030";
const MAX_ITEMS = 50000; // Maximum items to fetch in one request

async function fetchAllScreenpipeData(contentType: "ocr" | "audio") {
  // Note: Screenpipe API offset is broken, so we fetch all at once with high limit
  const url = `${SCREENPIPE_API}/search?content_type=${contentType}&limit=${MAX_ITEMS}`;

  console.log(`Fetching all ${contentType} data from screenpipe...`);
  const response = await fetch(url);
  const data = await response.json();

  const items = data.data || [];
  const total = data.pagination?.total || items.length;

  console.log(`Fetched ${items.length}/${total} ${contentType} items`);

  return items;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fullReindex = searchParams.get("full") === "true";

    const settings = await getSettings();

    if (!settings.openaiApiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 400 }
      );
    }

    if (!settings.indexingEnabled) {
      return NextResponse.json({ message: "Indexing disabled" });
    }

    let store = loadVectorStore();
    const openai = getOpenAIClient(settings.openaiApiKey);

    // Calculate time range for indexing
    const endTime = new Date();
    let startTime: Date;

    if (fullReindex) {
      // Full reindex: go back 30 days or use a very old date
      startTime = new Date(endTime.getTime() - 30 * 24 * 60 * 60 * 1000);
      // Clear existing documents for full reindex
      store = { documents: [], lastIndexedTime: null };
      console.log("Full reindex requested - clearing existing index");
    } else {
      startTime = store.lastIndexedTime
        ? new Date(store.lastIndexedTime)
        : new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
    }

    console.log(`Full reindex: ${fullReindex}`);

    // Fetch ALL OCR data with pagination (no time filter - get everything)
    const ocrDataItems = await fetchAllScreenpipeData("ocr");

    // Fetch ALL audio data with pagination
    const audioDataItems = await fetchAllScreenpipeData("audio");

    console.log(`Total OCR items fetched: ${ocrDataItems.length}`);
    console.log(`Total audio items fetched: ${audioDataItems.length}`);

    const documentsToIndex: Array<{
      id: string;
      text: string;
      metadata: VectorDocument["metadata"];
    }> = [];

    // Process OCR data
    for (const item of ocrDataItems) {
      if (item.type === "OCR") {
        const content = item.content;
        const text = content.text?.trim();

        if (text && text.length > 30) {
          // Chunk long texts
          const chunks = chunkText(text);
          chunks.forEach((chunk, idx) => {
            documentsToIndex.push({
              id: `ocr-${content.frame_id}-${idx}`,
              text: chunk,
              metadata: {
                timestamp: content.timestamp,
                appName: content.app_name || "unknown",
                windowName: content.window_name || "unknown",
                type: "ocr",
              },
            });
          });
        }
      }
    }

    // Process audio data
    for (const item of audioDataItems) {
      if (item.type === "Audio") {
        const content = item.content;
        const text = content.transcription?.trim();

        if (text && text.length > 20) {
          const chunks = chunkText(text);
          chunks.forEach((chunk, idx) => {
            documentsToIndex.push({
              id: `audio-${content.chunk_id}-${idx}`,
              text: chunk,
              metadata: {
                timestamp: content.timestamp,
                appName: "audio",
                windowName: content.speaker?.name || `Speaker ${content.speaker?.id || 0}`,
                type: "audio",
              },
            });
          });
        }
      }
    }

    // Filter out documents that already exist in the store (BEFORE creating embeddings)
    const existingIds = new Set(store.documents.map((d) => d.id));
    const newDocumentsToIndex = documentsToIndex.filter((d) => !existingIds.has(d.id));

    console.log(`Documents to index: ${documentsToIndex.length} total, ${newDocumentsToIndex.length} new (${documentsToIndex.length - newDocumentsToIndex.length} already exist)`);

    if (newDocumentsToIndex.length === 0) {
      // Update last indexed time even if no new documents
      const updatedStore = {
        ...store,
        lastIndexedTime: endTime.toISOString(),
      };
      saveVectorStore(updatedStore);

      return NextResponse.json({
        message: "No new documents to index",
        documentsIndexed: 0,
        totalDocuments: store.documents.length,
      });
    }

    // Create embeddings only for NEW documents
    console.log(`Creating embeddings for ${newDocumentsToIndex.length} NEW documents...`);
    const texts = newDocumentsToIndex.map((d) => d.text);
    const embeddings = await createEmbeddings(openai, texts);

    // Create vector documents from NEW documents only
    const vectorDocs: VectorDocument[] = newDocumentsToIndex.map((doc, i) => ({
      ...doc,
      embedding: embeddings[i],
    }));

    // Add to store and prune old documents
    let updatedStore = addDocuments(store, vectorDocs);
    updatedStore = pruneOldDocuments(updatedStore);
    updatedStore.lastIndexedTime = endTime.toISOString();

    saveVectorStore(updatedStore);

    console.log(`Indexed ${vectorDocs.length} documents. Total: ${updatedStore.documents.length}`);

    return NextResponse.json({
      message: "Indexing complete",
      documentsIndexed: vectorDocs.length,
      totalDocuments: updatedStore.documents.length,
      lastIndexedTime: updatedStore.lastIndexedTime,
    });
  } catch (error) {
    console.error("Indexing error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Indexing failed" },
      { status: 500 }
    );
  }
}
