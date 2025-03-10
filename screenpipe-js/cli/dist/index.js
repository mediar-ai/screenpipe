#!/usr/bin/env bun
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/index.ts
import { Command as Command13 } from "commander";

// src/commands/login/index.ts
import { Command } from "commander";
import * as p3 from "@clack/prompts";

// src/commands/login/utils/cli-login.ts
import http from "http";
import { spawn } from "child_process";
import url from "url";
import { listen } from "async-listen";
import { customAlphabet } from "nanoid";

// src/commands/components/commands/add/utils/logger.ts
import * as p from "@clack/prompts";
import chalk from "chalk";
var logger = {
  error: (...args) => console.error(chalk.red(...args)),
  warn: (...args) => console.warn(chalk.yellow(...args)),
  info: (...args) => console.info(chalk.blue(...args)),
  success: (...args) => console.log(chalk.green(...args)),
  log: (...args) => console.log(...args),
  break: () => console.log("")
};
var highlighter = {
  info: (text5) => chalk.blue(text5),
  error: (text5) => chalk.red(text5),
  warning: (text5) => chalk.yellow(text5),
  success: (text5) => chalk.green(text5),
  code: (text5) => chalk.gray(text5)
};
var spinner2 = (text5, options = {}) => {
  const s = p.spinner();
  return {
    start: (newText) => {
      if (!options.silent) {
        s.start(newText || text5);
      }
      return s;
    },
    stop: () => {
      if (!options.silent) {
        s.stop();
      }
      return s;
    },
    succeed: (text6) => {
      if (!options.silent) {
        s.stop(text6 ? chalk.green(`\u2714 ${text6}`) : void 0);
      }
      return s;
    },
    fail: (text6) => {
      if (!options.silent) {
        s.stop(text6 ? chalk.red(`\u2716 ${text6}`) : void 0);
      }
      return s;
    },
    info: (text6) => {
      if (!options.silent) {
        s.stop(text6 ? chalk.blue(`\u2139 ${text6}`) : void 0);
      }
      return s;
    },
    warn: (text6) => {
      if (!options.silent) {
        s.stop(text6 ? chalk.yellow(`\u26A0 ${text6}`) : void 0);
      }
      return s;
    }
  };
};

// src/utils/colors.ts
import chalk2 from "chalk";
var colors = {
  primary: chalk2.cyan,
  success: chalk2.green,
  error: chalk2.red,
  warning: chalk2.yellow,
  info: chalk2.blue,
  dim: chalk2.gray,
  highlight: chalk2.magenta,
  bold: chalk2.bold,
  header: (text5) => chalk2.bold.cyan(`
${text5}`),
  subHeader: (text5) => chalk2.dim(`${text5}`),
  listItem: (text5) => chalk2.cyan(`  * ${text5}`),
  label: (text5) => chalk2.bold.blue(`${text5}:`),
  value: (text5) => chalk2.white(`${text5}`)
};
var symbols = {
  success: "+",
  error: "x",
  warning: "!",
  info: "i",
  arrow: ">"
};

// src/commands/components/commands/add/utils/handle-error.ts
import { z } from "zod";
function handleError(error) {
  if (typeof error === "string") {
    logger.error(error);
    logger.break();
    process.exit(1);
  }
  if (error instanceof z.ZodError) {
    logger.error("validation failed:");
    for (const [key, value] of Object.entries(error.flatten().fieldErrors)) {
      logger.error(`- ${highlighter.info(key)}: ${value}`);
    }
    logger.break();
    process.exit(1);
  }
  if (error instanceof Error) {
    logger.error(error.message);
    logger.break();
    process.exit(1);
  }
  logger.break();
  process.exit(1);
}
var ERRORS = {
  MISSING_DIR_OR_EMPTY_PIPE: "1",
  COMPONENT_NOT_FOUND: "2",
  BUILD_MISSING_REGISTRY_FILE: "3"
};

// src/commands/login/utils/cli-login.ts
import { z as z2 } from "zod";

// src/utils/credentials.ts
import os from "os";
import fs from "fs";
import path from "path";
var Credentials = class {
  static configDir = path.join(os.homedir(), ".screenpipe");
  static configFile = path.join(this.configDir, "config-developer.json");
  static getApiKey() {
    try {
      if (!fs.existsSync(this.configFile)) {
        return null;
      }
      const config = JSON.parse(fs.readFileSync(this.configFile, "utf-8"));
      return config.apiKey || null;
    } catch (error) {
      return null;
    }
  }
  static setApiKey(apiKey, developerId) {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir);
    }
    fs.writeFileSync(
      this.configFile,
      JSON.stringify(
        {
          apiKey,
          developerId
        },
        null,
        2
      )
    );
  }
  static clearCredentials() {
    if (fs.existsSync(this.configFile)) {
      fs.unlinkSync(this.configFile);
    }
  }
};

