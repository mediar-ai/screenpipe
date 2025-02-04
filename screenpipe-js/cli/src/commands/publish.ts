import fs from "fs";
import path from "path";
import { Credentials } from "../utils/credentials";
import { API_BASE_URL } from "../constants";
import archiver from "archiver";
import crypto from "crypto";
import ignore from "ignore";
import { colors, symbols } from "../utils/colors";
import { Command } from "commander";
import { logger } from "./components/commands/add/utils/logger";
import { handleError } from "./components/commands/add/utils/handle-error";

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

export const publishCommand = new Command()
  .name('publish')
  .description('publish or update a pipe to the store')
  .requiredOption('--name <name>', 'name of the pipe')
  .option('--verbose', 'enable verbose logging', false)
  .action(async (opts) => {
    try {
      if (opts.verbose) {
        logger.info(`${symbols.arrow} starting publish command...`);
      }

      const apiKey = Credentials.getApiKey();
      if (!apiKey) {
        handleError(
          `${
            symbols.error
          } not logged in. please login first using ${colors.highlight(
            "screenpipe login"
          )}`
        )
      }

      if (opts.verbose) {
        logger.info(`${symbols.arrow} reading package.json...`);
      }
      // Read package.json
      let packageJson: { name: string; version: string } | undefined
      try {
        packageJson = JSON.parse(fs.readFileSync("package.json", "utf-8"));
      } catch (error) {
        handleError(
          `${symbols.error} failed to read package.json. make sure you're in the correct directory.`
        )
      }

      if (!packageJson || !packageJson.name || !packageJson.version) {
        handleError(
          `${symbols.error} package name and version are required in package.json`
        );
        // handleError terminates process but ts doesnt infer that. This return will never be executed, its ts friendly.
        return
      }

      logger.info(
        `\n${symbols.info} publishing ${colors.highlight(
          packageJson.name
        )} v${packageJson.version}...`
      )
      logger.info(colors.dim(`${symbols.arrow} creating package archive...`));

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
        logger.info(
          `${symbols.arrow} detected project type: ${
            isNextProject ? "nextjs" : "standard"
          }`
        );
        logger.info(
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
        handleError(
          `${symbols.error} package size (${(fileSize / 1024 / 1024).toFixed(
            2
          )}MB) exceeds maximum allowed size (${
            MAX_FILE_SIZE / 1024 / 1024
          }MB)`
        )
        fs.unlinkSync(zipPath); // Clean up the zip file
      }

      let description = null;
      try {
        const readmeContent = fs.readFileSync("README.md", "utf-8");
        if (readmeContent) {
          description = readmeContent;
        }
      } catch (error) {
        logger.warn(
          `${symbols.arrow} no README.md found, required for description`
        )
      }
      if (!description) {
        handleError(`${symbols.error} description is required`)
      }

      if (opts.verbose) {
        logger.info(`${symbols.arrow} calculating file hash...`)
      }

      // Replace the upload section with this:
      try {
        // First get the signed URL
        logger.info(`${symbols.arrow} getting upload URL...`)

        const urlResponse = await fetch(`${API_BASE_URL}/api/plugins/publish`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: opts.name,
            version: packageJson.version,
            fileSize,
            fileHash,
            description,
          }),
        });

        if (!urlResponse.ok) {
          throw new Error(
            `failed to get upload URL: ${await urlResponse.text()}`
          );
        }

        const { uploadUrl, path } = await urlResponse.json();

        // Upload directly to Supabase
        logger.info(`${symbols.arrow} uploading to storage...`);
        const uploadResponse = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "application/zip",
          },
          body: fileBuffer,
        });

        if (!uploadResponse.ok) {
          const text = await uploadResponse.text();
          throw new Error(`failed to upload file to storage: ${text}`);
        }

        // Notify server that upload is complete
        logger.info(`${symbols.arrow} finalizing upload...`);
        const finalizeResponse = await fetch(
          `${API_BASE_URL}/api/plugins/publish/finalize`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: opts.name,
              version: packageJson.version,
              fileHash,
              storagePath: path,
              description,
              fileSize,
            }),
          }
        );

        if (!finalizeResponse.ok) {
          const text = await finalizeResponse.text();
          throw new Error(`failed to finalize upload: ${text}`);
        }

        const data = await finalizeResponse.json();

        // Success messages
        logger.success(`\n${symbols.success} successfully published plugin!`)
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

        if (data.message) {
          logger.info(`\n${symbols.info} ${data.message}`);
        }

        // Cleanup zip file
        fs.unlinkSync(zipPath);
        if (opts.verbose) {
          logger.log(`${symbols.arrow} cleaned up temporary zip file`)
        }
      } catch (error) {
        // Cleanup zip file even if upload failed
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
          if (opts.verbose) {
            logger.log(`${symbols.arrow} cleaned up temporary zip file`)
          }
        }

        if (error instanceof Error) {
            handleError(
              `\n${symbols.error} publishing failed: ${error.message}`
            );
        }
        process.exit(1);
      }
    } catch (error) {
      if (error instanceof Error) {
        handleError(`\n${symbols.error} publishing failed: ${error.message}`)
      } else {
        handleError(
          `\n${symbols.error} publishing failed with unexpected error`
        )
      }
    }
  })
