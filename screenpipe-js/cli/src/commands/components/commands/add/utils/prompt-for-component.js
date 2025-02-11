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
exports.promptForRegistryComponents = promptForRegistryComponents;
const zod_1 = require("zod");
const handle_error_1 = require("./handle-error");
const api_1 = require("../registry/api");
const logger_1 = require("./logger");
const inquirer_1 = __importDefault(require("inquirer"));
function promptForRegistryComponents(all) {
    return __awaiter(this, void 0, void 0, function* () {
        const registryIndex = yield (0, api_1.getRegistry)();
        if (!registryIndex) {
            logger_1.logger.break();
            (0, handle_error_1.handleError)(new Error("Failed to fetch registry index."));
            return [];
        }
        if (all) {
            return Object.values(registryIndex).map((entry) => entry.name);
        }
        const { components } = yield inquirer_1.default.prompt([
            {
                type: "checkbox",
                name: "components",
                message: "Which components would you like to add?",
                choices: Object.values(registryIndex)
                    .filter((item) => item.internal !== true)
                    .map((entry) => ({
                    name: entry.name,
                    value: entry.name,
                    // checked: options.all ? true : options.components?.includes(entry.name),
                })),
            },
        ]);
        if (!(components === null || components === void 0 ? void 0 : components.length)) {
            logger_1.logger.warn("No components selected. Exiting.");
            logger_1.logger.info("");
            process.exit(1);
        }
        const result = zod_1.z.array(zod_1.z.string()).safeParse(components);
        if (!result.success) {
            logger_1.logger.error("");
            (0, handle_error_1.handleError)(new Error("Something went wrong. Please try again."));
            return [];
        }
        return result.data;
    });
}
