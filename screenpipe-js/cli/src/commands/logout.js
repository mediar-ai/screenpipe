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
exports.logoutCommand = void 0;
const credentials_1 = require("../utils/credentials");
const colors_1 = require("../utils/colors");
const commander_1 = require("commander");
const logger_1 = require("./components/commands/add/utils/logger");
exports.logoutCommand = new commander_1.Command()
    .name("logout")
    .description("end current session")
    .action(() => __awaiter(void 0, void 0, void 0, function* () {
    credentials_1.Credentials.clearCredentials();
    logger_1.logger.success(`\n${colors_1.symbols.success} successfully logged out`);
    logger_1.logger.info(`${colors_1.symbols.info} thanks for using screenpipe! come back soon.`);
}));
