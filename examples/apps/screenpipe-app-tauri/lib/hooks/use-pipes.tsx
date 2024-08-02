import { useState, useEffect } from "react";

export type Pipe = {
  name: string;
  downloads: number;
  version: string;
  author: string;
  authorLink: string;
  repository: string;
  lastUpdate: string;
  description: string;
  fullDescription: string;
};

const convertHtmlToMarkdown = (html: string) => {
  // Convert <img> tags to Markdown
  const convertedHtml = html.replace(
    /<img\s+(?:[^>]*?\s+)?src="([^"]*)"(?:\s+(?:[^>]*?\s+)?alt="([^"]*)")?\s*\/?>/g,
    (match, src, alt) => {
      return `![${alt || ""}](${src})`;
    }
  );

  // Remove any remaining HTML tags
  return convertedHtml.replace(/<[^>]*>/g, "");
};
const fetchReadme = async (fullName: string) => {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${fullName}/readme`
    );
    const data = await response.json();
    const decodedContent = atob(data.content);
    // console.log("YOOOO dd", decodedContent);
    const markdown = convertHtmlToMarkdown(decodedContent);
    // console.log("YOOOO md", markdown);
    return markdown;
  } catch (error) {
    console.error("error fetching readme:", error);
    return "";
  }
};

const fetchLatestRelease = async (fullName: string) => {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${fullName}/releases/latest`
    );
    const data = await response.json();
    return data.tag_name;
  } catch (error) {
    console.error("error fetching latest release:", error);
    return "";
  }
};

export const usePipes = (repoUrl: string) => {
  const [pipes, setPipes] = useState<Pipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPipes = async () => {
      try {
        setLoading(true);
        const repoName = repoUrl.split("/").slice(-2).join("/");
        const response = await fetch(
          `https://api.github.com/repos/${repoName}`
        );
        const data = await response.json();
        const latestVersion = await fetchLatestRelease(repoName);
        const pipe: Pipe = {
          name: data.name,
          downloads: data.stargazers_count,
          version: latestVersion || data.default_branch,
          author: data.owner.login,
          authorLink: data.owner.html_url,
          repository: data.html_url,
          lastUpdate: data.updated_at,
          description: data.description,
          fullDescription: await fetchReadme(repoName),
        };
        setPipes([pipe]);
        setError(null);
      } catch (error) {
        console.error("error fetching pipes:", error);
        setError("Failed to fetch pipes");
      } finally {
        setLoading(false);
      }
    };

    fetchPipes();
  }, [repoUrl]);

  return { pipes, loading, error };
};
