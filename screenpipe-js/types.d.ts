declare global {
  namespace NodeJS {
    interface ProcessEnv {
      SCREENPIPE_DIR: string;
      SCREENPIPE_LOG_API_URL?: string;
      SCREENPIPE_SERVER_URL?: string;
      PIPE_DIR: string;
      PIPE_ID: string;
    }
  }
  const process: {
    env: NodeJS.ProcessEnv;
  };
}
export {};