// src/commands/login/utils/cli-login.ts
var UserCancellationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "UserCancellationError";
  }
};
var authPayload = z2.object({
  token: z2.string(),
  email: z2.string(),
  user_id: z2.string(),
  developer_id: z2.string(),
  api_key: z2.string()
});
async function sendAuthData(authPayload2) {
  try {
    const response = await fetch(`http://localhost:11435/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(authPayload2)
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
var nanoid = customAlphabet("123456789qazwsxedcrfvtgbyhnujmikolp", 8);
async function cliLogin() {
  const server = http.createServer();
  const { port } = await listen(server, 0, "127.0.0.1");
  logger.info(`server listening on http://127.0.0.1:${port}`);
  const authPromise = new Promise((resolve, reject) => {
    server.on("request", (req, res) => {
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
        const parsedUrl = url.parse(req.url, true);
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
  const confirmationUrl = new URL("http://screenpi.pe/login");
  confirmationUrl.searchParams.append("code", code);
  confirmationUrl.searchParams.append("redirect", redirect);
  logger.log(`confirmation code: ${colors.bold(code)}
`);
  logger.log(
    `if something goes wrong, copy and paste this url into your browser: ${colors.bold(
      confirmationUrl.toString()
    )}
`
  );
  const openBrowser = (url2) => {
    const platform = process.platform;
    switch (platform) {
      case "win32":
        const escapedUrl = url2.replace(/&/g, "^&");
        return spawn("cmd", ["/c", "start", "", escapedUrl]);
      case "darwin":
        return spawn("open", [url2]);
      default:
        return spawn("xdg-open", [url2]);
    }
  };
  openBrowser(confirmationUrl.toString());
  const loadingSpinner = spinner2("waiting for authentication...");
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

// src/constants.ts
var API_BASE_URL = process.env.SC_API_BASE_URL || "https://screenpi.pe";

// src/commands/login/utils/api-key-login.ts
import * as p2 from "@clack/prompts";
async function apiKeyLogin(apiKey) {
  try {
    logger.info(`
${symbols.info} validating API key...`);
    const response = await fetch(`${API_BASE_URL}/api/plugins/dev-status`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to validate API key ${error.error}`);
    }
    const data = await response.json();
    if (data.data.needs_name) {
      const developerName = await p2.text({
        message: "enter your developer name:",
        validate: (input) => {
          if (input.length < 2) {
            return "developer name must be at least 2 characters";
          }
          if (input.length > 50) {
            return "developer name must be less than 50 characters";
          }
          return;
        }
      });
      if (p2.isCancel(developerName)) {
        p2.cancel("Operation cancelled");
        process.exit(1);
      }
      const updateResponse = await fetch(
        `${API_BASE_URL}/api/plugins/dev-status`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ developer_name: developerName })
        }
      );
      if (!updateResponse.ok) {
        const error = await updateResponse.json();
        throw new Error(`failed to set developer name: ${error.error}`);
      }
      const updateData = await updateResponse.json();
      data.data.developer_name = updateData.data.developer_name;
    }
    logger.info(`
${symbols.success} successfully logged in!`);
    console.log(
      colors.listItem(
        `${colors.label("developer id")} ${data.data.developer_id}`
      )
    );
    console.log(
      colors.listItem(
        `${colors.label("developer name")} ${data.data.developer_name}`
      )
    );
    Credentials.setApiKey(apiKey, data.data.developer_id);
  } catch (error) {
    if (error instanceof Error) {
      handleError(`
${symbols.error} login failed: ${error.message}`);
    } else {
      handleError(`
${symbols.error} login failed with unexpected error`);
    }
    process.exit(1);
  }
}

// src/commands/login/index.ts
var loginCommand = new Command().name("login").description("authenticate with screenpipe").action(async () => {
  p3.intro("Welcome to Screenpipe");
  const type = await p3.select({
    message: "Select login type",
    options: [
      { value: "browser", label: "Browser" },
      { value: "apiKey", label: "API Key" }
    ]
  });
  if (p3.isCancel(type)) {
    p3.cancel("Login cancelled");
    process.exit(1);
  }
  if (type === "browser") {
    await cliLogin();
  } else {
    const apiKey = await p3.text({
      message: "Enter your API key"
      // validate: (value) => {
      //     if (value.length !== 32) {
      //         return 'API key must be 32 characters long';
      //     }
      // }
    });
    if (p3.isCancel(apiKey)) {
      p3.cancel("Login cancelled");
      process.exit(1);
    }
    await apiKeyLogin(apiKey);
  }
  p3.outro("Login complete");
});

// src/commands/logout.ts
import { Command as Command2 } from "commander";
var logoutCommand = new Command2().name("logout").description("end current session").action(async () => {
  Credentials.clearCredentials();
  logger.success(`
${symbols.success} successfully logged out`);
  logger.info(`${symbols.info} thanks for using screenpipe! come back soon.`);
});

// src/commands/pipe/index.ts
import { Command as Command7 } from "commander";

// src/commands/pipe/register.ts
import fs2 from "fs";
import { Command as Command3 } from "commander";
import * as p4 from "@clack/prompts";
async function validateGitHubRepo(url2) {
  try {
    const repoPath = url2.replace("https://github.com/", "").replace(/\/$/, "");
    const apiUrl = `https://api.github.com/repos/${repoPath}`;
    const response = await fetch(apiUrl, {
      headers: { Accept: "application/vnd.github.v3+json" }
    });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}
var registerCommand = new Command3().name("register").description("register a new pipe").requiredOption("--name <name>", "name of the pipe", (value) => {
  if (value.includes(" ")) {
    throw new Error("name cannot contain spaces");
  }
  if (!/^[a-zA-Z0-9-_]+$/.test(value)) {
    throw new Error(
      "name can only contain letters, numbers, hyphens, underscores, and periods"
    );
  }
  if (value.length > 20) {
    throw new Error("name cannot be longer than 20 characters");
  }
  return value;
}).option("--paid", "set this flag to create a paid pipe").option(
  "--price <price>",
  "price in usd (required for paid pipes)",
  parseFloat
).requiredOption(
  "--source <source>",
  "source code url (e.g., github repository)",
  (value) => {
    if (!value.startsWith("https://github.com/")) {
      throw new Error("source must start with https://github.com/");
    }
    return value;
  }
).option(
  "--discord <handle>",
  "your discord handle (e.g., username or user.name)",
  (value) => {
    const modernDiscordPattern = /^(?!.*\.\.)[a-z0-9_.]{2,32}(?<!\.)$/;
    const legacyDiscordPattern = /^[a-zA-Z0-9_]{2,32}#[0-9]{4}$/;
    if (!modernDiscordPattern.test(value) && !legacyDiscordPattern.test(value)) {
      throw new Error(
        "invalid discord handle format. should be a valid discord username (2-32 characters containing lowercase letters, numbers, periods, underscores; no consecutive periods; cannot start/end with period) or legacy format (username#1234)"
      );
    }
    return value;
  }
).action(async (opts) => {
  p4.intro(`${colors.highlight("\u26A0\uFE0F IMPORTANT: Publishing Process \u26A0\uFE0F")}`);
  const githubValidationSpinner = p4.spinner();
  githubValidationSpinner.start("Validating GitHub repository");
  const isValidRepo = await validateGitHubRepo(opts.source);
  if (!isValidRepo) {
    githubValidationSpinner.stop("GitHub validation failed");
    handleError(
      `${symbols.error} repository doesn't exist or isn't accessible: ${opts.source}`
    );
    return;
  }
  githubValidationSpinner.stop("GitHub repository validated successfully");
  p4.note(
    `Before publishing your pipe, you MUST contact ${colors.highlight(
      "louis030195"
    )} on Discord.
      Join the Discord server: ${colors.highlight(
      "https://discord.gg/dU9EBuw7Uq"
    )}
      This step is required to complete the publishing process.`,
    "Contact Required"
  );
  const confirmed = await p4.confirm({
    message: "Have you contacted louis030195 on Discord before proceeding?",
    initialValue: false
  });
  if (p4.isCancel(confirmed) || !confirmed) {
    p4.cancel(
      "Please contact louis030195 on Discord before publishing your pipe."
    );
    process.exit(0);
  }
  if (opts.paid && opts.price == null) {
    handleError(
      "error: price is required for paid pipes, i.e., --price <amount>"
    );
  }
  if (opts.paid && opts.price <= 0) {
    handleError("error: price must be positive for paid pipes");
  }
  try {
    const apiKey = Credentials.getApiKey();
    if (!apiKey) {
      handleError(
        symbols.error + " not logged in. please login first using" + colors.highlight("screenpipe login")
      );
    }
    const isPaid = opts.paid || false;
    const price = opts.price;
    let description = null;
    try {
      const readmeContent = fs2.readFileSync("README.md", "utf-8");
      if (readmeContent) {
        description = readmeContent;
      }
    } catch (error) {
      logger.warn(
        `${symbols.arrow} no README.md found, required for description`
      );
    }
    const response = await fetch(`${API_BASE_URL}/api/plugins/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: opts.name,
        description,
        is_paid: isPaid,
        price: isPaid ? price : null,
        source_url: opts.source,
        discord_handle: opts.discord
      })
    });
    if (!response.ok) {
      const errorData = await response.json();
      handleError(errorData.error || "failed to create plugin");
    }
    logger.success(
      `
${symbols.success} successfully created pipe: ${colors.highlight(
        opts.name
      )}`
    );
    logger.info(`
${symbols.info} plugin details:`);
    console.log(colors.listItem(`${colors.label("name")} ${opts.name}`));
    console.log(
      colors.listItem(
        `${colors.label("type")} ${isPaid ? `paid ($${price})` : "free"}`
      )
    );
    console.log(colors.listItem(`${colors.label("source")} ${opts.source}`));
    console.log(
      colors.listItem(`${colors.label("discord")} ${opts.discord}`)
    );
    p4.outro(`Successfully registered your pipe! \u{1F389}`);
  } catch (error) {
    if (error instanceof Error) {
      handleError(`
${symbols.error} creating failed: ${error.message}`);
    } else {
      handleError(`
${symbols.error} creating failed with unexpected error`);
    }
  }
});

// src/commands/pipe/publish.ts
import fs3 from "fs";
import path2 from "path";
import archiver from "archiver";
import crypto from "crypto";
import ignore from "ignore";
import { Command as Command4 } from "commander";
import http2 from "http";
import https from "https";
import { URL as URL2 } from "url";
import { execSync } from "child_process";
var NEXTJS_FILES = {
  required: ["package.json", ".next"],
  optional: [
    "package-lock.json",
    "bun.lockb",
    "next.config.js",
    "next.config.mjs"
  ]
};
var MAX_FILE_SIZE = 500 * 1024 * 1024;
async function archiveNextJsProject(archive) {
  const { required, optional } = NEXTJS_FILES;
  const missingFiles = required.filter((file) => !fs3.existsSync(file));
  if (missingFiles.length > 0) {
    throw new Error(
      `Required files not found: ${missingFiles.join(", ")}. Make sure you're in the correct directory and the project is built.`
    );
  }
  for (const file of required) {
    if (file === ".next") {
      archive.directory(".next", ".next", (entry) => {
        return entry.name.startsWith(".next/cache/") ? false : entry;
      });
    } else {
      archive.file(file, { name: file });
    }
  }
  optional.filter((file) => fs3.existsSync(file)).forEach((file) => {
    archive.file(file, { name: file });
  });
}
function archiveStandardProject(archive, ig) {
  archive.glob("**/*", {
    ignore: [".git/**", "node_modules/**", ".next/cache/**"],
    dot: true,
    nodir: false,
    mark: true
  });
}
async function httpRequest(url2, method, data, headers, onProgress, verbose = false) {
  const MAX_RETRIES = 10;
  const INITIAL_DELAY = 1e3;
  const parsedUrl = new URL2(url2);
  const isHttps = parsedUrl.protocol === "https:";
  const requestModule = isHttps ? https : http2;
  let bodyData = data;
  if (data && typeof data === "object" && !(data instanceof Buffer)) {
    bodyData = JSON.stringify(data);
    headers = { ...headers, "Content-Type": "application/json" };
  }
  if (bodyData) {
    const contentLength = Buffer.isBuffer(bodyData) ? bodyData.length : Buffer.byteLength(bodyData, "utf8");
    headers = { ...headers, "Content-Length": contentLength.toString() };
    if (verbose) {
      console.log(colors.dim(`${symbols.arrow} setting content-length: ${contentLength}`));
    }
  }
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        console.log(colors.dim(`${symbols.arrow} retry attempt ${attempt}/${MAX_RETRIES}...`));
      }
      const result = await new Promise((resolve, reject) => {
        const requestOptions = {
          method,
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          headers
        };
        if (verbose && attempt === 1) {
          console.log(colors.dim(`${symbols.arrow} request options: ${JSON.stringify({
            method,
            url: parsedUrl.toString(),
            headers
          }, null, 2)}`));
        }
        const req = requestModule.request(requestOptions, (res) => {
          const chunks = [];
          let receivedLength = 0;
          res.on("data", (chunk) => {
            chunks.push(chunk);
            receivedLength += chunk.length;
          });
          res.on("end", () => {
            const responseData = Buffer.concat(chunks);
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                data: responseData
              });
            } else {
              let errorMessage = `HTTP error ${res.statusCode}`;
              try {
                const contentType = res.headers["content-type"] || "";
                if (contentType.includes("json")) {
                  errorMessage += `: ${responseData.toString("utf8")}`;
                } else if (contentType.includes("xml")) {
                  const xmlString = responseData.toString("utf8");
                  console.log(colors.dim(`${symbols.arrow} error response (XML): ${xmlString}`));
                  const errorCodeMatch = xmlString.match(/<Code>(.*?)<\/Code>/);
                  const errorMessageMatch = xmlString.match(/<Message>(.*?)<\/Message>/);
                  if (errorCodeMatch && errorMessageMatch) {
                    errorMessage += `: ${errorCodeMatch[1]} - ${errorMessageMatch[1]}`;
                  }
                } else if (contentType.includes("text")) {
                  errorMessage += `: ${responseData.toString("utf8")}`;
                }
              } catch (e) {
              }
              reject(new Error(errorMessage));
            }
          });
        });
        req.on("error", (error) => {
          reject(error);
        });
        if (onProgress && method === "PUT" && bodyData) {
          let uploadedBytes = 0;
          const totalBytes = Buffer.isBuffer(bodyData) ? bodyData.length : Buffer.byteLength(bodyData, "utf8");
          const originalWrite = req.write;
          req.write = function(chunk, encoding, callback) {
            const result2 = originalWrite.call(this, chunk, encoding, callback);
            if (Buffer.isBuffer(chunk)) {
              uploadedBytes += chunk.length;
            } else if (typeof chunk === "string") {
              uploadedBytes += Buffer.byteLength(chunk, encoding);
            }
            onProgress(uploadedBytes, totalBytes);
            return result2;
          };
        }
        if (bodyData) {
          req.write(bodyData);
        }
        req.end();
      });
      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes("400") && (error.message.includes("already exists") || error.message.includes("Version") || error.message.includes("version"))) {
        console.log(colors.dim(`${symbols.arrow} detected version conflict, not retrying with same version`));
        throw error;
      }
      if (attempt === MAX_RETRIES) {
        throw error;
      }
      console.log(colors.dim(`${symbols.arrow} request failed (attempt ${attempt}/${MAX_RETRIES}): ${error instanceof Error ? error.message : "unknown error"}`));
      const delay = INITIAL_DELAY * Math.pow(2, attempt - 1) * (0.5 + Math.random() * 0.5);
      console.log(colors.dim(`${symbols.arrow} waiting ${Math.round(delay)}ms before retry...`));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Max retries exceeded");
}
function runBuildCommand() {
  logger.info(
    colors.info(
      `
${symbols.info} Project needs to be built. Running build command...`
    )
  );
  try {
    const packageJson = JSON.parse(fs3.readFileSync("package.json", "utf-8"));
    if (packageJson.scripts && packageJson.scripts.build) {
      try {
        logger.log(colors.dim(`${symbols.arrow} Executing: bun run build`));
        execSync("bun run build", { stdio: "inherit" });
      } catch (error) {
        logger.log(
          colors.dim(`${symbols.arrow} Bun not available, trying npm instead`)
        );
        execSync("npm run build", { stdio: "inherit" });
      }
      logger.success(`${symbols.success} Build completed successfully`);
    } else {
      throw new Error("No build script found in package.json");
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to build project: ${error.message}`);
    }
    throw new Error("Failed to build project");
  }
}
function bumpVersion(version, type = "patch") {
  console.log(colors.dim(`${symbols.arrow} bumping version from ${version}`));
  const [major, minor, patch] = version.split(".").map(Number);
  let newVersion;
  if (type === "patch") newVersion = `${major}.${minor}.${patch + 1}`;
  else if (type === "minor") newVersion = `${major}.${minor + 1}.0`;
  else if (type === "major") newVersion = `${major + 1}.0.0`;
  else newVersion = `${major}.${minor}.${patch + 1}`;
  console.log(colors.dim(`${symbols.arrow} new version: ${newVersion}`));
  return newVersion;
  return `${major}.${minor}.${patch + 1}`;
}
function updatePackageVersion(newVersion) {
  const packageJsonPath = path2.join(process.cwd(), "package.json");
  const packageJson = JSON.parse(fs3.readFileSync(packageJsonPath, "utf-8"));
  packageJson.version = newVersion;
  fs3.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
}
var publishCommand = new Command4("publish").description("publish or update a pipe to the store").requiredOption("-n, --name <name>", "name of the pipe").option("-v, --verbose", "enable verbose logging", false).option(
  "--skip-build-check",
  "skip checking if the project has been built",
  false
).option("--build", "automatically run the build command if needed", false).action(async (opts) => {
  try {
    if (opts.verbose) {
      console.log(colors.dim(`${symbols.arrow} starting publish command...`));
    }
    const apiKey = Credentials.getApiKey();
    if (!apiKey) {
      console.error(
        colors.error(
          `${symbols.error} not logged in. please login first using ${colors.highlight(
            "screenpipe login"
          )}`
        )
      );
      process.exit(1);
    }
    if (!opts.skipBuildCheck) {
      try {
        runBuildCommand();
      } catch (error) {
        if (error instanceof Error) {
          console.error(colors.error(`${symbols.error} ${error.message}`));
          process.exit(1);
        }
      }
    }
    if (opts.verbose) {
      console.log(colors.dim(`${symbols.arrow} reading package.json...`));
    }
    let packageJson;
    try {
      packageJson = JSON.parse(fs3.readFileSync("package.json", "utf-8"));
    } catch (error) {
      console.error(
        colors.error(
          `${symbols.error} failed to read package.json. Make sure you're in the correct directory.`
        )
      );
      process.exit(1);
    }
    if (!packageJson.name || !packageJson.version) {
      console.error(
        colors.error(
          `${symbols.error} package name and version are required in package.json`
        )
      );
      process.exit(1);
    }
    logger.info(
      colors.info(
        `
${symbols.info} publishing ${colors.highlight(
          packageJson.name
        )} v${packageJson.version}...`
      )
    );
    logger.log(colors.dim(`${symbols.arrow} creating package archive...`));
    let zipPath = path2.join(
      process.cwd(),
      `${packageJson.name}-${packageJson.version}.zip`
    );
    const output = fs3.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    const ig = ignore();
    if (fs3.existsSync(".gitignore")) {
      ig.add(fs3.readFileSync(".gitignore").toString());
    }
    const isNextProject = fs3.existsSync("next.config.js") || fs3.existsSync("next.config.mjs") || fs3.existsSync("next.config.ts");
    archive.pipe(output);
    if (isNextProject) {
      await archiveNextJsProject(archive);
    } else {
      archiveStandardProject(archive, ig);
    }
    await new Promise((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
      archive.finalize();
    });
    if (opts.verbose) {
      console.log(
        colors.dim(
          `${symbols.arrow} detected project type: ${isNextProject ? "nextjs" : "standard"}`
        )
      );
      console.log(
        colors.dim(`${symbols.arrow} starting archive creation...`)
      );
    }
    let fileBuffer = fs3.readFileSync(zipPath);
    const hashSum = crypto.createHash("sha256");
    hashSum.update(fileBuffer);
    let fileHash = hashSum.digest("hex");
    let fileSize = fs3.statSync(zipPath).size;
    if (fileSize > MAX_FILE_SIZE) {
      console.error(
        colors.error(
          `${symbols.error} Package size (${(fileSize / 1024 / 1024).toFixed(
            2
          )}MB) exceeds maximum allowed size (${MAX_FILE_SIZE / 1024 / 1024}MB)`
        )
      );
      fs3.unlinkSync(zipPath);
      process.exit(1);
    }
    let description = null;
    try {
      const readmeContent = fs3.readFileSync("README.md", "utf-8");
      if (readmeContent) {
        description = readmeContent;
      }
    } catch (error) {
      console.log(
        colors.dim(
          `${symbols.arrow} No README.md found, required for description`
        )
      );
    }
    if (!description) {
      console.error(colors.error(`${symbols.error} Description is required`));
      process.exit(1);
    }
    if (opts.verbose) {
      console.log(colors.dim(`${symbols.arrow} calculating file hash...`));
    }
    try {
      console.log(colors.dim(`${symbols.arrow} getting upload URL...`));
      console.log(colors.dim(`${symbols.arrow} requesting URL from: ${API_BASE_URL}/api/plugins/publish`));
      let urlResponse;
      try {
        const response = await httpRequest(
          `${API_BASE_URL}/api/plugins/publish`,
          "POST",
          {
            name: opts.name,
            version: packageJson.version,
            fileSize,
            fileHash,
            description,
            useS3: true
          },
          {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          opts.verbose
        );
        urlResponse = { data: JSON.parse(response.data.toString("utf8")) };
        console.log(colors.dim(`${symbols.arrow} storage provider: S3`));
        console.log(colors.dim(`${symbols.arrow} url response status: ${response.statusCode}`));
      } catch (error) {
        console.log(colors.dim(`${symbols.arrow} server error details: ${error instanceof Error ? error.message : "unknown error"}`));
        if (error instanceof Error && (error.message.includes("already exists") || error.message.includes("Version") || error.message.includes("version"))) {
          console.log(colors.dim(`${symbols.arrow} detected version conflict, preparing to bump version`));
          const readline = __require("readline").createInterface({
            input: process.stdin,
            output: process.stdout
          });
          const newVersion = bumpVersion(packageJson.version);
          const question = `
${symbols.info} ${colors.info(`Version ${packageJson.version} already exists.`)} 
${colors.info(`Would you like to bump to version ${newVersion} and continue? (y/n): `)}`;
          const answer = await new Promise((resolve) => {
            readline.question(question, (ans) => {
              readline.close();
              resolve(ans.toLowerCase());
            });
          });
          if (answer === "y" || answer === "yes") {
            updatePackageVersion(newVersion);
            logger.success(`${symbols.success} Updated package.json to version ${newVersion}`);
            packageJson.version = newVersion;
            if (fs3.existsSync(zipPath)) {
              fs3.unlinkSync(zipPath);
              if (opts.verbose) {
                console.log(colors.dim(`${symbols.arrow} cleaned up old zip file`));
              }
            }
            try {
              logger.info(colors.info(`
${symbols.info} Rebuilding project with new version ${newVersion}...`));
              runBuildCommand();
            } catch (error2) {
              if (error2 instanceof Error) {
                console.error(colors.error(`${symbols.error} ${error2.message}`));
                process.exit(1);
              }
            }
            zipPath = path2.join(
              process.cwd(),
              `${packageJson.name}-${newVersion}.zip`
            );
            const newOutput = fs3.createWriteStream(zipPath);
            const newArchive = archiver("zip", { zlib: { level: 9 } });
            newArchive.pipe(newOutput);
            logger.log(colors.dim(`${symbols.arrow} creating new package archive with version ${newVersion}...`));
            if (isNextProject) {
              await archiveNextJsProject(newArchive);
            } else {
              archiveStandardProject(newArchive, ig);
            }
            await new Promise((resolve, reject) => {
              newOutput.on("close", resolve);
              newArchive.on("error", reject);
              newArchive.finalize();
            });
            fileBuffer = fs3.readFileSync(zipPath);
            const newHashSum = crypto.createHash("sha256");
            newHashSum.update(fileBuffer);
            fileHash = newHashSum.digest("hex");
            fileSize = fs3.statSync(zipPath).size;
            if (opts.verbose) {
              console.log(colors.dim(`${symbols.arrow} new archive created: ${zipPath}`));
              console.log(colors.dim(`${symbols.arrow} new file size: ${fileSize} bytes`));
              console.log(colors.dim(`${symbols.arrow} new file hash: ${fileHash}`));
            }
            console.log(colors.dim(`${symbols.arrow} retrying with new version: ${newVersion}`));
            const response = await httpRequest(
              `${API_BASE_URL}/api/plugins/publish`,
              "POST",
              {
                name: opts.name,
                version: newVersion,
                fileSize,
                fileHash,
                description,
                useS3: true
              },
              {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json"
              },
              void 0,
              opts.verbose
            );
            urlResponse = { data: JSON.parse(response.data.toString("utf8")) };
          } else {
            throw new Error(`Publishing canceled. Please update the version manually in package.json.`);
          }
        } else {
          throw error;
        }
      }
      const { uploadUrl, path: storagePath } = urlResponse.data;
      console.log(colors.dim(`${symbols.arrow} received upload URL: ${uploadUrl.substring(0, 50)}...`));
      console.log(colors.dim(`${symbols.arrow} storage path: ${storagePath}`));
      console.log(colors.dim(`${symbols.arrow} file size: ${fileSize} bytes`));
      let currentUploadUrl = uploadUrl;
      let currentStoragePath = storagePath;
      logger.log(colors.dim(`${symbols.arrow} uploading to storage...`));
      console.log(colors.dim(`${symbols.arrow} starting upload with native http...`));
      console.log(colors.dim(`${symbols.arrow} upload file size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB`));
      const progressBar = {
        current: 0,
        total: fileSize,
        width: 40,
        update(loaded, total) {
          const percent = Math.floor(loaded / total * 100);
          const filledWidth = Math.floor(loaded / total * this.width);
          const emptyWidth = this.width - filledWidth;
          if (percent > this.current) {
            this.current = percent;
            process.stdout.write("\r");
            const bar = "\u2588".repeat(filledWidth) + "\u2591".repeat(emptyWidth);
            const loadedSize = (loaded / (1024 * 1024)).toFixed(2);
            const totalSize = (total / (1024 * 1024)).toFixed(2);
            process.stdout.write(
              `${colors.dim(`${symbols.arrow} uploading: [`)}${colors.info(bar)}${colors.dim(`] ${percent}%`)} ${colors.dim(`(${loadedSize}/${totalSize} MB)`)}`
            );
          }
        },
        complete() {
          process.stdout.write("\n");
          logger.success(`${symbols.success} upload completed successfully`);
        }
      };
      const uploadResponse = await httpRequest(
        currentUploadUrl,
        "PUT",
        fileBuffer,
        {
          "Content-Type": "application/zip",
          "Content-Length": fileSize.toString()
        },
        (loaded, total) => progressBar.update(loaded, total),
        opts.verbose
      );
      progressBar.complete();
      console.log(colors.dim(`${symbols.arrow} upload completed with status: ${uploadResponse.statusCode}`));
      console.log(colors.dim(`${symbols.arrow} waiting for S3 to process the upload...`));
      await new Promise((resolve) => setTimeout(resolve, 5e3));
      logger.log(colors.dim(`${symbols.arrow} finalizing upload with S3 storage...`));
      console.log(colors.dim(`${symbols.arrow} sending finalize request to: ${API_BASE_URL}/api/plugins/publish/finalize`));
      const finalizeResponse = await httpRequest(
        `${API_BASE_URL}/api/plugins/publish/finalize`,
        "POST",
        {
          name: opts.name,
          version: packageJson.version,
          fileHash,
          storagePath: currentStoragePath,
          description,
          fileSize
        },
        {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        void 0,
        opts.verbose
      );
      console.log(colors.dim(`${symbols.arrow} finalize response status: ${finalizeResponse.statusCode}`));
      const finalizeData = JSON.parse(finalizeResponse.data.toString("utf8"));
      console.log(colors.dim(`${symbols.arrow} finalize response data: ${JSON.stringify(finalizeData)}`));
      logger.success(`
${symbols.success} successfully published plugin!`);
      console.log(
        colors.listItem(`${colors.label("name")} ${packageJson.name}`)
      );
      console.log(
        colors.listItem(`${colors.label("version")} ${packageJson.version}`)
      );
      console.log(
        colors.listItem(
          `${colors.label("size")} ${(fileSize / 1024).toFixed(2)} KB`
        )
      );
      if (finalizeData.message) {
        logger.info(`
${symbols.info} ${finalizeData.message}`);
      }
    } catch (error) {
      console.error(colors.error(`${symbols.error} ${error instanceof Error ? error.message : "unknown error"}`));
      process.exit(1);
    }
  } catch (error) {
    console.error(colors.error(`${symbols.error} ${error instanceof Error ? error.message : "unknown error"}`));
    process.exit(1);
  }
});

// src/commands/pipe/list-versions.ts
import { Command as Command5 } from "commander";
var listVersionsCommand = new Command5().name("list-versions").description("List all versions of a pipe").requiredOption("--name <name>", "name of the pipe").action(async (opts) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/plugins/list-versions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Credentials.getApiKey()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: opts.name
        })
      }
    );
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`failed to list versions ${error.error}`);
    }
    const data = await response.json();
    console.log(colors.header(`plugin Information`));
    console.log(colors.listItem(`${colors.label("Name")} ${opts.name}`));
    console.log(colors.listItem(`${colors.label("ID")} ${data.plugin_id}`));
    console.log(colors.header("version History"));
    data.versions.forEach((version) => {
      const status = version.status === "published" ? colors.success(version.status) : colors.warning(version.status);
      console.log(
        colors.primary(
          `
  ${symbols.arrow} version ${colors.bold(
            version.version
          )} ${colors.dim(`(${status})`)}`
        )
      );
      console.log(
        colors.listItem(
          `${colors.label("created")} ${new Date(
            version.created_at
          ).toLocaleString()}`
        )
      );
      console.log(
        colors.listItem(
          `${colors.label("size")} ${(version.file_size / 1024).toFixed(
            2
          )} KB`
        )
      );
      console.log(
        colors.listItem(
          `${colors.label("hash")} ${colors.dim(version.file_hash)}`
        )
      );
      if (version.changelog) {
        console.log(
          colors.listItem(`${colors.label("changelog")} ${version.changelog}`)
        );
      }
    });
  } catch (error) {
    if (error instanceof Error) {
      handleError(
        `
${symbols.error} list versions failed: ${error.message}`
      );
    } else {
      handleError(
        `
${symbols.error} list versions failed with unexpected error`
      );
    }
  }
});

