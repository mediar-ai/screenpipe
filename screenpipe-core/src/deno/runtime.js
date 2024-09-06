const { core } = Deno;
const { ops } = core;

function argsToMessage(...args) {
    return args.map((arg) => JSON.stringify(arg)).join(" ");
}

const sendLog = async (level, ...args) => {
    const message = argsToMessage(...args);
    const logApiUrl = process.env.SCREENPIPE_LOG_API_URL || "http://localhost:11435/log";
    const pipeId = globalThis.metadata.id || "unknown";

    try {
        await ops.op_fetch(logApiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                pipeId,
                level,
                message,
                timestamp: new Date().toISOString(),
            }),
        });
    } catch (error) {
        // core.print(`[js][error]: Failed to send log: ${error}\n`, true);
    }
};

const console = {
    log: (...args) => {
        core.print(`[js][info]: ${argsToMessage(...args)}\n`, false);
        sendLog("info", ...args);
    },
    error: (...args) => {
        core.print(`[js][error]: ${argsToMessage(...args)}\n`, true);
        sendLog("error", ...args);
    },
};

globalThis.console = console;

const pipe = {
    readFile: (path) => {
        return ops.op_read_file(path);
    },
    writeFile: (path, contents) => {
        return ops.op_write_file(path, contents);
    },
    removeFile: (path) => {
        return ops.op_remove_file(path);
    },
    get: async (url) => {
        const response = await ops.op_fetch_get(url);
        return JSON.parse(response);
    },
    post: async (url, body) => {
        const response = await ops.op_fetch_post(url, body);
        return JSON.parse(response);
    },
    fetch: async (url, options) => {
        try {
            const responseString = await ops.op_fetch(url, options);
            const response = JSON.parse(responseString);
            return {
                ok: response.status >= 200 && response.status < 300,
                status: response.status,
                statusText: response.statusText,
                headers: response.headers, // Use the headers directly without wrapping in Headers object
                text: async () => response.text,
                json: async () => {
                    try {
                        return JSON.parse(response.text);
                    } catch (error) {
                        console.error("Error parsing JSON:", error);
                        return response.text;
                    }
                },
            };
        } catch (error) {
            console.error("Fetch error:", error);
            throw error;
        }
    },
    sendNotification: async ({ title, body }) => {
        // try to fetch this url, if not live do try to send the notification to the server
        const notificationApiUrl = process.env.SCREENPIPE_SERVER_URL || "http://localhost:11435";

        try {
            const response = await ops.op_fetch(notificationApiUrl)
            if (!response.ok) {
                throw new Error("Failed to send notification");
            }
        } catch (error) {
            console.warn("Failed to send notification to server, is your notification server running?");
            return
        }

        const response = await ops.op_fetch(notificationApiUrl + "/notify", {
            headers: {
                "Content-Type": "application/json",
            },
            method: "POST",
            body: JSON.stringify({ title, body })
        });
        console.log("Notification sent:", response);
        return JSON.parse(response);
    },
    loadConfig: async () => {
        try {
            console.log("Attempting to load pipe.json");
            const configContent = await ops.op_read_file("pipe.json");
            console.log("pipe.json content:", configContent);
            const parsedConfig = JSON.parse(configContent);
            console.log("Parsed config:", parsedConfig);
            pipe.config = parsedConfig; // Set the config property
            return parsedConfig;
        } catch (error) {
            console.error("Error loading pipe.json:", error);
            pipe.config = {}; // Set an empty object if loading fails
            return {};
        }
    },
};

globalThis.setTimeout = (callback, delay) => {
    ops.op_set_timeout(delay).then(callback);
};
globalThis.pipe = pipe;
globalThis.pipe.metadata = globalThis.metadata;
globalThis.fetch = pipe.fetch;
globalThis.loadConfig = pipe.loadConfig;

