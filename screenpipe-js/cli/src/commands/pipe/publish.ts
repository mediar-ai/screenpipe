import fs from "fs";
import path from "path";
import { Credentials } from "../../utils/credentials";
import { API_BASE_URL } from "../../constants";
import archiver from "archiver";
import crypto from "crypto";
import ignore from "ignore";
import { colors, symbols } from "../../utils/colors";
import { Command } from "commander";
import { logger } from "../components/commands/add/utils/logger";
import axios from "axios";
import { execSync } from 'child_process';

interface ProjectFiles {
  required: string[];
  optional: string[];
}

const NEXTJS_FILES: ProjectFiles = {
  required: ["package.json", ".next"],
  optional: [
    "package-lock.json",
    "bun.lockb",
    "next.config.js",
    "next.config.mjs",
  ],
};

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB limit

async function archiveNextJsProject(archive: archiver.Archiver): Promise<void> {
  const { required, optional } = NEXTJS_FILES;

  // Verify required files exist
  const missingFiles = required.filter((file) => !fs.existsSync(file));
  if (missingFiles.length > 0) {
    throw new Error(
      `Required files not found: ${missingFiles.join(", ")}. ` +
        "Make sure you're in the correct directory and the project is built."
    );
  }

  // Archive required files
  for (const file of required) {
    if (file === ".next") {
      archive.directory(".next", ".next", (entry) => {
        return entry.name.startsWith(".next/cache/") ? false : entry;
      });
    } else {
      archive.file(file, { name: file });
    }
  }

  // Archive optional files if they exist
  optional
    .filter((file) => fs.existsSync(file))
    .forEach((file) => {
      archive.file(file, { name: file });
    });
}

function archiveStandardProject(
  archive: archiver.Archiver,
  ig: ReturnType<typeof ignore>
): void {
  archive.glob("**/*", {
    ignore: [".git/**", "node_modules/**", ".next/cache/**"],
    dot: true,
    nodir: false,
    mark: true,
  });
}

async function retryFetch(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  baseDelay = 1000
): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;

      // If it's the last attempt, throw the error
      if (attempt === maxRetries) {
        throw new Error(
          `Failed after ${maxRetries} attempts: ${await response.text()}`
        );
      }
    } catch (error) {
      if (attempt === maxRetries) throw error;
    }

    // Exponential backoff delay
    const delay = baseDelay * Math.pow(2, attempt - 1);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error("Retry failed"); // Fallback error
}