// src/commands/pipe/create.ts
import fs4 from "fs-extra";
import path3 from "path";
import * as p5 from "@clack/prompts";
import chalk3 from "chalk";
import { Command as Command6 } from "commander";
import { extract } from "tar-stream";
import { createGunzip } from "zlib";
import { Readable } from "stream";
process.removeAllListeners("warning");
var PIPE_ADDITIONS = {
  dependencies: {
    "@screenpipe/js": "latest"
  },
  devDependencies: {
    "bun-types": "latest"
  }
};
async function downloadAndExtractSubdir(subdir, destPath) {
  const tempDir = path3.join(destPath, "_temp");
  const s = p5.spinner();
  try {
    s.start("preparing to download template...");
    await fs4.ensureDir(destPath);
    await fs4.ensureDir(tempDir);
    s.message("downloading template files...");
    const repoOwner = "mediar-ai";
    const repoName = "screenpipe";
    const branch = "main";
    const tarballUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/tarball/${branch}`;
    const response = await fetch(tarballUrl);
    if (!response.ok) {
      throw new Error(`Failed to download template: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    s.message("extracting template files...");
    const extractedDirName = await extractTarball(buffer, tempDir, subdir);
    s.message("checking template directory...");
    const sourcePath = path3.join(tempDir, extractedDirName, subdir);
    if (!await fs4.pathExists(sourcePath)) {
      throw new Error(`template directory '${subdir}' not found in repository`);
    }
    s.message("copying template files to destination...");
    await fs4.copy(sourcePath, destPath);
    s.message("cleaning up temporary files...");
    await fs4.remove(tempDir);
    s.stop("template downloaded and extracted successfully!");
  } catch (error) {
    if (await fs4.pathExists(tempDir)) {
      s.message("cleaning up after error...");
      await fs4.remove(tempDir);
    }
    s.stop("download failed!");
    throw new Error(`failed to setup pipe: ${error.message}`);
  }
}
async function extractTarball(buffer, tempDir, targetSubdir) {
  return new Promise((resolve, reject) => {
    const extractor = extract();
    let extractedDirName = "";
    extractor.on("entry", async (header, stream, next) => {
      const parts = header.name.split("/");
      if (parts.length > 0 && !extractedDirName) {
        extractedDirName = parts[0];
      }
      if (header.name.includes(`/${targetSubdir}/`) || header.name.endsWith(`/${targetSubdir}`)) {
        const filePath = path3.join(tempDir, header.name);
        if (header.type === "directory") {
          await fs4.ensureDir(filePath);
          stream.resume();
        } else {
          await fs4.ensureDir(path3.dirname(filePath));
          stream.pipe(fs4.createWriteStream(filePath));
        }
      } else {
        stream.resume();
      }
      stream.on("end", next);
    });
    extractor.on("finish", () => {
      if (!extractedDirName) {
        reject(new Error("Could not determine extracted directory name"));
      } else {
        resolve(extractedDirName);
      }
    });
    extractor.on("error", reject);
    const bufferStream = Readable.from(buffer);
    bufferStream.pipe(createGunzip()).pipe(extractor);
  });
}
var createPipeCommand = new Command6().name("create").description("create a new pipe").action(async () => {
  p5.intro(chalk3.bold("\nwelcome to screenpipe!\n"));
  const pipeNameInput = await p5.text({
    message: "what is your pipe name?",
    placeholder: "my-screenpipe",
    validate: (value) => {
      if (value.trim().length === 0) return "pipe name is required";
      return void 0;
    }
  });
  if (p5.isCancel(pipeNameInput)) {
    p5.cancel("operation cancelled");
    process.exit(1);
  }
  const pipeName = pipeNameInput;
  const directoryInput = await p5.text({
    message: "where would you like to create your pipe?",
    placeholder: pipeName,
    validate: (value) => {
      if (value.trim().length === 0) return "directory is required";
      return void 0;
    }
  });
  if (p5.isCancel(directoryInput)) {
    p5.cancel("operation cancelled");
    process.exit(1);
  }
  const directory = directoryInput;
  const s = p5.spinner();
  s.start("creating your pipe...");
  try {
    const absoluteDirectory = path3.resolve(process.cwd(), directory);
    await downloadAndExtractSubdir("pipes/example-pipe", absoluteDirectory);
    const pkgPath = path3.join(absoluteDirectory, "package.json");
    const pkg = await fs4.readJson(pkgPath);
    pkg.name = pipeName;
    pkg.dependencies = {
      ...pkg.dependencies,
      ...PIPE_ADDITIONS.dependencies
    };
    pkg.devDependencies = {
      ...pkg.devDependencies,
      ...PIPE_ADDITIONS.devDependencies
    };
    await fs4.writeJson(pkgPath, pkg, { spaces: 2 });
    s.stop(chalk3.green(`> pipe created successfully!`));
    console.log("\nto get started:");
    console.log(chalk3.cyan(`cd ${absoluteDirectory}`));
    console.log(
      chalk3.cyan("bun install    # or use: npm install, pnpm install, yarn")
    );
    console.log(
      chalk3.cyan("bun dev      # or use: npm run dev, pnpm dev, yarn dev")
    );
    console.log(
      "\nwhen you're ready, you can ship your pipe to the app by adding it to the pipe store using the UI and then send a PR to the main repo.\n"
    );
  } catch (error) {
    s.stop("failed to create pipe");
    handleError(error);
  }
});

