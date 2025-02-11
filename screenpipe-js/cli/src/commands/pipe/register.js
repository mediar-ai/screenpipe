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
exports.registerCommand = void 0;
const fs_1 = __importDefault(require("fs"));
const credentials_1 = require("../../utils/credentials");
const constants_1 = require("../../constants");
const colors_1 = require("../../utils/colors");
const commander_1 = require("commander");
const logger_1 = require("../components/commands/add/utils/logger");
const handle_error_1 = require("../components/commands/add/utils/handle-error");
exports.registerCommand = new commander_1.Command()
    .name('register')
    .description('register a new pipe')
    .requiredOption('--name <name>', 'name of the pipe')
    .option('--paid', 'set this flag to create a paid pipe')
    .option('--price <price>', 'price in usd (required for paid pipes)', parseFloat)
    .option('--source <source>', 'source code url (e.g., github repository)')
    .action((opts) => __awaiter(void 0, void 0, void 0, function* () {
    if (opts.paid && opts.price == null) {
        (0, handle_error_1.handleError)('error: price is required for paid pipes, i.e., --price <amount>');
    }
    if (opts.paid && opts.price <= 0) {
        (0, handle_error_1.handleError)('error: price must be positive for paid pipes');
    }
    try {
        const apiKey = credentials_1.Credentials.getApiKey();
        if (!apiKey) {
            (0, handle_error_1.handleError)(colors_1.symbols.error + " not logged in. please login first using" + colors_1.colors.highlight("screenpipe login"));
        }
        let packageJson;
        try {
            packageJson = JSON.parse(fs_1.default.readFileSync("package.json", "utf-8"));
        }
        catch (error) {
            (0, handle_error_1.handleError)(`${colors_1.symbols.error} failed to read package.json. make sure you're in the correct directory.`);
        }
        const isPaid = opts.paid || false;
        const price = opts.price;
        // Read description from README.md
        let description = null;
        try {
            const readmeContent = fs_1.default.readFileSync("README.md", "utf-8");
            if (readmeContent) {
                description = readmeContent;
            }
        }
        catch (error) {
            logger_1.logger.warn(`${colors_1.symbols.arrow} no README.md found, required for description`);
        }
        const response = yield fetch(`${constants_1.API_BASE_URL}/api/plugins/create`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name: opts.name,
                description: description,
                is_paid: isPaid,
                price: isPaid ? price : null,
                source_url: opts.source || null,
            }),
        });
        if (!response.ok) {
            const errorData = yield response.json();
            (0, handle_error_1.handleError)(errorData.error || "failed to create plugin");
        }
        const data = yield response.json();
        logger_1.logger.success(`\n${colors_1.symbols.success} successfully created pipe: ${colors_1.colors.highlight(opts.name)}`);
        // Display additional info
        logger_1.logger.info(`\n${colors_1.symbols.info} plugin details:`);
        console.log(colors_1.colors.listItem(`${colors_1.colors.label("name")} ${opts.name}`));
        console.log(colors_1.colors.listItem(`${colors_1.colors.label("type")} ${isPaid ? `paid ($${price})` : "free"}`));
        if (opts.source) {
            console.log(colors_1.colors.listItem(`${colors_1.colors.label("source")} ${opts.source}`));
        }
    }
    catch (error) {
        if (error instanceof Error) {
            (0, handle_error_1.handleError)(`\n${colors_1.symbols.error} creating failed: ${error.message}`);
        }
        else {
            (0, handle_error_1.handleError)(`\n${colors_1.symbols.error} creating failed with unexpected error`);
        }
    }
}));
