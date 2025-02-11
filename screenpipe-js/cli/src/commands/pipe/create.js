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
exports.createPipeCommand = void 0;
// Add this at the very top to suppress the Buffer deprecation warning
process.removeAllListeners("warning");
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const prompts_1 = require("@inquirer/prompts");
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const commander_1 = require("commander");
const logger_1 = require("../components/commands/add/utils/logger");
const simple_git_1 = __importDefault(require("simple-git"));
const handle_error_1 = require("../components/commands/add/utils/handle-error");
const PIPE_ADDITIONS = {
    dependencies: {
        "@screenpipe/js": "latest",
    },
    devDependencies: {
        "bun-types": "latest",
    },
};
function downloadAndExtractSubdir(subdir, destPath) {
    return __awaiter(this, void 0, void 0, function* () {
        const tempDir = path_1.default.join(destPath, "_temp");
        yield fs_extra_1.default.ensureDir(tempDir);
        yield (0, simple_git_1.default)().clone("https://github.com/mediar-ai/screenpipe", tempDir);
        const sourcePath = path_1.default.join(tempDir, subdir);
        yield fs_extra_1.default.copy(sourcePath, destPath);
        yield fs_extra_1.default.remove(tempDir);
    });
}
exports.createPipeCommand = new commander_1.Command()
    .name('create')
    .description('create a new pipe')
    .action(() => __awaiter(void 0, void 0, void 0, function* () {
    console.log(chalk_1.default.bold("\nwelcome to screenpipe! 🚀\n"));
    logger_1.logger.log("let's create a new screenpipe pipe.\n");
    logger_1.logger.log("pipes are plugins that interact with captured screen and audio data.");
    logger_1.logger.log("build powerful agents, monetize it, etc.\n");
    let pipeName = "";
    try {
        pipeName = yield (0, prompts_1.input)({
            message: "what is your pipe name?",
            default: "my-screenpipe",
            validate: (input) => {
                if (input.trim().length === 0)
                    return "pipe name is required";
                return true;
            },
        });
    }
    catch (error) {
        (0, handle_error_1.handleError)(error);
    }
    let directory = "";
    try {
        directory = yield (0, prompts_1.input)({
            message: "where would you like to create your pipe?",
            default: pipeName,
        });
    }
    catch (error) {
        (0, handle_error_1.handleError)(error);
    }
    const spinner = (0, ora_1.default)("creating your pipe...").start();
    try {
        // Download and extract the appropriate template
        yield downloadAndExtractSubdir("pipes/obsidian", directory);
        // Update package.json with the pipe name
        const pkgPath = path_1.default.join(process.cwd(), directory, "package.json");
        const pkg = yield fs_extra_1.default.readJson(pkgPath);
        pkg.name = pipeName;
        pkg.dependencies = Object.assign(Object.assign({}, pkg.dependencies), PIPE_ADDITIONS.dependencies);
        pkg.devDependencies = Object.assign(Object.assign({}, pkg.devDependencies), PIPE_ADDITIONS.devDependencies);
        yield fs_extra_1.default.writeJson(pkgPath, pkg, { spaces: 2 });
        spinner.succeed(chalk_1.default.green("pipe created successfully! 🎉"));
        console.log("\nto get started:");
        console.log(chalk_1.default.cyan(`cd ${directory}`));
        console.log(chalk_1.default.cyan("bun install    # or use: npm install, pnpm install, yarn"));
        console.log(chalk_1.default.cyan("bun dev      # or use: npm run dev, pnpm dev, yarn dev"));
        console.log("\nwhen you're ready, you can ship your pipe to the app by adding it to the pipe store using the UI and then send a PR to the main repo.\n");
    }
    catch (error) {
        spinner.fail("failed to create pipe");
        (0, handle_error_1.handleError)(error);
    }
}));