// src/commands/pipe/index.ts
var pipeCommands = new Command7().name("pipe").description("create and manage pipes");
pipeCommands.addCommand(createPipeCommand);
pipeCommands.addCommand(registerCommand);
pipeCommands.addCommand(publishCommand);
pipeCommands.addCommand(listVersionsCommand);

// src/commands/app/index.ts
import { Command as Command9 } from "commander";

// src/commands/app/create.ts
import * as p6 from "@clack/prompts";
import { Command as Command8 } from "commander";
import simpleGit from "simple-git";
var TEMPLATE_REPOS = {
  electron: "https://github.com/neo773/screenpipe-electron",
  tauri: "https://github.com/LorenzoBloedow/screenpipe-tauri-template-dev"
};
var createAppCommand = new Command8().name("create").description("create a new desktop app project").option("-a, --name <name>", "the name of your app (optional)").option("-t, --appType <type>", "the type of desktop app (electron or tauri)").action(async (options) => {
  let { name, appType } = options;
  if (!appType) {
    try {
      appType = await p6.select({
        message: "what type of desktop app would you like to create?",
        options: [
          { value: "electron", label: "electron" },
          { value: "tauri", label: "tauri" }
        ]
      });
      if (p6.isCancel(appType)) {
        p6.cancel("operation cancelled");
        process.exit(1);
      }
    } catch (error) {
      handleError(error);
    }
  }
  if (!name || name.length === 0) {
    try {
      name = await p6.text({
        message: "what is your project name?",
        placeholder: "my-desktop-app",
        validate: (input) => {
          if (input.trim().length === 0) return "project name is required.";
          return;
        }
      });
      if (p6.isCancel(name)) {
        p6.cancel("operation cancelled");
        process.exit(1);
      }
    } catch (error) {
      handleError(error);
    }
  }
  const loadingSpinner = spinner2("creating your desktop app...");
  try {
    await simpleGit().clone(
      TEMPLATE_REPOS[appType],
      name
    );
    loadingSpinner.succeed(`> project created successfully! \u{1F389}`);
    logger.info("\ncredits to the template authors:");
    if (appType === "electron") {
      logger.info("electron template by: Neo @ https://github.com/neo773");
    } else {
      logger.info(
        "tauri template by: Lorenzo @ https://github.com/LorenzoBloedow"
      );
    }
    logger.info("\nto get started:");
    logger.info(`cd ${name}`);
    logger.info("npm install     # or bun install, pnpm install, yarn");
    logger.info("npm run dev     # or bun dev, pnpm dev, yarn dev");
    logger.info(
      "\nwhen you're ready, you can deploy your app following the documentation for the respective framework.\n"
    );
  } catch (error) {
    loadingSpinner.failed("failed to create project");
    handleError(error instanceof Error ? error.message : String(error));
  }
});

