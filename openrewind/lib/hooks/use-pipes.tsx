import { useState, useEffect } from "react";

export type Pipe = {
  enabled: boolean;
  name: string;
  downloads: number;
  version: string;
  author: string;
  authorLink: string;
  repository: string;
  lastUpdate: string;
  description: string;
  fullDescription: string;
  mainFile?: string;
  config?: Record<string, any>;
};

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

const fetchWithCache = async (url: string) => {
  const cacheKey = `cache_${url}`;
  const cachedData = localStorage.getItem(cacheKey);

  if (cachedData) {
    const { data, timestamp } = JSON.parse(cachedData);
    if (Date.now() - timestamp < CACHE_DURATION) {
      return data;
    }
  }

  try {
    const response = await fetch(url);
    if (response.status === 403) {
      throw new Error("Rate limit exceeded");
    }
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    localStorage.setItem(
      cacheKey,
      JSON.stringify({ data, timestamp: Date.now() })
    );
    return data;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    if (cachedData) {
      console.log("Returning stale cached data");
      return JSON.parse(cachedData).data;
    }
    throw error;
  }
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

const fetchReadme = async (fullName: string) => {
  try {
    const data = await fetchWithCache(
      `https://api.github.com/repos/${fullName}/readme`
    );
    const decodedContent = atob(data.content);
    return convertHtmlToMarkdown(decodedContent);
  } catch (error) {
    console.error("error fetching readme:", error);
    return "";
  }
};

const fetchLatestRelease = async (fullName: string) => {
  try {
    const data = await fetchWithCache(
      `https://api.github.com/repos/${fullName}/releases/latest`
    );
    return data.tag_name;
  } catch (error) {
    console.error("error fetching latest release:", error);
    return "";
  }
};

const fetchSubdirContents = async (
  repoName: string,
  branch: string,
  path: string
) => {
  try {
    return await fetchWithCache(
      `https://api.github.com/repos/${repoName}/contents/${path}?ref=${branch}`
    );
  } catch (error) {
    console.error(`Error fetching subdirectory contents: ${error}`);
    throw error;
  }
};

const fetchFileContent = async (
  repoName: string,
  branch: string,
  path: string
) => {
  try {
    const data = await fetchWithCache(
      `https://api.github.com/repos/${repoName}/contents/${path}?ref=${branch}`
    );
    return atob(data.content);
  } catch (error) {
    console.error(`Error fetching file content: ${error}`);
    throw error;
  }
};

const fetchPipeConfig = async (
  repoFullName: string,
  branch: string,
  subDir: string
): Promise<Record<string, any> | undefined> => {
  try {
    const configPath = subDir ? `${subDir}/pipe.json` : "pipe.json";
    const configContent = await fetchFileContent(
      repoFullName,
      branch,
      configPath
    );
    return JSON.parse(configContent);
  } catch (error) {
    console.error("Error fetching pipe config:", error);
    return undefined;
  }
};

export const usePipes = (initialRepoUrls: string[]) => {
  const [pipes, setPipes] = useState<Pipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repoUrls, setRepoUrls] = useState<string[]>(initialRepoUrls);

  const fetchPipeData = async (repoUrl: string): Promise<Pipe | null> => {
    console.log("fetchPipeData", repoUrl);
    try {
      const urlParts = repoUrl.split("/");
      const isSubdir = urlParts.length > 5;
      const repoOwner = urlParts[3];
      const repoName = urlParts[4];
      const repoFullName = `${repoOwner}/${repoName}`;
      const branch = isSubdir ? urlParts[6] : "main";
      const subDir = isSubdir ? urlParts.slice(7).join("/") : "";
      console.log("urlParts", urlParts);
      console.log("isSubdir", isSubdir);
      console.log("repoFullName", repoFullName);
      console.log("branch", branch);
      console.log("subDir", subDir);
      console.log("repoOwner", repoOwner);
      console.log("repoName", repoName);
      console.log(`Fetching repo data for ${repoFullName}`);
      const repoData = await fetchWithCache(
        `https://api.github.com/repos/${repoFullName}`
      );

      let pipeConfig: Record<string, any> | undefined;

      if (isSubdir) {
        console.log(
          `Fetching subdirectory contents for ${repoFullName}/${subDir}`
        );
        const contents = await fetchSubdirContents(
          repoFullName,
          branch,
          subDir
        );
        console.log("contents", contents);
        if (!contents || !Array.isArray(contents)) return null;

        const jsFiles = contents.filter(
          (file: any) => file.name.endsWith(".js") || file.name.endsWith(".ts")
        );
        const hasJsFile = jsFiles.length > 0;
        const readmeFile = contents.find(
          (file: any) => file.name.toLowerCase() === "readme.md"
        );

        if (!hasJsFile || !readmeFile) return null;
        console.log(`Fetching README content for ${repoFullName}/${subDir}`);
        const readmeContent = await fetchFileContent(
          repoFullName,
          branch,
          `${subDir}/${readmeFile.name}`
        );

        const mainFile =
          jsFiles.find((file: any) => file.name === "pipe.ts") || jsFiles[0];
        const mainFileUrl = mainFile
          ? `https://raw.githubusercontent.com/${repoFullName}/${branch}/${subDir}/${mainFile.name}`
          : undefined;

        console.log(`Fetching latest release for ${repoFullName}`);

        console.log(`Fetching pipe config for ${repoFullName}/${subDir}`);
        pipeConfig = await fetchPipeConfig(repoFullName, branch, subDir).catch(
          (error) => {
            console.warn("Error fetching pipe config:", error);
            return undefined;
          }
        );

        return {
          enabled: false,
          name: subDir.split("/").pop() || repoData.name,
          downloads: repoData.stargazers_count,
          version: await fetchLatestRelease(repoFullName),
          author: repoData.owner.login,
          authorLink: repoData.owner.html_url,
          repository: `${repoData.html_url}/tree/${branch}/${subDir}`,
          lastUpdate: repoData.updated_at,
          description: repoData.description,
          fullDescription: readmeContent
            ? convertHtmlToMarkdown(readmeContent)
            : "",
          mainFile: mainFileUrl,
          config: pipeConfig,
        };
      } else {
        console.log(`Fetching README for ${repoFullName}`);
        const fullDescription = await fetchReadme(repoFullName);

        console.log(`Fetching latest release for ${repoFullName}`);
        const version = await fetchLatestRelease(repoFullName);

        console.log(`Fetching pipe config for ${repoFullName}`);
        pipeConfig = await fetchPipeConfig(repoFullName, branch, "");

        return {
          enabled: false,
          name: repoData.name,
          downloads: repoData.stargazers_count,
          version,
          author: repoData.owner.login,
          authorLink: repoData.owner.html_url,
          repository: repoData.html_url,
          lastUpdate: repoData.updated_at,
          description: repoData.description,
          fullDescription,
          config: pipeConfig,
        };
      }
    } catch (error) {
      console.error(`Error processing ${repoUrl}:`, error);
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const fetchPipes = async () => {
      if (!isMounted) return;

      setLoading(true);
      setError(null);

      try {
        const pipePromises = repoUrls.map(fetchPipeData);
        const fetchedPipes = (await Promise.all(pipePromises)).filter(
          Boolean
        ) as Pipe[];

        if (isMounted) {
          setPipes(fetchedPipes);
        }
      } catch (error) {
        console.error("Error in fetchPipes:", error);
        if (isMounted && !error) {
          setError("Failed to fetch pipes");
        }
      } finally {
        if (isMounted && loading) {
          setLoading(false);
        }
      }

      // get pipes from local api /pipes/list and add them to the list
      const localPipes = await fetch(`http://localhost:3030/pipes/list`).then(
        (res) => res.json()
      );
      // console.log("localPipes", localPipes);
      setPipes([
        ...pipes,
        ...localPipes.map((pipe: any) => ({
          ...pipe,
          name: pipe.id,
        })),
      ]);
    };

    fetchPipes();

    return () => {
      isMounted = false;
    };
  }, [repoUrls]);

  const addCustomPipe = async (newRepoUrl: string) => {
    setError(null);

    // Check if the URL already exists
    if (repoUrls.includes(newRepoUrl)) {
      setError("This pipe is already in the list.");
      return;
    }

    try {
      const newPipe = await fetchPipeData(newRepoUrl);
      console.log("newPipe", newPipe);
      if (newPipe) {
        // Check if a pipe with the same name already exists
        if (pipes.some((pipe) => pipe.name === newPipe.name)) {
          setError("A pipe with this name already exists.");
          return;
        }

        setRepoUrls((prevUrls) => [...prevUrls, newRepoUrl]);
        setPipes((prevPipes) => [...prevPipes, newPipe]);
      } else {
        throw new Error("Failed to fetch pipe data");
      }
    } catch (error) {
      console.error("Error adding custom pipe:", error);
      setError(
        error instanceof Error ? error.message : "Failed to add custom pipe"
      );
    }
  };

  return { pipes, loading, error, addCustomPipe };
};
