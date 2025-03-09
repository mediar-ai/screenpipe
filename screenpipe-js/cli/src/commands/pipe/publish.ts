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
import http from 'http';
import https from 'https';
import { URL } from 'url';
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

// Add this function for HTTP requests with retry logic
async function httpRequest(
  url: string, 
  method: string, 
  data?: Buffer | string | object, 
  headers?: Record<string, string>, 
  onProgress?: (loaded: number, total: number) => void,
  verbose: boolean = false
): Promise<{ statusCode: number, headers: http.IncomingHttpHeaders, data: Buffer }> {
  const MAX_RETRIES = 10;
  const INITIAL_DELAY = 1000; // 1 second
  
  const parsedUrl = new URL(url);
  const isHttps = parsedUrl.protocol === 'https:';
  const requestModule = isHttps ? https : http;
  
  // Convert object data to JSON string if needed
  let bodyData: Buffer | string | undefined = data as Buffer | string;
  if (data && typeof data === 'object' && !(data instanceof Buffer)) {
    bodyData = JSON.stringify(data);
    headers = { ...headers, 'Content-Type': 'application/json' };
  }
  
  // Set content length if we have body data
  if (bodyData) {
    const contentLength = Buffer.isBuffer(bodyData) 
      ? bodyData.length 
      : Buffer.byteLength(bodyData, 'utf8');
    headers = { ...headers, 'Content-Length': contentLength.toString() };
    
    if (verbose) {
      console.log(colors.dim(`${symbols.arrow} setting content-length: ${contentLength}`));
    }
  }
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        console.log(colors.dim(`${symbols.arrow} retry attempt ${attempt}/${MAX_RETRIES}...`));
      }
      
      const result = await new Promise<{ statusCode: number, headers: http.IncomingHttpHeaders, data: Buffer }>((resolve, reject) => {
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
          const chunks: Buffer[] = [];
          let receivedLength = 0;
          
          res.on('data', (chunk) => {
            chunks.push(chunk);
            receivedLength += chunk.length;
          });
          
          res.on('end', () => {
            const responseData = Buffer.concat(chunks);
            
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                data: responseData
              });
            } else {
              // Log error response details
              let errorMessage = `HTTP error ${res.statusCode}`;
              try {
                const contentType = res.headers['content-type'] || '';
                if (contentType.includes('json')) {
                  errorMessage += `: ${responseData.toString('utf8')}`;
                } else if (contentType.includes('xml')) {
                  const xmlString = responseData.toString('utf8');
                  console.log(colors.dim(`${symbols.arrow} error response (XML): ${xmlString}`));
                  
                  // Extract error details from XML
                  const errorCodeMatch = xmlString.match(/<Code>(.*?)<\/Code>/);
                  const errorMessageMatch = xmlString.match(/<Message>(.*?)<\/Message>/);
                  
                  if (errorCodeMatch && errorMessageMatch) {
                    errorMessage += `: ${errorCodeMatch[1]} - ${errorMessageMatch[1]}`;
                  }
                } else if (contentType.includes('text')) {
                  errorMessage += `: ${responseData.toString('utf8')}`;
                }
              } catch (e) {
                // Ignore parsing errors
              }
              
              reject(new Error(errorMessage));
            }
          });
        });
        
        req.on('error', (error) => {
          reject(error);
        });
        
        // Track upload progress if callback provided
        if (onProgress && method === 'PUT' && bodyData) {
          let uploadedBytes = 0;
          const totalBytes = Buffer.isBuffer(bodyData) 
            ? bodyData.length 
            : Buffer.byteLength(bodyData, 'utf8');
          
          const originalWrite = req.write;
          req.write = function(chunk: any, encoding?: BufferEncoding, callback?: (error: Error | null | undefined) => void) {
            const result = originalWrite.call(this, chunk, encoding, callback);
            
            if (Buffer.isBuffer(chunk)) {
              uploadedBytes += chunk.length;
            } else if (typeof chunk === 'string') {
              uploadedBytes += Buffer.byteLength(chunk, encoding as BufferEncoding);
            }
            
            onProgress(uploadedBytes, totalBytes);
            return result;
          };
        }
        
        // Send the body data
        if (bodyData) {
          req.write(bodyData);
        }
        
        req.end();
      });
      
      return result;
    } catch (error) {
      // Don't retry version conflicts - they won't resolve without version change
      if (error instanceof Error && 
          error.message.includes('400') && 
          (error.message.includes('already exists') || 
           error.message.includes('Version') || 
           error.message.includes('version'))) {
        console.log(colors.dim(`${symbols.arrow} detected version conflict, not retrying with same version`));
        throw error; // Immediately throw to handle at higher level
      }
      
      if (attempt === MAX_RETRIES) {
        throw error;
      }
      
      // Log the error
      console.log(colors.dim(`${symbols.arrow} request failed (attempt ${attempt}/${MAX_RETRIES}): ${error instanceof Error ? error.message : 'unknown error'}`));
      
      // Exponential backoff with jitter
      const delay = INITIAL_DELAY * Math.pow(2, attempt - 1) * (0.5 + Math.random() * 0.5);
      console.log(colors.dim(`${symbols.arrow} waiting ${Math.round(delay)}ms before retry...`));
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Max retries exceeded'); // Should never reach here due to throw in the loop
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
  console.log(colors.dim(`${symbols.arrow} bumping version from ${version}`));
  const [major, minor, patch] = version.split('.').map(Number);
  
  let newVersion: string;
  if (type === 'patch') newVersion = `${major}.${minor}.${patch + 1}`;
  else if (type === 'minor') newVersion = `${major}.${minor + 1}.0`;
  else if (type === 'major') newVersion = `${major + 1}.0.0`;
  else newVersion = `${major}.${minor}.${patch + 1}`; // Default to patch
  
  console.log(colors.dim(`${symbols.arrow} new version: ${newVersion}`));
  return newVersion;
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
          const response = await httpRequest(
            `${API_BASE_URL}/api/plugins/publish`,
            'POST',
            {
              name: opts.name,
              version: packageJson.version,
              fileSize,
              fileHash,
              description,
              useS3: true,
            },
            {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            opts.verbose
          );
          
          urlResponse = { data: JSON.parse(response.data.toString('utf8')) };
          console.log(colors.dim(`${symbols.arrow} storage provider: S3`));
          console.log(colors.dim(`${symbols.arrow} url response status: ${response.statusCode}`));
        } catch (error) {
          // Handle version conflict specifically
          console.log(colors.dim(`${symbols.arrow} server error details: ${error instanceof Error ? error.message : 'unknown error'}`));
          
          // Check if this is a version conflict error
          if (error instanceof Error && 
              (error.message.includes('already exists') || 
               error.message.includes('Version') || 
               error.message.includes('version'))) {
            
            // Log the detected version conflict
            console.log(colors.dim(`${symbols.arrow} detected version conflict, preparing to bump version`));
            
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
              const response = await httpRequest(
                `${API_BASE_URL}/api/plugins/publish`,
                'POST',
                {
                  name: opts.name,
                  version: newVersion,
                  fileSize,
                  fileHash,
                  description,
                  useS3: true,
                },
                {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                undefined,
                opts.verbose
              );
              
              urlResponse = { data: JSON.parse(response.data.toString('utf8')) };
            } else {
              // User chose not to bump version
              throw new Error(`Publishing canceled. Please update the version manually in package.json.`);
            }
          } else {
            // Handle other errors
            throw error;
          }
        }

        // Get the upload URL and storage path from the response
        const { uploadUrl, path: storagePath } = urlResponse.data;
        console.log(colors.dim(`${symbols.arrow} received upload URL: ${uploadUrl.substring(0, 50)}...`));
        console.log(colors.dim(`${symbols.arrow} storage path: ${storagePath}`));
        console.log(colors.dim(`${symbols.arrow} file size: ${fileSize} bytes`));

        // Create variables that can be reassigned during retry
        let currentUploadUrl = uploadUrl;
        let currentStoragePath = storagePath;

        // Upload directly to S3
        logger.log(colors.dim(`${symbols.arrow} uploading to storage...`));
        console.log(colors.dim(`${symbols.arrow} starting upload with native http...`));
        console.log(colors.dim(`${symbols.arrow} upload file size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB`));
        
        // Create a progress bar
        const progressBar = {
          current: 0,
          total: fileSize,
          width: 40,
          update(loaded: number, total: number) {
            const percent = Math.floor((loaded / total) * 100);
            const filledWidth = Math.floor((loaded / total) * this.width);
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
              const totalSize = (total / (1024 * 1024)).toFixed(2);
              
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
        
        // Upload the file with retry logic
        const uploadResponse = await httpRequest(
          currentUploadUrl,
          'PUT',
          fileBuffer,
          {
            "Content-Type": "application/zip",
            "Content-Length": fileSize.toString(),
          },
          (loaded, total) => progressBar.update(loaded, total),
          opts.verbose
        );
        
        progressBar.complete();
        console.log(colors.dim(`${symbols.arrow} upload completed with status: ${uploadResponse.statusCode}`));
        
        // Add a delay after upload to ensure S3 has processed the file
        console.log(colors.dim(`${symbols.arrow} waiting for S3 to process the upload...`));
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
        
        // Notify server that upload is complete
        logger.log(colors.dim(`${symbols.arrow} finalizing upload with S3 storage...`));
        console.log(colors.dim(`${symbols.arrow} sending finalize request to: ${API_BASE_URL}/api/plugins/publish/finalize`));
        
        const finalizeResponse = await httpRequest(
          `${API_BASE_URL}/api/plugins/publish/finalize`,
          'POST',
          {
            name: opts.name,
            version: packageJson.version,
            fileHash,
            storagePath: currentStoragePath,
            description,
            fileSize,
          },
          {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          undefined,
          opts.verbose
        );

        console.log(colors.dim(`${symbols.arrow} finalize response status: ${finalizeResponse.statusCode}`));
        
        const finalizeData = JSON.parse(finalizeResponse.data.toString('utf8'));
        console.log(colors.dim(`${symbols.arrow} finalize response data: ${JSON.stringify(finalizeData)}`));

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

        if (finalizeData.message) {
          logger.info(`\n${symbols.info} ${finalizeData.message}`);
        }
      } catch (error) {
        console.error(colors.error(`${symbols.error} ${error instanceof Error ? error.message : 'unknown error'}`));
        process.exit(1);
      }
    } catch (error) {
      console.error(colors.error(`${symbols.error} ${error instanceof Error ? error.message : 'unknown error'}`));
      process.exit(1);
    }
  });