// src/commands/app/index.ts
var appCommands = new Command9().name("app").description("create a new screenpipe application using default templates");
appCommands.addCommand(createAppCommand);

// src/commands/components/commands/add/utils/prompt-for-component.ts
import { z as z4 } from "zod";
import * as p7 from "@clack/prompts";

// src/commands/components/commands/add/registry/schema.ts
import { z as z3 } from "zod";
var registryComponentSchema = z3.object({
  name: z3.string(),
  src: z3.string(),
  internal: z3.boolean().optional(),
  docs: z3.string().optional(),
  target: z3.string(),
  dependencies: z3.array(z3.string()).optional(),
  registryDependencies: z3.array(z3.string()).optional(),
  devDependencies: z3.array(z3.string()).optional(),
  shadcnComponent: z3.array(z3.string()).optional()
});
var registrySchema = z3.record(z3.string(), registryComponentSchema);
var registryResolvedComponentsTreeSchema = registryComponentSchema.pick({
  dependencies: true,
  devDependencies: true,
  docs: true,
  shadcnComponent: true
}).merge(
  z3.object({
    files: z3.array(z3.object({
      src: z3.string(),
      target: z3.string()
    }))
  })
);

// src/commands/components/commands/add/registry/registry.json
var registry_default = {
  "use-health": {
    name: "use-health",
    src: "https://api.github.com/repos/mediar-ai/screenpipe/contents/pipes/example-pipe/lib/hooks/use-health-check.tsx",
    target: "./src/hooks/use-health.tsx",
    dependencies: [
      "lodash"
    ],
    devDependencies: [
      "@types/lodash"
    ]
  },
  "update-pipe-config": {
    name: "update-pipe-config",
    src: "https://api.github.com/repos/mediar-ai/screenpipe/contents/pipes/example-pipe/lib/actions/update-pipe-config.ts",
    target: "./src/lib/actions/update-pipe-config.tsx",
    dependencies: [
      "@screenpipe/browser"
    ],
    registryDependencies: [
      "types"
    ]
  },
  "use-pipe-settings": {
    name: "use-pipe-settings",
    src: "https://api.github.com/repos/mediar-ai/screenpipe/contents/pipes/example-pipe/lib/hooks/use-pipe-settings.tsx",
    target: "./src/lib/hooks/use-pipe-settings.ts",
    dependencies: [
      "@screenpipe/browser"
    ],
    registryDependencies: [
      "get-screenpipe-app-settings",
      "types"
    ]
  },
  "get-screenpipe-app-settings": {
    name: "get-screenpipe-app-settings",
    src: "https://api.github.com/repos/mediar-ai/screenpipe/contents/pipes/example-pipe/lib/actions/get-screenpipe-app-settings.ts",
    target: "./src/lib/actions/get-screenpipe-app-settings.ts",
    dependencies: [
      "@screenpipe/js"
    ],
    registryDependencies: []
  },
  types: {
    name: "types",
    src: "https://api.github.com/repos/mediar-ai/screenpipe/contents/pipes/obsidian/src/lib/types.ts",
    target: "./src/lib/types.ts",
    dependencies: [
      "@screenpipe/js"
    ],
    registryDependencies: []
  },
  "use-sql-autocomplete": {
    name: "use-sql-autocomplete",
    src: "https://api.github.com/repos/mediar-ai/screenpipe/contents/screenpipe-app-tauri/components/sql-autocomplete-input.tsx",
    target: "./src/hooks/use-sql-autocomplete.ts"
  },
  "sql-autocomplete-input": {
    name: "sql-autocomplete-input",
    src: "https://api.github.com/repos/mediar-ai/screenpipe/contents/screenpipe-app-tauri/components/sql-autocomplete-input.tsx",
    target: "./src/components/sql-autocomplete-input.ts",
    dependencies: [
      "cmdk",
      "lucide-react"
    ],
    registryDependencies: [
      "use-sql-autocomplete"
    ]
  },
  "use-ai-provider": {
    name: "use-ai-provider",
    src: "https://api.github.com/repos/mediar-ai/screenpipe/contents/pipes/search/src/lib/hooks/use-ai-provider.tsx",
    target: "./src/hooks/use-ai-provider.tsx",
    dependencies: [
      "@screenpipe/browser"
    ],
    registryDependencies: [],
    devDependencies: []
  }
};

