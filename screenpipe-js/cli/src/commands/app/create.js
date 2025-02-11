#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAppCommand = void 0;
const prompts_1 = require("@inquirer/prompts"); // Import select from inquirer prompts
const commander_1 = require("commander");
const inquirer_1 = __importDefault(require("inquirer"));
const simple_git_1 = __importDefault(require("simple-git"));
const logger_1 = require("../components/commands/add/utils/logger");
const handle_error_1 = require("../components/commands/add/utils/handle-error");
const TEMPLATE_REPOS = {
    electron: "https://github.com/neo773/screenpipe-electron",
    tauri: "https://github.com/LorenzoBloedow/screenpipe-tauri-template-dev",
};
exports.createAppCommand = new commander_1.Command()
    .name("create")
    .description("create a new desktop app project")
    .option("-a, --name <name>", "the name of your app (optional)")
    .option("-t, --appType <type>", "the type of desktop app (electron or tauri)")
    .action((options) => __awaiter(void 0, void 0, void 0, function* () {
    let { name, appType } = options;
    if (!appType) {
        try {
            let { appTypePrompt } = yield inquirer_1.default.prompt({
                name: "appTypePrompt",
                type: "select",
                message: "what type of desktop app would you like to create?",
                choices: [
                    { name: "electron", value: "electron" },
                    { name: "tauri", value: "tauri" }
                ],
                default: "tauri"
            });
            appType = appTypePrompt;
        }
        catch (error) {
            (0, handle_error_1.handleError)(error);
        }
    }
    if (!name || name.length === 0) {
        try {
            name = yield (0, prompts_1.input)({
                message: "What is your project name?",
                default: "my-desktop-app",
                validate: (input) => {
                    if (input.trim().length === 0)
                        return "project name is required.";
                    return true;
                },
            });
        }
        catch (error) {
            (0, handle_error_1.handleError)(error);
        }
    }
    const loadingSpinner = (0, logger_1.spinner)("creating your desktop app...");
    try {
        loadingSpinner.start();
        yield (0, simple_git_1.default)().clone(TEMPLATE_REPOS[appType], name);
        loadingSpinner.succeed("Project created successfully! 🎉");
        logger_1.logger.info("\ncredits to the template authors:");
        if (appType === "electron") {
            logger_1.logger.info("electron template by: Neo @ https://github.com/neo773");
        }
        else {
            logger_1.logger.info("tauri template by: Lorenzo @ https://github.com/LorenzoBloedow");
        }
        logger_1.logger.info("\nto get started:");
        logger_1.logger.info(`cd ${name}`);
        logger_1.logger.info("npm install     # or bun install, pnpm install, yarn");
        logger_1.logger.info("npm run dev     # or bun dev, pnpm dev, yarn dev");
        logger_1.logger.info("\nwhen you're ready, you can deploy your app following the documentation for the respective framework.\n");
    }
    catch (error) {
        loadingSpinner.fail("failed to create project");
        (0, handle_error_1.handleError)(error instanceof Error ? error.message : String(error));
    }
}));
