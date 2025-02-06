#!/usr/bin/env node
import { input } from "@inquirer/prompts"; // Import select from inquirer prompts
import { Command } from "commander";
import inquirer from "inquirer";
import simpleGit from "simple-git";
import { logger, spinner } from "../components/commands/add/utils/logger";
import { handleError } from "../components/commands/add/utils/handle-error";

const TEMPLATE_REPOS = {
  electron: "https://github.com/neo773/screenpipe-electron",
  tauri: "https://github.com/LorenzoBloedow/screenpipe-tauri-template-dev",
};

export const createAppCommand = new Command()
  .name("create")
  .description("create a new desktop app project")
  .option(
    "-a, --name <name>",
    "the name of your app (optional)",
  )
  .option(
    "-t, --appType <type>",
    "the type of desktop app (electron or tauri)",
  )
  .action(async (options) => {
    let { name, appType } = options;

    if (!appType) {
      let { appTypePrompt } = await inquirer.prompt({
        name: "appTypePrompt",
        type: "select",
        message: "what type of desktop app would you like to create?",
        choices: [
          { name: "electron", value: "electron"},
          { name: "tauri", value: "tauri"}
        ],
        default: "tauri"
      });

      appType = appTypePrompt
    }


    if (!name || name.length === 0) {
      name = await input({
        message: "What is your project name?",
        default: "my-desktop-app",
        validate: (input) => {
          if (input.trim().length === 0) return "project name is required.";
          return true;
        },
      });
    }

    const loadingSpinner = spinner("creating your desktop app...");

    try {
      loadingSpinner.start();

      await simpleGit().clone(TEMPLATE_REPOS[appType as "electron" | "tauri"], name);
      loadingSpinner.succeed("Project created successfully! 🎉");

      logger.info("\ncredits to the template authors:");
      if (appType === "electron") {
        logger.info("electron template by: Neo @ https://github.com/neo773");
      } else {
        logger.info("tauri template by: Lorenzo @ https://github.com/LorenzoBloedow");
      }

      logger.info("\nto get started:");
      logger.info(`cd ${name}`);
      logger.info("npm install     # or bun install, pnpm install, yarn");
      logger.info("npm run dev     # or bun dev, pnpm dev, yarn dev");

      logger.info("\nwhen you're ready, you can deploy your app following the documentation for the respective framework.\n");
    } catch (error) {
      loadingSpinner.fail("failed to create project");
      handleError(error instanceof Error ? error.message : String(error));
    }
  });
