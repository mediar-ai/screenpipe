import { useState, useEffect } from "react";

export type Pipe = {
  enabled: boolean;
  name: string;
  source: string;
  fullDescription: string;
  config?: Record<string, any>;
};

const convertHtmlToMarkdown = (html: string) => {
  const convertedHtml = html.replace(
    /<img\s+(?:[^>]*?\s+)?src="([^"]*)"(?:\s+(?:[^>]*?\s+)?alt="([^"]*)")?\s*\/?>/g,
    (match, src, alt) => {
      return `![${alt || ""}](${src})`;
    }
  );
  return convertedHtml.replace(/<[^>]*>/g, "");
};

export const usePipes = (initialRepoUrls: string[]) => {
  const [pipes, setPipes] = useState<Pipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  return { pipes, loading, error };
};
