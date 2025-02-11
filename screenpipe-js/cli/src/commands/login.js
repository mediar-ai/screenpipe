"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.loginCommand = void 0;
const constants_1 = require("../constants");
const credentials_1 = require("../utils/credentials");
const colors_1 = require("../utils/colors");
const commander_1 = require("commander");
const logger_1 = require("./components/commands/add/utils/logger");
const handle_error_1 = require("./components/commands/add/utils/handle-error");
exports.loginCommand = new commander_1.Command()
    .name('login')
    .description('login with an API key')
    .requiredOption('--apiKey <apiKey>', 'API key to login with')
    .action((opts) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        logger_1.logger.info(`\n${colors_1.symbols.info} validating API key...`);
        const response = yield fetch(`${constants_1.API_BASE_URL}/api/plugins/dev-status`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${opts.apiKey}`,
                "Content-Type": "application/json",
            },
        });
        if (!response.ok) {
            const error = yield response.json();
            throw new Error(`Failed to validate API key ${error.error}`);
        }
        const data = yield response.json();
        if (data.data.needs_name) {
            const inquirer = (yield Promise.resolve().then(() => __importStar(require('inquirer')))).default;
            const { developerName } = yield inquirer.prompt([
                {
                    type: 'input',
                    name: 'developerName',
                    message: 'enter your developer name:',
                    validate: (input) => {
                        if (input.length < 2) {
                            return 'developer name must be at least 2 characters';
                        }
                        if (input.length > 50) {
                            return 'developer name must be less than 50 characters';
                        }
                        return true;
                    }
                }
            ]);
            const updateResponse = yield fetch(`${constants_1.API_BASE_URL}/api/plugins/dev-status`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${opts.apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ developer_name: developerName }),
            });
            if (!updateResponse.ok) {
                const error = yield updateResponse.json();
                throw new Error(`failed to set developer name: ${error.error}`);
            }
            const updateData = yield updateResponse.json();
            data.data.developer_name = updateData.data.developer_name;
        }
        logger_1.logger.info(`\n${colors_1.symbols.success} successfully logged in!`);
        console.log(colors_1.colors.listItem(`${colors_1.colors.label('developer id')} ${data.data.developer_id}`));
        console.log(colors_1.colors.listItem(`${colors_1.colors.label('developer name')} ${data.data.developer_name}`));
        credentials_1.Credentials.setApiKey(opts.apiKey, data.data.developer_id);
    }
    catch (error) {
        if (error instanceof Error) {
            (0, handle_error_1.handleError)(`\n${colors_1.symbols.error} login failed: ${error.message}`);
        }
        else {
            (0, handle_error_1.handleError)(`\n${colors_1.symbols.error} login failed with unexpected error`);
        }
        process.exit(1);
    }
}));