// src/commands/components/commands/add/registry/api.ts
import deepmerge from "deepmerge";
function getRegistry() {
  try {
    const parsedRegistry = registrySchema.parse(registry_default);
    return parsedRegistry;
  } catch (error) {
    logger.break();
    handleError(error);
  }
}
function resolveRegistryItems(names) {
  let registryDependencies = {};
  const registry = getRegistry();
  if (!registry) return;
  for (const name of names) {
    const itemRegistryDependencies = resolveRegistryDependencies(
      name,
      registry
    );
    registryDependencies = {
      ...registryDependencies,
      ...itemRegistryDependencies
    };
  }
  return registryDependencies;
}
function resolveRegistryDependencies(name, registry) {
  const components = {};
  function resolveDependencies(componentName) {
    if (registry[componentName]) {
      components[componentName] = registry[componentName];
    } else {
      logger.break();
      handleError(
        `Component ${componentName} not found.`
      );
    }
    if (registry[componentName].registryDependencies) {
      for (const dependency of registry[componentName].registryDependencies) {
        resolveDependencies(dependency);
      }
    }
  }
  resolveDependencies(name);
  return components;
}
function registryResolveItemsTree(names) {
  let relevantItemsRegistry = resolveRegistryItems(names);
  const payload = registrySchema.parse(relevantItemsRegistry);
  if (!payload) {
    return null;
  }
  const componentArray = Object.values(payload);
  let docs = "";
  componentArray.forEach((item) => {
    if (item.docs) {
      docs += `${item.docs}
`;
    }
  });
  return registryResolvedComponentsTreeSchema.parse({
    dependencies: deepmerge.all(
      componentArray.map((item) => item.dependencies ?? [])
    ),
    devDependencies: deepmerge.all(
      componentArray.map((item) => item.devDependencies ?? [])
    ),
    files: componentArray.map((item) => {
      return {
        src: item.src,
        target: item.target
      };
    }),
    docs,
    shadcnComponent: Array.from(new Set(
      componentArray.flatMap((item) => item.shadcnComponent ?? [])
    ))
  });
}

// src/commands/components/commands/add/utils/prompt-for-component.ts
async function promptForRegistryComponents(all) {
  const registrySpinner = spinner2("Checking registry...");
  registrySpinner.start();
  const registryIndex = getRegistry();
  if (!registryIndex) {
    registrySpinner.fail("Failed to fetch registry index.");
    logger.break();
    handleError(new Error("Failed to fetch registry index."));
    return [];
  }
  registrySpinner.succeed("Registry checked successfully.");
  if (all) {
    return Object.values(registryIndex).map((entry) => entry.name);
  }
  const components = await p7.multiselect({
    message: "Which components would you like to add?",
    options: Object.values(registryIndex).filter((item) => item.internal !== true).map((entry) => ({
      value: entry.name,
      label: entry.name
    }))
  });
  if (p7.isCancel(components)) {
    p7.cancel("No components selected. Exiting.");
    process.exit(1);
  }
  const result = z4.array(z4.string()).safeParse(components);
  if (!result.success) {
    handleError(new Error("Something went wrong. Please try again."));
    return [];
  }
  return result.data;
}

