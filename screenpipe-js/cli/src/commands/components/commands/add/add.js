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
Object.defineProperty(exports, "__esModule", { value: true });
exports.addComponentCommand = void 0;
const logger_1 = require("./utils/logger");
const handle_error_1 = require("./utils/handle-error");
const prompt_for_component_1 = require("./utils/prompt-for-component");
const preflight_add_1 = require("./preflights/preflight-add");
const add_components_1 = require("./utils/add-components");
const commander_1 = require("commander");
exports.addComponentCommand = new commander_1.Command()
    .name("add")
    .description("add components and dependencies to your pipe")
    .argument("[components...]", "List of components by name")
    .option("--path <path>", "The path to add the component to.")
    .option("--silent", "Mute output.", false)
    .option("--overwrite", "Overwrite existing files.", false)
    .option("--cwd <cwd>", "The working directory. Defaults to the current directory.", process.cwd())
    .action((comps, opts) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let components;
        // If there are no components, ask the user which ones they want.
        if (!(comps === null || comps === void 0 ? void 0 : comps.length)) {
            components = yield (0, prompt_for_component_1.promptForRegistryComponents)();
        }
        else {
            components = [comps];
        }
        // Before addig check a few things
        const result = (0, preflight_add_1.preFlightAdd)(opts.cwd);
        // If the current directory is not a pipe, create one
        if (result === null || result === void 0 ? void 0 : result.errors[handle_error_1.ERRORS.MISSING_DIR_OR_EMPTY_PIPE]) {
            logger_1.logger.warn("you need to create a pipe first. run bunx --bun @screenpipe/dev@latest pipe create or visit https://docs.screenpi.pe/docs/plugins for more information.");
            process.exit(1);
        }
        // Add components to the directory
        yield (0, add_components_1.addComponents)(components, {
            silent: opts.silent,
            cwd: opts.cwd,
            overwrite: opts.overwrite,
        });
    }
    catch (error) {
        logger_1.logger.break();
        (0, handle_error_1.handleError)(error);
    }
}));
