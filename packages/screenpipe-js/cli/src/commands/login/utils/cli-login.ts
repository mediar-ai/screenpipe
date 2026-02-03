import http from "http";
import { spawn } from "child_process";
import url from "url";
import { listen } from "async-listen";
import { customAlphabet } from "nanoid";
import { logger, spinner } from "../../components/commands/add/utils/logger";
import { colors } from "../../../utils/colors";
import { handleError } from "../../components/commands/add/utils/handle-error";
import { z } from "zod";
import { Credentials } from "../../../utils/credentials";

class UserCancellationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserCancellationError";
  }
}

type AuthPayload = z.infer<typeof authPayload>;

const authPayload = z.object({
  token: z.string(),
  email: z.string(),
  user_id: z.string(),
  developer_id: z.string(),
  api_key: z.string(),
});

async function sendAuthData(authPayload: AuthPayload) {
  try {
    const response = await fetch(`http://localhost:11435/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(authPayload),
    });

    if (!response.ok) {
      throw new Error("failed to send auth data");
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error("Make sure to run the app before attempting to login");
    }
    throw error;
  }
}

const nanoid = customAlphabet("123456789qazwsxedcrfvtgbyhnujmikolp", 8);

export async function cliLogin() {
  // create localhost server for our page to call back to
  const server = http.createServer();
  const { port } = await listen(server, 0, "127.0.0.1");

  logger.info(`server listening on http://127.0.0.1:${port}`);

  // set up HTTP server that waits for a request containing an API key
  const authPromise = new Promise<AuthPayload>((resolve, reject) => {
    server.on("request", (req, res) => {
      // Set CORS headers for all responses
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
      );

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

          const authData = authPayload.parse(queryParams);

          if (!authData) {
            reject(new Error("invalid response from server"));
          }

          resolve(authData);
        }
      } else {
        res.writeHead(405);
        res.end("Method not allowed");
      }
    });
  });

  const redirect = `http://127.0.0.1:${port}`;

  const code = nanoid();
  // This does not work on my computer (in prod), so hardcoding to screenpi.pe
  // const confirmationUrl = new URL(
  //     process.env.NODE_ENV === "development"
  //         ? "http://localhost:3001/login"
  //         : "http://screenpi.pe/login"
  // );
  const confirmationUrl = new URL("http://screenpi.pe/login");
  confirmationUrl.searchParams.append("code", code);
  confirmationUrl.searchParams.append("redirect", redirect);
  logger.log(`confirmation code: ${colors.bold(code)}\n`);
  logger.log(
    `if something goes wrong, copy and paste this url into your browser: ${colors.bold(
      confirmationUrl.toString()
    )}\n`
  );

  // Use the appropriate command based on the operating system
  const openBrowser = (url: string) => {
    const platform = process.platform;
    switch (platform) {
      case "win32":
        // Escape & characters for Windows command prompt
        const escapedUrl = url.replace(/&/g, "^&");
        return spawn("cmd", ["/c", "start", "", escapedUrl]);
      case "darwin":
        return spawn("open", [url]);
      default:
        // For Linux and other systems
        return spawn("xdg-open", [url]);
    }
  };

  openBrowser(confirmationUrl.toString());

  const loadingSpinner = spinner("waiting for authentication...");

  try {
    loadingSpinner.start();
    const authData = await authPromise;
    Credentials.setApiKey(authData.api_key, authData.developer_id);
    await sendAuthData(authData).catch((_) => {
      logger.warn(
        "could not set app credentials, is it app running? \nignore this warning if you're just trying to publish a pipe!"
      );
    });

    loadingSpinner.succeed("authentication successful");
    server.close();
  } catch (error) {
    if (error instanceof UserCancellationError) {
      server.close();
      logger.log("\n");
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