// src/commands/components/commands/add/preflights/preflight-add.ts
import fs5 from "fs";
import path4 from "path";
function preFlightAdd(cwd) {
  const errors = {};
  if (!fs5.existsSync(cwd) || !fs5.existsSync(path4.resolve(cwd, "package.json"))) {
    errors[ERRORS.MISSING_DIR_OR_EMPTY_PIPE] = true;
    return {
      errors
    };
  }
}

// src/commands/components/commands/add/utils/updaters/update-dependencies.ts
import { execSync as execSync2 } from "child_process";

// src/commands/components/commands/add/utils/package-manager.ts
import { existsSync } from "fs";
import { join } from "path";
function detectPackageManager(cwd) {
  if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) return "bun";
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "package-lock.json"))) return "npm";
  return "npm";
}

// src/commands/components/commands/add/utils/updaters/update-dependencies.ts
async function updateDependencies(dependencies, options) {
  if (!dependencies?.length) {
    return;
  }
  const uniqueDependencies = Array.from(new Set(dependencies));
  try {
    const packageManager = detectPackageManager(options.cwd);
    const command = getPackageManagerCommand(packageManager, uniqueDependencies, options.devDependency);
    const spinnerText = `Installing ${options.devDependency ? "dev dependencies" : "dependencies"}: ${uniqueDependencies.join(", ")}...`;
    const dependenciesSpinner = spinner2(spinnerText, { silent: options.silent });
    dependenciesSpinner.start();
    try {
      execSync2(command.join(" "), {
        cwd: options.cwd,
        stdio: ["ignore", "pipe", "pipe"]
      });
      if (!options.silent) {
        dependenciesSpinner.succeed(`Installed ${options.devDependency ? "dev dependencies" : "dependencies"}: ${uniqueDependencies.join(", ")}`);
      }
    } catch (error) {
      if (!options.silent) {
        dependenciesSpinner.fail(`Failed to install ${options.devDependency ? "dev dependencies" : "dependencies"}`);
      }
      throw error;
    }
  } catch (error) {
    throw error;
  }
}
function getPackageManagerCommand(packageManager, dependencies, isDevDependency = false) {
  const commands = {
    npm: ["npm", isDevDependency ? "install --save-dev" : "install", ...dependencies],
    yarn: ["yarn", "add", isDevDependency ? "--dev" : "", ...dependencies],
    pnpm: ["pnpm", "add", isDevDependency ? "--save-dev" : "", ...dependencies],
    bun: ["bun", "add", isDevDependency ? "--dev" : "", ...dependencies]
  };
  return commands[packageManager].filter(Boolean);
}

// src/commands/components/commands/add/utils/updaters/update-files.ts
import fs7 from "fs-extra";
import path5 from "path";
import * as p8 from "@clack/prompts";
import { existsSync as existsSync2 } from "fs";

