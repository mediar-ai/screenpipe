#!/usr/bin/env bun
// Add this at the very top to suppress the Buffer deprecation warning
process.removeAllListeners("warning");

import fs from "fs-extra";
import path from "path";
import { input } from "@inquirer/prompts";
import chalk from "chalk";
import { Command } from "commander";
import { logger, spinner } from "../components/commands/add/utils/logger";
import simpleGit from "simple-git";
import { handleError } from "../components/commands/add/utils/handle-error";

const PIPE_ADDITIONS = {
  dependencies: {
    "@screenpipe/js": "latest",
  },
  devDependencies: {
    "bun-types": "latest",
  },
};

async function downloadAndExtractSubdir(subdir: string, destPath: string) {
  const tempDir = path.join(destPath, "_temp");
  try {
    // Ensure the destination path exists first
    await fs.ensureDir(destPath);
    await fs.ensureDir(tempDir);

    // Use more specific error handling for git clone
    const git = simpleGit();
    await git.clone("https://github.com/mediar-ai/screenpipe", tempDir);

    const sourcePath = path.join(tempDir, subdir);
    if (!(await fs.pathExists(sourcePath))) {
      throw new Error(`Template directory '${subdir}' not found in repository`);
    }

    await fs.copy(sourcePath, destPath);
    await fs.remove(tempDir);
  } catch (error: any) {
    // Clean up temp directory if it exists
    if (await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
    throw new Error(`Failed to setup pipe: ${error.message}`);
  }
}

export const createPipeCommand = new Command()
  .name("create")
  .description("create a new pipe")
  .action(async () => {
    console.log(chalk.bold("\nwelcome to screenpipe!\n"));
    logger.log("let's create a new screenpipe pipe.\n");
    logger.log(
      "pipes are plugins that interact with captured screen and audio data."
    );
    logger.log("build powerful agents, monetize it, etc.\n");

    let pipeName = "";
    try {
      pipeName = await input({
        message: "> what is your pipe name?",
        default: "my-screenpipe",
        validate: (input) => {
          if (input.trim().length === 0) return "pipe name is required";
          return true;
        },
        transformer: (input) => input.trim(),
      });
    } catch (error) {
      handleError(error);
    }

    let directory = "";
    try {
      directory = await input({
        message: "> where would you like to create your pipe?",
        default: pipeName,
        validate: (input) => {
          if (input.trim().length === 0) return "directory is required";
          return true;
        },
        transformer: (input) => input.trim(),
      });
    } catch (error) {
      handleError(error);
    }

    const loadingSpinner = spinner("creating your pipe...");

    try {
      // Ensure we have an absolute path
      const absoluteDirectory = path.resolve(process.cwd(), directory);

      // Download and extract the appropriate template
      await downloadAndExtractSubdir("pipes/obsidian", absoluteDirectory);

      // Update package.json with the pipe name
      const pkgPath = path.join(absoluteDirectory, "package.json");
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

      loadingSpinner.succeed(chalk.green(`> pipe created successfully!`));

      console.log("\nto get started:");
      console.log(chalk.cyan(`cd ${absoluteDirectory}`));
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
      loadingSpinner.failed("failed to create pipe");
      handleError(error);
    }
  });
