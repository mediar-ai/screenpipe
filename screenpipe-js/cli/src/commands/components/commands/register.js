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
exports.registerComponentCommand = void 0;
const logger_1 = require("./add/utils/logger");
const handle_error_1 = require("./add/utils/handle-error");
const api_1 = require("./add/registry/api");
const fs_extra_1 = __importDefault(require("fs-extra"));
const commander_1 = require("commander");
const inquirer_1 = __importDefault(require("inquirer"));
function writeJsonToFile(filePath, data) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield fs_extra_1.default.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
            logger_1.logger.success(`component registry successfully updated.`);
        }
        catch (error) {
            if (error)
                if (error instanceof Error) {
                    if (error.message === "No such file or directory") {
                        logger_1.logger.break();
                        logger_1.logger.warn("this command can only be called from within the screenpipe-js/cli of screenpipe's repository");
                        process.exit(1);
                    }
                }
            logger_1.logger.break();
            (0, handle_error_1.handleError)('critical: could not save information to registry');
            process.exit(1);
        }
    });
}
exports.registerComponentCommand = new commander_1.Command()
    .name("register")
    .description("register a new component in screenpipe's component registry")
    .option("-n, --name <name>", "name of the component")
    .option("-s, --src", "github url for the component")
    .option("-t, --target", "path where file should be created")
    .action((opts) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        if (!opts.name) {
            const { name } = yield inquirer_1.default.prompt([
                {
                    type: "input",
                    name: "name",
                    message: "what's your component's name?",
                },
            ]);
            opts.name = name;
        }
        if (!opts.src) {
            const { src } = yield inquirer_1.default.prompt([
                {
                    type: "input",
                    name: "src",
                    message: "where should we download the component from? (URL pattern: https://api.github.com/repos/{owner}/{repo}/contents/{path})",
                    validate: input => input.startsWith("https://api.github.com/repos/") ? true : "URL must follow the pattern: https://api.github.com/repos/{owner}/{repo}/contents/{path}. \n \n \nvisit: https://github.com/mediar-ai/screenpipe/blob/main/screenpipe-js/cli/src/commands/components/README.md for more details.",
                },
            ]);
            opts.src = src;
        }
        if (!opts.target) {
            const { target } = yield inquirer_1.default.prompt([
                {
                    type: "input",
                    name: "target",
                    message: "where should the component be created?",
                },
            ]);
            opts.target = target;
        }
        if (!((_a = opts.name) === null || _a === void 0 ? void 0 : _a.length) || !((_b = opts.src) === null || _b === void 0 ? void 0 : _b.length) || !((_c = opts.target) === null || _c === void 0 ? void 0 : _c.length)) {
            logger_1.logger.break();
            (0, handle_error_1.handleError)("invalid component");
            process.exit(1);
        }
        const { deps } = yield inquirer_1.default.prompt([
            {
                type: "input",
                name: "deps",
                message: "type all of the component's runtime dependencies by name, separated by a comma",
                filter: (input) => input.split(',').map(item => item.trim()).filter(item => item !== ""),
            },
        ]);
        const { devDeps } = yield inquirer_1.default.prompt([
            {
                type: "input",
                name: "devDeps",
                message: "type all of the component's dev dependencies by name, separated by a comma",
                filter: (input) => input.split(',').map(item => item.trim()).filter(item => item !== ""),
            },
        ]);
        const { registryDeps } = yield inquirer_1.default.prompt([
            {
                type: "input",
                name: "registryDeps",
                message: "type all of the component's registry dependencies by name, separated by a comma",
                filter: (input) => input.split(',').map(item => item.trim()).filter(item => item !== ""),
            },
        ]);
        const componentObject = {
            name: opts.name,
            src: opts.src,
            target: opts.target,
            dependencies: deps,
            devDependencies: devDeps,
            registryDependencies: registryDeps,
        };
        const currentRegistry = (0, api_1.getRegistry)();
        if (!currentRegistry) {
            logger_1.logger.break();
            (0, handle_error_1.handleError)("critical: build is missing registry file.");
            process.exit(1);
        }
        currentRegistry[opts.name] = componentObject;
        yield writeJsonToFile("./src/commands/components/commands/add/registry/registry.json", currentRegistry);
        logger_1.logger.log("run `bun run build` and open a PR at https://github.com/mediar-ai/screenpipe to update registry.");
    }
    catch (error) {
        logger_1.logger.break();
        (0, handle_error_1.handleError)(error);
    }
}));
