import http from "http";
import { spawn } from "child_process";
import { writeFileSync } from "fs";
import { ParsedUrlQuery } from "node:querystring";
import url from "url";
import { listen } from "async-listen";
import { customAlphabet } from "nanoid";
import os from 'os';
import path from "node:path";
import { logger, spinner } from "../../components/commands/add/utils/logger";
import { colors } from "../../../utils/colors";
import { handleError } from "../../components/commands/add/utils/handle-error";

const FILENAME = ".apikey";

class UserCancellationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserCancellationError";
  }
}

async function writeToConfigFile(data: ParsedUrlQuery) {
    try {
      const homeDir = os.homedir();
      const filePath = path.join(homeDir, FILENAME);
      writeFileSync(filePath, JSON.stringify(data));
    } catch (error) {
      handleError(`error writing to local config file ${error}`);
    }
}

const nanoid = customAlphabet("123456789qazwsxedcrfvtgbyhnujmikolp", 8);


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
    const confirmationUrl = new URL(`https://screenpi.pe/login`);
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
        loadingSpinner.succeed("authentication successful");
        writeToConfigFile(authData);
        server.close();
        process.exit(0);
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
