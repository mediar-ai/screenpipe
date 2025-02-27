#!/usr/bin/env bun
// Add this at the very top to suppress the Buffer deprecation warning
process.removeAllListeners("warning");

import fs from "fs-extra";
import path from "path";
import * as p from "@clack/prompts";
import chalk from "chalk";
import { Command } from "commander";
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

  // Create a spinner with initial text
  const s = p.spinner();

  try {
    // Start spinner with initial message
    s.start("preparing to download template...");

    // Ensure the destination path exists first
    await fs.ensureDir(destPath);
    await fs.ensureDir(tempDir);

    // Update spinner text before clone starts
    s.message(
      "cloning repository (this may take a while on slow connections)..."
    );

    // Use more specific error handling for git clone
    const git = simpleGit();
    await git.clone("https://github.com/mediar-ai/screenpipe", tempDir);

    // Update spinner as we progress through steps
    s.message("checking template directory...");
    const sourcePath = path.join(tempDir, subdir);
    if (!(await fs.pathExists(sourcePath))) {
      throw new Error(`template directory '${subdir}' not found in repository`);
    }

    s.message("copying template files to destination...");
    await fs.copy(sourcePath, destPath);

    s.message("cleaning up temporary files...");
    await fs.remove(tempDir);

    // Stop spinner with success
    s.stop("template downloaded and extracted successfully!");
  } catch (error: any) {
    // Clean up temp directory if it exists
    if (await fs.pathExists(tempDir)) {
      s.message("cleaning up after error...");
      await fs.remove(tempDir);
    }

    // Stop spinner with error
    s.stop("download failed!");
    throw new Error(`failed to setup pipe: ${error.message}`);
  }
}

export const createPipeCommand = new Command()
  .name("create")
  .description("create a new pipe")
  .action(async () => {
    p.intro(chalk.bold("\nwelcome to screenpipe!\n"));

    // Get pipe name
    const pipeNameInput = await p.text({
      message: "what is your pipe name?",
      placeholder: "my-screenpipe",
      validate: (value) => {
        if (value.trim().length === 0) return "pipe name is required";
        return undefined;
      },
    });

    // Check if user cancelled
    if (p.isCancel(pipeNameInput)) {
      p.cancel("operation cancelled");
      process.exit(1);
    }

    // Now pipeName is definitely a string
    const pipeName = pipeNameInput;

    // Get directory
    const directoryInput = await p.text({
      message: "where would you like to create your pipe?",
      placeholder: pipeName,
      validate: (value) => {
        if (value.trim().length === 0) return "directory is required";
        return undefined;
      },
    });

    // Check if user cancelled
    if (p.isCancel(directoryInput)) {
      p.cancel("operation cancelled");
      process.exit(1);
    }

    // Now directory is definitely a string
    const directory = directoryInput;

    const s = p.spinner();
    s.start("creating your pipe...");

    try {
      // Ensure we have an absolute path
      const absoluteDirectory = path.resolve(process.cwd(), directory);

      // Download and extract the appropriate template
      await downloadAndExtractSubdir("pipes/example-pipe", absoluteDirectory);

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

      s.stop(chalk.green(`> pipe created successfully!`));

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
      s.stop("failed to create pipe");
      handleError(error);
    }
  });
