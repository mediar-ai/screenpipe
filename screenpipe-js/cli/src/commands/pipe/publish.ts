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

// Add this function to bump semver version
function bumpVersion(version: string, type: 'patch' | 'minor' | 'major' = 'patch'): string {
  const [major, minor, patch] = version.split('.').map(Number);
  
  if (type === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  if (type === 'major') return `${major + 1}.0.0`;
  
  return `${major}.${minor}.${patch + 1}`; // Default to patch
}

// Add this function to update package.json
function updatePackageVersion(newVersion: string): void {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
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
      let zipPath = path.join(
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
      let fileBuffer = fs.readFileSync(zipPath);
      const hashSum = crypto.createHash("sha256");
      hashSum.update(fileBuffer);
      let fileHash = hashSum.digest("hex");
      let fileSize = fs.statSync(zipPath).size;

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

        let urlResponse;
        try {
          urlResponse = await axios.post(`${API_BASE_URL}/api/plugins/publish`, {
            name: opts.name,
            version: packageJson.version,
            fileSize,
            fileHash,
            description,
            useS3: true,
          }, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            timeout: 30000, // 30 second timeout
          });
        } catch (error) {
          // Handle version conflict specifically
          if (axios.isAxiosError(error)) {
            console.log(colors.dim(`${symbols.arrow} network error details:`));
            
            if (error.response) {
              // The server responded with a status code outside the 2xx range
              console.log(colors.dim(`${symbols.arrow} server responded with status: ${error.response.status}`));
              console.log(colors.dim(`${symbols.arrow} response data: ${JSON.stringify(error.response.data)}`));
            } else if (error.request) {
              // The request was made but no response was received
              console.log(colors.dim(`${symbols.arrow} no response received from server`));
              console.log(colors.dim(`${symbols.arrow} check network connectivity and server status`));
              console.log(colors.dim(`${symbols.arrow} attempted to connect to: ${error.request._currentUrl || API_BASE_URL}`));
            } else {
              // Something happened in setting up the request
              console.log(colors.dim(`${symbols.arrow} error setting up request: ${error.message}`));
            }
            
            // Check if this is a version conflict error
            if (error.response && error.response.status === 400 && typeof error.response.data === 'string' && 
                error.response.data.includes('already exists') && error.response.data.includes('version')) {
              
              // Ask user if they want to bump the version
              const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
              });
              
              const newVersion = bumpVersion(packageJson.version);
              
              const question = `\n${symbols.info} ${colors.info(`Version ${packageJson.version} already exists.`)} 
${colors.info(`Would you like to bump to version ${newVersion} and continue? (y/n): `)}`;
              
              const answer = await new Promise<string>(resolve => {
                readline.question(question, (ans: string) => {
                  readline.close();
                  resolve(ans.toLowerCase());
                });
              });
              
              if (answer === 'y' || answer === 'yes') {
                // Update package.json with new version
                updatePackageVersion(newVersion);
                logger.success(`${symbols.success} Updated package.json to version ${newVersion}`);
                
                // Update packageJson in memory
                packageJson.version = newVersion;
                
                // Clean up the old zip file
                if (fs.existsSync(zipPath)) {
                  fs.unlinkSync(zipPath);
                  if (opts.verbose) {
                    console.log(colors.dim(`${symbols.arrow} cleaned up old zip file`));
                  }
                }
                
                // Rebuild the project with the new version
                try {
                  logger.info(colors.info(`\n${symbols.info} Rebuilding project with new version ${newVersion}...`));
                  runBuildCommand();
                } catch (error) {
                  if (error instanceof Error) {
                    console.error(colors.error(`${symbols.error} ${error.message}`));
                    process.exit(1);
                  }
                }
                
                // Create a new zip file with the updated version
                zipPath = path.join(
                  process.cwd(),
                  `${packageJson.name}-${newVersion}.zip`
                );
                const newOutput = fs.createWriteStream(zipPath);
                const newArchive = archiver("zip", { zlib: { level: 9 } });
                
                newArchive.pipe(newOutput);
                
                logger.log(colors.dim(`${symbols.arrow} creating new package archive with version ${newVersion}...`));
                
                // Archive the project again
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
                
                // Recalculate file hash and size
                fileBuffer = fs.readFileSync(zipPath);
                const newHashSum = crypto.createHash("sha256");
                newHashSum.update(fileBuffer);
                fileHash = newHashSum.digest("hex");
                fileSize = fs.statSync(zipPath).size;
                
                if (opts.verbose) {
                  console.log(colors.dim(`${symbols.arrow} new archive created: ${zipPath}`));
                  console.log(colors.dim(`${symbols.arrow} new file size: ${fileSize} bytes`));
                  console.log(colors.dim(`${symbols.arrow} new file hash: ${fileHash}`));
                }
                
                // Retry the request with new version
                console.log(colors.dim(`${symbols.arrow} retrying with new version: ${newVersion}`));
                urlResponse = await axios.post(`${API_BASE_URL}/api/plugins/publish`, {
                  name: opts.name,
                  version: newVersion,
                  fileSize,
                  fileHash,
                  description,
                  useS3: true,
                }, {
                  headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                  },
                  timeout: 30000,
                });
              } else {
                // User chose not to bump version
                throw new Error(`Publishing canceled. Please update the version manually in package.json.`);
              }
            } else {
              // Handle other errors
              if (typeof error.response?.data === 'string') {
                throw new Error(error.response.data);
              } else if (error.response?.data.error) {
                if (Array.isArray(error.response.data.error)) {
                  const issues = error.response.data.error.map((issue: any) => 
                    `${issue.path.join('.')}: ${issue.message}`
                  ).join(', ');
                  throw new Error(`validation failed: ${issues}`);
                } else {
                  throw new Error(`server error: ${JSON.stringify(error.response.data.error)}`);
                }
              } else {
                throw new Error(`server responded with error: ${JSON.stringify(error.response?.data)}`);
              }
            }
          } else {
            throw error; // Re-throw if not an axios error
          }
        }

        console.log(colors.dim(`${symbols.arrow} url response status: ${urlResponse.status}`));
        
        // Get the upload URL and storage path from the response
        const { uploadUrl, path: storagePath } = urlResponse.data;
        console.log(colors.dim(`${symbols.arrow} received upload URL: ${uploadUrl.substring(0, 50)}...`));
        console.log(colors.dim(`${symbols.arrow} storage path: ${storagePath}`));
        console.log(colors.dim(`${symbols.arrow} file size: ${fileSize} bytes`));

        // Upload directly to Supabase
        logger.log(colors.dim(`${symbols.arrow} uploading to storage...`));
        console.log(colors.dim(`${symbols.arrow} starting upload with axios...`));
        console.log(colors.dim(`${symbols.arrow} upload file size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB`));
        
        let uploadSuccessful = false;
        let uploadError = null;
        
        // Create a progress bar
        const progressBar = {
          current: 0,
          total: fileSize,
          width: 40,
          update(loaded: number) {
            const percent = Math.floor((loaded / this.total) * 100);
            const filledWidth = Math.floor((loaded / this.total) * this.width);
            const emptyWidth = this.width - filledWidth;
            
            // Only update if progress has changed by at least 1%
            if (percent > this.current) {
              this.current = percent;
              
              // Clear the current line and move to beginning
              process.stdout.write('\r');
              
              // Create the progress bar
              const bar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
              
              // Format the size display
              const loadedSize = (loaded / (1024 * 1024)).toFixed(2);
              const totalSize = (this.total / (1024 * 1024)).toFixed(2);
              
              // Print the progress bar
              process.stdout.write(
                `${colors.dim(`${symbols.arrow} uploading: [`)}${colors.info(bar)}${colors.dim(`] ${percent}%`)} ${colors.dim(`(${loadedSize}/${totalSize} MB)`)}`
              );
            }
          },
          complete() {
            // Move to next line after completion
            process.stdout.write('\n');
            logger.success(`${symbols.success} upload completed successfully`);
          }
        };
        
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
                progressBar.update(progressEvent.loaded);
                
                // Mark as successful if we reach 100%
                if (progressEvent.loaded === progressEvent.total) {
                  uploadSuccessful = true;
                }
              }
            },
            // Add a custom validator to handle the case where the socket closes after 100% upload
            validateStatus: function (status) {
              // Consider any status less than 500 as success
              return status < 500;
            },
            // Add responseType to handle binary responses
            responseType: 'arraybuffer'
          });
          
          progressBar.complete();
          console.log(colors.dim(`${symbols.arrow} upload completed with status: ${uploadResponse.status || 'unknown'}`));
          
          // Check if response is binary/non-text and log appropriately
          if (uploadResponse.data) {
            const contentType = uploadResponse.headers['content-type'] || '';
            if (contentType.includes('json')) {
              // It's JSON, try to parse and display
              try {
                const jsonData = JSON.parse(uploadResponse.data.toString());
                console.log(colors.dim(`${symbols.arrow} upload response: ${JSON.stringify(jsonData)}`));
              } catch (e) {
                console.log(colors.dim(`${symbols.arrow} upload response: [unparseable JSON response]`));
              }
            } else if (contentType.includes('text')) {
              // It's text, display as string
              console.log(colors.dim(`${symbols.arrow} upload response: ${uploadResponse.data.toString()}`));
            } else {
              // It's binary, just log the type and size
              console.log(colors.dim(`${symbols.arrow} upload response: [binary data, ${uploadResponse.data.byteLength} bytes]`));
              console.log(colors.dim(`${symbols.arrow} response content-type: ${contentType}`));
            }
          }
          
          uploadSuccessful = true;
        } catch (error) {
          uploadError = error;
          
          // Always print the error response as a normal message
          if (axios.isAxiosError(error)) {
            if (error.response?.data) {
              // Check if the response is binary
              if (error.response.data instanceof Buffer || error.response.data instanceof ArrayBuffer) {
                console.log(colors.dim(`${symbols.arrow} upload response: [binary data, ${error.response.data.byteLength} bytes]`));
                console.log(colors.dim(`${symbols.arrow} response content-type: ${error.response.headers['content-type'] || 'unknown'}`));
              } else {
                // Try to stringify the response data
                try {
                  console.log(colors.dim(`${symbols.arrow} upload response: ${JSON.stringify(error.response.data)}`));
                } catch (e) {
                  console.log(colors.dim(`${symbols.arrow} upload response: [unparseable response data]`));
                }
              }
            }
            console.log(colors.dim(`${symbols.arrow} upload status: ${error.response?.status || 'unknown'}`));
          }
          
          // Check if we've seen 100% progress
          if (!uploadSuccessful) {
            // This is a real error, not just a socket close after successful upload
            console.error(colors.error(`${symbols.error} upload error: ${error instanceof Error ? error.message : 'unknown error'}`));
            if (error instanceof Error && error.stack) {
              console.error(colors.dim(`${symbols.arrow} stack trace: ${error.stack}`));
            }
            if (axios.isAxiosError(error)) {
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
            progressBar.complete();
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
            storagePath: storagePath,
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
