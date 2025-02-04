import type { Settings } from "./types";

// Helper functions to flatten/unflatten objects
const flattenObject = (obj: any, prefix = ""): Record<string, any> => {
  return Object.keys(obj).reduce((acc: Record<string, any>, k: string) => {
    const pre = prefix.length ? prefix + "." : "";
    if (
      typeof obj[k] === "object" &&
      obj[k] !== null &&
      !Array.isArray(obj[k])
    ) {
      Object.assign(acc, flattenObject(obj[k], pre + k));
    } else {
      acc[pre + k] = obj[k];
    }
    return acc;
  }, {});
};

const unflattenObject = (obj: Record<string, any>): any => {
  const result: any = {};
  for (const key in obj) {
    const keys = key.split(".");
    let current = result;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (i === keys.length - 1) {
        current[k] = obj[key];
      } else {
        current[k] = current[k] || {};
        current = current[k];
      }
    }
  }
  return result;
};
// Helper functions that work in both environments
function toCamelCase(str: string): string {
  return str.replace(/([-_][a-z])/g, (group) =>
    group.toUpperCase().replace("-", "").replace("_", "")
  );
}

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function convertToCamelCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(convertToCamelCase);
  } else if (obj !== null && typeof obj === "object") {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = toCamelCase(key);
      result[camelKey] = convertToCamelCase(obj[key]);
      return result;
    }, {} as any);
  }
  return obj;
}

function getDefaultSettings(): Settings {
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

export {
  flattenObject,
  unflattenObject,
  toCamelCase,
  toSnakeCase,
  convertToCamelCase,
  getDefaultSettings,
};
