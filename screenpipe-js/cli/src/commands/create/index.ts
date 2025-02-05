#!/usr/bin/env node
// Add this at the very top to suppress the Buffer deprecation warning
process.removeAllListeners("warning");

import fs from "fs-extra";
import path from "path";
import { input } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import { Command } from "commander";
import { logger } from "../components/commands/add/utils/logger";
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
  await fs.ensureDir(tempDir);
  await simpleGit().clone("https://github.com/mediar-ai/screenpipe", tempDir);
  const sourcePath = path.join(tempDir, subdir);
  await fs.copy(sourcePath, destPath);
  await fs.remove(tempDir);
}

export const createPipeCommand = new Command()
  .name('create')
  .description('create a new pipe')
  .action(async () => {
    console.log(chalk.bold("\nwelcome to screenpipe! 🚀\n"));
    logger.log("let's create a new screenpipe pipe.\n");
    logger.log(
      "pipes are plugins that interact with captured screen and audio data."
    ); 
    logger.log("build powerful agents, monetize it, etc.\n");

    const pipeName = await input({
      message: "what is your pipe name?",
      default: "my-screenpipe",
      validate: (input) => {
        if (input.trim().length === 0) return "pipe name is required";
        return true;
      },
    });

    const directory = await input({
      message: "where would you like to create your pipe?",
      default: pipeName,
    });

    const spinner = ora("creating your pipe...").start();

    try {
      // Download and extract the appropriate template
      await downloadAndExtractSubdir(
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
      handleError(error);
    }
  })