function runBuildCommand(): void {
  logger.info(
    colors.info(
      `\n${symbols.info} Project needs to be built. Running build command...`
    )
  );

  try {
    // Check if package.json has a build script
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf-8"));

    if (packageJson.scripts && packageJson.scripts.build) {
      // Try bun first, fall back to npm
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

export const publishCommand = new Command("publish")
  .description("publish or update a pipe to the store")
  .requiredOption("-n, --name <name>", "name of the pipe")
  .option("-v, --verbose", "enable verbose logging", false)
  .option(
    "--skip-build-check",
    "skip checking if the project has been built",
    false
  )
  .option("--build", "automatically run the build command if needed", false)
  .action(async (opts) => {
    try {
      if (opts.verbose) {
        console.log(colors.dim(`${symbols.arrow} starting publish command...`));
      }

      const apiKey = Credentials.getApiKey();
      if (!apiKey) {
        console.error(
          colors.error(
            `${
              symbols.error
            } not logged in. please login first using ${colors.highlight(
              "screenpipe login"
            )}`
          )
        );
        process.exit(1);
      }
      // Check if the project needs to be built
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
      // Read package.json
      let packageJson: { name: string; version: string };
      try {
        packageJson = JSON.parse(fs.readFileSync("package.json", "utf-8"));
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
          `\n${symbols.info} publishing ${colors.highlight(
            packageJson.name
          )} v${packageJson.version}...`
        )
      );
      logger.log(colors.dim(`${symbols.arrow} creating package archive...`));

      // Create temporary zip file
      const zipPath = path.join(
        process.cwd(),
        `${packageJson.name}-${packageJson.version}.zip`
      );
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      // Setup .gitignore rules
      const ig = ignore();
      if (fs.existsSync(".gitignore")) {
        ig.add(fs.readFileSync(".gitignore").toString());
      }

      // Check if it's a Next.js project by looking for next.config.js or next.config.mjs
      const isNextProject =
        fs.existsSync("next.config.js") ||
        fs.existsSync("next.config.mjs") ||
        fs.existsSync("next.config.ts");

      // Create zip file
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
            `${symbols.arrow} detected project type: ${
              isNextProject ? "nextjs" : "standard"
            }`
          )
        );
        console.log(
          colors.dim(`${symbols.arrow} starting archive creation...`)
        );
      }

      // Calculate file hash
      const fileBuffer = fs.readFileSync(zipPath);
      const hashSum = crypto.createHash("sha256");
      hashSum.update(fileBuffer);
      const fileHash = hashSum.digest("hex");
      const fileSize = fs.statSync(zipPath).size;

      if (fileSize > MAX_FILE_SIZE) {
        console.error(
          colors.error(
            `${symbols.error} Package size (${(fileSize / 1024 / 1024).toFixed(
              2
            )}MB) exceeds maximum allowed size (${
              MAX_FILE_SIZE / 1024 / 1024
            }MB)`
          )
        );
        fs.unlinkSync(zipPath); // Clean up the zip file
        process.exit(1);
      }

      let description = null;
      try {
        const readmeContent = fs.readFileSync("README.md", "utf-8");
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

      // Replace the upload section with this:
      try {
        // First get the signed URL
        console.log(colors.dim(`${symbols.arrow} getting upload URL...`));
        console.log(colors.dim(`${symbols.arrow} requesting URL from: ${API_BASE_URL}/api/plugins/publish`));

        const urlResponse = await axios.post(`${API_BASE_URL}/api/plugins/publish`, {
          name: opts.name,
          version: packageJson.version,
          fileSize,
          fileHash,
          description,
        }, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 30000, // 30 second timeout
        });

        console.log(colors.dim(`${symbols.arrow} url response status: ${urlResponse.status}`));
        
        const { uploadUrl, path } = urlResponse.data;
        console.log(colors.dim(`${symbols.arrow} received upload URL: ${uploadUrl.substring(0, 50)}...`));
        console.log(colors.dim(`${symbols.arrow} storage path: ${path}`));
        console.log(colors.dim(`${symbols.arrow} file size: ${fileSize} bytes`));

        // Upload directly to Supabase
        logger.log(colors.dim(`${symbols.arrow} uploading to storage...`));
        console.log(colors.dim(`${symbols.arrow} starting upload with axios...`));
        console.log(colors.dim(`${symbols.arrow} upload file size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB`));
        
        let uploadSuccessful = false;
        let uploadError = null;
        
        try {
          // Try using a different approach for the upload
          const uploadResponse = await axios.put(uploadUrl, fileBuffer, {
            headers: {
              "Content-Type": "application/zip",
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 300000, // 5 minute timeout for large uploads
            decompress: false, // Disable automatic decompression
            onUploadProgress: (progressEvent) => {
              if (progressEvent.total) {
                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                if (percentCompleted % 10 === 0) { // Log every 10%
                  console.log(colors.dim(`${symbols.arrow} upload progress: ${percentCompleted}%`));
                }
                // Mark as successful if we reach 100%
                if (percentCompleted === 100) {
                  uploadSuccessful = true;
                }
              }
            },
            // Add a custom validator to handle the case where the socket closes after 100% upload
            validateStatus: function (status) {
              // Consider any status less than 500 as success
              return status < 500;
            }
          });
          
          console.log(colors.dim(`${symbols.arrow} upload completed with status: ${uploadResponse.status || 'unknown'}`));
          uploadSuccessful = true;
        } catch (error) {
          uploadError = error;
          
          // Check if we've seen 100% progress
          if (!uploadSuccessful) {
            // This is a real error, not just a socket close after successful upload
            console.error(colors.error(`${symbols.error} upload error: ${error instanceof Error ? error.message : 'unknown error'}`));
            if (error instanceof Error && error.stack) {
              console.error(colors.dim(`${symbols.arrow} stack trace: ${error.stack}`));
            }
            if (axios.isAxiosError(error)) {
              console.error(colors.error(`${symbols.error} upload response: ${JSON.stringify(error.response?.data || {})}`));
              console.error(colors.error(`${symbols.error} upload status: ${error.response?.status || 'unknown'}`));
              console.error(colors.error(`${symbols.error} upload request config: ${JSON.stringify({
                url: error.config?.url?.substring(0, 100) + '...',
                method: error.config?.method,
                timeout: error.config?.timeout,
                headers: error.config?.headers
              })}`));
            }
            throw error;
          } else {
            // If we've seen 100% progress, we can ignore the socket close error
            // Use a warning style instead of error
            console.log(colors.dim(`${symbols.info} upload completed but connection closed: ${error instanceof Error ? error.message : 'unknown'}`));
            console.log(colors.dim(`${symbols.arrow} socket was closed after upload completed, continuing with finalization...`));
          }
        }
        
        // Notify server that upload is complete
        logger.log(colors.dim(`${symbols.arrow} finalizing upload...`));
        console.log(colors.dim(`${symbols.arrow} sending finalize request to: ${API_BASE_URL}/api/plugins/publish/finalize`));
        
        const finalizeResponse = await axios.post(
          `${API_BASE_URL}/api/plugins/publish/finalize`,
          {
            name: opts.name,
            version: packageJson.version,
            fileHash,
            storagePath: path,
            description,
            fileSize,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            timeout: 30000, // 30 second timeout
          }
        );

        console.log(colors.dim(`${symbols.arrow} finalize response status: ${finalizeResponse.status}`));
        console.log(colors.dim(`${symbols.arrow} finalize response data: ${JSON.stringify(finalizeResponse.data)}`));

        // Success messages
        logger.success(`\n${symbols.success} successfully published plugin!`);

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

        if (finalizeResponse.data.message) {
          logger.info(`\n${symbols.info} ${finalizeResponse.data.message}`);
        }
        
      } catch (error) {
        // Cleanup zip file even if upload failed
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
          if (opts.verbose) {
            logger.log(
              colors.dim(`${symbols.arrow} cleaned up temporary zip file`)
            );
          }
        }

        if (error instanceof Error) {
          console.error(
            colors.error(
              `\n${symbols.error} Publishing failed: ${error.message}`
            )
          );
        }
        process.exit(1);
      }

      // After the zip file is created and published, add cleanup logic:
      try {
        // Assuming zipFilePath is the variable holding the path to the zip file
        if (fs.existsSync(zipPath)) {
          console.log(`cleaning up zip file: ${zipPath}`);
          fs.unlinkSync(zipPath);
        }
      } catch (error) {
        console.error(`failed to clean up zip file: ${error}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(
          colors.error(`\n${symbols.error} Publishing failed: ${error.message}`)
        );
      } else {
        console.error(
          colors.error(
            `\n${symbols.error} Publishing failed with unexpected error`
          )
        );
      }
      process.exit(1);
    }
  });
