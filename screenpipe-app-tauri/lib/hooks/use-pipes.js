"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePipes = void 0;
const react_1 = require("react");
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
const fetchWithCache = (url) => __awaiter(void 0, void 0, void 0, function* () {
    const cacheKey = `cache_${url}`;
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
        const { data, timestamp } = JSON.parse(cachedData);
        if (Date.now() - timestamp < CACHE_DURATION) {
            return data;
        }
    }
    try {
        const response = yield fetch(url);
        if (response.status === 403) {
            throw new Error("Rate limit exceeded");
        }
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = yield response.json();
        localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
        return data;
    }
    catch (error) {
        console.error(`Error fetching ${url}:`, error);
        if (cachedData) {
            console.log("Returning stale cached data");
            return JSON.parse(cachedData).data;
        }
        throw error;
    }
});
const convertHtmlToMarkdown = (html) => {
    const convertedHtml = html.replace(/<img\s+(?:[^>]*?\s+)?src="([^"]*)"(?:\s+(?:[^>]*?\s+)?alt="([^"]*)")?\s*\/?>/g, (match, src, alt) => {
        return `![${alt || ""}](${src})`;
    });
    return convertedHtml.replace(/<[^>]*>/g, "");
};
const fetchReadme = (fullName) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = yield fetchWithCache(`https://api.github.com/repos/${fullName}/readme`);
        const decodedContent = atob(data.content);
        return convertHtmlToMarkdown(decodedContent);
    }
    catch (error) {
        console.error("error fetching readme:", error);
        return "";
    }
});
const fetchLatestRelease = (fullName) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = yield fetchWithCache(`https://api.github.com/repos/${fullName}/releases/latest`);
        return data.tag_name;
    }
    catch (error) {
        console.error("error fetching latest release:", error);
        return "";
    }
});
const fetchSubdirContents = (repoName, branch, path) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        return yield fetchWithCache(`https://api.github.com/repos/${repoName}/contents/${path}?ref=${branch}`);
    }
    catch (error) {
        console.error(`Error fetching subdirectory contents: ${error}`);
        throw error;
    }
});
const fetchFileContent = (repoName, branch, path) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = yield fetchWithCache(`https://api.github.com/repos/${repoName}/contents/${path}?ref=${branch}`);
        return atob(data.content);
    }
    catch (error) {
        console.error(`Error fetching file content: ${error}`);
        throw error;
    }
});
const fetchPipeConfig = (repoFullName, branch, subDir) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const configPath = subDir ? `${subDir}/pipe.json` : "pipe.json";
        const configContent = yield fetchFileContent(repoFullName, branch, configPath);
        return JSON.parse(configContent);
    }
    catch (error) {
        console.error("Error fetching pipe config:", error);
        return undefined;
    }
});
const usePipes = (initialRepoUrls) => {
    const [pipes, setPipes] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [error, setError] = (0, react_1.useState)(null);
    const [repoUrls, setRepoUrls] = (0, react_1.useState)(initialRepoUrls);
    const fetchPipeData = (repoUrl) => __awaiter(void 0, void 0, void 0, function* () {
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
            const repoData = yield fetchWithCache(`https://api.github.com/repos/${repoFullName}`);
            let pipeConfig;
            if (isSubdir) {
                console.log(`Fetching subdirectory contents for ${repoFullName}/${subDir}`);
                const contents = yield fetchSubdirContents(repoFullName, branch, subDir);
                console.log("contents", contents);
                if (!contents || !Array.isArray(contents))
                    return null;
                const jsFiles = contents.filter((file) => file.name.endsWith(".js") || file.name.endsWith(".ts"));
                const hasJsFile = jsFiles.length > 0;
                const readmeFile = contents.find((file) => file.name.toLowerCase() === "readme.md");
                if (!hasJsFile || !readmeFile)
                    return null;
                console.log(`Fetching README content for ${repoFullName}/${subDir}`);
                const readmeContent = yield fetchFileContent(repoFullName, branch, `${subDir}/${readmeFile.name}`);
                const mainFile = jsFiles.find((file) => file.name === "pipe.ts") || jsFiles[0];
                const mainFileUrl = mainFile
                    ? `https://raw.githubusercontent.com/${repoFullName}/${branch}/${subDir}/${mainFile.name}`
                    : undefined;
                console.log(`Fetching latest release for ${repoFullName}`);
                console.log(`Fetching pipe config for ${repoFullName}/${subDir}`);
                pipeConfig = yield fetchPipeConfig(repoFullName, branch, subDir).catch((error) => {
                    console.warn("Error fetching pipe config:", error);
                    return undefined;
                });
                return {
                    enabled: false,
                    name: subDir.split("/").pop() || repoData.name,
                    downloads: repoData.stargazers_count,
                    version: yield fetchLatestRelease(repoFullName),
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
            }
            else {
                console.log(`Fetching README for ${repoFullName}`);
                const fullDescription = yield fetchReadme(repoFullName);
                console.log(`Fetching latest release for ${repoFullName}`);
                const version = yield fetchLatestRelease(repoFullName);
                console.log(`Fetching pipe config for ${repoFullName}`);
                pipeConfig = yield fetchPipeConfig(repoFullName, branch, "");
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
        }
        catch (error) {
            console.error(`Error processing ${repoUrl}:`, error);
            return null;
        }
    });
    (0, react_1.useEffect)(() => {
        let isMounted = true;
        const fetchPipes = () => __awaiter(void 0, void 0, void 0, function* () {
            if (!isMounted)
                return;
            setLoading(true);
            setError(null);
            try {
                const pipePromises = repoUrls.map(fetchPipeData);
                const fetchedPipes = (yield Promise.all(pipePromises)).filter(Boolean);
                if (isMounted) {
                    setPipes(fetchedPipes);
                }
            }
            catch (error) {
                console.error("Error in fetchPipes:", error);
                if (isMounted && !error) {
                    setError("Failed to fetch pipes");
                }
            }
            finally {
                if (isMounted && loading) {
                    setLoading(false);
                }
            }
            // get pipes from local api /pipes/list and add them to the list
            const localPipes = yield fetch(`http://localhost:3030/pipes/list`).then((res) => res.json());
            // console.log("localPipes", localPipes);
            setPipes([
                ...pipes,
                ...localPipes.map((pipe) => (Object.assign(Object.assign({}, pipe), { name: pipe.id }))),
            ]);
        });
        fetchPipes();
        return () => {
            isMounted = false;
        };
    }, [repoUrls]);
    const addCustomPipe = (newRepoUrl) => __awaiter(void 0, void 0, void 0, function* () {
        setError(null);
        // Check if the URL already exists
        if (repoUrls.includes(newRepoUrl)) {
            setError("This pipe is already in the list.");
            return;
        }
        try {
            const newPipe = yield fetchPipeData(newRepoUrl);
            console.log("newPipe", newPipe);
            if (newPipe) {
                // Check if a pipe with the same name already exists
                if (pipes.some((pipe) => pipe.name === newPipe.name)) {
                    setError("A pipe with this name already exists.");
                    return;
                }
                setRepoUrls((prevUrls) => [...prevUrls, newRepoUrl]);
                setPipes((prevPipes) => [...prevPipes, newPipe]);
            }
            else {
                throw new Error("Failed to fetch pipe data");
            }
        }
        catch (error) {
            console.error("Error adding custom pipe:", error);
            setError(error instanceof Error ? error.message : "Failed to add custom pipe");
        }
    });
    return { pipes, loading, error, addCustomPipe };
};
exports.usePipes = usePipes;
