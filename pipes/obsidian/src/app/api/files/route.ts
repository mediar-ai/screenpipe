import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { pipe } from "@screenpipe/js";

// Force Node.js runtime
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cache for vault files - invalidated every 5 minutes
let filesCache: {
  files: string[];
  vaultPath: string;
  timestamp: number;
} | null = null;

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function findObsidianRoot(startPath: string): Promise<string | null> {
  let currentPath = startPath;

  while (currentPath !== path.parse(currentPath).root) {
    try {
      const hasObsidianDir = await fs
        .access(path.join(currentPath, ".obsidian"))
        .then(() => true)
        .catch(() => false);

      if (hasObsidianDir) {
        return currentPath;
      }

      currentPath = path.dirname(currentPath);
    } catch (error) {
      return null;
    }
  }
  return null;
}

async function getAllFiles(vaultPath: string): Promise<string[]> {
  // Check cache first
  if (
    filesCache &&
    filesCache.vaultPath === vaultPath &&
    Date.now() - filesCache.timestamp < CACHE_DURATION
  ) {
    return filesCache.files;
  }

  async function getFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const res = path.resolve(dir, entry.name);
        // Skip .obsidian directory
        if (entry.isDirectory() && entry.name !== ".obsidian") {
          return getFiles(res);
        }
        return entry.isFile() && entry.name.endsWith(".md") ? res : [];
      })
    );
    return files.flat();
  }

  const allFiles = await getFiles(vaultPath);
  const relativeFiles = allFiles.map((file) => path.relative(vaultPath, file));

  // Update cache
  filesCache = {
    files: relativeFiles,
    vaultPath,
    timestamp: Date.now(),
  };

  return relativeFiles;
}

function getSearchScore(file: string, searchTerms: string[]): number {
  const lowerFile = file.toLowerCase();
  const fileName = path.basename(file).toLowerCase();
  let score = 0;

  // Exact filename match gets highest score
  if (fileName === searchTerms.join(" ").toLowerCase()) {
    score += 1000;
  }

  // Filename contains all terms in order
  if (fileName.includes(searchTerms.join(" ").toLowerCase())) {
    score += 500;
  }

  // Individual term matches in filename
  for (const term of searchTerms) {
    if (fileName.includes(term)) {
      score += 100;
    }
  }

  // Path matches
  for (const term of searchTerms) {
    if (lowerFile.includes(term)) {
      score += 10;
    }
  }

  return score;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    console.log("search term:", search);

    const settingsManager = pipe.settings;
    if (!settingsManager) {
      throw new Error("settingsManager not found");
    }

    const settings = await settingsManager.getAll();
    const initialPath = settings.customSettings?.obsidian?.path;

    if (!initialPath) {
      return NextResponse.json({ files: [] });
    }

    const vaultPath = await findObsidianRoot(initialPath);
    console.log("vault root path:", vaultPath);

    if (!vaultPath) {
      return NextResponse.json({ files: [] });
    }

    const allFiles = await getAllFiles(vaultPath);

    // Optimize search with lowercase and pre-split search terms
    const searchTerms = search.toLowerCase().split(/\s+/);

    const matchingFiles = allFiles
      .filter((file) => {
        const lowerFile = file.toLowerCase();
        return searchTerms.every((term) => lowerFile.includes(term));
      })
      .map((file) => ({
        file,
        score: getSearchScore(file, searchTerms),
      }))
      .sort((a, b) => b.score - a.score) // Sort by score descending
      .map(({ file }) => file) // Extract just the filename
      .slice(0, 50); // Limit results to 50 files

    return NextResponse.json({ files: matchingFiles });
  } catch (error) {
    console.error("Error fetching files:", error);
    return NextResponse.json({ files: [] });
  }
}
