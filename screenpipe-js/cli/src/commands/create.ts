#!/usr/bin/env node
// Add this at the very top to suppress the Buffer deprecation warning
process.removeAllListeners("warning");

import fs from "fs-extra";
import path from "path";
import { input } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import https from "https";
import { Extract } from "unzip-stream";
import { command } from "@drizzle-team/brocli";

const PIPE_ADDITIONS = {
  dependencies: {
    "@screenpipe/js": "latest",
  },
  devDependencies: {
    "bun-types": "latest",
  },
};

async function downloadAndExtractRepo(
  owner: string,
  repo: string,
  branch: string,
  subdir: string,
  destPath: string
): Promise<void> {
  const url = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;

  // Create a temporary directory for extraction
  const tempDir = path.join(destPath, "_temp");
  await fs.ensureDir(tempDir);

  return new Promise((resolve, reject) => {
    const request = https
      .get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          if (!redirectUrl) {
            reject(new Error("Redirect location not found"));
            return;
          }

          https
            .get(redirectUrl, async (redirectResponse) => {
              if (redirectResponse.statusCode !== 200) {
                reject(
                  new Error(
                    `Failed to download: ${redirectResponse.statusCode}`
                  )
                );
                return;
              }

              const extractStream = Extract({ path: tempDir });

              extractStream.on("finish", async () => {
                try {
                  // Move files from the specific subdirectory to the final destination
                  const sourcePath = path.join(
                    tempDir,
                    `screenpipe-${branch}`,
                    subdir
                  );
                  await fs.copy(sourcePath, destPath);
                  // Clean up temp directory
                  await fs.remove(tempDir);
                  console.log("extraction completed");
                  resolve();
                } catch (err) {
                  reject(err);
                }
              });

              extractStream.on("error", async (err) => {
                await fs.remove(tempDir).catch(console.error);
                reject(err);
              });

              redirectResponse.pipe(extractStream);
            })
            .on("error", async (err) => {
              await fs.remove(tempDir).catch(console.error);
              reject(err);
            });
        } else {
          reject(new Error(`Failed to download: ${response.statusCode}`));
        }
      })
      .on("error", async (err) => {
        await fs.remove(tempDir).catch(console.error);
        reject(err);
      });

    request.end();
  });
}

export const createCommand = command({
  name: "create",
  desc: "create a new pipe",
  handler: async () => {
    console.log(chalk.bold("\nwelcome to screenpipe! 🚀\n"));
    console.log("let's create a new screenpipe pipe.\n");
    console.log(
      "pipes are plugins that interact with captured screen and audio data."
    ); 
    console.log("build powerful agents, monetize it, etc.\n");

    // get project name
    const pipeName = await input({
      message: "what is your pipe name?",
      default: "my-screenpipe",
      validate: (input) => {
        if (input.trim().length === 0) return "pipe name is required";
        return true;
      },
    });

    // get directory
    const directory = await input({
      message: "where would you like to create your pipe?",
      default: pipeName,
    });

    const spinner = ora("creating your pipe...").start();

    try {
      // Download and extract the appropriate template
      await downloadAndExtractRepo(
        "mediar-ai",
        "screenpipe",
        "main",
        "pipes/obsidian",
        directory
      );

      // Update package.json with the pipe name
      const pkgPath = path.join(process.cwd(), directory, "package.json");
      const pkg = await fs.readJson(pkgPath);

      pkg.name = pipeName;
      pkg.dependencies = {
        ...pkg.dependencies,
        ...PIPE_ADDITIONS.dependencies,
      };
      pkg.devDependencies = {
        ...pkg.devDependencies,
        ...PIPE_ADDITIONS.devDependencies,
      };

      await fs.writeJson(pkgPath, pkg, { spaces: 2 });

      spinner.succeed(chalk.green("pipe created successfully! 🎉"));

      console.log("\nto get started:");
      console.log(chalk.cyan(`cd ${directory}`));
      console.log(
        chalk.cyan("bun install    # or use: npm install, pnpm install, yarn")
      );
      console.log(
        chalk.cyan("bun dev      # or use: npm run dev, pnpm dev, yarn dev")
      );

      console.log(
        "\nwhen you're ready, you can ship your pipe to the app by adding it to the pipe store using the UI and then send a PR to the main repo.\n"
      );
    } catch (error) {
      spinner.fail("failed to create pipe");
      console.error(error);
      process.exit(1);
    }
  },
});

