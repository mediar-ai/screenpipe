"use server";
import * as fs from "fs/promises";
import * as path from "path";

export async function readObsidianFile(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content;
  } catch (err) {
    console.error(`failed to read file ${filePath}:`, err);
    return "";
  }
}

export async function findVaultRoot(startPath: string): Promise<string> {
  let currentPath = startPath;

  while (currentPath !== "/" && currentPath !== ".") {
    try {
      await fs.access(path.join(currentPath, ".obsidian"));
      return currentPath;
    } catch {
      currentPath = path.dirname(currentPath);
    }
  }
  throw new Error("could not find obsidian vault root (.obsidian folder)");
}

export async function extractLinkedContent(
  prompt: string,
  basePath: string
): Promise<string> {
  try {
    const vaultRoot = await findVaultRoot(basePath);
    const linkRegex = /@\[\[(.*?)\]\]/g;
    const matches = [...prompt.matchAll(linkRegex)];
    let enrichedPrompt = prompt;

    for (const match of matches) {
      const relativePath = match[1];
      const fullPath = path.join(
        vaultRoot,
        relativePath.endsWith(".md") ? relativePath : `${relativePath}.md`
      );

      try {
        const content = await readObsidianFile(fullPath);
        enrichedPrompt = enrichedPrompt.replace(
          match[0],
          `\n--- Content of ${relativePath} ---\n${content}\n---\n`
        );
      } catch (err) {
        console.error(`failed to process link ${relativePath}:`, err);
      }
    }

    return enrichedPrompt;
  } catch (err) {
    console.error("failed to find vault root:", err);
    return prompt;
  }
}
