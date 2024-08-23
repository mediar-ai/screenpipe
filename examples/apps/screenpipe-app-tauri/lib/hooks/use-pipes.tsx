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

const meetingSummarizerPipe: Pipe = {
  name: "Local First Meeting Summarizer",
  downloads: 42,
  version: "1.0.0",
  author: "Louis",
  authorLink: "https://github.com/louis030195",
  repository: "https://github.com/mediar-ai/screenpipe",
  lastUpdate: new Date().toISOString(),
  description: "Summarize your meetings locally with AI",
  fullDescription: `# Local First Meeting Summarizer

This pipe allows you to summarize your meetings locally using AI. It provides a start and stop button to control the meeting duration, with an additional input for manually setting the end time if you forget to click stop.

## Features

- Start and stop buttons for meeting control
- Manual end time input
- Uses Ollama or OpenAI based on user settings
- Removes noise from transcripts
- Generates meeting summary with action items
- Markdown output for easy reading and sharing

## How to Use

1. Click the "Start Meeting" button when your meeting begins.
2. When the meeting ends, click the "Stop Meeting" button.
3. If you forgot to stop the meeting, you can manually set the end time using the datetime input.
4. The pipe will query Screenpipe for audio transcripts during the meeting duration.
5. An AI model (Ollama or OpenAI, based on your settings) will generate a summary and extract action items.
6. The summary will be displayed in markdown format, which you can easily copy and share.

## Privacy and Security

This pipe processes all data locally on your machine, ensuring your meeting content remains private and secure. No data is sent to external servers except for the AI model API calls.

## Customization

You can customize the AI model used for summarization in the settings. Choose between Ollama (for local processing) or OpenAI for cloud-based processing.

## Feedback and Improvements

We're constantly working to improve this pipe. If you have any feedback or suggestions, please open an issue on our GitHub repository.

Happy summarizing!`,
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
        setPipes([pipe, meetingSummarizerPipe]);

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
