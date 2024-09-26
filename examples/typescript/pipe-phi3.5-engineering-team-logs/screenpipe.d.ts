declare global {
  const pipe: {
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, contents: string) => Promise<void>;
    removeFile: (path: string) => Promise<void>;
    get: (url: string) => Promise<any>;
    post: (url: string, body: string) => Promise<any>;
    fetch: (url: string, options?: RequestInit) => Promise<Response>;
    sendNotification: (options: {
      title: string;
      body: string;
    }) => Promise<any>;
    loadConfig: () => Promise<Record<string, any>>;
    config: Record<string, any>;
    metadata: {
      id: string;
    };
  };

  const fs: {
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, contents: string) => Promise<void>;
    readdir: (path: string) => Promise<string[]>;
    mkdir: (path: string) => Promise<void>;
  };

  const path: {
    join: (...paths: string[]) => string;
  };

  namespace NodeJS {
    interface ProcessEnv {
      SCREENPIPE_DIR: string;
      SCREENPIPE_LOG_API_URL?: string;
      SCREENPIPE_SERVER_URL?: string;
      PIPE_DIR: string;
      NOTION_DATABASE_ID: string;
      NOTION_API_KEY: string;
    }
  }
  const process: {
    env: NodeJS.ProcessEnv;
  };
}

export {};
