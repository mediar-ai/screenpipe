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
exports.updateFiles = updateFiles;
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("../logger");
const fs_1 = require("fs");
const download_file_from_github_1 = require("../download-file-from-github");
const inquirer_1 = __importDefault(require("inquirer"));
function updateFiles(componentLocations, options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        if (!(componentLocations === null || componentLocations === void 0 ? void 0 : componentLocations.length)) {
            return {
                filesCreated: [],
                filesUpdated: [],
                filesSkipped: [],
            };
        }
        options = Object.assign({ overwrite: false, silent: false }, options);
        const filesCreatedSpinner = (_a = (0, logger_1.spinner)(`Updating files.`, {
            silent: options.silent,
        })) === null || _a === void 0 ? void 0 : _a.start();
        const filesCreated = [];
        const filesUpdated = [];
        const filesSkipped = [];
        for (const location of componentLocations) {
            const targetDir = path_1.default.dirname(location.target);
            const existingFile = (0, fs_1.existsSync)(location.target);
            if (existingFile && !options.overwrite) {
                filesCreatedSpinner.stop();
                const { overwrite } = yield inquirer_1.default.prompt([
                    {
                        type: "confirm",
                        name: "overwrite",
                        message: `The file ${logger_1.highlighter.info(location.target)} already exists. Would you like to overwrite?`,
                        default: false,
                    },
                ]);
                if (!overwrite) {
                    filesSkipped.push(path_1.default.relative(options.cwd, location.target));
                    continue;
                }
                filesCreatedSpinner === null || filesCreatedSpinner === void 0 ? void 0 : filesCreatedSpinner.start();
                // Create the target directory if it doesn't exist.
                if (!(0, fs_1.existsSync)(targetDir)) {
                    yield fs_extra_1.default.mkdir(targetDir, { recursive: true });
                }
            }
            // Create the target directory if it doesn't exist.
            if (!(0, fs_1.existsSync)(targetDir)) {
                yield fs_extra_1.default.mkdir(targetDir, { recursive: true });
            }
            yield (0, download_file_from_github_1.fetchFileFromGitHubAPI)(location.src, location.target);
            existingFile
                ? filesUpdated.push(path_1.default.relative(options.cwd, location.target))
                : filesCreated.push(path_1.default.relative(options.cwd, location.target));
        }
        const hasUpdatedFiles = filesCreated.length || filesUpdated.length;
        if (!hasUpdatedFiles && !filesSkipped.length) {
            filesCreatedSpinner === null || filesCreatedSpinner === void 0 ? void 0 : filesCreatedSpinner.info("No files updated.");
        }
        if (filesCreated.length) {
            filesCreatedSpinner === null || filesCreatedSpinner === void 0 ? void 0 : filesCreatedSpinner.succeed(`Created ${filesCreated.length} ${filesCreated.length === 1 ? "file" : "files"}:`);
            if (!options.silent) {
                for (const file of filesCreated) {
                    logger_1.logger.log(`  - ${file}`);
                }
            }
        }
        else {
            filesCreatedSpinner === null || filesCreatedSpinner === void 0 ? void 0 : filesCreatedSpinner.stop();
        }
        if (filesUpdated.length) {
            (_b = (0, logger_1.spinner)(`Updated ${filesUpdated.length} ${filesUpdated.length === 1 ? "file" : "files"}:`, {
                silent: options.silent,
            })) === null || _b === void 0 ? void 0 : _b.info();
            if (!options.silent) {
                for (const file of filesUpdated) {
                    logger_1.logger.log(`  - ${file}`);
                }
            }
        }
        if (filesSkipped.length) {
            (_c = (0, logger_1.spinner)(`Skipped ${filesSkipped.length} ${filesUpdated.length === 1 ? "file" : "files"}: (use --overwrite to overwrite)`, {
                silent: options.silent,
            })) === null || _c === void 0 ? void 0 : _c.info();
            if (!options.silent) {
                for (const file of filesSkipped) {
                    logger_1.logger.log(`  - ${file}`);
                }
            }
        }
        if (!options.silent) {
            logger_1.logger.break();
        }
        return {
            filesCreated,
            filesUpdated,
            filesSkipped,
        };
    });
}
