import http from "http";
import { spawn } from "child_process";
import { writeFileSync } from "fs";
import { ParsedUrlQuery } from "node:querystring";
import url from "url";
import { listen } from "async-listen";
import { customAlphabet } from "nanoid";
import { logger, spinner } from "../../components/commands/add/utils/logger";
import { colors } from "../../../utils/colors";
import { handleError } from "../../components/commands/add/utils/handle-error";
import fs from 'fs';

class UserCancellationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserCancellationError";
  }
}

type User = {
  id: string;
  email: string;
  clerk_id: string;
  token: string;
  credits: { amount: number };
  stripe_connected: boolean;
  stripe_account_status: string;
  api_key: string;
  cloud_subscribed: boolean;
  github_username: string;
  website: string;
  contact: string;
  bio: string;
}

async function writeToConfigFile(userData: User, tauriStorePath: string) {
  let config = {};

  const fileContent = fs.readFileSync(tauriStorePath, 'utf8');
  config = JSON.parse(fileContent);

  const updatedConfig = {
    ...config,
    user: userData,
  };
  writeFileSync(tauriStorePath, JSON.stringify(updatedConfig, null, 2));
}

const nanoid = customAlphabet("123456789qazwsxedcrfvtgbyhnujmikolp", 8);

const getUser = async (token: string): Promise<User> => { 
  const response = await fetch(process.env.NODE_ENV === 'development' 
    ? 'http://localhost:3001/api/user' 
    : 'https://screenpi.pe/api/user', 
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    throw new Error("failed to verify token");
  }

  const data = await response.json();
  const userData = {
    ...data.user,
  } as User;

  if (!userData) {
    throw new Error("failed to load user");
  }

  return userData;
};

const getTauriStore = async () => {
  const tauriStore = await fetch(`http://localhost:3030/app-info`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const tauriStoreData = await tauriStore.json();
  return tauriStoreData.store_path;
}

export async function cliLogin() {
    // create localhost server for our page to call back to
    const server = http.createServer();
    const { port } = await listen(server, 0, "127.0.0.1");
    
    logger.info(`server listening on http://127.0.0.1:${port}`);

    // set up HTTP server that waits for a request containing an API key
    const authPromise = new Promise<ParsedUrlQuery>((resolve, reject) => {
        server.on("request", (req, res) => {
        
        // Set CORS headers for all responses
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

        if (req.method === "OPTIONS") {
            res.writeHead(200);
            res.end();
        } else if (req.method === "GET") {
            const parsedUrl = url.parse(req.url as string, true);
            const queryParams = parsedUrl.query;
            
            if (queryParams.cancelled) {
                res.writeHead(200);
                res.end("Cancelled");
                reject(new UserCancellationError("Login process cancelled by user."));
            } else {
                res.writeHead(200);
                res.end("Success");
                resolve(queryParams);
            }
        } else {
            res.writeHead(405);
            res.end("Method not allowed");
        }
        });
    });

    const redirect = `http://127.0.0.1:${port}`;

    const code = nanoid();
    const confirmationUrl = new URL(
        process.env.NODE_ENV === "development" 
            ? "http://localhost:3001/login"
            : "http://screenpi.pe/login"
    );
    confirmationUrl.searchParams.append("code", code);
    confirmationUrl.searchParams.append("redirect", redirect);
    logger.log(`confirmation code: ${colors.bold(code)}\n`);
    logger.log(
        `if something goes wrong, copy and paste this url into your browser: ${
            colors.bold(confirmationUrl.toString())
        }\n`,
    );

    spawn("open", [confirmationUrl.toString()]);

    const loadingSpinner = spinner("waiting for authentication...");

    try {
        loadingSpinner.start();
        const authData = await authPromise;
        const userData = await getUser(authData.apiKey as string);
        const tauriStoreData = await getTauriStore();
        writeToConfigFile(userData, tauriStoreData);

        loadingSpinner.succeed("authentication successful");
        server.close();
    } catch (error) {
        if (error instanceof UserCancellationError) {
            server.close();
            logger.log("\n")
            logger.error("authentication cancelled.\n");
            process.exit(0);
        } else {
            server.close();
            handleError(`authentication failed: + ${error}`);
        }
    } finally {
        server.close();
        process.exit(0);
    }
}