// src/commands/components/commands/add/utils/download-file-from-github.ts
import fs6 from "fs-extra";
async function fetchFileFromGitHubAPI(apiUrl, outputPath) {
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch file info from GitHub API. HTTP Status: ${response.status}`);
    }
    const data = await response.json();
    const fileContent = Buffer.from(data.content, "base64").toString("utf-8");
    fs6.writeFileSync(outputPath, fileContent);
  } catch (err) {
    handleError(`Error: ${err.message}`);
  }
}

// src/commands/components/commands/add/utils/updaters/update-files.ts
async function updateFiles(componentLocations, options) {
  if (!componentLocations?.length) {
    return {
      filesCreated: [],
      filesUpdated: [],
      filesSkipped: []
    };
  }
  options = {
    overwrite: false,
    silent: false,
    ...options
  };
  const filesCreatedSpinner = spinner2(`Creating files...`, {
    silent: options.silent
  });
  filesCreatedSpinner.start();
  const filesCreated = [];
  const filesUpdated = [];
  const filesSkipped = [];
  for (const location of componentLocations) {
    const targetDir = path5.dirname(location.target);
    const existingFile = existsSync2(location.target);
    if (existingFile && !options.overwrite) {
      filesCreatedSpinner.stop();
      const overwrite = await p8.confirm({
        message: `The file ${highlighter.info(location.target)} already exists. Would you like to overwrite?`
      });
      if (p8.isCancel(overwrite) || !overwrite) {
        filesSkipped.push(path5.relative(options.cwd, location.target));
        continue;
      }
      filesCreatedSpinner.start();
      if (!existsSync2(targetDir)) {
        await fs7.mkdir(targetDir, { recursive: true });
      }
    }
    if (!existsSync2(targetDir)) {
      await fs7.mkdir(targetDir, { recursive: true });
    }
    await fetchFileFromGitHubAPI(location.src, location.target);
    existingFile ? filesUpdated.push(path5.relative(options.cwd, location.target)) : filesCreated.push(path5.relative(options.cwd, location.target));
  }
  const hasUpdatedFiles = filesCreated.length || filesUpdated.length;
  if (!hasUpdatedFiles && !filesSkipped.length) {
    filesCreatedSpinner.info("No files created.");
    return { filesCreated, filesUpdated, filesSkipped };
  }
  if (!options.silent) {
    filesCreatedSpinner.stop();
    if (filesCreated.length) {
      p8.note(
        [
          `Created ${filesCreated.length} ${filesCreated.length === 1 ? "file" : "files"}:`,
          ...filesCreated.map((file) => `  - ${file}`)
        ].join("\n"),
        "Created"
      );
    }
    if (filesUpdated.length) {
      p8.note(
        [
          `Updated ${filesUpdated.length} ${filesUpdated.length === 1 ? "file" : "files"}:`,
          ...filesUpdated.map((file) => `  - ${file}`)
        ].join("\n"),
        "Updated"
      );
    }
    if (filesSkipped.length) {
      p8.note(
        [
          `Skipped ${filesSkipped.length} ${filesSkipped.length === 1 ? "file" : "files"}:`,
          ...filesSkipped.map((file) => `  - ${file}`),
          "",
          "Use --overwrite to overwrite existing files"
        ].join("\n"),
        "Skipped"
      );
    }
  }
  return {
    filesCreated,
    filesUpdated,
    filesSkipped
  };
}

// src/commands/components/commands/add/utils/shadcn.ts
import { execSync as execSync3 } from "child_process";
import { existsSync as existsSync3 } from "fs";
import { join as join2 } from "path";
import * as p9 from "@clack/prompts";
async function getValidShadcnComponents() {
  try {
    const response = await fetch("https://ui.shadcn.com/r/index.json");
    const data = await response.json();
    return data.map((item) => item.name);
  } catch (error) {
    return [
      "accordion",
      "alert",
      "alert-dialog",
      "aspect-ratio",
      "avatar",
      "badge",
      "button",
      "calendar",
      "card",
      "carousel",
      "checkbox",
      "collapsible",
      "command",
      "context-menu",
      "dialog",
      "dropdown-menu",
      "form",
      "hover-card",
      "input",
      "label",
      "menubar",
      "navigation-menu",
      "popover",
      "progress",
      "radio-group",
      "scroll-area",
      "select",
      "separator",
      "sheet",
      "skeleton",
      "slider",
      "switch",
      "table",
      "tabs",
      "textarea",
      "toast",
      "toggle",
      "tooltip"
    ];
  }
}
function getShadcnAddCommand(components, packageManager, options = {}) {
  const flags = [];
  if (options.noPrompt) {
    flags.push("-y");
  }
  if (options.overwrite) {
    flags.push("--overwrite");
  }
  const baseCommand = {
    bun: ["bunx", "--bun", "shadcn@latest"],
    pnpm: ["pnpm", "dlx", "shadcn@latest"],
    yarn: ["yarn", "dlx", "shadcn@latest"],
    npm: ["npx", "shadcn@latest"]
  };
  const command = baseCommand[packageManager] || baseCommand.npm;
  return [...command, "add", ...components, ...flags];
}
function getShadcnInitCommand(packageManager) {
  const baseCommand = {
    bun: ["bunx", "--bun", "shadcn@latest"],
    pnpm: ["pnpm", "dlx", "shadcn@latest"],
    yarn: ["yarn", "dlx", "shadcn@latest"],
    npm: ["npx", "shadcn@latest"]
  };
  const command = baseCommand[packageManager] || baseCommand.npm;
  return [...command, "init", "-yd"];
}
function isShadcnInitialized(cwd) {
  return existsSync3(join2(cwd, "components.json"));
}
async function initializeShadcn(cwd, silent = false) {
  const initSpinner = spinner2("Checking shadcn-ui initialization...");
  try {
    if (!silent) {
      const shouldInit = await p9.confirm({
        message: "shadcn-ui is not initialized in this project. Would you like to initialize it now?"
      });
      if (p9.isCancel(shouldInit) || !shouldInit) {
        console.log("Please initialize shadcn-ui manually by running: npx shadcn@latest init");
        return false;
      }
    }
    initSpinner.start("Initializing shadcn-ui...");
    const packageManager = detectPackageManager(cwd);
    const commandParts = getShadcnInitCommand(packageManager);
    execSync3(commandParts.join(" "), {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        FORCE_COLOR: "true",
        CI: "true"
        // Always run in CI mode for init
      }
    });
    initSpinner.succeed("Initialized shadcn-ui");
    return true;
  } catch (error) {
    initSpinner.fail("Failed to initialize shadcn-ui");
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    throw new Error(`Failed to initialize shadcn-ui: ${errorMessage}`);
  }
}
async function installShadcnComponents(components = [], options) {
  if (!components?.length) {
    return;
  }
  try {
    if (!isShadcnInitialized(options.cwd)) {
      const initialized = await initializeShadcn(options.cwd, options.silent);
      if (!initialized) {
        return handleError(
          new Error("shadcn-ui must be initialized before installing components")
        );
      }
    }
    const validComponents = await getValidShadcnComponents();
    const invalidComponents = components.filter((component) => !validComponents.includes(component));
    if (invalidComponents.length > 0) {
      return handleError(
        new Error(
          `Invalid shadcn components: ${invalidComponents.join(", ")}
Available components are: ${validComponents.join(", ")}`
        )
      );
    }
    const packageManager = detectPackageManager(options.cwd);
    const componentList = components.join(", ");
    const commandParts = getShadcnAddCommand(components, packageManager, {
      overwrite: options.overwrite,
      noPrompt: options.silent
    });
    const shadcnSpinner = spinner2(`Installing shadcn components: ${componentList}...`, { silent: options.silent });
    shadcnSpinner.start();
    try {
      execSync3(commandParts.join(" "), {
        cwd: options.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          FORCE_COLOR: "true",
          CI: options.silent ? "true" : "false"
        }
      });
      shadcnSpinner.succeed(`Installed shadcn components: ${componentList}
`);
    } catch (error) {
      shadcnSpinner.fail(`Failed to install shadcn components
`);
      throw error;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return handleError(new Error(`Failed to install shadcn components: ${errorMessage}`));
  }
}

// src/commands/components/commands/add/utils/add-components.ts
async function addComponents(components, options) {
  const registrySpinner = spinner2(`Checking registry.`, {
    silent: options.silent
  });
  registrySpinner.start();
  const tree = registryResolveItemsTree(components);
  if (!tree) {
    registrySpinner.fail("Failed to fetch components from registry.");
    return handleError(new Error("Failed to fetch components from registry."));
  }
  registrySpinner.succeed("Registry checked successfully.");
  await updateDependencies(
    tree.dependencies,
    {
      cwd: options.cwd,
      silent: options.silent
    }
  );
  await updateDependencies(
    tree.devDependencies,
    {
      cwd: options.cwd,
      silent: options.silent,
      devDependency: true
    }
  );
  await installShadcnComponents(tree.shadcnComponent ?? [], {
    cwd: options.cwd,
    silent: options.silent,
    overwrite: options.overwrite
  });
  await updateFiles(tree.files, {
    cwd: options.cwd,
    overwrite: options.overwrite,
    silent: options.silent
  });
}

// src/commands/components/commands/add/add.ts
import { Command as Command10 } from "commander";
var addComponentCommand = new Command10().name("add").description("add components and dependencies to your pipe").argument("[components...]", "List of components by name").option("--path <path>", "The path to add the component to.").option("--silent", "Mute output.", false).option("--overwrite", "Overwrite existing files.", false).option(
  "--cwd <cwd>",
  "The working directory. Defaults to the current directory.",
  process.cwd()
).action(async (comps, opts) => {
  try {
    let components;
    if (!comps?.length) {
      components = await promptForRegistryComponents();
    } else {
      components = [comps];
    }
    const result = preFlightAdd(opts.cwd);
    if (result?.errors[ERRORS.MISSING_DIR_OR_EMPTY_PIPE]) {
      logger.warn(
        "you need to create a pipe first. run bunx --bun @screenpipe/dev@latest pipe create or visit https://docs.screenpi.pe/docs/plugins for more information."
      );
      process.exit(1);
    }
    await addComponents(components, {
      silent: opts.silent,
      cwd: opts.cwd,
      overwrite: opts.overwrite
    });
  } catch (error) {
    logger.break();
    handleError(error);
  }
});

// src/commands/components/commands/register.ts
import fs8 from "fs-extra";
import { Command as Command11 } from "commander";
import inquirer from "inquirer";
async function writeJsonToFile(filePath, data) {
  try {
    await fs8.promises.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
    logger.success(`component registry successfully updated.`);
  } catch (error) {
    if (error) {
      if (error instanceof Error) {
        if (error.message === "No such file or directory") {
          logger.break();
          logger.warn("this command can only be called from within the screenpipe-js/cli of screenpipe's repository");
          process.exit(1);
        }
      }
    }
    logger.break();
    handleError("critical: could not save information to registry");
    process.exit(1);
  }
}
var registerComponentCommand = new Command11().name("register").description("register a new component in screenpipe's component registry").option("-n, --name <name>", "name of the component").option("-s, --src", "github url for the component").option("-t, --target", "path where file should be created").action(async (opts) => {
  try {
    if (!opts.name) {
      const { name } = await inquirer.prompt([
        {
          type: "input",
          name: "name",
          message: "what's your component's name?"
        }
      ]);
      opts.name = name;
    }
    if (!opts.src) {
      const { src } = await inquirer.prompt([
        {
          type: "input",
          name: "src",
          message: "where should we download the component from? (URL pattern: https://api.github.com/repos/{owner}/{repo}/contents/{path})",
          validate: (input) => input.startsWith("https://api.github.com/repos/") ? true : "URL must follow the pattern: https://api.github.com/repos/{owner}/{repo}/contents/{path}. \n \n \nvisit: https://github.com/mediar-ai/screenpipe/blob/main/screenpipe-js/cli/src/commands/components/README.md for more details."
        }
      ]);
      opts.src = src;
    }
    if (!opts.target) {
      const { target } = await inquirer.prompt([
        {
          type: "input",
          name: "target",
          message: "where should the component be created?"
        }
      ]);
      opts.target = target;
    }
    if (!opts.name?.length || !opts.src?.length || !opts.target?.length) {
      logger.break();
      handleError("invalid component");
      process.exit(1);
    }
    const { deps } = await inquirer.prompt([
      {
        type: "input",
        name: "deps",
        message: "type all of the component's runtime dependencies by name, separated by a comma",
        filter: (input) => input.split(",").map((item) => item.trim()).filter((item) => item !== "")
      }
    ]);
    const { devDeps } = await inquirer.prompt([
      {
        type: "input",
        name: "devDeps",
        message: "type all of the component's dev dependencies by name, separated by a comma",
        filter: (input) => input.split(",").map((item) => item.trim()).filter((item) => item !== "")
      }
    ]);
    const { registryDeps } = await inquirer.prompt([
      {
        type: "input",
        name: "registryDeps",
        message: "type all of the component's registry dependencies by name, separated by a comma",
        filter: (input) => input.split(",").map((item) => item.trim()).filter((item) => item !== "")
      }
    ]);
    const componentObject = {
      name: opts.name,
      src: opts.src,
      target: opts.target,
      dependencies: deps,
      devDependencies: devDeps,
      registryDependencies: registryDeps
    };
    const currentRegistry = getRegistry();
    if (!currentRegistry) {
      logger.break();
      handleError("critical: build is missing registry file.");
      process.exit(1);
    }
    currentRegistry[opts.name] = componentObject;
    await writeJsonToFile("./src/commands/components/commands/add/registry/registry.json", currentRegistry);
    logger.log("run `bun run build` and open a PR at https://github.com/mediar-ai/screenpipe to update registry.");
  } catch (error) {
    logger.break();
    handleError(error);
  }
});

// src/commands/components/index.ts
import { Command as Command12 } from "commander";
var componentsCommands = new Command12().name("components").description("easily add screenpipe components to your project");
componentsCommands.addCommand(addComponentCommand);
componentsCommands.addCommand(registerComponentCommand);

// src/index.ts
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
async function main() {
  const program = new Command13();
  program.name("screenpipe-dev").description("screenpipe development CLI tool").version("0.0.1");
  program.addCommand(loginCommand);
  program.addCommand(logoutCommand);
  program.addCommand(appCommands);
  program.addCommand(pipeCommands);
  program.addCommand(componentsCommands);
  program.parse();
}
main();
