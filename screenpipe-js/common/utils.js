"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unflattenObject = exports.flattenObject = void 0;
exports.toCamelCase = toCamelCase;
exports.toSnakeCase = toSnakeCase;
exports.convertToCamelCase = convertToCamelCase;
exports.getDefaultSettings = getDefaultSettings;
// Helper functions to flatten/unflatten objects
const flattenObject = (obj, prefix = "") => {
    return Object.keys(obj).reduce((acc, k) => {
        const pre = prefix.length ? prefix + "." : "";
        if (typeof obj[k] === "object" &&
            obj[k] !== null &&
            !Array.isArray(obj[k])) {
            Object.assign(acc, flattenObject(obj[k], pre + k));
        }
        else {
            acc[pre + k] = obj[k];
        }
        return acc;
    }, {});
};
exports.flattenObject = flattenObject;
const unflattenObject = (obj) => {
    const result = {};
    for (const key in obj) {
        const keys = key.split(".");
        let current = result;
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (i === keys.length - 1) {
                current[k] = obj[key];
            }
            else {
                current[k] = current[k] || {};
                current = current[k];
            }
        }
    }
    return result;
};
exports.unflattenObject = unflattenObject;
// Helper functions that work in both environments
function toCamelCase(str) {
    return str.replace(/([-_][a-z])/g, (group) => group.toUpperCase().replace("-", "").replace("_", ""));
}
function toSnakeCase(str) {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
function convertToCamelCase(obj) {
    if (Array.isArray(obj)) {
        return obj.map(convertToCamelCase);
    }
    else if (obj !== null && typeof obj === "object") {
        return Object.keys(obj).reduce((result, key) => {
            const camelKey = toCamelCase(key);
            result[camelKey] = convertToCamelCase(obj[key]);
            return result;
        }, {});
    }
    return obj;
}
function getDefaultSettings() {
    return {
        openaiApiKey: "",
        deepgramApiKey: "",
        aiModel: "gpt-4o",
        aiUrl: "https://api.openai.com/v1",
        customPrompt: `Rules:
    - You can analyze/view/show/access videos to the user by putting .mp4 files in a code block (we'll render it) like this: \`/users/video.mp4\`, use the exact, absolute, file path from file_path property
    - Do not try to embed video in links (e.g. [](.mp4) or https://.mp4) instead put the file_path in a code block using backticks
    - Do not put video in multiline code block it will not render the video (e.g. \`\`\`bash\n.mp4\`\`\` IS WRONG) instead using inline code block with single backtick
    - Always answer my question/intent, do not make up things
    
    `,
        port: 3030,
        dataDir: "default",
        disableAudio: false,
        ignoredWindows: [],
        includedWindows: [],
        aiProviderType: "openai",
        embeddedLLM: {
            enabled: false,
            model: "llama3.2:1b-instruct-q4_K_M",
            port: 11434,
        },
        enableFrameCache: true,
        enableUiMonitoring: false,
        aiMaxContextChars: 512000,
        analyticsEnabled: true,
        user: {
            token: "",
        },
        customSettings: {},
        monitorIds: ["default"],
        audioDevices: ["default"],
        audioTranscriptionEngine: "whisper-large-v3-turbo",
        enableRealtimeAudioTranscription: false,
        realtimeAudioTranscriptionEngine: "deepgram",
        disableVision: false,
    };
}
